"""Allow an exact, course-specific completion cut-off.

Revision ID: 20261123_0011
Revises: 20261108_0010
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261123_0011"
down_revision: Union[str, None] = "20261108_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS completion_deadline_at TIMESTAMP")
    # 23:59:59 Malaysia time is 15:59:59 UTC.  This preserves all recordings
    # made on 23 November 2026 while applying only to this confirmed course.
    op.execute(
        """
        UPDATE courses
        SET completion_deadline_at = TIMESTAMP '2026-11-23 15:59:59'
        WHERE title = 'Kursus Profesional Azan Maqam Hijjaz'
          AND starts_at = TIMESTAMP '2026-10-24 00:30:00'
        """
    )


def downgrade() -> None:
    # Kept as no-op so a rollback never shortens an already-announced course window.
    pass
