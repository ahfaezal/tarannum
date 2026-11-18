"""Add central-student package execution and agent audit records.

Revision ID: 20261108_0010
Revises: 20261108_0009
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261108_0010"
down_revision: Union[str, None] = "20261108_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid():
    return postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "kids_package_assignments",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("student_id", _uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("package_id", _uuid(), sa.ForeignKey("kids_learning_packages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by", _uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="admin"),
        sa.Column("status", sa.String(), nullable=False, server_default="assigned"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("assignment_metadata", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("assigned_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    for column in ("student_id", "package_id", "assigned_by", "source", "status", "assigned_at"):
        op.create_index(f"ix_kids_package_assignments_{column}", "kids_package_assignments", [column])

    op.create_table(
        "kids_package_runs",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("assignment_id", _uuid(), sa.ForeignKey("kids_package_assignments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("student_id", _uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("package_id", _uuid(), sa.ForeignKey("kids_learning_packages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("package_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="in_progress"),
        sa.Column("completion_evaluation", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("valid_activity_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    for column in ("assignment_id", "student_id", "package_id", "status", "started_at", "completed_at"):
        op.create_index(f"ix_kids_package_runs_{column}", "kids_package_runs", [column])

    op.create_table(
        "kids_package_unit_results",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("run_id", _uuid(), sa.ForeignKey("kids_package_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_id", _uuid(), sa.ForeignKey("kids_package_units.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("score_summary", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("evidence_refs", postgresql.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("engine_results", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("valid_attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("credited_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("evaluated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "unit_id", name="uq_kids_package_unit_result"),
    )
    for column in ("run_id", "unit_id", "status"):
        op.create_index(f"ix_kids_package_unit_results_{column}", "kids_package_unit_results", [column])

    op.create_table(
        "kids_agent_decisions",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("run_id", _uuid(), sa.ForeignKey("kids_package_runs.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("student_id", _uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("package_id", _uuid(), sa.ForeignKey("kids_learning_packages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("transition_id", _uuid(), sa.ForeignKey("kids_package_transitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("strengths", postgresql.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("weaknesses", postgresql.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("evidence_snapshot", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("rules_snapshot", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("requires_human_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("review_status", sa.String(), nullable=False, server_default="not_required"),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("policy_version", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column in ("run_id", "student_id", "package_id", "transition_id", "outcome", "requires_human_review", "review_status", "created_at"):
        op.create_index(f"ix_kids_agent_decisions_{column}", "kids_agent_decisions", [column])

    op.create_table(
        "kids_learning_plans",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("student_id", _uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decision_id", _uuid(), sa.ForeignKey("kids_agent_decisions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("target_package_id", _uuid(), sa.ForeignKey("kids_learning_packages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="proposed"),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("plan_metadata", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    for column in ("student_id", "decision_id", "target_package_id", "action", "status", "created_at"):
        op.create_index(f"ix_kids_learning_plans_{column}", "kids_learning_plans", [column])

    op.create_table(
        "kids_agent_overrides",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("decision_id", _uuid(), sa.ForeignKey("kids_agent_decisions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("student_id", _uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("overridden_by", _uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("replacement_payload", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column in ("decision_id", "student_id", "overridden_by", "action", "created_at"):
        op.create_index(f"ix_kids_agent_overrides_{column}", "kids_agent_overrides", [column])


def downgrade() -> None:
    op.drop_table("kids_agent_overrides")
    op.drop_table("kids_learning_plans")
    op.drop_table("kids_agent_decisions")
    op.drop_table("kids_package_unit_results")
    op.drop_table("kids_package_runs")
    op.drop_table("kids_package_assignments")
