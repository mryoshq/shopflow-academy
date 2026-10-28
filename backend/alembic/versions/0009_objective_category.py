"""Optional category of a learning objective (sprint 2, part G, ADR-0022).

Revision ID: 0009_objective_category
Revises: 0008_module_description
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_objective_category"
down_revision = "0008_module_description"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Empty = category deduced from the code prefix (SQL-, PY-, BLOC-): existing rows are unchanged.
    with op.batch_alter_table("learning_objectives") as batch:
        batch.add_column(sa.Column("category", sa.String(60), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("learning_objectives") as batch:
        batch.drop_column("category")
