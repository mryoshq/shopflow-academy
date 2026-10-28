"""Module introduction shown to students when the module opens (sprint 2, part D).

Revision ID: 0008_module_description
Revises: 0007_blocks_help
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_module_description"
down_revision = "0007_blocks_help"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("course_modules") as batch:
        batch.add_column(sa.Column("description", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("course_modules") as batch:
        batch.drop_column("description")
