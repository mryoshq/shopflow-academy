"""ADR-0039: earned badges and the class goal (streaks, experience and levels are computed, not stored)."""

from alembic import op
import sqlalchemy as sa

revision = "0015_rewards"
down_revision = "0014_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_badges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(160), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("rules_version", sa.Integer(), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "course_id", "key", name="uq_student_badge"),
    )
    op.create_index("ix_student_badges_user_id", "student_badges", ["user_id"])
    op.create_table(
        "class_goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric", sa.String(16), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("cohort_id", "course_id", name="uq_class_goal"),
    )


def downgrade() -> None:
    op.drop_table("class_goals")
    op.drop_index("ix_student_badges_user_id", table_name="student_badges")
    op.drop_table("student_badges")
