"""Student dashboard, mission player, attempts and progressive hints (P0-05, ADR-0011).

Every route checks that the mission version belongs to a published release assigned
to one of the student's cohorts. Attempts are append-only, idempotent per student
key and tied to the exact mission version; scores and best score arrive in P0-06.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, display_name, require_student, require_student_csrf, utcnow
from app.config import get_settings
from app.curriculum import release_private_definitions, student_safe_snapshot
from app.curriculum_schema import MissionDefinition
from app.database import get_db
from app.grading import AnswerInput, InvalidAnswer, evaluate, feedback_for, reveal_explanation, score
from app.progress import attempt_points, course_score, mission_scores
from app.models import (
    Assignment, BlockState, Course, CourseRelease, Enrollment, HelpRequest, HintReveal, MissionAttempt, MissionUnlock, MissionVersion,
)

router = APIRouter(prefix="/api/v1/student", tags=["student"])
ATTEMPTS_PER_MINUTE = 20


class AttemptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    answer: AnswerInput


def assigned_releases(db: Session, user_id: int) -> list[CourseRelease]:
    rows = db.scalars(
        select(CourseRelease)
        .join(Assignment, Assignment.course_release_id == CourseRelease.id)
        .join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
        .join(Course, Course.id == CourseRelease.course_id)
        .where(Enrollment.user_id == user_id, CourseRelease.status == "published", Course.status != "archived")
        .order_by(CourseRelease.id)
    ).all()
    return list({item.id: item for item in rows}.values())


def flatten(snapshot: dict) -> list[dict]:
    items = []
    for module in snapshot.get("modules", []):
        for chapter in module.get("chapters", []):
            for mission in chapter.get("missions", []):
                if isinstance(mission.get("mission_version_id"), int):
                    items.append({"module": module.get("title", ""), "chapter": chapter.get("title", ""),
                                  "chapter_id": chapter.get("id"), **mission})
    return items


def blocks_of(snapshot: dict) -> list[dict]:
    """Blocks (chapters) in course order, with their module title."""
    return [{"chapter_id": chapter.get("id"), "title": chapter.get("title", ""), "module": module.get("title", ""),
             "missions": [m for m in chapter.get("missions", []) if isinstance(m.get("mission_version_id"), int)]}
            for module in snapshot.get("modules", []) for chapter in module.get("chapters", [])]


def student_cohorts(db: Session, user_id: int, release_id: int) -> list[int]:
    return list(db.scalars(select(Assignment.cohort_id).join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
                           .where(Enrollment.user_id == user_id, Assignment.course_release_id == release_id)).all())


def open_blocks(db: Session, cohort_ids: list[int]) -> set[int]:
    """Chapters opened for at least one of these classes."""
    if not cohort_ids:
        return set()
    return set(db.scalars(select(BlockState.chapter_id).where(BlockState.cohort_id.in_(cohort_ids),
                                                              BlockState.opened_at.is_not(None))).all())


def unlocked_versions(db: Session, user_id: int, version_ids: list[int]) -> set[int]:
    if not version_ids:
        return set()
    return set(db.scalars(select(MissionUnlock.mission_version_id).where(
        MissionUnlock.user_id == user_id, MissionUnlock.mission_version_id.in_(version_ids))).all())


def visible_missions(db: Session, user_id: int, release: CourseRelease, missions: list[dict] | None = None) -> list[dict]:
    """Missions of open blocks, plus missions a teacher unlocked for this student. A closed block exposes nothing."""
    missions = flatten(release.student_snapshot) if missions is None else missions
    opened = open_blocks(db, student_cohorts(db, user_id, release.id))
    unlocked = unlocked_versions(db, user_id, [item["mission_version_id"] for item in missions])
    return [item for item in missions if item.get("chapter_id") in opened or item["mission_version_id"] in unlocked]


def visible_snapshot(db: Session, user_id: int, release: CourseRelease) -> dict:
    """Release snapshot where closed blocks keep only their title (no mission, no content)."""
    from copy import deepcopy

    visible = {item["mission_version_id"] for item in visible_missions(db, user_id, release)}
    snapshot = deepcopy(release.student_snapshot)
    for module in snapshot.get("modules", []):
        for chapter in module.get("chapters", []):
            chapter["missions"] = [m for m in chapter.get("missions", []) if m.get("mission_version_id") in visible]
    return snapshot


def completed_versions(db: Session, user_id: int, version_ids: list[int]) -> set[int]:
    if not version_ids:
        return set()
    return set(db.scalars(select(MissionAttempt.mission_version_id).where(
        MissionAttempt.user_id == user_id, MissionAttempt.mission_version_id.in_(version_ids), MissionAttempt.is_correct.is_(True)
    ).distinct()).all())


def attempted_versions(db: Session, user_id: int, version_ids: list[int]) -> set[int]:
    if not version_ids:
        return set()
    return set(db.scalars(select(MissionAttempt.mission_version_id).where(
        MissionAttempt.user_id == user_id, MissionAttempt.mission_version_id.in_(version_ids)
    ).distinct()).all())


def statuses(db: Session, user_id: int, missions: list[dict], visible: set[int] | None = None) -> dict[int, dict]:
    """Status of each mission. ``visible`` (version IDs) hides the titles of prerequisites in closed blocks."""
    ids = [item["mission_version_id"] for item in missions]
    done = completed_versions(db, user_id, ids)
    tried = attempted_versions(db, user_id, ids)
    unlocked = unlocked_versions(db, user_id, ids)
    by_mission_id = {item["id"]: item for item in missions}
    result: dict[int, dict] = {}
    for item in missions:
        definition = item.get("definition") or {}
        blockers = []
        for prerequisite in definition.get("prerequisite_mission_ids", []):
            other = by_mission_id.get(prerequisite)
            if other is None or other["mission_version_id"] not in done:
                if other is None:
                    blockers.append("Mission indisponible")
                elif visible is not None and other["mission_version_id"] not in visible:
                    blockers.append("une mission d’un bloc à venir")
                else:
                    blockers.append(other["title"])
        version_id = item["mission_version_id"]
        if version_id in unlocked:
            blockers = []
        if blockers:
            status = "locked"
        elif version_id in done:
            status = "completed"
        elif version_id in tried:
            status = "in_progress"
        else:
            status = "not_started"
        result[version_id] = {"status": status, "locked_by": blockers, "unlocked_by_teacher": version_id in unlocked}
    return result


def locate(db: Session, user_id: int, version_id: int) -> tuple[CourseRelease, list[dict], int, list[dict]]:
    """Find a mission the student may see: (release, visible missions, index in them, all missions).

    A mission of a closed block answers 404 exactly like a mission of another class.
    """
    for release in assigned_releases(db, user_id):
        missions = flatten(release.student_snapshot)
        visible = visible_missions(db, user_id, release, missions)
        for index, item in enumerate(visible):
            if item["mission_version_id"] == version_id:
                return release, visible, index, missions
    raise HTTPException(status_code=404, detail="mission not found")


def private_definition(db: Session, version_id: int) -> MissionDefinition:
    version = db.get(MissionVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="mission not found")
    return MissionDefinition.model_validate(version.definition_private)


def is_paused(db: Session, user_id: int, release_id: int) -> bool:
    """A release is paused for a student when every assignment giving access to it is paused."""
    pauses = db.scalars(select(Assignment.paused_at).join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
                        .where(Enrollment.user_id == user_id, Assignment.course_release_id == release_id)).all()
    return bool(pauses) and all(item is not None for item in pauses)


def ensure_open(db: Session, user_id: int, release: CourseRelease, missions: list[dict], version_id: int) -> None:
    """``missions``: every mission of the release (prerequisites may sit in another block)."""
    if statuses(db, user_id, missions)[version_id]["status"] == "locked":
        raise HTTPException(status_code=409, detail="mission locked")
    if is_paused(db, user_id, release.id):
        raise HTTPException(status_code=409, detail="sequence paused")


def is_demo(release: CourseRelease) -> bool:
    return str(release.student_snapshot.get("slug", "")).startswith("demo-")


def ai_enabled() -> bool:
    return get_settings().ai_provider not in {"", "none"}


def revealed_hints(db: Session, user_id: int, version_id: int, definition: MissionDefinition) -> list[str]:
    levels = db.scalars(select(HintReveal.level).where(HintReveal.user_id == user_id, HintReveal.mission_version_id == version_id)
                        .order_by(HintReveal.level)).all()
    return [definition.hints[level - 1] for level in levels if 0 < level <= len(definition.hints)]


def attempt_count(db: Session, user_id: int, version_id: int) -> int:
    return db.scalar(select(func.count(MissionAttempt.id)).where(
        MissionAttempt.user_id == user_id, MissionAttempt.mission_version_id == version_id)) or 0


def mission_kind(item: dict) -> str | None:
    return (item.get("definition") or {}).get("kind")


@router.get("/dashboard")
def dashboard(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    courses = []
    for release in assigned_releases(db, auth.user.id):
        missions = flatten(release.student_snapshot)
        visible = visible_missions(db, auth.user.id, release, missions)
        visible_ids = {item["mission_version_id"] for item in visible}
        state = statuses(db, auth.user.id, missions, visible_ids)
        scores = mission_scores(db, auth.user.id, [item["mission_version_id"] for item in missions])
        opened = open_blocks(db, student_cohorts(db, auth.user.id, release.id))
        resources: list[str] = []
        for item in visible:
            for url in (item.get("definition") or {}).get("resources", []):
                if url not in resources:
                    resources.append(url)
        modules: list[dict] = []
        for block in blocks_of(release.student_snapshot):
            if not modules or modules[-1]["title"] != block["module"]:
                modules.append({"title": block["module"], "blocks": []})
            ids = [m["mission_version_id"] for m in block["missions"]]
            core = [vid for vid in ids if not scores[vid].bonus] if ids else []
            is_open = block["chapter_id"] in opened
            shown = [vid for vid in ids if vid in visible_ids]
            modules[-1]["blocks"].append({
                "id": block["chapter_id"], "title": block["title"], "open": is_open,
                "mission_count": len(core), "bonus_count": len(ids) - len(core),
                "completed_count": sum(1 for vid in core if scores[vid].completed) if is_open else 0,
                "done": is_open and bool(core) and all(scores[vid].completed for vid in core),
                "mission_ids": shown,
            })
        courses.append({
            "release_id": release.id, "title": release.student_snapshot.get("title", ""),
            "description": release.student_snapshot.get("description", ""), "version": release.version,
            "is_demo": is_demo(release), "resources": resources, "score": course_score(scores),
            "paused": is_paused(db, auth.user.id, release.id), "modules": modules,
            "missions": [{
                "mission_version_id": item["mission_version_id"], "title": item["title"],
                "module": item["module"], "chapter": item["chapter"], "block_id": item.get("chapter_id"),
                "kind": mission_kind(item),
                "estimated_duration_minutes": (item.get("definition") or {}).get("estimated_duration_minutes"),
                "best_points": scores[item["mission_version_id"]].best, "possible": scores[item["mission_version_id"]].possible,
                "bonus": scores[item["mission_version_id"]].bonus,
                **state[item["mission_version_id"]],
            } for item in visible],
        })
    return {"display_name": display_name(auth.user.username), "ai_enabled": ai_enabled(), "courses": courses}


@router.get("/missions/{version_id}")
def mission(version_id: int, response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    release, missions, index, every = locate(db, auth.user.id, version_id)
    state = statuses(db, auth.user.id, every, {item["mission_version_id"] for item in missions})[version_id]
    entry = missions[index]
    payload = {
        "mission_version_id": version_id, "release_id": release.id,
        "course_title": release.student_snapshot.get("title", ""), "is_demo": is_demo(release),
        "module": entry["module"], "chapter": entry["chapter"], "block_id": entry.get("chapter_id"), "title": entry["title"],
        "position": index + 1, "total": len(missions),
        "previous_id": missions[index - 1]["mission_version_id"] if index > 0 else None,
        "next_id": missions[index + 1]["mission_version_id"] if index + 1 < len(missions) else None,
        "ai_enabled": ai_enabled(), "paused": is_paused(db, auth.user.id, release.id), **state,
        "definition": None, "hints": [], "hint_count": 0, "attempts_count": 0, "last_attempt": None, "explanation": None,
        "score": None, "help_request": help_payload(latest_help(db, auth.user.id, version_id)),
    }
    if state["status"] == "locked":
        return payload
    safe = student_safe_snapshot(release.student_snapshot, release_private_definitions(db, release.student_snapshot))
    payload["definition"] = next(item for item in flatten(safe) if item["mission_version_id"] == version_id)["definition"]
    definition = private_definition(db, version_id)
    count = attempt_count(db, auth.user.id, version_id)
    last = db.scalar(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id, MissionAttempt.mission_version_id == version_id)
                     .order_by(MissionAttempt.id.desc()).limit(1))
    payload.update({
        "hints": revealed_hints(db, auth.user.id, version_id, definition), "hint_count": len(definition.hints),
        "attempts_count": count,
        "last_attempt": {"correct": last.is_correct, "created_at": last.created_at.isoformat()} if last else None,
        "explanation": reveal_explanation(definition, state["status"] == "completed", count),
        "score": score_payload(db, auth.user.id, version_id),
    })
    return payload


def score_payload(db: Session, user_id: int, version_id: int) -> dict:
    item = mission_scores(db, user_id, [version_id])[version_id]
    return {"best": item.best, "possible": item.possible, "bonus": item.bonus}


def attempt_response(db: Session, attempt: MissionAttempt, definition: MissionDefinition, replayed: bool) -> dict:
    from app.grading import Evaluation

    raw = attempt.answer
    selected = raw.get("choice_ids") or sorted((raw.get("pairs") or {}).keys())
    evaluation = Evaluation(attempt.is_correct, raw, list(selected))
    count = attempt_count(db, attempt.user_id, attempt.mission_version_id)
    return {
        "attempt_id": attempt.id, "correct": attempt.is_correct, "replayed": replayed, "attempts_count": count,
        "points": attempt_points(attempt, definition), "score": score_payload(db, attempt.user_id, attempt.mission_version_id),
        "feedback": feedback_for(definition, attempt.mission_version_id, evaluation),
        "explanation": reveal_explanation(definition, attempt.is_correct, count),
    }


@router.post("/missions/{version_id}/attempts", status_code=201)
def submit_attempt(version_id: int, payload: AttemptInput, response: Response,
                   auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    release, _, _, missions = locate(db, auth.user.id, version_id)
    definition = private_definition(db, version_id)
    existing = db.scalar(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id,
                                                      MissionAttempt.idempotency_key == payload.idempotency_key))
    if existing is not None:
        if existing.mission_version_id != version_id:
            raise HTTPException(status_code=409, detail="idempotency key already used")
        response.status_code = 200
        return attempt_response(db, existing, definition, replayed=True)
    ensure_open(db, auth.user.id, release, missions, version_id)
    recent = db.scalar(select(func.count(MissionAttempt.id)).where(
        MissionAttempt.user_id == auth.user.id, MissionAttempt.created_at >= utcnow() - timedelta(minutes=1))) or 0
    if recent >= ATTEMPTS_PER_MINUTE:
        raise HTTPException(status_code=429, detail="too many attempts")
    try:
        evaluation = evaluate(definition, version_id, payload.answer)
    except InvalidAnswer as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    attempt = MissionAttempt(user_id=auth.user.id, mission_version_id=version_id, course_release_id=release.id,
                             idempotency_key=payload.idempotency_key, answer=evaluation.raw_answer, is_correct=evaluation.correct,
                             points=score(definition, evaluation.raw_answer))
    db.add(attempt)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id,
                                                          MissionAttempt.idempotency_key == payload.idempotency_key))
        if existing is None or existing.mission_version_id != version_id:
            raise HTTPException(status_code=409, detail="idempotency key already used")
        response.status_code = 200
        return attempt_response(db, existing, definition, replayed=True)
    return attempt_response(db, attempt, definition, replayed=False)


@router.post("/missions/{version_id}/hints")
def reveal_hint(version_id: int, response: Response, auth: AuthContext = Depends(require_student_csrf),
                db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    release, _, _, missions = locate(db, auth.user.id, version_id)
    ensure_open(db, auth.user.id, release, missions, version_id)
    definition = private_definition(db, version_id)
    shown = revealed_hints(db, auth.user.id, version_id, definition)
    if len(shown) < len(definition.hints):
        db.add(HintReveal(user_id=auth.user.id, mission_version_id=version_id, level=len(shown) + 1))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        shown = revealed_hints(db, auth.user.id, version_id, definition)
    return {"hints": shown, "hint_count": len(definition.hints)}


@router.get("/missions/{version_id}/attempts")
def attempt_history(version_id: int, response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> list[dict]:
    """The student's own attempts on one mission version, newest first (no answer echo)."""
    response.headers["Cache-Control"] = "no-store"
    locate(db, auth.user.id, version_id)
    definition = private_definition(db, version_id)
    attempts = db.scalars(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id, MissionAttempt.mission_version_id == version_id)
                          .order_by(MissionAttempt.id.desc()).limit(50)).all()
    return [{"id": item.id, "created_at": item.created_at.isoformat(), "correct": item.is_correct,
             "points": attempt_points(item, definition)} for item in attempts]


