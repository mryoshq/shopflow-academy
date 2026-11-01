"""Student dashboard, mission player, attempts and progressive hints (P0-05, ADR-0011).

Every route checks that the mission version belongs to a published release assigned
to one of the student's cohorts. Attempts are append-only, idempotent per student
key and tied to the exact mission version; scores and best score arrive in P0-06.
"""

from __future__ import annotations

from datetime import timedelta
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.curriculum_schema import UNGRADED_KINDS
from app.auth import AuthContext, display_name, require_student, require_student_csrf, utcnow
from app.config import get_settings
from app.attempt_rules import (is_fast, next_attempt, notice, pause_remaining, reading_remaining, record_opening,
                                rules_for_release, student_state)
from app.curriculum import BLOCK_CATEGORY, objective_category, release_private_definitions, student_safe_snapshot
from app.curriculum_schema import MissionDefinition
from app.database import get_db
from app.grading import AnswerInput, InvalidAnswer, evaluate, feedback_for, reveal_explanation, score
from app.progress import block_done, attempt_points, course_score, decayed, mission_scores
from app.rewards import after_attempt, dashboard_rewards
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
             "module_description": module.get("description", ""),
             "missions": [m for m in chapter.get("missions", []) if isinstance(m.get("mission_version_id"), int)]}
            for module in snapshot.get("modules", []) for chapter in module.get("chapters", [])]


def first_sentence(text: str) -> str:
    match = re.match(r"(.+?[.!?])(?:\s|$)", text.strip(), re.S)
    return (match.group(1) if match else text.strip()).replace("\n", " ")


def block_objective(snapshot: dict, missions: list[dict]) -> str:
    """The block's objective for students, in one sentence and never with its code (ADR-0022).

    A « bloc » objective (BLOC- prefix or category) covered by the block's missions comes first,
    else the first objective they cover.
    """
    objectives = {item.get("id"): item for item in snapshot.get("objectives", []) if isinstance(item, dict)}
    covered: list[dict] = []
    for mission in missions:
        definition = mission.get("definition") or {}
        for objective_id in definition.get("objective_ids", []) if isinstance(definition, dict) else []:
            item = objectives.get(objective_id)
            if item is not None and item not in covered:
                covered.append(item)
    if not covered:
        return ""
    chosen = next((item for item in covered if objective_category(str(item.get("code", "")), str(item.get("category") or "")) == BLOCK_CATEGORY), covered[0])
    return first_sentence(str(chosen.get("statement", "")))


def student_cohorts(db: Session, user_id: int, release_id: int) -> list[int]:
    return list(db.scalars(select(Assignment.cohort_id).join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
                           .where(Enrollment.user_id == user_id, Assignment.course_release_id == release_id)).all())


def open_blocks(db: Session, cohort_ids: list[int]) -> set[int]:
    """Chapters opened for at least one of these classes."""
    if not cohort_ids:
        return set()
    return set(db.scalars(select(BlockState.chapter_id).where(BlockState.cohort_id.in_(cohort_ids),
                                                              BlockState.opened_at.is_not(None))).all())


def all_open_blocks(db: Session, user_id: int, release_id: int) -> set[int]:
    """Blocks open for the class, plus the blocks the teacher opened for this student only (ADR-0023)."""
    from app.live import personal_blocks

    cohorts = student_cohorts(db, user_id, release_id)
    return open_blocks(db, cohorts) | personal_blocks(db, user_id, cohorts)


def unlocked_versions(db: Session, user_id: int, version_ids: list[int]) -> set[int]:
    if not version_ids:
        return set()
    return set(db.scalars(select(MissionUnlock.mission_version_id).where(
        MissionUnlock.user_id == user_id, MissionUnlock.mission_version_id.in_(version_ids))).all())


def visible_missions(db: Session, user_id: int, release: CourseRelease, missions: list[dict] | None = None) -> list[dict]:
    """Missions of open blocks, plus missions a teacher unlocked for this student. A closed block exposes nothing."""
    missions = flatten(release.student_snapshot) if missions is None else missions
    opened = all_open_blocks(db, user_id, release.id)
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
    """Solved versions, counting the same mission solved before a republication (``progress.equivalents``)."""
    from app.progress import attempts_for

    return {vid for attempt, vid in attempts_for(db, [user_id], version_ids) if attempt.is_correct}


def attempted_versions(db: Session, user_id: int, version_ids: list[int]) -> set[int]:
    from app.progress import attempts_for

    return {vid for _, vid in attempts_for(db, [user_id], version_ids)}


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


