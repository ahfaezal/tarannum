"""Public course promotion, lead capture, and ToyyibPay payment workflow."""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional
from urllib import error, parse, request
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import PromotionCampaign, PromotionRegistration, User, get_db
from auth import get_current_admin_user


router = APIRouter(prefix="/api/promotions", tags=["promotions"])
CAMPAIGN_SLUG = "kursus-muazzin-hijjaz-2026"
RESERVATION_MINUTES = 60


class RegistrationCreate(BaseModel):
    full_name: str = Field(min_length=3, max_length=180)
    phone: str = Field(min_length=8, max_length=30)
    email: EmailStr
    state: str = Field(min_length=2, max_length=80)
    district: str = Field(min_length=2, max_length=100)
    organization: Optional[str] = Field(default=None, max_length=180)
    registration_consent: bool
    marketing_consent: bool = False

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        normalized = re.sub(r"[^0-9+]", "", value)
        if not re.fullmatch(r"(?:\+?6)?01\d{8,9}", normalized):
            raise ValueError("Masukkan nombor telefon Malaysia yang sah")
        return normalized


class WaitlistCreate(RegistrationCreate):
    preferred_month: str

    @field_validator("preferred_month")
    @classmethod
    def validate_month(cls, value: str) -> str:
        if value not in {"Oktober 2026", "November 2026", "Disember 2026"}:
            raise ValueError("Pilihan bulan tidak sah")
        return value


def _campaign(db: Session, slug: str, lock: bool = False) -> PromotionCampaign:
    query = db.query(PromotionCampaign).filter(PromotionCampaign.slug == slug)
    if lock:
        query = query.with_for_update()
    campaign = query.first()
    if not campaign or campaign.status != "published":
        raise HTTPException(404, "Program tidak ditemui atau belum dibuka")
    return campaign


def _seat_counts(db: Session, campaign_id: UUID) -> tuple[int, int]:
    now = datetime.utcnow()
    paid = db.query(func.count(PromotionRegistration.id)).filter(
        PromotionRegistration.campaign_id == campaign_id,
        PromotionRegistration.status.in_(["paid", "account_linked", "attended"]),
    ).scalar() or 0
    reserved = db.query(func.count(PromotionRegistration.id)).filter(
        PromotionRegistration.campaign_id == campaign_id,
        PromotionRegistration.status == "payment_reserved",
        PromotionRegistration.reservation_expires_at > now,
    ).scalar() or 0
    return int(paid), int(reserved)


def _public_payload(campaign: PromotionCampaign, paid: int, reserved: int) -> dict:
    available = max(0, campaign.capacity - paid - reserved)
    return {
        "slug": campaign.slug,
        "title": campaign.title,
        "capacity": campaign.capacity,
        "paid_count": paid,
        "reserved_count": reserved,
        "available_count": available,
        "is_full": available == 0,
        "price": campaign.price_cents / 100,
        "starts_at": campaign.starts_at.isoformat(),
    }


def _frontend_url() -> str:
    return os.getenv("PROMOTION_FRONTEND_URL", "http://localhost:3000/kursus-pemantapan-muazzin").rstrip("/")


def _api_url() -> str:
    return os.getenv("API_URL", "http://localhost:8000").rstrip("/")


