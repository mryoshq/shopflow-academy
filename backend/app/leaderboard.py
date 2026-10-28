"""Class leaderboard (sprint 2, part K, ADR-0026).

Off by default; the teacher turns it on per class in « Ma classe ». Students see display
names they chose (or « Participant N »), never a username or an e-mail, never a per-mission
grade. Ranks never appear in exports or grading: this module only reads scores.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import re
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, display_name, require_student, require_student_csrf, require_teacher, require_teacher_csrf, utcnow
from app.config import get_settings
from app.database import get_db
from app.models import Assignment, BlockState, Cohort, CourseRelease, Enrollment, MissionAttempt, User
from app.progress import mission_scores
from app.student import blocks_of
from app.teacher_dashboard import audit, class_students, owned_class

router = APIRouter(prefix="/api/v1", tags=["leaderboard"])

BLOCK_MINUTES = 15
NAME_RE = re.compile(r"^[\w][\w '’.-]{0,23}$", re.UNICODE)
EMAIL_LIKE = re.compile(r"@|https?:|www\.|\.(?:com|ma|fr|net|org|io)\b", re.IGNORECASE)
RESERVED = re.compile(r"^(participant|enseignant|professeur|admin)\b", re.IGNORECASE)


def local_today(now: datetime) -> date:
    try:
        zone = ZoneInfo(get_settings().class_timezone)
    except Exception:  # pragma: no cover - missing tz database: Morocco is UTC+1
        zone = timezone(timedelta(hours=1))
    return aware(now).astimezone(zone).date()


def local_date(value: datetime) -> date:
    return local_today(value)


@dataclass
class Row:
    user_id: int
    name: str
    points: float
    bonus: float
    blocks_done: int
    blocks_today: int
    rank: int = 0
    today_rank: int = 0


def competition_ranks(values: list[tuple]) -> list[int]:
    """1, 1, 3 ranking: equal keys share a rank, the next rank skips."""
    ranks: list[int] = []
    for index, value in enumerate(values):
        ranks.append(ranks[-1] if index and value == values[index - 1] else index + 1)
    return ranks


def default_names(students: list[User]) -> dict[int, str]:
    """« Participant N », stable within the class (ordered by account creation)."""
    return {student.id: f"Participant {position}" for position, student in enumerate(sorted(students, key=lambda s: s.id), start=1)}


def build_rows(db: Session, release: CourseRelease, cohort: Cohort, now: datetime) -> list[Row]:
    students = [student for student in class_students(db, cohort.id) if student.enabled]
    defaults = default_names(students)
    blocks = [block for block in blocks_of(release.student_snapshot) if block["missions"]]
    version_ids = [mission["mission_version_id"] for block in blocks for mission in block["missions"]]
    first_success: dict[tuple[int, int], datetime] = {}
    if students and version_ids:
        for user_id, version_id, when in db.execute(
            select(MissionAttempt.user_id, MissionAttempt.mission_version_id, func.min(MissionAttempt.created_at))
            .where(MissionAttempt.user_id.in_([s.id for s in students]), MissionAttempt.mission_version_id.in_(version_ids),
                   MissionAttempt.is_correct.is_(True))
            .group_by(MissionAttempt.user_id, MissionAttempt.mission_version_id)
        ).all():
            first_success[(user_id, version_id)] = when
    today = local_today(now)
    rows: list[Row] = []
    for student in students:
        scores = mission_scores(db, student.id, version_ids)
        core = [score for score in scores.values() if not score.bonus]
        bonus = [score for score in scores.values() if score.bonus]
        done = today_done = 0
        for block in blocks:
            core_ids = [m["mission_version_id"] for m in block["missions"] if not scores[m["mission_version_id"]].bonus]
            if not core_ids or not all((student.id, vid) in first_success for vid in core_ids):
                continue
            done += 1
            if local_date(max(first_success[(student.id, vid)] for vid in core_ids)) == today:
                today_done += 1
        rows.append(Row(student.id, student.public_name or defaults[student.id], round(sum(s.best for s in core), 2),
                        round(sum(s.best for s in bonus), 2), done, today_done))
    rows.sort(key=lambda row: (-row.points, -row.bonus, row.name.casefold()))
    for row, rank in zip(rows, competition_ranks([(row.points, row.bonus) for row in rows])):
        row.rank = rank
    by_today = sorted(rows, key=lambda row: (-row.blocks_today, row.rank, row.name.casefold()))
    for row, rank in zip(by_today, competition_ranks([(row.blocks_today,) for row in by_today])):
        row.today_rank = rank
    return rows


def block_in_progress(db: Session, cohort: Cohort, now: datetime) -> bool:
    """A block counts as in progress during the 15 minutes after its opening (blocks never close by themselves)."""
    last = db.scalar(select(func.max(BlockState.opened_at)).where(BlockState.cohort_id == cohort.id, BlockState.opened_at.is_not(None)))
    return last is not None and aware(now) - aware(last) < timedelta(minutes=BLOCK_MINUTES)


def settings_of(cohort: Cohort) -> dict:
    return {"enabled": cohort.leaderboard_enabled, "top3_only": cohort.leaderboard_top3_only,
            "hide_during_block": cohort.leaderboard_hide_during_block}


def public_row(row: Row, me: int | None, accounts: dict[int, str] | None) -> dict:
    item = {"rank": row.rank, "today_rank": row.today_rank, "name": row.name, "points": row.points, "bonus": row.bonus,
            "blocks_done": row.blocks_done, "blocks_today": row.blocks_today, "me": row.user_id == me}
    if accounts is not None:  # teacher only
        item["account"] = accounts.get(row.user_id, "")
    return item


def board(rows: list[Row], me: int | None, top3_only: bool, accounts: dict[int, str] | None = None) -> dict:
    main = [public_row(row, me, accounts) for row in rows]
    today = [public_row(row, me, accounts) for row in sorted(rows, key=lambda r: (r.today_rank, r.rank, r.name.casefold()))]
    if top3_only:
        main = [row for row in main if row["rank"] <= 3 or row["me"]]
        today = [row for row in today if row["today_rank"] <= 3 or row["me"]]
    best = [row["name"] for row in today if row["today_rank"] == 1 and row["blocks_today"] > 0]
    return {"main": main, "today": today, "best_progress": best}


# Student ------------------------------------------------------------------------------

def student_class(db: Session, user_id: int, assignment_id: int) -> tuple[Assignment, CourseRelease, Cohort]:
    row = db.execute(
        select(Assignment, CourseRelease, Cohort)
        .join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
        .join(Cohort, Cohort.id == Assignment.cohort_id)
        .join(Enrollment, Enrollment.cohort_id == Cohort.id)
        .where(Assignment.id == assignment_id, Enrollment.user_id == user_id, CourseRelease.status == "published")
    ).first()
    if row is None or not row[2].leaderboard_enabled:
        raise HTTPException(status_code=404, detail="leaderboard not found")
    return row[0], row[1], row[2]


def enabled_boards(db: Session, user_id: int) -> dict[int, int]:
    """release_id → assignment_id of a class of this student whose leaderboard is on."""
    rows = db.execute(
        select(Assignment.course_release_id, Assignment.id)
        .join(Cohort, Cohort.id == Assignment.cohort_id).join(Enrollment, Enrollment.cohort_id == Cohort.id)
        .where(Enrollment.user_id == user_id, Cohort.leaderboard_enabled.is_(True)).order_by(Assignment.id)
    ).all()
    result: dict[int, int] = {}
    for release_id, assignment_id in rows:
        result.setdefault(release_id, assignment_id)
    return result


@router.get("/student/leaderboard/{assignment_id}")
def student_leaderboard(assignment_id: int, response: Response, auth: AuthContext = Depends(require_student),
                        db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, release, cohort = student_class(db, auth.user.id, assignment_id)
    now = utcnow()
    base = {"title": release.student_snapshot.get("title", ""), "settings": settings_of(cohort),
            "generated_at": now.isoformat(), "my_name": auth.user.public_name or ""}
    if cohort.leaderboard_hide_during_block and block_in_progress(db, cohort, now):
        return {**base, "hidden": True, "main": [], "today": [], "best_progress": []}
    return {**base, "hidden": False, **board(build_rows(db, release, cohort, now), auth.user.id, cohort.leaderboard_top3_only)}


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    public_name: str = Field(default="", max_length=40)

    @field_validator("public_name")
    @classmethod
    def safe_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            return ""
        if len(value) > 24 or not NAME_RE.fullmatch(value) or EMAIL_LIKE.search(value) or RESERVED.match(value):
            raise ValueError("Display name: 1 to 24 letters, digits, spaces, - ' . _ ; no e-mail address")
        return value


@router.get("/student/profile")
def student_profile(response: Response, auth: AuthContext = Depends(require_student)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {"public_name": auth.user.public_name or ""}


@router.put("/student/profile")
def update_profile(payload: ProfileInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    user = db.get(User, auth.user.id)
    user.public_name = payload.public_name or None
    db.commit()
    return {"public_name": user.public_name or ""}


# Teacher ------------------------------------------------------------------------------

class SettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    top3_only: bool | None = None
    hide_during_block: bool | None = None


@router.get("/teacher/classes/{assignment_id}/leaderboard")
def teacher_leaderboard(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher),
                        db: Session = Depends(get_db)) -> dict:
    """The teacher always sees the full table, with the account behind each display name."""
    response.headers["Cache-Control"] = "no-store"
    _, release, cohort = owned_class(db, auth, assignment_id)
    now = utcnow()
    rows = build_rows(db, release, cohort, now)
    accounts = {student.id: display_name(student.username) for student in class_students(db, cohort.id)}
    data = board(rows, None, False, accounts)
    return {"settings": settings_of(cohort), "hidden_for_students": cohort.leaderboard_hide_during_block and block_in_progress(db, cohort, now),
            "generated_at": now.isoformat(), **data}


@router.patch("/teacher/classes/{assignment_id}/leaderboard")
def update_settings(assignment_id: int, payload: SettingsInput, auth: AuthContext = Depends(require_teacher_csrf),
                    db: Session = Depends(get_db)) -> dict:
    assignment, _, cohort = owned_class(db, auth, assignment_id)
    changes = payload.model_dump(exclude_none=True)
    for key, value in changes.items():
        setattr(cohort, f"leaderboard_{key}", value)
    audit(db, auth, "leaderboard.settings", assignment.id, changes)
    db.commit()
    return settings_of(cohort)
