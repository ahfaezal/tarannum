"""Add isolated IQRA attempt and progress tables for Tarannum Kids.

Revision ID: 20261106_0007
Revises: 20261030_0006
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261106_0007"
down_revision: Union[str, None] = "20261030_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "iqra_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sample_id", sa.String(), nullable=False), sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False), sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("reference_text", sa.Text(), nullable=False), sa.Column("recognized_text", sa.Text()),
        sa.Column("accuracy_score", sa.Float()), sa.Column("completeness_score", sa.Float()),
        sa.Column("fluency_score", sa.Float()), sa.Column("pronunciation_score", sa.Float()),
        sa.Column("unit_score", sa.Float(), nullable=False), sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("valid_attempt", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("duration_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("credited_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("word_results", postgresql.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("provider", sa.String(), nullable=False), sa.Column("decision_reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column in ("student_id", "sample_id", "unit_id", "level", "passed", "valid_attempt", "created_at"):
        op.create_index(f"ix_iqra_attempts_{column}", "iqra_attempts", [column])
    op.create_table(
        "iqra_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sample_id", sa.String(), nullable=False), sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False), sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("best_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_attempt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("iqra_attempts.id", ondelete="SET NULL")),
        sa.Column("first_passed_at", sa.DateTime()), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("student_id", "sample_id", name="uq_iqra_progress_student_sample"),
    )
    for column in ("student_id", "sample_id", "unit_id", "level", "passed"):
        op.create_index(f"ix_iqra_progress_{column}", "iqra_progress", [column])


def downgrade() -> None:
    op.drop_table("iqra_progress")
    op.drop_table("iqra_attempts")
