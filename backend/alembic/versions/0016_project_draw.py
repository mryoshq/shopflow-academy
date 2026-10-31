"""ADR-0041: surprise draw for the project space (sign-ups, recorded draws, reveal once)."""

from alembic import op
import sqlalchemy as sa

revision = "0016_project_draw"
down_revision = "0015_rewards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_draws",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seed", sa.String(64), nullable=False),
        sa.Column("pool", sa.JSON(), nullable=False),
        sa.Column("included_teams", sa.JSON(), nullable=False),
        sa.Column("groups", sa.JSON(), nullable=False),
        sa.Column("left_out", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cohort_id", "seed", name="uq_project_draw_seed"),
    )
    op.create_index("ix_project_draws_cohort_id", "project_draws", ["cohort_id"])
    op.create_table(
        "project_draw_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cohort_id", "user_id", name="uq_project_draw_entry"),
    )
    with op.batch_alter_table("project_members") as batch:
        batch.add_column(sa.Column("draw_id", sa.Integer(), nullable=True))  # the draw that placed the person (no FK: audit record)
        batch.add_column(sa.Column("revealed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("project_members") as batch:
        batch.drop_column("revealed_at")
        batch.drop_column("draw_id")
    op.drop_table("project_draw_entries")
    op.drop_index("ix_project_draws_cohort_id", table_name="project_draws")
    op.drop_table("project_draws")
