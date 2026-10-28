"""Repair course QR columns on deployments that skipped pre-deploy migration.

Revision ID: 20261028_0003
Revises: 20261028_0002
Create Date: 2026-10-28

Railway did not execute the configured pre-deploy command for an earlier
deployment.  Keep this revision idempotent so both untouched and partially
updated production databases converge on the expected schema.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261028_0003"
down_revision: Union[str, None] = "20261028_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
    # Revision 0002 owns these fields.  This repair revision intentionally has
    # no destructive downgrade of its own.
    pass
