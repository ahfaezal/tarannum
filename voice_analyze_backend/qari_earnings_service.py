"""Ledger, encrypted bank details and withdrawals for Qari assessments."""
from __future__ import annotations

import base64
import hashlib
import os
from datetime import datetime

from cryptography.fernet import Fernet
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import SECRET_KEY
from database import CertificateApplication, Course, QariBankAccount, QariEarning, QariWithdrawal, User

ASSESSMENT_FEE_CENTS = 1000
MINIMUM_WITHDRAWAL_CENTS = 5000


def _cipher() -> Fernet:
    secret = os.getenv("BANK_DETAILS_ENCRYPTION_KEY") or SECRET_KEY
    key = base64.urlsafe_b64encode(hashlib.sha256((secret + ":qari-bank:v1").encode("utf-8")).digest())
    return Fernet(key)


def encrypt_account_number(value: str) -> str:
    return _cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_account_number(value: str) -> str:
    return _cipher().decrypt(value.encode("ascii")).decode("utf-8")


def bank_payload(row: QariBankAccount | None) -> dict:
    if not row:
        return {"configured": False}
    return {
        "configured": True,
        "account_holder_name": row.account_holder_name,
        "bank_name": row.bank_name,
        "account_number_masked": f"•••• {row.account_number_last4}",
        "is_verified": bool(row.is_verified),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def record_assessment_earning(db: Session, application: CertificateApplication) -> QariEarning:
    existing = db.query(QariEarning).filter(QariEarning.application_id == application.id).first()
    if existing:
        return existing
    earning = QariEarning(
        application_id=application.id,
        qari_id=application.qari_id,
        student_id=application.student_id,
        course_id=application.course_id,
        payer_type="tarannum" if application.course_id else "participant",
        amount_cents=ASSESSMENT_FEE_CENTS,
        currency="MYR",
        status="available",
        decision=application.status,
        earned_at=application.decided_at or datetime.utcnow(),
    )
    db.add(earning)
    db.flush()
    return earning


def qari_finance_summary(db: Session, qari_id) -> dict:
    rows = db.query(QariEarning).filter(QariEarning.qari_id == qari_id).order_by(QariEarning.earned_at.desc()).all()
    totals = {status: sum(row.amount_cents for row in rows if row.status == status) for status in (
        "available", "withdrawal_pending", "paid", "held", "cancelled"
    )}
    withdrawals = db.query(QariWithdrawal).filter(QariWithdrawal.qari_id == qari_id).order_by(
        QariWithdrawal.requested_at.desc()
    ).limit(25).all()
    student_names = {u.id: (u.full_name or u.email) for u in db.query(User).filter(
        User.id.in_([row.student_id for row in rows] or [qari_id])
    ).all()}
    course_titles = {c.id: c.title for c in db.query(Course).filter(
        Course.id.in_([row.course_id for row in rows if row.course_id] or [None])
    ).all()}
    return {
        "currency": "MYR",
        "fee_per_assessment_cents": ASSESSMENT_FEE_CENTS,
        "minimum_withdrawal_cents": MINIMUM_WITHDRAWAL_CENTS,
        "available_cents": totals["available"],
        "pending_withdrawal_cents": totals["withdrawal_pending"],
        "paid_cents": totals["paid"],
        "assessment_count": len([row for row in rows if row.status not in {"cancelled"}]),
        "earnings": [{
            "id": str(row.id),
            "student_name": student_names.get(row.student_id, "PESERTA"),
            "course_title": course_titles.get(row.course_id) if row.course_id else None,
            "payer_type": row.payer_type,
            "amount_cents": row.amount_cents,
            "status": row.status,
            "decision": row.decision,
            "earned_at": row.earned_at.isoformat(),
        } for row in rows[:50]],
        "withdrawals": [{
            "id": str(row.id), "amount_cents": row.amount_cents, "status": row.status,
            "bank_name": row.bank_name, "account_number_masked": f"•••• {row.account_number_last4}",
            "requested_at": row.requested_at.isoformat(),
            "processed_at": row.processed_at.isoformat() if row.processed_at else None,
            "payment_reference": row.payment_reference,
        } for row in withdrawals],
    }


def request_withdrawal(db: Session, qari_id, amount_cents: int) -> QariWithdrawal:
    if amount_cents < MINIMUM_WITHDRAWAL_CENTS:
        raise ValueError("Pengeluaran minimum ialah RM50.00")
    if amount_cents % ASSESSMENT_FEE_CENTS:
        raise ValueError("Jumlah pengeluaran mestilah dalam gandaan RM10.00")
    bank = db.query(QariBankAccount).filter(QariBankAccount.qari_id == qari_id).first()
    if not bank:
        raise ValueError("Lengkapkan maklumat akaun bank sebelum membuat pengeluaran")
    count = amount_cents // ASSESSMENT_FEE_CENTS
    earnings = db.query(QariEarning).filter(
        QariEarning.qari_id == qari_id, QariEarning.status == "available"
    ).order_by(QariEarning.earned_at.asc()).with_for_update().limit(count).all()
    if len(earnings) != count or sum(row.amount_cents for row in earnings) != amount_cents:
        raise ValueError("Baki yang tersedia tidak mencukupi")
    withdrawal = QariWithdrawal(
        qari_id=qari_id, amount_cents=amount_cents, currency="MYR", status="requested",
        account_holder_name=bank.account_holder_name, bank_name=bank.bank_name,
        account_number_encrypted=bank.account_number_encrypted,
        account_number_last4=bank.account_number_last4,
    )
    db.add(withdrawal)
    db.flush()
    for earning in earnings:
        earning.status = "withdrawal_pending"
        earning.withdrawal_id = withdrawal.id
    return withdrawal
