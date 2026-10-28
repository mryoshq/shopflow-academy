"""Points awarded per attempt (P0-06).

Revision ID: 0005_attempt_points
Revises: 0004_student_attempts
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_attempt_points"
down_revision = "0004_student_attempts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable: attempts recorded before P0-06 are scored from is_correct at read time.
    with op.batch_alter_table("mission_attempts") as batch:
        batch.add_column(sa.Column("points", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("mission_attempts") as batch:
        batch.drop_column("points")
