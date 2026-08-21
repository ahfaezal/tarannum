"""Create the promotion campaign and participant registration tables."""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import Base, PromotionCampaign, PromotionRegistration, SessionLocal, engine


def migrate() -> None:
    Base.metadata.create_all(
        bind=engine,
        tables=[PromotionCampaign.__table__, PromotionRegistration.__table__],
        checkfirst=True,
    )
    db = SessionLocal()
    try:
        slug = "kursus-muazzin-hijjaz-2026"
        campaign = db.query(PromotionCampaign).filter(PromotionCampaign.slug == slug).first()
        if not campaign:
            campaign = db.query(PromotionCampaign).filter(
                PromotionCampaign.slug == "kursus-muazzin-soba-2026"
            ).first()
            if campaign:
                campaign.slug = slug
                campaign.title = "Kursus Pemantapan Muazzin Azan Maqam Hijjaz"
                db.commit()
        if not campaign:
            db.add(PromotionCampaign(
                slug=slug,
                title="Kursus Pemantapan Muazzin Azan Maqam Hijjaz",
                starts_at=datetime(2026, 9, 19, 8, 30),
                capacity=20,
                price_cents=10000,
                status="published",
            ))
            db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
    print("Promotion registration migration completed")