def course_payload(db: Session, user_id: int, release: CourseRelease, missions: list[dict], visible: list[dict], *,
                   class_open: set[int], opened: set[int], paused: bool, rewards: dict | None) -> dict:
    """One course of the student dashboard. Shared with the teacher's read-only « Vue étudiant » (user 0: no work)."""
    visible_ids = {item["mission_version_id"] for item in visible}
    state = statuses(db, user_id, missions, visible_ids)
    scores = mission_scores(db, user_id, [item["mission_version_id"] for item in missions])
    resources: list[str] = []
    for item in visible:
        for url in (item.get("definition") or {}).get("resources", []):
            if url not in resources:
                resources.append(url)
    modules: list[dict] = []
    for block in blocks_of(release.student_snapshot):
        if not modules or modules[-1]["title"] != block["module"]:
            modules.append({"title": block["module"], "description": block["module_description"], "blocks": []})
        ids = [m["mission_version_id"] for m in block["missions"]]
        # Graded missions only: lessons are counted apart, bonuses never count for « terminé ».
        core = [vid for vid in ids if not scores[vid].bonus and not scores[vid].lesson] if ids else []
        lessons = [vid for vid in ids if scores[vid].lesson]
        is_open = block["chapter_id"] in opened
        shown = [vid for vid in ids if vid in visible_ids]
        modules[-1]["blocks"].append({
            "id": block["chapter_id"], "title": block["title"], "open": is_open,
            # ADR-0023: opened by the teacher for this student only (« ouvert pour vous »).
            "for_you": is_open and block["chapter_id"] not in class_open,
            "mission_count": len(core), "bonus_count": sum(1 for vid in ids if scores[vid].bonus),
            "completed_count": sum(1 for vid in core if scores[vid].completed) if is_open else 0,
            "lesson_count": len(lessons), "lessons_read": sum(1 for vid in lessons if scores[vid].completed) if is_open else 0,
            # ADR-0046: the block's points (« 4 / 10 pts », « 0 / 6 pts bonus »), stored points only.
            "points": round(sum(scores[vid].best for vid in core), 2) if is_open else 0,
            "possible": sum(scores[vid].possible for vid in core),
            "bonus_points": round(sum(scores[vid].best for vid in ids if scores[vid].bonus), 2) if is_open else 0,
            "bonus_possible": sum(scores[vid].possible for vid in ids if scores[vid].bonus),
            "done": is_open and block_done(scores, ids),
            "mission_ids": shown,
            # Closed blocks expose their title only.
            "objective": block_objective(release.student_snapshot, block["missions"]) if is_open else "",
        })
    return {
        "release_id": release.id, "title": release.student_snapshot.get("title", ""),
        "description": release.student_snapshot.get("description", ""), "version": release.version,
        "is_demo": is_demo(release), "resources": resources, "score": course_score(scores),
        "paused": paused, "modules": modules,
        # ADR-0027: banner announcing the rules against random clicking, once the teacher turned them on.
        "rules_notice": notice(rules_for_release(db, release)),
        # ADR-0039: streak, level, badges and class goal (never part of the score).
        "rewards": rewards,
        "missions": [{
            "mission_version_id": item["mission_version_id"], "title": item["title"],
            "module": item["module"], "chapter": item["chapter"], "block_id": item.get("chapter_id"),
            "kind": mission_kind(item),
            "estimated_duration_minutes": (item.get("definition") or {}).get("estimated_duration_minutes"),
            "best_points": scores[item["mission_version_id"]].best, "possible": scores[item["mission_version_id"]].possible,
            "bonus": scores[item["mission_version_id"]].bonus,
            **state[item["mission_version_id"]],
        } for item in visible],
    }


def student_final(db: Session, user_id: int, release: CourseRelease) -> dict | None:
    from app.final_grade import student_final as final

    return final(db, user_id, release)


