"""Issue #107: deposits open until the defence (class closing time, per-team override)."""

from alembic import op
import sqlalchemy as sa

revision = "0020_deposit_close"
down_revision = "0019_final_grade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both empty by default: nothing closes until the teacher sets a time or a defence slot starts.
    op.create_table(
        "project_settings",
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("deposits_close_at", sa.DateTime(timezone=True), nullable=True),
    )
    with op.batch_alter_table("project_teams") as batch:
        batch.add_column(sa.Column("deposits_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("project_teams") as batch:
        batch.drop_column("deposits_until")
    op.drop_table("project_settings")
