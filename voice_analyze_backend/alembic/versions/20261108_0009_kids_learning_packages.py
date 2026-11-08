"""Add Admin-defined learning packages for Tarannum Kids.

Revision ID: 20261108_0009
Revises: 20261107_0008
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261108_0009"
down_revision: Union[str, None] = "20261107_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kids_learning_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("package_key", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("package_type", sa.String(), nullable=False),
        sa.Column("level", sa.String(), nullable=True),
        sa.Column("source_metadata", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("assessment_engines", postgresql.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("completion_rules", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("allowed_agent_actions", postgresql.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("package_key", "version", name="uq_kids_package_key_version"),
    )
    for column in ("package_key", "package_type", "level", "status", "created_by"):
        op.create_index(f"ix_kids_learning_packages_{column}", "kids_learning_packages", [column])

    op.create_table(
        "kids_package_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("package_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("kids_learning_packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_key", sa.String(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.Column("activity_type", sa.String(), nullable=False),
        sa.Column("reference_text", sa.Text(), nullable=True),
        sa.Column("reference_id", sa.String(), nullable=True),
        sa.Column("sample_id", sa.String(), nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("assessment_config", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("package_id", "unit_key", name="uq_kids_package_unit_key"),
        sa.UniqueConstraint("package_id", "sequence", name="uq_kids_package_unit_sequence"),
    )
    op.create_index("ix_kids_package_units_package_id", "kids_package_units", ["package_id"])
    op.create_index("ix_kids_package_units_activity_type", "kids_package_units", ["activity_type"])

    op.create_table(
        "kids_package_transitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("from_package_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("kids_learning_packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_package_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("kids_learning_packages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("conditions", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("requires_human_approval", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("from_package_id", "to_package_id", "outcome", name="uq_kids_package_transition"),
    )
    for column in ("from_package_id", "to_package_id", "outcome"):
        op.create_index(f"ix_kids_package_transitions_{column}", "kids_package_transitions", [column])


def downgrade() -> None:
    op.drop_table("kids_package_transitions")
    op.drop_table("kids_package_units")
    op.drop_table("kids_learning_packages")
