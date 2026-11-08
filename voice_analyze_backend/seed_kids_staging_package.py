"""Idempotently create the Tarannum Kids demonstration path in staging only."""
from __future__ import annotations

import os

IQRA3_KEY = "iqra-3-demo-page-1"
IQRA6_KEY = "iqra-6-al-fatihah"
TARANNUM_KEY = "tarannum-al-fatihah-nahawand"
TARANNUM_REFERENCE_ID = "83fb669fe34c252fd2a4d0c3349ead16"


def _require_staging() -> None:
    environment = (os.getenv("RAILWAY_ENVIRONMENT_NAME") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if environment != "staging":
        raise RuntimeError("Refusing to seed Kids packages outside staging")


def _common_rules() -> dict:
    return {
        "required_unit_pass_rate": 1.0,
        "minimum_valid_attempts_per_unit": 1,
        "require_in_sequence": True,
        "agent_minimum_confidence": 0.75,
        "agent_advance_minimum_score": 80,
        "agent_remedial_below_score": 70,
    }


def _actions() -> list[str]:
    return ["advance", "retain", "remedial", "foundation", "human_review", "notify_parent", "notify_teacher"]


def main() -> None:
    _require_staging()
    from database import KidsLearningPackage, SessionLocal, User
    from kids_package_endpoints import PackageCreate, PackageUnitInput, TransitionInput, create_package, publish_package, replace_transitions

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).order_by(User.created_at.asc()).first()
        if admin is None:
            raise RuntimeError("No active staging admin is available to own the packages")

        def ensure(payload: PackageCreate):
            existing = db.query(KidsLearningPackage).filter(KidsLearningPackage.package_key == payload.package_key).order_by(KidsLearningPackage.version.desc()).first()
            if existing:
                print(f"Existing package: {existing.package_key} v{existing.version} ({existing.status})")
                return existing
            result = create_package(payload=payload, admin=admin, db=db)
            package = db.query(KidsLearningPackage).filter(
                KidsLearningPackage.package_key == result["package_key"],
                KidsLearningPackage.version == result["version"],
            ).one()
            print(f"Created package: {package.package_key} v{package.version} ({package.status})")
            return package

        iqra3 = ensure(PackageCreate(
            package_key=IQRA3_KEY, title="IQRA 3 - Latihan Perkataan",
            description="Tiga unit bacaan perkataan daripada IQRA 3.", package_type="page", level="IQRA 3",
            source_metadata={"book_title": "IQRA 3", "page_number": 1, "content_status": "demonstration"},
            assessment_engines=["azure_speech", "fastconformer"], completion_rules=_common_rules(), allowed_agent_actions=_actions(),
            units=[
                PackageUnitInput(unit_key="perkataan-1", sequence=1, title="Perkataan 1", instruction="Baca setiap perkataan dengan jelas mengikut susunan.", activity_type="iqra_reading", reference_text="شَهِدَ لَعِبَ عَلِمَ رَضِيَ", sample_id="iqra-3-unit-1", assessment_config={"reading_mode": "word_sequence"}),
                PackageUnitInput(unit_key="perkataan-2", sequence=2, title="Perkataan 2", instruction="Baca setiap perkataan dengan baris yang tepat.", activity_type="iqra_reading", reference_text="فِعْلًا فَاعِلٌ كِتَابٌ كَاتِبٌ", sample_id="iqra-3-unit-2", assessment_config={"reading_mode": "word_sequence"}),
                PackageUnitInput(unit_key="perkataan-3", sequence=3, title="Perkataan 3", instruction="Baca setiap perkataan dengan jelas dan lancar.", activity_type="iqra_reading", reference_text="جِهَادٌ جَامِدٌ غَفَّارٌ غَافِرٌ", sample_id="iqra-3-unit-3", assessment_config={"reading_mode": "word_sequence"}),
            ],
        ))

        ayat = [
            "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", "الرَّحْمَٰنِ الرَّحِيمِ",
            "مَالِكِ يَوْمِ الدِّينِ", "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
            "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ",
        ]
        iqra6 = ensure(PackageCreate(
            package_key=IQRA6_KEY, title="IQRA 6 - Surah Al-Fatihah",
            description="Bacaan lengkap Surah Al-Fatihah, satu ayat pada satu masa.", package_type="surah", level="IQRA 6",
            source_metadata={"surah_name": "Al-Fatihah", "ayah_start": 1, "ayah_end": 7, "content_status": "demonstration"},
            assessment_engines=["azure_speech", "fastconformer"], completion_rules=_common_rules(), allowed_agent_actions=_actions(),
            units=[PackageUnitInput(unit_key=f"ayat-{index}", sequence=index, title=f"Al-Fatihah - Ayat {index}", instruction="Baca ayat secara bersambung, lengkap dan jelas.", activity_type="iqra_reading", reference_text=text, sample_id=f"iqra-6-ayah-{index}", assessment_config={"reading_mode": "continuous_ayah"}) for index, text in enumerate(ayat, 1)],
        ))

        tarannum = ensure(PackageCreate(
            package_key=TARANNUM_KEY, title="Tarannum - Al-Fatihah Nahawand",
            description="Dengar, latih dan rakam Surah Al-Fatihah dalam lagu Nahawand.", package_type="surah", level="Tarannum",
            source_metadata={"surah_name": "Al-Fatihah", "maqam": "Nahawand", "reference_id": TARANNUM_REFERENCE_ID},
            assessment_engines=["tarannum"], completion_rules=_common_rules(), allowed_agent_actions=_actions(),
            units=[PackageUnitInput(unit_key="rakaman-al-fatihah", sequence=1, title="Rakaman Al-Fatihah Nahawand", instruction="Rakam bacaan penuh dan capai markah lulus.", activity_type="tarannum_record", reference_id=TARANNUM_REFERENCE_ID, assessment_config={"minimum_score": 80})],
        ))

        advance_conditions = {"min_average_score": 80, "min_pass_rate": 1.0, "min_confidence": 0.75, "max_failed_units": 0}
        if tarannum.status == "draft":
            publish_package(package_id=tarannum.id, admin=admin, db=db)
        if iqra6.status == "draft":
            replace_transitions(package_id=iqra6.id, payload=[TransitionInput(to_package_id=tarannum.id, outcome="advance", priority=10, conditions=advance_conditions)], admin=admin, db=db)
            publish_package(package_id=iqra6.id, admin=admin, db=db)
        if iqra3.status == "draft":
            replace_transitions(package_id=iqra3.id, payload=[TransitionInput(to_package_id=iqra6.id, outcome="advance", priority=10, conditions=advance_conditions)], admin=admin, db=db)
            publish_package(package_id=iqra3.id, admin=admin, db=db)

        print("Published learning path:")
        print(f"  {IQRA3_KEY} -> {IQRA6_KEY} -> {TARANNUM_KEY}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