def _create_toyyibpay_bill(campaign: PromotionCampaign, registration: PromotionRegistration) -> str:
    secret_key = os.getenv("TOYYIBPAY_SECRET_KEY", "").strip()
    category_code = os.getenv("TOYYIBPAY_CATEGORY_CODE", "7d359q4h").strip()
    if not secret_key or not category_code:
        raise HTTPException(503, "Pembayaran sedang disediakan. Pendaftaran minat anda telah disimpan.")

    expiry = datetime.utcnow() + timedelta(minutes=30)
    data = {
        "userSecretKey": secret_key,
        "categoryCode": category_code,
        "billName": "Kursus Pemantapan Muazzin",
        "billDescription": "Kursus Muazzin Maqam Hijjaz 19 September 2026",
        "billPriceSetting": "1",
        "billPayorInfo": "1",
        "billAmount": str(campaign.price_cents),
        "billReturnUrl": f"{_frontend_url()}/pembayaran?registration={registration.public_token}",
        "billCallbackUrl": f"{_api_url()}/api/promotions/toyyibpay/callback",
        "billExternalReferenceNo": str(registration.id),
        "billTo": registration.full_name,
        "billEmail": registration.email,
        "billPhone": registration.phone,
        "billSplitPayment": "0",
        "billPaymentChannel": "0",
        "billContentEmail": "Terima kasih. Tempat anda disahkan selepas pembayaran berjaya.",
        "billChargeToCustomer": "",
        "billChargeToPrepaid": "0",
        "billExpiryDate": expiry.strftime("%d-%m-%Y %H:%M:%S"),
        "enableDuitNowQR": "1",
        "chargeDuitNowQR": "0",
    }
    encoded = parse.urlencode(data).encode("utf-8")
    req = request.Request(
        "https://toyyibpay.com/index.php/api/createBill",
        data=encoded,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(502, "ToyyibPay tidak dapat dihubungi. Sila cuba lagi.") from exc
    if not isinstance(result, list) or not result or not result[0].get("BillCode"):
        raise HTTPException(502, "ToyyibPay tidak menghasilkan pautan pembayaran.")
    return str(result[0]["BillCode"])


@router.get("/{slug}")
def get_campaign(slug: str, db: Session = Depends(get_db)):
    campaign = _campaign(db, slug)
    return _public_payload(campaign, *_seat_counts(db, campaign.id))


@router.post("/{slug}/registrations")
def create_registration(slug: str, payload: RegistrationCreate, db: Session = Depends(get_db)):
    if not payload.registration_consent:
        raise HTTPException(400, "Persetujuan pendaftaran diperlukan")
    campaign = _campaign(db, slug, lock=True)
    paid, reserved = _seat_counts(db, campaign.id)
    email = payload.email.strip().lower()
    registration = db.query(PromotionRegistration).filter(
        PromotionRegistration.campaign_id == campaign.id,
        PromotionRegistration.email == email,
    ).first()
    if registration and registration.status in {"paid", "account_linked", "attended"}:
        return {"status": registration.status, "registration_token": registration.public_token, "already_paid": True}
    if paid + reserved >= campaign.capacity:
        raise HTTPException(409, "Tempat telah penuh. Sila sertai senarai menunggu.")
    if not registration:
        registration = PromotionRegistration(
            campaign_id=campaign.id,
            public_token=secrets.token_urlsafe(24),
            email=email,
        )
        db.add(registration)
    registration.full_name = payload.full_name.strip()
    registration.phone = payload.phone
    registration.state = payload.state.strip()
    registration.district = payload.district.strip()
    registration.organization = payload.organization.strip() if payload.organization else None
    registration.registration_consent = True
    registration.marketing_consent = payload.marketing_consent
    registration.consented_at = datetime.utcnow()
    registration.status = "interested"
    db.flush()
    try:
        bill_code = _create_toyyibpay_bill(campaign, registration)
    except HTTPException:
        # Keep the lead, but do not consume a seat when checkout creation fails.
        registration.status = "interested"
        registration.reservation_expires_at = None
        db.commit()
        raise
    registration.toyyibpay_bill_code = bill_code
    registration.status = "payment_reserved"
    registration.reservation_expires_at = datetime.utcnow() + timedelta(minutes=RESERVATION_MINUTES)
    db.commit()
    return {
        "status": registration.status,
        "registration_token": registration.public_token,
        "checkout_url": f"https://toyyibpay.com/{bill_code}",
        "reservation_minutes": RESERVATION_MINUTES,
    }


@router.post("/{slug}/waitlist")
def join_waitlist(slug: str, payload: WaitlistCreate, db: Session = Depends(get_db)):
    if not payload.registration_consent:
        raise HTTPException(400, "Persetujuan diperlukan")
    campaign = _campaign(db, slug)
    email = payload.email.strip().lower()
    registration = db.query(PromotionRegistration).filter(
        PromotionRegistration.campaign_id == campaign.id,
        PromotionRegistration.email == email,
    ).first()
    if not registration:
        registration = PromotionRegistration(campaign_id=campaign.id, public_token=secrets.token_urlsafe(24), email=email)
        db.add(registration)
    registration.full_name = payload.full_name.strip()
    registration.phone = payload.phone
    registration.state = payload.state.strip()
    registration.district = payload.district.strip()
    registration.organization = payload.organization.strip() if payload.organization else None
    registration.registration_consent = True
    registration.marketing_consent = payload.marketing_consent
    registration.preferred_month = payload.preferred_month
    registration.status = "waitlisted"
    registration.consented_at = datetime.utcnow()
    db.commit()
    return {"status": "waitlisted"}


@router.post("/toyyibpay/callback")
def toyyibpay_callback(
    refno: str = Form(...),
    status: str = Form(...),
    billcode: str = Form(...),
    order_id: str = Form(...),
    amount: str = Form(...),
    hash: str = Form(...),
    db: Session = Depends(get_db),
):
    secret_key = os.getenv("TOYYIBPAY_SECRET_KEY", "")
    expected = hashlib.md5(f"{secret_key}{status}{order_id}{refno}ok".encode("utf-8")).hexdigest()
    if not secret_key or not secrets.compare_digest(expected.lower(), hash.lower()):
        raise HTTPException(400, "Callback tidak sah")
    try:
        registration_id = UUID(order_id)
    except ValueError as exc:
        raise HTTPException(400, "Rujukan pembayaran tidak sah") from exc
    registration = db.query(PromotionRegistration).filter(PromotionRegistration.id == registration_id).with_for_update().first()
    if not registration or registration.toyyibpay_bill_code != billcode:
        raise HTTPException(404, "Pendaftaran tidak ditemui")
    if status == "1" and registration.status not in {"paid", "account_linked", "attended"}:
        registration.status = "paid"
        registration.toyyibpay_reference_no = refno
        registration.payment_amount = float(amount)
        registration.paid_at = datetime.utcnow()
        registration.reservation_expires_at = None
        existing_user = db.query(User).filter(func.lower(User.email) == registration.email.lower()).first()
        if existing_user:
            registration.user_id = existing_user.id
            registration.status = "account_linked"
    elif status == "3" and registration.status == "payment_reserved":
        registration.status = "payment_failed"
        registration.reservation_expires_at = None
    db.commit()
    return {"status": "ok"}


@router.get("/{slug}/registrations/{token}")
def registration_status(slug: str, token: str, db: Session = Depends(get_db)):
    campaign = _campaign(db, slug)
    registration = db.query(PromotionRegistration).filter(
        PromotionRegistration.campaign_id == campaign.id,
        PromotionRegistration.public_token == token,
    ).first()
    if not registration:
        raise HTTPException(404, "Pendaftaran tidak ditemui")
    return {
        "status": registration.status,
        "paid": registration.status in {"paid", "account_linked", "attended"},
        "account_linked": registration.user_id is not None,
        "email": registration.email,
        "full_name": registration.full_name,
    }


@router.get("/{slug}/admin/registrations")
def admin_registrations(
    slug: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """Admin-only participant and planning view; never expose this PII publicly."""
    campaign = _campaign(db, slug)
    rows = db.query(PromotionRegistration).filter(
        PromotionRegistration.campaign_id == campaign.id,
    ).order_by(PromotionRegistration.created_at.desc()).all()
    paid, reserved = _seat_counts(db, campaign.id)
    status_counts = {
        status: count
        for status, count in db.query(
            PromotionRegistration.status,
            func.count(PromotionRegistration.id),
        ).filter(
            PromotionRegistration.campaign_id == campaign.id,
        ).group_by(PromotionRegistration.status).all()
    }
    return {
        "campaign": _public_payload(campaign, paid, reserved),
        "status_counts": status_counts,
        "registrations": [
            {
                "id": str(row.id),
                "full_name": row.full_name,
                "phone": row.phone,
                "email": row.email,
                "state": row.state,
                "district": row.district,
                "organization": row.organization,
                "status": row.status,
                "marketing_consent": row.marketing_consent,
                "preferred_month": row.preferred_month,
                "paid_at": row.paid_at.isoformat() if row.paid_at else None,
                "account_linked": row.user_id is not None,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
    }
