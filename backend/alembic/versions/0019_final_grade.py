"""ADR-0046: project grid of the two subjects (former grid kept) and the final grade settings."""

from alembic import op
import sqlalchemy as sa

revision = "0019_final_grade"
down_revision = "0018_project_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nothing already entered is changed: the former grid's columns stay as they are.
    with op.batch_alter_table("project_grades") as batch:
        batch.add_column(sa.Column("scores", sa.JSON(), nullable=True))
    op.create_table(
        "grade_settings",
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("grade_settings")
    with op.batch_alter_table("project_grades") as batch:
        batch.drop_column("scores")