@router.get("/dashboard")
def dashboard(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    courses = []
    for release in assigned_releases(db, auth.user.id):
        missions = flatten(release.student_snapshot)
        visible = visible_missions(db, auth.user.id, release, missions)
        courses.append(course_payload(db, auth.user.id, release, missions, visible,
                                      class_open=open_blocks(db, student_cohorts(db, auth.user.id, release.id)),
                                      opened=all_open_blocks(db, auth.user.id, release.id),
                                      paused=is_paused(db, auth.user.id, release.id),
                                      rewards=dashboard_rewards(db, release, auth.user.id)))
        # ADR-0046: the final grade, only once the teacher turned it on for the student's class.
        courses[-1]["final_grade"] = student_final(db, auth.user.id, release)
    from app.announcements import class_sounds, next_deadline

    return {"display_name": display_name(auth.user.username), "ai_enabled": ai_enabled(), "courses": courses,
            # ADR-0047: countdown to the next project deadline, and Rafi's sounds (the teacher can switch them off for the class).
            "next_deadline": next_deadline(db, auth.user.id), "rafi": {"sounds": class_sounds(db, auth.user.id)}}


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
    now = utcnow()
    record_opening(db, auth.user.id, version_id, now)
    payload.update({
        "rules": student_state(db, rules_for_release(db, release), definition, auth.user.id, version_id, now),
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
    release = db.get(CourseRelease, attempt.course_release_id)
    rules = student_state(db, rules_for_release(db, release), definition, attempt.user_id, attempt.mission_version_id, utcnow())
    return {
        "attempt_id": attempt.id, "correct": attempt.is_correct, "replayed": replayed, "attempts_count": count,
        "percent": attempt.percent, "attempt_number": attempt.attempt_number, "rules": rules,
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
    rules = rules_for_release(db, release)
    now = utcnow()
    # ADR-0027: after a wrong answer, the next attempt waits (checked here, not only in the browser).
    wait = pause_remaining(db, rules, auth.user.id, version_id, now) if definition.kind not in UNGRADED_KINDS else 0
    if wait:
        raise HTTPException(status_code=429, detail={"code": "pause", "retry_after": wait,
                                                     "message": "Pause après une erreur : relisez la situation."},
                            headers={"Retry-After": str(wait)})
    try:
        evaluation = evaluate(definition, version_id, payload.answer)
    except InvalidAnswer as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    number, percent = next_attempt(db, rules, definition, auth.user.id, version_id)
    raw_points = score(definition, evaluation.raw_answer)
    attempt = MissionAttempt(user_id=auth.user.id, mission_version_id=version_id, course_release_id=release.id,
                             idempotency_key=payload.idempotency_key, answer=evaluation.raw_answer, is_correct=evaluation.correct,
                             points=decayed(raw_points, percent), attempt_number=number, percent=percent,
                             fast=is_fast(db, rules, auth.user.id, version_id, now),
                             # Set here (not by the database) so the rank is exact even within one second.
                             created_at=now)
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
    if not attempt.is_correct and definition.kind not in UNGRADED_KINDS:
        blocked_signal(db, auth, release, version_id)
    rewards = after_attempt(db, release, auth.user.id, version_id, attempt.id, attempt.is_correct)
    return {**attempt_response(db, attempt, definition, replayed=False), "rewards": rewards}


def mission_title(release: CourseRelease, version_id: int) -> str:
    return next((m["title"] for m in flatten(release.student_snapshot) if m["mission_version_id"] == version_id), "")


def teacher_signal(db: Session, release: CourseRelease, kind: str, text: str, data: dict, dedup: str) -> list[int]:
    """Teacher's notification centre (ADR-0023): the course owner, unless the type is switched off."""
    from app.live import teacher_event

    course = db.get(Course, release.course_id)
    return teacher_event(db, course.created_by, kind, text, data, dedup) if course else []


def push_teacher(db: Session, user_ids: list[int]) -> None:
    from app.live import push_after_commit

    push_after_commit(db, user_ids)


def blocked_signal(db: Session, auth: AuthContext, release: CourseRelease, version_id: int) -> None:
    """« Étudiant bloqué » once, when the wrong attempts on a mission reach the help threshold without success."""
    from app.teacher_dashboard import HELP_AFTER_FAILURES

    rows = db.execute(select(MissionAttempt.is_correct).where(MissionAttempt.user_id == auth.user.id,
                                                              MissionAttempt.mission_version_id == version_id)).scalars().all()
    if any(rows) or len(rows) < HELP_AFTER_FAILURES:
        return
    notified = teacher_signal(db, release, "blocked", f"{display_name(auth.user.username)} semble bloqué sur « {mission_title(release, version_id)} » ({len(rows)} essais).",
                              {"student_id": auth.user.id, "mission_version_id": version_id}, f"blocked:{auth.user.id}:{version_id}")
    db.commit()
    push_teacher(db, notified)


@router.post("/missions/{version_id}/understood", status_code=201)
def understood(version_id: int, response: Response, auth: AuthContext = Depends(require_student_csrf),
               db: Session = Depends(get_db)) -> dict:
    """"J'ai compris" on a lesson: one attempt per student and lesson (idempotent), 0 point."""
    definition = private_definition(db, version_id)
    if definition.kind not in UNGRADED_KINDS:
        locate(db, auth.user.id, version_id)
        raise HTTPException(status_code=422, detail="only lessons can be marked as understood")
    key = f"lesson-{version_id}"
    done = db.scalar(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id, MissionAttempt.idempotency_key == key))
    if done is None:
        # ADR-0027: minimum reading time, counted from the last opening of the lesson.
        release = locate(db, auth.user.id, version_id)[0]
        left = reading_remaining(db, rules_for_release(db, release), definition, auth.user.id, version_id, utcnow())
        if left:
            raise HTTPException(status_code=429, detail={"code": "reading", "retry_after": left,
                                                         "message": "Prenez le temps de lire la leçon."},
                                headers={"Retry-After": str(left)})
    payload = AttemptInput(idempotency_key=key, answer=AnswerInput())
    return submit_attempt(version_id, payload, response, auth, db)


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
    db.flush()
    notified = teacher_signal(db, release, "help", f"{display_name(auth.user.username)} demande de l’aide sur « {mission_title(release, version_id)} ».",
                              {"help_id": item.id, "mission_version_id": version_id}, f"help:{item.id}")
    db.commit()
    push_teacher(db, notified)
    return help_payload(item)  # type: ignore[return-value]


@router.get("/help")
def my_help(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> list[dict]:
    """The student's own help requests only, newest first."""
    response.headers["Cache-Control"] = "no-store"
    items = db.scalars(select(HelpRequest).where(HelpRequest.user_id == auth.user.id).order_by(HelpRequest.id.desc()).limit(50)).all()
    return [{**help_payload(item), "mission_version_id": item.mission_version_id} for item in items]  # type: ignore[dict-item]
