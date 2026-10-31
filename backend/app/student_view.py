"""« Vue étudiant » for the teacher (ADR-0043): the student application on the version published for the class, read only.

The pages are built by the same code as the student's (``student.course_payload``, ``project.project_page``),
for a virtual student without any work (user id 0): no attempt, no point, no presence, no notification,
no hint or opening is ever stored. Answers can be checked as in the course preview: the server grades them
and answers like a first attempt, with 0 point, and never sends the private correction.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.attempt_rules import rules_for_release, student_state
from app.auth import AuthContext, require_teacher, require_teacher_csrf, utcnow
from app.curriculum import release_private_definitions, student_safe_snapshot
from app.curriculum_schema import UNGRADED_KINDS
from app.database import get_db
from app.grading import AnswerInput, InvalidAnswer, evaluate, feedback_for, reveal_explanation
from app.models import Assignment, Cohort, CourseRelease
from app.student import ai_enabled, blocks_of, course_payload, flatten, is_demo, open_blocks, private_definition, statuses
from app.teacher_dashboard import owned_class

router = APIRouter(prefix="/api/v1/teacher/classes/{assignment_id}/student-view", tags=["teacher"])
NOBODY = 0  # the virtual student: no row anywhere carries this id


def context(db: Session, auth: AuthContext, assignment_id: int) -> tuple[Assignment, CourseRelease, Cohort]:
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    if release.status != "published":
        raise HTTPException(status_code=404, detail="no published version for the class")
    return assignment, release, cohort


def visible(release: CourseRelease, opened: set[int]) -> tuple[list[dict], list[dict]]:
    missions = flatten(release.student_snapshot)
    return missions, [item for item in missions if item.get("chapter_id") in opened]


def opened_blocks(db: Session, release: CourseRelease, cohort: Cohort, every_block: bool) -> set[int]:
    """Blocks open for the class (as a student sees them), or every block when the teacher asks for it."""
    if every_block:
        return {block["chapter_id"] for block in blocks_of(release.student_snapshot)}
    return open_blocks(db, [cohort.id])


def rewards_of(db: Session, release: CourseRelease, cohort: Cohort, opened: set[int]) -> dict:
    from app.rewards import course_of, facts_for, goal_state, summary

    course = course_of(db, release)
    facts = facts_for(db, course, [NOBODY])[NOBODY]
    return {**summary(db, course, NOBODY, facts, opened), "class_goal": goal_state(db, course, cohort.id)}


@router.get("/dashboard")
def view_dashboard(assignment_id: int, response: Response, all: bool = Query(default=False),
                   auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    assignment, release, cohort = context(db, auth, assignment_id)
    opened = opened_blocks(db, release, cohort, all)
    missions, shown = visible(release, opened)
    course = course_payload(db, NOBODY, release, missions, shown, class_open=opened, opened=opened,
                            paused=assignment.paused_at is not None, rewards=rewards_of(db, release, cohort, opened))
    # A neutral name: the page is the one any student of the class would see.
    return {"display_name": "Étudiant", "ai_enabled": ai_enabled(), "courses": [course], "student_view": True}


def located(db: Session, auth: AuthContext, assignment_id: int, version_id: int, every_block: bool) -> tuple[Assignment, CourseRelease, list[dict], int, list[dict]]:
    assignment, release, cohort = context(db, auth, assignment_id)
    missions, shown = visible(release, opened_blocks(db, release, cohort, every_block))
    index = next((i for i, item in enumerate(shown) if item["mission_version_id"] == version_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="mission not found")
    return assignment, release, shown, index, missions


@router.get("/missions/{version_id}")
def view_mission(assignment_id: int, version_id: int, response: Response, all: bool = Query(default=False),
                 auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    assignment, release, shown, index, missions = located(db, auth, assignment_id, version_id, all)
    state = statuses(db, NOBODY, missions, {item["mission_version_id"] for item in shown})[version_id]
    entry = shown[index]
    payload = {
        "mission_version_id": version_id, "release_id": release.id,
        "course_title": release.student_snapshot.get("title", ""), "is_demo": is_demo(release),
        "module": entry["module"], "chapter": entry["chapter"], "block_id": entry.get("chapter_id"), "title": entry["title"],
        "position": index + 1, "total": len(shown),
        "previous_id": shown[index - 1]["mission_version_id"] if index > 0 else None,
        "next_id": shown[index + 1]["mission_version_id"] if index + 1 < len(shown) else None,
        "ai_enabled": ai_enabled(), "paused": assignment.paused_at is not None, **state,
        "definition": None, "hints": [], "hint_count": 0, "attempts_count": 0, "last_attempt": None, "explanation": None,
        "score": None, "help_request": None, "student_view": True,
    }
    if state["status"] == "locked":
        return payload
    safe = student_safe_snapshot(release.student_snapshot, release_private_definitions(db, release.student_snapshot))
    payload["definition"] = next(item for item in flatten(safe) if item["mission_version_id"] == version_id)["definition"]
    definition = private_definition(db, version_id)
    payload.update({
        # Nothing is recorded: the rules are those of a student who has just opened the mission.
        "rules": student_state(db, rules_for_release(db, release), definition, NOBODY, version_id, utcnow()),
        "hint_count": len(definition.hints),
        "score": {"best": 0, "possible": definition.max_points, "bonus": definition.bonus},
    })
    return payload


class CheckInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: AnswerInput = Field(default_factory=AnswerInput)


@router.post("/missions/{version_id}/check")
def view_check(assignment_id: int, version_id: int, payload: CheckInput, response: Response, all: bool = Query(default=False),
               auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Grades an answer like a first attempt, with 0 point; nothing is stored (no attempt, no reward, no signal)."""
    response.headers["Cache-Control"] = "no-store"
    _, release, _, _, _ = located(db, auth, assignment_id, version_id, all)
    definition = private_definition(db, version_id)
    if definition.kind in UNGRADED_KINDS:
        correct, feedback = True, None
    else:
        try:
            evaluation = evaluate(definition, version_id, payload.answer)
        except InvalidAnswer as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        correct, feedback = evaluation.correct, feedback_for(definition, version_id, evaluation)
    return {
        "attempt_id": 0, "correct": correct, "replayed": False, "attempts_count": 1, "percent": None, "attempt_number": 1,
        "rules": student_state(db, rules_for_release(db, release), definition, NOBODY, version_id, utcnow()),
        "points": 0, "score": {"best": 0, "possible": definition.max_points, "bonus": definition.bonus},
        "feedback": feedback, "explanation": reveal_explanation(definition, correct, 1), "student_view": True,
    }


class HintInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shown: int = Field(default=0, ge=0, le=20)


@router.post("/missions/{version_id}/hints")
def view_hints(assignment_id: int, version_id: int, payload: HintInput, all: bool = Query(default=False),
               auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """The next hint, without recording it (the browser keeps the count)."""
    located(db, auth, assignment_id, version_id, all)
    definition = private_definition(db, version_id)
    return {"hints": definition.hints[:min(payload.shown + 1, len(definition.hints))], "hint_count": len(definition.hints)}


@router.post("/missions/{version_id}/runs/{run_id}")
def view_run(assignment_id: int, version_id: int, run_id: str, all: bool = Query(default=False),
             auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Read-only lab runs of the mission (same lab and limits as the student's)."""
    from app.lab_api import execute_run, find_run, throttle

    located(db, auth, assignment_id, version_id, all)
    item = find_run(private_definition(db, version_id), run_id)
    throttle(auth.user.id)
    return execute_run(item)


@router.get("/project")
def view_project(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    from app.project import project_page

    response.headers["Cache-Control"] = "no-store"
    _, _, cohort = context(db, auth, assignment_id)
    page = project_page(db, cohort, [cohort], NOBODY)
    return {**page, "student_view": True}

