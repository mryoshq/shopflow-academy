from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, false, func, true
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(Enum("student", "teacher", "observer", name="user_role"), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    csrf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LoginThrottle(Base):
    __tablename__ = "login_throttles"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthEvent(Base):
    __tablename__ = "auth_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Rules against random clicking (ADR-0027), see app.attempt_rules. NULL = defaults, all off.
    attempt_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class LearningObjective(Base):
    __tablename__ = "learning_objectives"
    __table_args__ = (UniqueConstraint("course_id", "code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional; empty = deduced from the code prefix (see app.curriculum.objective_category).
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="", server_default="")


class CourseModule(Base):
    __tablename__ = "course_modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("course_modules.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class Mission(Base):
    __tablename__ = "missions"
    __table_args__ = (UniqueConstraint("chapter_id", "slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    draft_definition: Mapped[dict | None] = mapped_column(JSON)


class MissionVersion(Base):
    __tablename__ = "mission_versions"
    __table_args__ = (UniqueConstraint("mission_id", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="RESTRICT"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    definition_private: Mapped[dict] = mapped_column(JSON, nullable=False)
    student_projection: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CourseRelease(Base):
    __tablename__ = "course_releases"
    __table_args__ = (UniqueConstraint("course_id", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="published")
    snapshot_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    student_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Cohort(Base):
    __tablename__ = "cohorts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("cohort_id", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("cohort_id", "course_release_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    course_release_id: Mapped[int] = mapped_column(ForeignKey("course_releases.id", ondelete="RESTRICT"), nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MissionAttempt(Base):
    """Append-only: rows are never updated or deleted by the application."""

    __tablename__ = "mission_attempts"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_attempt_idempotency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mission_version_id: Mapped[int] = mapped_column(ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False)
    course_release_id: Mapped[int] = mapped_column(ForeignKey("course_releases.id", ondelete="RESTRICT"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    answer: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    points: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # ADR-0027: rank of the attempt since the rule was activated, and the percentage then in force
    # (NULL = 100 %, rule off or attempt older than the rule). ``points`` already includes it.
    attempt_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Marked « rapide »: < 5 s after opening the mission, or 3 attempts within 30 s.
    fast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())


class MissionOpening(Base):
    """Last time a student opened a mission (ADR-0027: fast clicks, minimum reading time)."""

    __tablename__ = "mission_openings"
    __table_args__ = (UniqueConstraint("user_id", "mission_version_id", name="uq_mission_opening"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mission_version_id: Mapped[int] = mapped_column(ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HintReveal(Base):
    __tablename__ = "hint_reveals"
    __table_args__ = (UniqueConstraint("user_id", "mission_version_id", "level", name="uq_hint_reveal"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mission_version_id: Mapped[int] = mapped_column(ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MissionUnlock(Base):
    """A teacher intervention: one student may open one mission despite its prerequisites."""

    __tablename__ = "mission_unlocks"
    __table_args__ = (UniqueConstraint("user_id", "mission_version_id", name="uq_mission_unlock"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mission_version_id: Mapped[int] = mapped_column(ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False)
    unlocked_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BlockState(Base):
    """Opening state of one block (chapter) for one class (cohort), kept across releases.

    No row, or ``opened_at`` NULL, means closed: newly imported blocks arrive closed.
    """

    __tablename__ = "block_states"
    __table_args__ = (UniqueConstraint("cohort_id", "chapter_id", name="uq_block_state"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class HelpRequest(Base):
    """A student's "I need an explanation" request on one mission (pending, then handled)."""

    __tablename__ = "help_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mission_version_id: Mapped[int] = mapped_column(ForeignKey("mission_versions.id", ondelete="RESTRICT"), nullable=False)
    course_release_id: Mapped[int] = mapped_column(ForeignKey("course_releases.id", ondelete="RESTRICT"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


# Live tracking (sprint 2, part H, ADR-0023) ------------------------------------------------

class Presence(Base):
    """Last heartbeat of a user (every 30 s while a page is open)."""

    __tablename__ = "presences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    online_since: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mission_version_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Notification(Base):
    """A message to one user: from the teacher, automatic, or a teacher event (help, block, ...)."""

    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("recipient_id", "dedup_key", name="uq_notification_dedup"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    text: Mapped[str] = mapped_column(String(280), nullable=False)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dedup_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BlockUnlock(Base):
    """One block opened for one student only (« ouvert pour vous »)."""

    __tablename__ = "block_unlocks"
    __table_args__ = (UniqueConstraint("cohort_id", "chapter_id", "user_id", name="uq_block_unlock"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    unlocked_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PushSubscription(Base):
    """Web Push endpoint of one browser (no payload is ever sent: the page fetches its notifications)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(600), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class NotificationSetting(Base):
    __tablename__ = "notification_settings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)


class BlockPlan(Base):
    """Automatic opening of the remaining blocks of a class (never closes anything)."""

    __tablename__ = "block_plans"

    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Observer(Base):
    """Read-only observer account (ADR-0025): created, set and disabled by its teacher (owner)."""

    __tablename__ = "observers"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    show_answers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    named: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    # ADR-0034: the project space stays hidden from the observer unless the teacher allows it.
    project_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    # ADR-0042: « admin » (Administration: real names, grades, exports, project) or « guest » (Invité: anonymised aggregates).
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="guest", server_default="guest")
    full_name: Mapped[str] = mapped_column(String(120), nullable=False, default="", server_default="")
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ObserverInvitation(Base):
    """ADR-0042: single-use invitation link (7 days); only the SHA-256 of the token is stored."""
    __tablename__ = "observer_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ObserverAlias(Base):
    """ADR-0042: « Étudiant N » for a guest observer, assigned once per (observer, student) and never renumbered."""
    __tablename__ = "observer_aliases"
    __table_args__ = (UniqueConstraint("observer_id", "student_id", name="uq_observer_alias"),
                      UniqueConstraint("observer_id", "number", name="uq_observer_alias_number"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)


# Project space (ADR-0034): teams of one or two students, milestones, versioned submissions, grades, defence slots.

class ProjectTeam(Base):
    __tablename__ = "project_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectMember(Base):
    """One person belongs to one team per class (unique cohort + user)."""
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("cohort_id", "user_id", name="uq_project_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # ADR-0041: set when the person was placed by a surprise draw; the reveal is shown once, then dated.
    draw_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProjectDrawEntry(Base):
    """ADR-0041: a student without a team who signed up for the surprise draw (can leave before the draw)."""
    __tablename__ = "project_draw_entries"
    __table_args__ = (UniqueConstraint("cohort_id", "user_id", name="uq_project_draw_entry"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectDraw(Base):
    """ADR-0041: one surprise draw, recorded for audit: seed, pool, included one-person teams, resulting groups."""
    __tablename__ = "project_draws"
    __table_args__ = (UniqueConstraint("cohort_id", "seed", name="uq_project_draw_seed"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True)
    seed: Mapped[str] = mapped_column(String(64), nullable=False)
    pool: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    included_teams: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    groups: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    left_out: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectInvitation(Base):
    __tablename__ = "project_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectMilestone(Base):
    __tablename__ = "project_milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deliverables: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # ADR-0045: automatic reminders 3 days and 1 day before the deadline (the teacher can turn them off).
    reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectReminder(Base):
    """ADR-0045: one reminder sent for a milestone to one target (a team, or a student without a team); the log."""
    __tablename__ = "project_reminders"
    __table_args__ = (UniqueConstraint("milestone_id", "reminder", "target", name="uq_project_reminder"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    milestone_id: Mapped[int] = mapped_column(ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=False, index=True)
    reminder: Mapped[str] = mapped_column(String(8), nullable=False)  # « j3 » or « j1 »
    target: Mapped[str] = mapped_column(String(32), nullable=False)  # « team:<id> » or « user:<id> »
    recipients: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectFile(Base):
    """A file uploaded by a team, stored on disk outside the database (content-addressed)."""
    __tablename__ = "project_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    stored: Mapped[str] = mapped_column(String(80), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectSubmission(Base):
    """One version of a team's work for a milestone; every submission is a new timestamped version."""
    __tablename__ = "project_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    milestone_id: Mapped[int] = mapped_column(ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    submitted_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectComment(Base):
    __tablename__ = "project_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("project_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    milestone_id: Mapped[int | None] = mapped_column(ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectGrade(Base):
    """Project grade on 20, apart from the course grade: common points + individual understanding (/4 each)."""
    __tablename__ = "project_grades"

    team_id: Mapped[int] = mapped_column(ForeignKey("project_teams.id", ondelete="CASCADE"), primary_key=True)
    sql: Mapped[float | None] = mapped_column(Float, nullable=True)
    python: Mapped[float | None] = mapped_column(Float, nullable=True)
    nosql: Mapped[float | None] = mapped_column(Float, nullable=True)
    airflow: Mapped[float | None] = mapped_column(Float, nullable=True)
    reproducibility: Mapped[float | None] = mapped_column(Float, nullable=True)
    individual: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProjectSlot(Base):
    __tablename__ = "project_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    team_id: Mapped[int | None] = mapped_column(ForeignKey("project_teams.id", ondelete="SET NULL"), nullable=True)
