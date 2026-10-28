"""Per-course rules against random clicking (sprint 2, part L, ADR-0027).

Revision ID: 0010_attempt_rules
Revises: 0009_objective_category

Existing attempts keep their stored points: the new columns are empty for them
(percent NULL = 100 %, never recomputed).
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_attempt_rules"
down_revision = "0009_objective_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch:
        batch.add_column(sa.Column("attempt_rules", sa.JSON(), nullable=True))
    with op.batch_alter_table("mission_attempts") as batch:
        batch.add_column(sa.Column("attempt_number", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("percent", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("fast", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "mission_openings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_version_id", sa.Integer(), sa.ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "mission_version_id", name="uq_mission_opening"),
    )


def downgrade() -> None:
    op.drop_table("mission_openings")
    with op.batch_alter_table("mission_attempts") as batch:
        batch.drop_column("fast")
        batch.drop_column("percent")
        batch.drop_column("attempt_number")
    with op.batch_alter_table("courses") as batch:
        batch.drop_column("attempt_rules")
