"""ADR-0042: professional observer space (types, invitations, stable aliases)."""

from alembic import op
import sqlalchemy as sa

revision = "0017_observer_pro"
down_revision = "0016_project_draw"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("observers") as batch:
        batch.add_column(sa.Column("kind", sa.String(16), nullable=False, server_default="guest"))
        batch.add_column(sa.Column("full_name", sa.String(120), nullable=False, server_default=""))
        batch.add_column(sa.Column("email", sa.String(254), nullable=True))
    # Existing accounts keep what they could see: a named observer becomes « Administration ».
    op.execute("UPDATE observers SET kind = 'admin' WHERE named")
    op.create_table(
        "observer_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("observer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_observer_invitations_observer_id", "observer_invitations", ["observer_id"])
    op.create_table(
        "observer_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("observer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.UniqueConstraint("observer_id", "student_id", name="uq_observer_alias"),
        sa.UniqueConstraint("observer_id", "number", name="uq_observer_alias_number"),
    )


def downgrade() -> None:
    op.drop_table("observer_aliases")
    op.drop_index("ix_observer_invitations_observer_id", table_name="observer_invitations")
    op.drop_table("observer_invitations")
    with op.batch_alter_table("observers") as batch:
        batch.drop_column("email")
        batch.drop_column("full_name")
        batch.drop_column("kind")
