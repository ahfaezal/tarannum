"""Persist IQRA FastConformer diagnostics for calibration.

Revision ID: 20261107_0008
Revises: 20261106_0007
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261107_0008"
down_revision: Union[str, None] = "20261106_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "iqra_attempts",
        sa.Column("fastconformer_result", postgresql.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("iqra_attempts", "fastconformer_result")
