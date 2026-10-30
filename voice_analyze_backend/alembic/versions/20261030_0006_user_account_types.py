"""Classify public account types without changing legacy authorization roles.

Revision ID: 20261030_0006
Revises: 20261028_0005
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261030_0006"
down_revision: Union[str, None] = "20261028_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'student'")
    op.execute("UPDATE users SET account_type = CASE WHEN role = 'admin' THEN 'admin' WHEN role = 'qari' THEN 'qari' ELSE 'student' END WHERE account_type IS NULL OR account_type = '' OR (account_type = 'student' AND role IN ('admin', 'qari'))")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_account_type ON users (account_type)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_account_type")
    op.drop_column("users", "account_type")
