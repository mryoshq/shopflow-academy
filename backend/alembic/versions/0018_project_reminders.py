"""ADR-0045: automatic milestone reminders (switch per milestone, log of what was sent)."""

from alembic import op
import sqlalchemy as sa

revision = "0018_project_reminders"
down_revision = "0017_observer_pro"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("project_milestones") as batch:
        batch.add_column(sa.Column("reminders", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table(
        "project_reminders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("milestone_id", sa.Integer(), sa.ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reminder", sa.String(8), nullable=False),
        sa.Column("target", sa.String(32), nullable=False),
        sa.Column("recipients", sa.JSON(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("milestone_id", "reminder", "target", name="uq_project_reminder"),
    )
    op.create_index("ix_project_reminders_milestone_id", "project_reminders", ["milestone_id"])


def downgrade() -> None:
    op.drop_index("ix_project_reminders_milestone_id", table_name="project_reminders")
    op.drop_table("project_reminders")
    with op.batch_alter_table("project_milestones") as batch:
        batch.drop_column("reminders")
