"""Part K: opt-in leaderboard preferences and separate pseudonyms."""

from alembic import op
import sqlalchemy as sa

revision = "0011_leaderboard"
down_revision = "0010_attempt_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leaderboard_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("top_three", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("hide_open_block", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("cohort_id", "course_id", name="uq_leaderboard_class_course"),
    )
    op.create_table(
        "leaderboard_names",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("display_name", sa.String(24), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("leaderboard_names")
    op.drop_table("leaderboard_settings")
