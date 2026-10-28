"""Teacher class dashboard (P0-07, ADR-0013).

A "class" is an assignment (cohort x published course release). Every route is
restricted to the teacher who owns the course (``Course.created_by``) and answers
404 otherwise, so another account cannot even learn that the class exists.
"""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, display_name, require_teacher, require_teacher_csrf, utcnow
from app.database import get_db
from app.models import (
    Assignment, AuditEvent, Cohort, Course, CourseRelease, Enrollment, HintReveal, MissionAttempt, MissionUnlock, User,
)
from app.progress import course_score, mission_scores
from app.student import flatten

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-dashboard"])
ACTIVE_WINDOW = timedelta(minutes=5)
HELP_AFTER_FAILURES = 3


class UnlockInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(gt=0)
    mission_version_id: int = Field(gt=0)


def owned_class(db: Session, auth: AuthContext, assignment_id: int) -> tuple[Assignment, CourseRelease, Cohort]:
    row = db.execute(
        select(Assignment, CourseRelease, Cohort)
        .join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
        .join(Course, Course.id == CourseRelease.course_id)
        .join(Cohort, Cohort.id == Assignment.cohort_id)
        .where(Assignment.id == assignment_id, Course.created_by == auth.user.id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="class not found")
    return row[0], row[1], row[2]


def class_students(db: Session, cohort_id: int) -> list[User]:
    return list(db.scalars(select(User).join(Enrollment, Enrollment.user_id == User.id)
                           .where(Enrollment.cohort_id == cohort_id, User.role == "student").order_by(User.username)).all())


def audit(db: Session, auth: AuthContext, action: str, assignment_id: int, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action=action, resource_type="assignment", resource_id=assignment_id, details=details))


def iso(value: datetime | None) -> str | None:
    return aware(value).isoformat() if value else None


