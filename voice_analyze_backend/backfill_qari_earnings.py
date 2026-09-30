"""Idempotently create RM10 earnings for assessments completed before ledger launch."""
import argparse

from database import AuditLog, CertificateApplication, QariEarning, SessionLocal, init_db
from qari_earnings_service import record_assessment_earning


def backfill(apply: bool = False) -> dict:
    init_db()
    db = SessionLocal()
    try:
        completed = db.query(CertificateApplication).filter(
            CertificateApplication.status.in_(("approved", "rejected", "resubmission_requested")),
            CertificateApplication.decided_at.isnot(None),
        ).order_by(CertificateApplication.decided_at.asc()).all()
        existing_ids = {row[0] for row in db.query(QariEarning.application_id).all()}
        missing = [application for application in completed if application.id not in existing_ids]
        if apply:
            for application in missing:
                earning = record_assessment_earning(db, application)
                db.add(AuditLog(
                    action="backfill_qari_earning",
                    entity_type="qari_earning",
                    entity_id=str(earning.id),
                    user_id=application.qari_id,
                    new_values={"application_id": str(application.id), "amount_cents": earning.amount_cents},
                ))
            db.commit()
        return {
            "completed": len(completed),
            "existing": len(existing_ids),
            "created": len(missing) if apply else 0,
            "would_create": len(missing),
            "amount_cents": len(missing) * 1000,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Commit missing earning records")
    args = parser.parse_args()
    print(backfill(apply=args.apply))
