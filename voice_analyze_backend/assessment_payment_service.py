"""ToyyibPay checkout for participant-funded Qari assessments."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from urllib import error, parse, request
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import (
    AnalysisResult, AssessmentPayment, AssessmentPaymentAttempt,
    CertificateApplication, QariContent, Reference, User, UserSession,
)

ASSESSMENT_PRICE_CENTS = 1000
MALAYSIA_TZ = ZoneInfo("Asia/Kuala_Lumpur")


def _qari_for_session(db: Session, session: UserSession):
    qari_id = session.qari_id
    if not qari_id:
        owner = db.query(QariContent).filter(
            QariContent.reference_id == session.reference_id,
            QariContent.is_active.is_(True),
        ).first()
        qari_id = owner.qari_id if owner else None
    qari = db.query(User).filter(User.id == qari_id).first() if qari_id else None
    if not qari or not qari.is_active or not qari.is_approved:
        raise ValueError("Qari aktif bagi rakaman ini tidak dapat dikenal pasti")
    return qari


def validate_private_assessment(db: Session, student: User, session_id, certificate_type: str):
    if certificate_type not in {"competency_tarannum", "competency_azan"}:
        raise ValueError("Jenis sijil kompetensi tidak sah")
    session = db.query(UserSession).filter(UserSession.id == session_id, UserSession.user_id == student.id).first()
    if not session:
        raise ValueError("Rakaman tidak ditemui")
    analysis = db.query(AnalysisResult).filter(AnalysisResult.user_session_id == session.id).first()
    if not analysis or analysis.score < 75:
        raise ValueError("Markah latihan AI sekurang-kurangnya 75% diperlukan")
    if db.query(CertificateApplication.id).filter(CertificateApplication.session_id == session.id).first():
        raise ValueError("Rakaman ini telah mempunyai permohonan penilaian")
    reference = db.query(Reference).filter(Reference.id == session.reference_id).first()
    if not reference:
        raise ValueError("Rujukan rakaman tidak ditemui")
    return session, analysis, reference, _qari_for_session(db, session)


def create_bill(payment: AssessmentPayment, student: User, reference: Reference) -> str:
    secret_key = os.getenv("TOYYIBPAY_SECRET_KEY", "").strip()
    category_code = (os.getenv("TOYYIBPAY_ASSESSMENT_CATEGORY_CODE") or os.getenv("TOYYIBPAY_CATEGORY_CODE", "")).strip()
    if not secret_key or not category_code:
        raise HTTPException(503, "Pembayaran penilaian sedang disediakan")
    phone = "".join(ch for ch in (student.phone_number or "") if ch.isdigit() or ch == "+")
    if len(phone) < 8:
        raise HTTPException(400, "Lengkapkan nombor telefon dalam profil sebelum membuat pembayaran")
    frontend = os.getenv("FRONTEND_URL", "https://tarannum.ai").rstrip("/")
    api_url = os.getenv("API_URL", "http://localhost:8000").rstrip("/")
    expiry = datetime.now(MALAYSIA_TZ) + timedelta(minutes=30)
    data = {
        "userSecretKey": secret_key,
        "categoryCode": category_code,
        "billName": "Penilaian Qari Tarannum",
        "billDescription": f"Penilaian Qari untuk {reference.title}"[:100],
        "billPriceSetting": "1",
        "billPayorInfo": "1",
        "billAmount": str(ASSESSMENT_PRICE_CENTS),
        "billReturnUrl": f"{frontend}/certificates?assessment_payment={payment.public_token}",
        "billCallbackUrl": f"{api_url}/api/certification/toyyibpay/assessment-callback",
        "billExternalReferenceNo": str(payment.id),
        "billTo": student.full_name or student.email,
        "billEmail": student.email,
        "billPhone": phone,
        "billSplitPayment": "0",
        "billPaymentChannel": "0",
        "billContentEmail": "Bayaran RM10 untuk satu penilaian rakaman oleh Qari Tarannum.ai.",
        "billChargeToCustomer": "",
        "billChargeToPrepaid": "0",
        "billExpiryDate": expiry.strftime("%d-%m-%Y %H:%M:%S"),
    }
    if os.getenv("TOYYIBPAY_ENABLE_DUITNOW_QR", "false").strip().lower() == "true":
        data.update({"enableDuitNowQR": "1", "chargeDuitNowQR": "0"})
    req = request.Request(
        "https://toyyibpay.com/index.php/api/createBill",
        data=parse.urlencode(data).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; Tarannum.ai/1.0; +https://tarannum.ai)"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8").strip()
        result = json.loads(raw)
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(502, "ToyyibPay tidak dapat menghasilkan bil. Sila cuba lagi.") from exc
    if not isinstance(result, list) or not result or not result[0].get("BillCode"):
        raise HTTPException(502, "ToyyibPay tidak menghasilkan pautan pembayaran")
    return str(result[0]["BillCode"])


def valid_callback_hash(status: str, order_id: str, refno: str, received_hash: str) -> bool:
    secret_key = os.getenv("TOYYIBPAY_SECRET_KEY", "")
    expected = hashlib.md5(f"{secret_key}{status}{order_id}{refno}ok".encode("utf-8")).hexdigest()
    return bool(secret_key) and secrets.compare_digest(expected.lower(), received_hash.lower())


def callback_amount_is_correct(amount: str) -> bool:
    try:
        value = Decimal(str(amount).replace(",", "").strip())
    except InvalidOperation:
        return False
    return value == Decimal("10.00")


def create_application_after_payment(db: Session, payment: AssessmentPayment) -> CertificateApplication:
    existing = db.query(CertificateApplication).filter(CertificateApplication.session_id == payment.session_id).first()
    if existing:
        payment.application_id = existing.id
        payment.status = "application_created"
        return existing
    session = db.query(UserSession).filter(UserSession.id == payment.session_id).first()
    analysis = db.query(AnalysisResult).filter(AnalysisResult.user_session_id == payment.session_id).first()
    if not session or not analysis or analysis.score < 75:
        raise ValueError("Rakaman berbayar tidak lagi layak untuk penilaian")
    from certification_service import grade_for_score
    application = CertificateApplication(
        certificate_type=payment.certificate_type,
        course_id=None,
        student_id=payment.student_id,
        qari_id=payment.qari_id,
        reference_id=payment.reference_id,
        session_id=payment.session_id,
        score_snapshot=analysis.score,
        suggested_grade=grade_for_score(analysis.score),
        status="pending",
    )
    db.add(application)
    db.flush()
    payment.application_id = application.id
    payment.status = "application_created"
    return application