@router.get("/classes")
def list_classes(auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(
        select(Assignment, CourseRelease, Cohort)
        .join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
        .join(Course, Course.id == CourseRelease.course_id)
        .join(Cohort, Cohort.id == Assignment.cohort_id)
        .where(Course.created_by == auth.user.id, CourseRelease.status == "published")
        .order_by(Assignment.id.desc())
    ).all()
    return [{
        "id": assignment.id, "cohort_id": cohort.id, "cohort": cohort.label, "release_id": release.id,
        "course_title": release.student_snapshot.get("title", ""), "version": release.version,
        "paused": assignment.paused_at is not None, "student_count": len(class_students(db, cohort.id)),
    } for assignment, release, cohort in rows]


@router.get("/classes/{assignment_id}/overview")
def overview(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    missions = flatten(release.student_snapshot)
    ids = [item["mission_version_id"] for item in missions]
    titles = {item["mission_version_id"]: item["title"] for item in missions}
    now = utcnow()
    rows = []
    for student in class_students(db, cohort.id):
        scores = mission_scores(db, student.id, ids)
        attempts = db.scalars(select(MissionAttempt).where(MissionAttempt.user_id == student.id, MissionAttempt.mission_version_id.in_(ids))
                              .order_by(MissionAttempt.id)).all() if ids else []
        hints = db.scalars(select(HintReveal).where(HintReveal.user_id == student.id, HintReveal.mission_version_id.in_(ids))).all() if ids else []
        events = [(aware(a.created_at), a.mission_version_id) for a in attempts] + [(aware(h.created_at), h.mission_version_id) for h in hints]
        last = max(events, default=None)
        help_missions = []
        for vid in ids:
            item = scores[vid]
            failures = sum(1 for a in attempts if a.mission_version_id == vid and not a.is_correct)
            if not item.completed and failures >= HELP_AFTER_FAILURES:
                help_missions.append(titles[vid])
        summary = course_score(scores)
        rows.append({
            "id": student.id, "display_name": display_name(student.username),
            "completed": summary["completed"], "total": summary["total"],
            "lessons_read": summary["lessons_read"], "lessons_total": summary["lessons_total"],
            "core_points": summary["core_points"], "core_possible": summary["core_possible"],
            "bonus_points": summary["bonus_points"], "attempts": len(attempts), "hints": len(hints),
            "current_mission": titles.get(last[1]) if last else None, "last_activity": last[0].isoformat() if last else None,
            "active": bool(last and now - last[0] <= ACTIVE_WINDOW), "needs_help": help_missions,
            "fast_attempts": sum(1 for a in attempts if a.fast),
        })
    return {
        "generated_at": now.isoformat(), "assignment_id": assignment.id, "cohort": cohort.label,
        "course_title": release.student_snapshot.get("title", ""), "version": release.version,
        "paused": assignment.paused_at is not None, "paused_at": iso(assignment.paused_at),
        "missions": [{"mission_version_id": vid, "title": titles[vid]} for vid in ids], "students": rows,
    }


@router.get("/classes/{assignment_id}/students/{user_id}")
def student_detail(assignment_id: int, user_id: int, response: Response, auth: AuthContext = Depends(require_teacher),
                   db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, release, cohort = owned_class(db, auth, assignment_id)
    student = next((item for item in class_students(db, cohort.id) if item.id == user_id), None)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")
    from app.student import statuses

    from app.student import open_blocks

    missions = flatten(release.student_snapshot)
    ids = [item["mission_version_id"] for item in missions]
    scores = mission_scores(db, student.id, ids)
    state = statuses(db, student.id, missions)
    opened = open_blocks(db, [cohort.id])
    attempts = db.scalars(select(MissionAttempt).where(MissionAttempt.user_id == student.id, MissionAttempt.mission_version_id.in_(ids))
                          .order_by(MissionAttempt.id.desc()).limit(100)).all() if ids else []
    hints = db.scalars(select(HintReveal).where(HintReveal.user_id == student.id, HintReveal.mission_version_id.in_(ids))).all() if ids else []
    titles = {item["mission_version_id"]: item["title"] for item in missions}
    from app.progress import attempt_points, definitions

    defs = definitions(db, ids)
    return {
        "id": student.id, "display_name": display_name(student.username),
        "missions": [{
            "mission_version_id": vid, "title": titles[vid], "status": state[vid]["status"], "locked_by": state[vid]["locked_by"],
            "unlocked_by_teacher": state[vid]["unlocked_by_teacher"],
            "block_open": next(item.get("chapter_id") for item in missions if item["mission_version_id"] == vid) in opened,
            "best_points": scores[vid].best, "possible": scores[vid].possible,
            "bonus": scores[vid].bonus, "attempts": scores[vid].attempts, "hints": sum(1 for h in hints if h.mission_version_id == vid),
            "fast_attempts": sum(1 for a in attempts if a.mission_version_id == vid and a.fast),
        } for vid in ids],
        "attempts": [{"id": a.id, "mission": titles[a.mission_version_id], "created_at": iso(a.created_at),
                      "correct": a.is_correct, "points": attempt_points(a, defs[a.mission_version_id]),
                      "fast": a.fast, "percent": a.percent} for a in attempts],
    }


@router.post("/classes/{assignment_id}/pause")
def pause(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, _, _ = owned_class(db, auth, assignment_id)
    if assignment.paused_at is None:
        assignment.paused_at = utcnow()
        audit(db, auth, "class.pause", assignment.id)
        db.commit()
    return {"paused": True, "paused_at": iso(assignment.paused_at)}


@router.post("/classes/{assignment_id}/resume")
def resume(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, _, _ = owned_class(db, auth, assignment_id)
    if assignment.paused_at is not None:
        assignment.paused_at = None
        audit(db, auth, "class.resume", assignment.id)
        db.commit()
    return {"paused": False, "paused_at": None}


@router.post("/classes/{assignment_id}/unlocks", status_code=201)
def unlock(assignment_id: int, payload: UnlockInput, response: Response, auth: AuthContext = Depends(require_teacher_csrf),
           db: Session = Depends(get_db)) -> dict:
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    if payload.user_id not in {item.id for item in class_students(db, cohort.id)}:
        raise HTTPException(status_code=404, detail="student not found")
    titles = {item["mission_version_id"]: item["title"] for item in flatten(release.student_snapshot)}
    if payload.mission_version_id not in titles:
        raise HTTPException(status_code=404, detail="mission not found")
    existing = db.scalar(select(MissionUnlock).where(MissionUnlock.user_id == payload.user_id,
                                                     MissionUnlock.mission_version_id == payload.mission_version_id))
    if existing is not None:
        response.status_code = 200
        return {"id": existing.id, "created": False}
    item = MissionUnlock(assignment_id=assignment.id, user_id=payload.user_id, mission_version_id=payload.mission_version_id,
                         unlocked_by=auth.user.id)
    db.add(item)
    student = db.get(User, payload.user_id)
    audit(db, auth, "mission.unlock", assignment.id,
          {"student": display_name(student.username), "mission": titles[payload.mission_version_id]})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        response.status_code = 200
        return {"id": None, "created": False}
    return {"id": item.id, "created": True}


def csv_number(value: float | int) -> str:
    """French spreadsheet format: 10 → "10", 7.5 → "7,5"."""
    number = float(value)
    return str(int(number)) if number.is_integer() else f"{number:.2f}".rstrip("0").replace(".", ",")


def csv_cell(value: object) -> str:
    """Neutralise spreadsheet formulas (CSV injection) in exported text."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in {"=", "+", "-", "@", "\t", "\r"} else text


@router.get("/classes/{assignment_id}/export.csv")
def export_csv(assignment_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> Response:
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    missions = flatten(release.student_snapshot)
    ids = [item["mission_version_id"] for item in missions]
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["etudiant"] + [csv_cell(item["title"]) for item in missions] + ["total_points", "total_possible", "bonus_points", "missions_reussies"])
    for student in class_students(db, cohort.id):
        scores = mission_scores(db, student.id, ids)
        summary = course_score(scores)
        writer.writerow([csv_cell(display_name(student.username))]
                        + [csv_number(scores[vid].best) for vid in ids]
                        + [csv_number(summary["core_points"]), summary["core_possible"],
                           csv_number(summary["bonus_points"]), summary["completed"]])
    audit(db, auth, "class.export", assignment.id)
    db.commit()
    filename = f"shopflow-notes-classe-{assignment.id}-v{release.version}.csv"
    # UTF-8 BOM so that Excel on Windows opens accents correctly.
    return Response(content="﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/classes/{assignment_id}/interventions")
def interventions(assignment_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    assignment, _, _ = owned_class(db, auth, assignment_id)
    events = db.scalars(select(AuditEvent).where(AuditEvent.resource_type == "assignment", AuditEvent.resource_id == assignment.id)
                        .order_by(AuditEvent.id.desc()).limit(100)).all()
    actors = {user.id: display_name(user.username) for user in db.scalars(select(User).where(User.id.in_({e.actor_id for e in events})))} if events else {}
    return [{"id": e.id, "action": e.action, "actor": actors.get(e.actor_id, "?"), "created_at": iso(e.created_at),
             "details": e.details or {}} for e in events]
