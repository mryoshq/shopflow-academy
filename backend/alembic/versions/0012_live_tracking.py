"""Live tracking (sprint 2, part H, ADR-0023).

Revision ID: 0012_live_tracking
Revises: 0011_leaderboard

New tables only: presence, notifications (students and teacher), per-student block
unlocks, push subscriptions, notification settings and the automatic opening plan.
Nothing existing is modified.
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_live_tracking"
down_revision = "0011_leaderboard"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "presences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("online_since", sa.DateTime(timezone=True), nullable=False),
        sa.Column("mission_version_id", sa.Integer(), nullable=True),
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("text", sa.String(280), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("dedup_key", sa.String(160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("recipient_id", "dedup_key", name="uq_notification_dedup"),
    )
    op.create_table(
        "block_unlocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chapter_id", sa.Integer(), sa.ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unlocked_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cohort_id", "chapter_id", "user_id", name="uq_block_unlock"),
    )
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("endpoint", sa.String(600), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "notification_settings",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_table(
        "block_plans",
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    for table in ("block_plans", "notification_settings", "push_subscriptions", "block_unlocks", "notifications", "presences"):
        op.drop_table(table)
