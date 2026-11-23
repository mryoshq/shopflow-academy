"""Issue #110: one statistics page for the teacher, the direction and the projector on the day of the defences.

Aggregates only: no student name, no individual grade. Course figures reuse the observer space (ADR-0042);
project figures come from the project space (ADR-0034, ADR-0046). The class average of the project appears
only for the teacher and « Administration » accounts.
"""

from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, require_observer, require_teacher, utcnow
from app.database import get_db
from app.models import ProjectGrade, ProjectSlot, ProjectSubmission
from app.observer_stats import ClassData, charts, dashboard

router = APIRouter(prefix="/api/v1", tags=["stats"])


def project_stats(db: Session, data: ClassData, with_grades: bool) -> dict:
    from app.project import all_teams, milestones_of, total

    cohort_id = data.cohort.id
    enrolled = {s.id for s in data.students}
    teams = {tid: [uid for uid in members if uid in enrolled] for tid, members in all_teams(db, cohort_id).items()}
    teams = {tid: members for tid, members in teams.items() if members}
    in_team = {uid for members in teams.values() for uid in members}
    sizes = Counter(len(members) for members in teams.values())
    submissions = db.scalars(select(ProjectSubmission).where(ProjectSubmission.team_id.in_(list(teams) or [0]))).all()
    by_milestone: dict[int, set[int]] = {}
    versions: Counter = Counter()
    for item in submissions:
        by_milestone.setdefault(item.milestone_id, set()).add(item.team_id)
        versions[item.milestone_id] += 1
    with_work = {item.team_id for item in submissions}
    milestones = [{"title": m.title, "teams": len(by_milestone.get(m.id, set())), "versions": versions[m.id]} for m in milestones_of(db, cohort_id)]

    now = utcnow()
    slots = db.scalars(select(ProjectSlot).where(ProjectSlot.cohort_id == cohort_id)).all()
    done = sum(1 for s in slots if s.team_id and aware(s.ends_at) <= now)
    current = sum(1 for s in slots if s.team_id and aware(s.starts_at) <= now < aware(s.ends_at))
    grades = {g.team_id: g for g in db.scalars(select(ProjectGrade).where(ProjectGrade.team_id.in_(list(teams) or [0])))}
    graded_teams, bases = 0, []
    for tid, members in teams.items():
        results = [total(grades.get(tid), uid) for uid in members]
        if results and all(item["complete"] for item in results):
            graded_teams += 1
            bases.extend(item["base"] for item in results if item["base"] is not None)
    out = {
        "teams": len(teams), "teams_of_2": sizes.get(2, 0), "teams_of_3": sizes.get(3, 0), "teams_other": sum(v for k, v in sizes.items() if k not in (2, 3)),
        "students_in_team": len(in_team), "students_without_team": len(enrolled - in_team),
        "teams_with_deposit": len(with_work), "teams_without_deposit": len(teams) - len(with_work), "versions": len(submissions),
        "milestones": milestones,
        "defences": {"slots": len(slots), "assigned": sum(1 for s in slots if s.team_id), "done": done, "current": current,
                     "upcoming": sum(1 for s in slots if s.team_id and aware(s.starts_at) > now), "graded_teams": graded_teams},
    }
    if with_grades:
        out["defences"]["mean_base"] = round(sum(bases) / len(bases), 2) if bases else None
    return out


def class_stats(db: Session, data: ClassData, with_grades: bool) -> dict:
    board = dashboard(db, data)
    keep = ("students", "mean_progress", "success_rate", "work_minutes_mean", "blocks_open", "blocks_total", "missions", "bonus_students",
            "course_title", "cohort")
    return {"course": {**{key: board[key] for key in keep}, "modules": charts(db, data)["modules"]},
            "project": project_stats(db, data, with_grades), "generated_at": utcnow().isoformat()}


@router.get("/teacher/classes/{assignment_id}/stats")
def teacher_stats(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return class_stats(db, ClassData(db, auth, assignment_id), with_grades=True)


@router.get("/observer/classes/{assignment_id}/stats", tags=["observer"])
def observer_stats(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    from app.observer import consulted, observer_scope, rights

    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    data = ClassData(db, owner, assignment_id)
    consulted(db, auth, "stats", assignment_id)
    return class_stats(db, data, with_grades=rights(row)["grades"])
