"""Append-only student attempts and hint reveals (P0-05).

Revision ID: 0004_student_attempts
Revises: 0003_curriculum
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_student_attempts"
down_revision = "0003_curriculum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mission_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_version_id", sa.Integer(), sa.ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("course_release_id", sa.Integer(), sa.ForeignKey("course_releases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("answer", sa.JSON(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_attempt_idempotency"),
    )
    op.create_index("ix_attempts_user_version", "mission_attempts", ["user_id", "mission_version_id"])
    op.create_table(
        "hint_reveals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_version_id", sa.Integer(), sa.ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "mission_version_id", "level", name="uq_hint_reveal"),
    )


def downgrade() -> None:
    op.drop_table("hint_reveals")
    op.drop_index("ix_attempts_user_version", table_name="mission_attempts")
    op.drop_table("mission_attempts")
