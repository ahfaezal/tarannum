"""Baseline the schema managed by Tarannum before Alembic.

Revision ID: 20261028_0001
Revises: None
Create Date: 2026-10-28

This revision is deliberately empty. Existing production databases already
contain the legacy schema and are stamped at this revision by migration_runner.
All schema changes after this point must be expressed as Alembic revisions.
"""

from typing import Sequence, Union


revision: str = "20261028_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
