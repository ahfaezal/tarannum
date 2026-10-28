"""Add a short manual course join code.

Revision ID: 20261028_0005
Revises: 20261028_0004
Create Date: 2026-10-28
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261028_0005"
down_revision: Union[str, None] = "20261028_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS join_pin VARCHAR(6)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_join_pin "
        "ON courses (join_pin)"
    )


def downgrade() -> None:
    pass
