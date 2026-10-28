"""Blocks of 15 minutes opened per class, and help requests (sprint 2, part A).

Existing assignments keep their behaviour: every block of their release is opened
for their cohort. Blocks added later arrive closed.

Revision ID: 0007_blocks_help
Revises: 0006_class_control
"""

from datetime import datetime, timezone
import json

from alembic import op
import sqlalchemy as sa

revision = "0007_blocks_help"
down_revision = "0006_class_control"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "block_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("chapter_id", sa.Integer(), sa.ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("cohort_id", "chapter_id", name="uq_block_state"),
    )
    op.create_table(
        "help_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("mission_version_id", sa.Integer(), sa.ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("course_release_id", sa.Integer(), sa.ForeignKey("course_releases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handled_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    bind = op.get_bind()
    chapters = {row[0] for row in bind.execute(sa.text("SELECT id FROM chapters"))}
    rows = bind.execute(sa.text(
        "SELECT a.cohort_id, r.student_snapshot FROM assignments a JOIN course_releases r ON r.id = a.course_release_id"
    )).fetchall()
    now = datetime.now(timezone.utc)
    opened: set[tuple[int, int]] = set()
    for cohort_id, snapshot in rows:
        data = json.loads(snapshot) if isinstance(snapshot, str) else snapshot or {}
        for module in data.get("modules", []):
            for chapter in module.get("chapters", []):
                chapter_id = chapter.get("id")
                if isinstance(chapter_id, int) and chapter_id in chapters and (cohort_id, chapter_id) not in opened:
                    opened.add((cohort_id, chapter_id))
    table = sa.table("block_states", sa.column("cohort_id", sa.Integer()), sa.column("chapter_id", sa.Integer()),
                     sa.column("opened_at", sa.DateTime(timezone=True)))
    if opened:
        op.bulk_insert(table, [{"cohort_id": c, "chapter_id": ch, "opened_at": now} for c, ch in sorted(opened)])


def downgrade() -> None:
    op.drop_table("help_requests")
    op.drop_table("block_states")
