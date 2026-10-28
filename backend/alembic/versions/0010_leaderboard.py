"""Class leaderboard settings and the students' chosen display name (sprint 2, part K, ADR-0026).

Revision ID: 0010_leaderboard
Revises: 0009_objective_category
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_leaderboard"
down_revision = "0009_objective_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Off by default: nothing changes for a class until the teacher turns it on.
    with op.batch_alter_table("cohorts") as batch:
        batch.add_column(sa.Column("leaderboard_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("leaderboard_top3_only", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("leaderboard_hide_during_block", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("public_name", sa.String(24), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("public_name")
    with op.batch_alter_table("cohorts") as batch:
        batch.drop_column("leaderboard_hide_during_block")
        batch.drop_column("leaderboard_top3_only")
        batch.drop_column("leaderboard_enabled")
