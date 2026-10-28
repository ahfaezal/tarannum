"""Verify and persist the course QR schema after transaction repair.

Revision ID: 20261028_0004
Revises: 20261028_0003
Create Date: 2026-10-28
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261028_0004"
down_revision: Union[str, None] = "20261028_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Revision 0003 may have been recorded before the shared-connection
    # transaction fix, while its PostgreSQL DDL was rolled back.  Repeat the
    # repair idempotently under the corrected, explicitly committed runner.
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS join_code VARCHAR(64)")
    op.execute(
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS "
        "join_enabled BOOLEAN NOT NULL DEFAULT TRUE"
    )
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS join_expires_at TIMESTAMP")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_join_code "
        "ON courses (join_code)"
    )
    op.execute(
        "ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS "
        "enrollment_source VARCHAR NOT NULL DEFAULT 'manual'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_course_enrollments_enrollment_source "
        "ON course_enrollments (enrollment_source)"
    )


def downgrade() -> None:
    pass
