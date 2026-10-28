"""Private class leaderboard: read-only projection of the existing score engine.

All visibility filtering happens here, before serialization. No username, answer,
mission score, or other student's identifier crosses this API boundary.
"""

from datetime import datetime
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, require_csrf, require_student, require_teacher, require_teacher_csrf, utcnow
from app.database import get_db
from app.leaderboard_models import LeaderboardName, LeaderboardSettings
from app.models import Assignment, BlockState, Cohort, Course, CourseRelease, Enrollment, MissionAttempt, User
from app.progress import course_score, mission_scores
from app.student import blocks_of, flatten
from app.teacher_dashboard import audit, owned_class

router = APIRouter(tags=["leaderboard"])
DAY_ZONE = ZoneInfo("Africa/Casablanca")


class SettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    top_three: bool
    hide_open_block: bool


class NameInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str = Field(min_length=1, max_length=24)

    @field_validator("display_name")
    @classmethod
    def safe_name(cls, value: str) -> str:
        value = unicodedata.normalize("NFKC", value).strip()
        # A first name/pseudonym, never a login address; exclude invisible/bidi controls.
        if not value or len(value) > 24 or "@" in value or any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("Choisissez un prénom ou pseudonyme de 1 à 24 caractères, sans adresse e-mail.")
        return value


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def settings_for(db: Session, assignment: Assignment, release: CourseRelease) -> LeaderboardSettings | None:
    return db.scalar(select(LeaderboardSettings).where(LeaderboardSettings.cohort_id == assignment.cohort_id,
                                                       LeaderboardSettings.course_id == release.course_id))


def preferences(row: LeaderboardSettings | None) -> dict:
    return {key: bool(getattr(row, key, False)) for key in ("enabled", "top_three", "hide_open_block")}


def student_class(db: Session, auth: AuthContext, assignment_id: int) -> tuple[Assignment, CourseRelease]:
    row = db.execute(select(Assignment, CourseRelease).join(CourseRelease, Assignment.course_release_id == CourseRelease.id)
                     .join(Course, Course.id == CourseRelease.course_id)
                     .join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
                     .where(Assignment.id == assignment_id, Enrollment.user_id == auth.user.id,
                            CourseRelease.status == "published", Course.status != "archived")).first()
    if row is None or not preferences(settings_for(db, *row))["enabled"]:
        raise HTTPException(status_code=404, detail="Classement indisponible.", headers={"Cache-Control": "no-store"})
    return row[0], row[1]


def directory(db: Session, auth: AuthContext) -> list[dict]:
    query = (select(Assignment, CourseRelease, Cohort.label).join(CourseRelease, Assignment.course_release_id == CourseRelease.id)
             .join(Course, Course.id == CourseRelease.course_id).join(Cohort, Cohort.id == Assignment.cohort_id)
             .where(CourseRelease.status == "published", Course.status != "archived").order_by(CourseRelease.version.desc(), Assignment.id))
    if auth.user.role == "teacher":
        query = query.where(Course.created_by == auth.user.id)
    else:
        query = query.join(Enrollment, Enrollment.cohort_id == Cohort.id).where(Enrollment.user_id == auth.user.id)
    result, seen = [], set()
    for assignment, release, label in db.execute(query):
        key = (assignment.cohort_id, release.course_id)
        if key in seen:
            continue
        seen.add(key)
        if auth.user.role == "teacher" or preferences(settings_for(db, assignment, release))["enabled"]:
            result.append({"assignment_id": assignment.id, "label": label})
    return result


def ranked(rows: list[dict], keys: tuple[str, ...]) -> list[dict]:
    ordered = sorted(rows, key=lambda row: tuple(-row[key] for key in keys) + (row["display_name"].casefold(), row["order"]))
    previous, rank = None, 0
    result = []
    for position, row in enumerate(ordered, 1):
        score = tuple(row[key] for key in keys)
        if score != previous:
            rank = position  # Competition ranking: 1, 1, 3 (names never break a tie).
        result.append({key: value for key, value in {**row, "rank": rank}.items() if key != "order"})
        previous = score
    return result


def top_and_self(rows: list[dict], limited: bool) -> list[dict]:
    # Include every student tied within the top three ranks, plus the caller.
    return [row for row in rows if not limited or row["rank"] <= 3 or row["is_self"]]


