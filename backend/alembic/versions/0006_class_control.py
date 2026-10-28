"""Class control: pause/resume per assignment, per-student unlocks, audit details (P0-07).

Revision ID: 0006_class_control
Revises: 0005_attempt_points
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_class_control"
down_revision = "0005_attempt_points"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assignments") as batch:
        batch.add_column(sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("audit_events") as batch:
        batch.add_column(sa.Column("details", sa.JSON(), nullable=True))
    op.create_table(
        "mission_unlocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_version_id", sa.Integer(), sa.ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("unlocked_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "mission_version_id", name="uq_mission_unlock"),
    )


def downgrade() -> None:
    op.drop_table("mission_unlocks")
    with op.batch_alter_table("audit_events") as batch:
        batch.drop_column("details")
    with op.batch_alter_table("assignments") as batch:
        batch.drop_column("paused_at")
