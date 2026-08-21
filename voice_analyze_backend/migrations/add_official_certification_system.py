"""Create the official Tarannum.ai course and certification tables.

Run from voice_analyze_backend with:
    python migrations/add_official_certification_system.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import Base, engine


CERTIFICATION_TABLES = {
    "courses",
    "course_enrollments",
    "certificate_applications",
    "qari_signatures",
    "certificates",
    "certificate_events",
    "certification_notifications",
}


def migrate():
    tables = [table for table in Base.metadata.sorted_tables if table.name in CERTIFICATION_TABLES]
    Base.metadata.create_all(bind=engine, tables=tables, checkfirst=True)
    print("Official certification tables are ready:")
    for table in tables:
        print(f"- {table.name}")


if __name__ == "__main__":
    migrate()