def board(db: Session, auth: AuthContext, assignment: Assignment, release: CourseRelease) -> dict:
    options = preferences(settings_for(db, assignment, release))
    blocks = blocks_of(release.student_snapshot)
    chapter_ids = [block["chapter_id"] for block in blocks]
    open_block = db.scalar(select(BlockState.id).where(BlockState.cohort_id == assignment.cohort_id,
                                                      BlockState.chapter_id.in_(chapter_ids), BlockState.opened_at.is_not(None)))
    hidden = not options["enabled"] or bool(options["hide_open_block"] and open_block is not None)
    own_name = db.get(LeaderboardName, auth.user.id)
    result = {"settings": options, "hidden": hidden, "rows": [], "daily_rows": [],
              "display_name": own_name.display_name if own_name else "", "day": utcnow().astimezone(DAY_ZONE).date().isoformat(),
              "timezone": "Africa/Casablanca"}
    if hidden:
        return result
    students = db.scalars(select(User).join(Enrollment, Enrollment.user_id == User.id)
                         .where(Enrollment.cohort_id == assignment.cohort_id, User.role == "student", User.enabled.is_(True))
                         .order_by(User.id)).all()
    ids = [mission["mission_version_id"] for mission in flatten(release.student_snapshot)]
    names = {row.user_id: row.display_name for row in db.scalars(select(LeaderboardName).where(LeaderboardName.user_id.in_([s.id for s in students])))}
    rows = []
    for order, student in enumerate(students, 1):
        scores = mission_scores(db, student.id, ids)
        totals = course_score(scores)
        first_correct: dict[int, datetime] = {}
        for attempt in db.scalars(select(MissionAttempt).where(MissionAttempt.user_id == student.id,
                                                               MissionAttempt.mission_version_id.in_(ids), MissionAttempt.is_correct.is_(True))):
            at = aware(attempt.created_at)
            vid = attempt.mission_version_id
            first_correct[vid] = min(first_correct.get(vid, at), at)
        completions = []
        for block in blocks:
            core = [m["mission_version_id"] for m in block["missions"]
                    if m["mission_version_id"] in scores and not scores[m["mission_version_id"]].bonus]
            if core and all(vid in first_correct for vid in core):
                completions.append(max(first_correct[vid] for vid in core))
        rows.append({"order": order, "display_name": names.get(student.id, f"Élève {order}"), "is_self": student.id == auth.user.id,
                     "core_points": totals["core_points"], "bonus_points": totals["bonus_points"], "completed_blocks": len(completions),
                     "today_blocks": sum(at.astimezone(DAY_ZONE).date().isoformat() == result["day"] for at in completions)})
    # Teachers see the same privacy limits; they have no personal row.
    result["rows"] = top_and_self(ranked(rows, ("core_points", "bonus_points")), options["top_three"])
    # Daily visibility must not reveal the main/bonus totals of students hidden
    # by the general top-three view: only serialize the daily tab's own columns.
    result["daily_rows"] = [{key: row[key] for key in ("rank", "display_name", "is_self", "today_blocks")}
                            for row in top_and_self(ranked(rows, ("today_blocks",)), options["top_three"])]
    return result


@router.get("/api/v1/student/leaderboard/classes")
def student_directory(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> list[dict]:
    no_store(response)
    return directory(db, auth)


@router.get("/api/v1/teacher/leaderboard/classes")
def teacher_directory(response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    no_store(response)
    return directory(db, auth)


@router.get("/api/v1/student/classes/{assignment_id}/leaderboard")
def student_board(assignment_id: int, response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    no_store(response)
    return board(db, auth, *student_class(db, auth, assignment_id))


@router.get("/api/v1/teacher/classes/{assignment_id}/leaderboard")
def teacher_board(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    no_store(response)
    assignment, release, _ = owned_class(db, auth, assignment_id)
    return board(db, auth, assignment, release)


@router.put("/api/v1/teacher/classes/{assignment_id}/leaderboard/settings")
def update_settings(assignment_id: int, payload: SettingsInput, response: Response,
                    auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    no_store(response)
    assignment, release, _ = owned_class(db, auth, assignment_id)
    row = settings_for(db, assignment, release)
    if row is None:
        row = LeaderboardSettings(cohort_id=assignment.cohort_id, course_id=release.course_id)
        db.add(row)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    audit(db, auth, "leaderboard.settings", assignment_id, payload.model_dump())
    db.commit()
    return preferences(row)


@router.put("/api/v1/student/classes/{assignment_id}/leaderboard/name", dependencies=[Depends(require_student)])
def update_name(assignment_id: int, payload: NameInput, response: Response,
                auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    no_store(response)
    student_class(db, auth, assignment_id)
    row = db.get(LeaderboardName, auth.user.id)
    if row is None:
        row = LeaderboardName(user_id=auth.user.id, display_name=payload.display_name)
        db.add(row)
    else:
        row.display_name = payload.display_name
    db.commit()
    return {"display_name": row.display_name}
