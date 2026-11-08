"""Idempotently create the first Tarannum Kids package in staging only."""
from __future__ import annotations

import os


def _require_staging() -> None:
    environment = (
        os.getenv("RAILWAY_ENVIRONMENT_NAME")
        or os.getenv("ENVIRONMENT")
        or ""
    ).strip().lower()
    if environment != "staging":
        raise RuntimeError("Refusing to seed Kids packages outside staging")


def main() -> None:
    _require_staging()

    from database import KidsLearningPackage, SessionLocal, User
    from kids_package_endpoints import PackageCreate, PackageUnitInput, create_package

    db = SessionLocal()
    try:
        package_key = "iqra-3-demo-page-1"
        existing = db.query(KidsLearningPackage).filter(
            KidsLearningPackage.package_key == package_key,
        ).order_by(KidsLearningPackage.version.desc()).first()
        if existing:
            print(
                f"Kids staging package already exists: id={existing.id} "
                f"key={existing.package_key} version={existing.version} status={existing.status}"
            )
            return

        admin = db.query(User).filter(
            User.role == "admin",
            User.is_active.is_(True),
        ).order_by(User.created_at.asc()).first()
        if admin is None:
            raise RuntimeError("No active staging admin is available to own the package")

        payload = PackageCreate(
            package_key=package_key,
            title="IQRA 3 - Pakej Demonstrasi",
            description=(
                "Pakej staging pertama untuk mengesahkan aliran Admin, unit latihan, "
                "Azure Speech, FastConformer dan keputusan agen terkawal."
            ),
            package_type="page",
            level="IQRA 3",
            source_metadata={
                "book_title": "IQRA 3 (Sampel Pembangunan)",
                "page_number": 1,
                "content_status": "demonstration",
            },
            assessment_engines=["azure_speech", "fastconformer"],
            completion_rules={
                "required_unit_pass_rate": 1.0,
                "minimum_valid_attempts_per_unit": 1,
                "require_in_sequence": True,
            },
            allowed_agent_actions=[
                "advance",
                "retain",
                "remedial",
                "foundation",
                "human_review",
                "notify_parent",
                "notify_teacher",
            ],
            units=[
                PackageUnitInput(
                    unit_key="perkataan-1",
                    sequence=1,
                    title="Perkataan 1",
                    instruction="Baca setiap perkataan dengan jelas mengikut susunan.",
                    activity_type="iqra_reading",
                    reference_text="شَهِدَ لَعِبَ عَلِمَ رَضِيَ",
                    required=True,
                    assessment_config={"reading_mode": "word_sequence"},
                ),
                PackageUnitInput(
                    unit_key="perkataan-2",
                    sequence=2,
                    title="Perkataan 2",
                    instruction="Baca setiap perkataan dengan baris yang tepat.",
                    activity_type="iqra_reading",
                    reference_text="فِعْلًا فَاعِلٌ كِتَابٌ كَاتِبٌ",
                    required=True,
                    assessment_config={"reading_mode": "word_sequence"},
                ),
                PackageUnitInput(
                    unit_key="perkataan-3",
                    sequence=3,
                    title="Perkataan 3",
                    instruction="Baca setiap perkataan dengan jelas dan lancar.",
                    activity_type="iqra_reading",
                    reference_text="جِهَادٌ جَامِدٌ غَفَّارٌ غَافِرٌ",
                    required=True,
                    assessment_config={"reading_mode": "word_sequence"},
                ),
            ],
        )
        created = create_package(payload=payload, admin=admin, db=db)
        print(
            f"Created Kids staging package: id={created['id']} "
            f"key={created['package_key']} version={created['version']} "
            f"status={created['status']} units={len(created['units'])}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
