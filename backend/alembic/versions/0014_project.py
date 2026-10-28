"""Project space (sprint 3, part R, ADR-0034).

Revision ID: 0014_project
Revises: 0013_observers

New tables only (teams, members, invitations, milestones, files, submissions, comments, grades,
defence slots) and one column ``observers.project_access`` (false by default).
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_project"
down_revision = "0013_observers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("observers", sa.Column("project_access", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "project_teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "project_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("cohort_id", "user_id", name="uq_project_member"),
    )
    op.create_table(
        "project_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("invited_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "project_milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deliverables", sa.JSON(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "project_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("stored", sa.String(80), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "project_submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("milestone_id", sa.Integer(), sa.ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("file_ids", sa.JSON(), nullable=False),
        sa.Column("late", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("submitted_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "project_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("milestone_id", sa.Integer(), sa.ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "project_grades",
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("sql", sa.Float(), nullable=True),
        sa.Column("python", sa.Float(), nullable=True),
        sa.Column("nosql", sa.Float(), nullable=True),
        sa.Column("airflow", sa.Float(), nullable=True),
        sa.Column("reproducibility", sa.Float(), nullable=True),
        sa.Column("individual", sa.JSON(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "project_slots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("label", sa.String(120), nullable=False, server_default=""),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("project_teams.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    for table in ("project_slots", "project_grades", "project_comments", "project_submissions", "project_files",
                  "project_milestones", "project_invitations", "project_members", "project_teams"):
        op.drop_table(table)
    with op.batch_alter_table("observers") as batch:
        batch.drop_column("project_access")