# Help requests ("J'ai besoin d'une explication") -------------------------------------------

HELP_PER_HOUR = 20


class HelpInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(default="", max_length=300)


def latest_help(db: Session, user_id: int, version_id: int) -> HelpRequest | None:
    return db.scalar(select(HelpRequest).where(HelpRequest.user_id == user_id, HelpRequest.mission_version_id == version_id)
                     .order_by(HelpRequest.id.desc()).limit(1))


def help_payload(item: HelpRequest | None) -> dict | None:
    if item is None:
        return None
    from app.auth import aware

    return {"id": item.id, "status": item.status, "message": item.message, "created_at": aware(item.created_at).isoformat(),
            "handled_at": aware(item.handled_at).isoformat() if item.handled_at else None}


@router.post("/missions/{version_id}/help", status_code=201)
def ask_help(version_id: int, payload: HelpInput, response: Response, auth: AuthContext = Depends(require_student_csrf),
             db: Session = Depends(get_db)) -> dict:
    """One pending request per mission: asking again while it is pending returns the same request."""
    from app.curriculum_schema import CONTROL, HTML_TAG

    response.headers["Cache-Control"] = "no-store"
    release, _, _, _ = locate(db, auth.user.id, version_id)
    message = payload.message.strip()
    if HTML_TAG.search(message) or CONTROL.search(message.replace("\n", " ")):
        raise HTTPException(status_code=422, detail="plain text only")
    pending = latest_help(db, auth.user.id, version_id)
    if pending is not None and pending.status == "pending":
        response.status_code = 200
        return help_payload(pending)  # type: ignore[return-value]
    recent = db.scalar(select(func.count(HelpRequest.id)).where(
        HelpRequest.user_id == auth.user.id, HelpRequest.created_at >= utcnow() - timedelta(hours=1))) or 0
    if recent >= HELP_PER_HOUR:
        raise HTTPException(status_code=429, detail="too many help requests")
    item = HelpRequest(user_id=auth.user.id, mission_version_id=version_id, course_release_id=release.id, message=message)
    db.add(item)
    db.commit()
    return help_payload(item)  # type: ignore[return-value]


@router.get("/help")
def my_help(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> list[dict]:
    """The student's own help requests only, newest first."""
    response.headers["Cache-Control"] = "no-store"
    items = db.scalars(select(HelpRequest).where(HelpRequest.user_id == auth.user.id).order_by(HelpRequest.id.desc()).limit(50)).all()
    return [{**help_payload(item), "mission_version_id": item.mission_version_id} for item in items]  # type: ignore[dict-item]
