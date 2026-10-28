"""Read-only observers (sprint 2, part J, ADR-0025).

Revision ID: 0013_observers
Revises: 0012_live_tracking

Adds the ``observer`` value to the ``user_role`` enum and the ``observers`` table
(owner teacher, answer-key and named-results options). Nothing existing is modified.
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_observers"
down_revision = "0012_live_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # A new enum value must be committed before use: run it outside the migration transaction.
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'observer'")
    op.create_table(
        "observers",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("show_answers", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("named", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    # Observer accounts disappear with their table; the enum value stays (PostgreSQL cannot drop it), unused.
    op.execute("DELETE FROM user_sessions WHERE user_id IN (SELECT user_id FROM observers)")
    op.execute("DELETE FROM audit_events WHERE actor_id IN (SELECT user_id FROM observers)")
    op.execute("DELETE FROM auth_events WHERE user_id IN (SELECT user_id FROM observers)")
    users = sa.table("users", sa.column("id"), sa.column("role"))
    op.drop_table("observers")
    op.execute(users.delete().where(users.c.role == "observer"))
