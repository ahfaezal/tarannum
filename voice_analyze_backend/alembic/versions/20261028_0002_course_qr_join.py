"""Add secure course QR join fields.

Revision ID: 20261028_0002
Revises: 20261028_0001
Create Date: 2026-10-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261028_0002"
down_revision: Union[str, None] = "20261028_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("join_code", sa.String(length=64), nullable=True))
    op.add_column(
        "courses",
        sa.Column("join_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column("courses", sa.Column("join_expires_at", sa.DateTime(), nullable=True))
    op.create_index("ix_courses_join_code", "courses", ["join_code"], unique=True)

    op.add_column(
        "course_enrollments",
        sa.Column(
            "enrollment_source",
            sa.String(),
            server_default="manual",
            nullable=False,
        ),
    )
    op.create_index(
        "ix_course_enrollments_enrollment_source",
        "course_enrollments",
        ["enrollment_source"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_course_enrollments_enrollment_source", table_name="course_enrollments")
    op.drop_column("course_enrollments", "enrollment_source")
    op.drop_index("ix_courses_join_code", table_name="courses")
    op.drop_column("courses", "join_expires_at")
    op.drop_column("courses", "join_enabled")
    op.drop_column("courses", "join_code")
