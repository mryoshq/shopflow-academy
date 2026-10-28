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
from app.models import Assignment, Course, CourseRelease, Enrollment, HintReveal, MissionAttempt, MissionUnlock, MissionVersion

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
                    items.append({"module": module.get("title", ""), "chapter": chapter.get("title", ""), **mission})
    return items


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


def statuses(db: Session, user_id: int, missions: list[dict]) -> dict[int, dict]:
    ids = [item["mission_version_id"] for item in missions]
    done = completed_versions(db, user_id, ids)
    tried = attempted_versions(db, user_id, ids)
    unlocked = set(db.scalars(select(MissionUnlock.mission_version_id).where(
        MissionUnlock.user_id == user_id, MissionUnlock.mission_version_id.in_(ids))).all()) if ids else set()
    by_mission_id = {item["id"]: item for item in missions}
    result: dict[int, dict] = {}
    for item in missions:
        definition = item.get("definition") or {}
        blockers = []
        for prerequisite in definition.get("prerequisite_mission_ids", []):
            other = by_mission_id.get(prerequisite)
            if other is None or other["mission_version_id"] not in done:
                blockers.append(other["title"] if other else "Mission indisponible")
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


def locate(db: Session, user_id: int, version_id: int) -> tuple[CourseRelease, list[dict], int]:
    for release in assigned_releases(db, user_id):
        missions = flatten(release.student_snapshot)
        for index, item in enumerate(missions):
            if item["mission_version_id"] == version_id:
                return release, missions, index
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


@router.get("/dashboard")
def dashboard(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    courses = []
    for release in assigned_releases(db, auth.user.id):
        missions = flatten(release.student_snapshot)
        state = statuses(db, auth.user.id, missions)
        scores = mission_scores(db, auth.user.id, [item["mission_version_id"] for item in missions])
        resources: list[str] = []
        for item in missions:
            for url in (item.get("definition") or {}).get("resources", []):
                if url not in resources:
                    resources.append(url)
        courses.append({
            "release_id": release.id, "title": release.student_snapshot.get("title", ""),
            "description": release.student_snapshot.get("description", ""), "version": release.version,
            "is_demo": is_demo(release), "resources": resources, "score": course_score(scores),
            "paused": is_paused(db, auth.user.id, release.id),
            "missions": [{
                "mission_version_id": item["mission_version_id"], "title": item["title"],
                "module": item["module"], "chapter": item["chapter"],
                "kind": (item.get("definition") or {}).get("kind"),
                "estimated_duration_minutes": (item.get("definition") or {}).get("estimated_duration_minutes"),
                "best_points": scores[item["mission_version_id"]].best, "possible": scores[item["mission_version_id"]].possible,
                "bonus": scores[item["mission_version_id"]].bonus,
                **state[item["mission_version_id"]],
            } for item in missions],
        })
    return {"display_name": display_name(auth.user.username), "ai_enabled": ai_enabled(), "courses": courses}


@router.get("/missions/{version_id}")
def mission(version_id: int, response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    release, missions, index = locate(db, auth.user.id, version_id)
    state = statuses(db, auth.user.id, missions)[version_id]
    entry = missions[index]
    payload = {
        "mission_version_id": version_id, "release_id": release.id,
        "course_title": release.student_snapshot.get("title", ""), "is_demo": is_demo(release),
        "module": entry["module"], "chapter": entry["chapter"], "title": entry["title"],
        "position": index + 1, "total": len(missions),
        "previous_id": missions[index - 1]["mission_version_id"] if index > 0 else None,
        "next_id": missions[index + 1]["mission_version_id"] if index + 1 < len(missions) else None,
        "ai_enabled": ai_enabled(), "paused": is_paused(db, auth.user.id, release.id), **state,
        "definition": None, "hints": [], "hint_count": 0, "attempts_count": 0, "last_attempt": None, "explanation": None,
        "score": None,
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
    release, missions, _ = locate(db, auth.user.id, version_id)
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
    release, missions, _ = locate(db, auth.user.id, version_id)
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
