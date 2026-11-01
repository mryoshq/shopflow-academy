"""Final grade on 20 of a class (ADR-0046): a calculation over the stored points, never a write to them.

Base = 30 % course + 20 % workshops + 50 % CampusEquip, each part brought to 20:
- course: main points of the modules that are not workshops (the axes), on their total;
- workshops: every graded point of the workshop modules (bonus ones included), on their total;
- CampusEquip: the project base on 20 (ADR-0046 grid).
Bonus = at most +1 for the project bonus (proportional, on 10) and at most +1 for the course bonus outside the
workshops (proportional to their total). Final = base + bonus, capped (20), rounded to the nearest 0.25.

A part with nothing yet (project not graded, no module of the part opened) is « en attente »: it is left out of a
provisional preview (the other weights are scaled up) instead of counting as zero. A module counts once one of its
blocks is open for the class, on its full total.
"""

from __future__ import annotations

import math
from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_teacher, require_teacher_csrf, utcnow
from app.database import get_db
from app.models import Assignment, BlockState, Cohort, CourseRelease, GradeSetting, ProjectGrade, ProjectMember, User
from app.progress import MissionScore, mission_scores
from app.project_grid import BONUS_MAX, student_total
from app.student import blocks_of
from app.teacher_dashboard import audit, class_students, owned_class

router = APIRouter(prefix="/api/v1/teacher", tags=["final-grade"])

DEFAULTS = {
    "weights": {"course": 30, "workshops": 20, "project": 50},
    "cap": 20, "project_bonus_max": 1, "course_bonus_max": 1,
    "workshop_modules": None,  # None = modules whose title starts with « Ateliers »
    "visible_to_students": False,
}
WORKSHOP_PREFIX = "ateliers"
PARTS = ("course", "workshops", "project")


def config_of(db: Session, assignment_id: int) -> dict:
    row = db.get(GradeSetting, assignment_id)
    config = deepcopy(DEFAULTS)
    if row:
        stored = row.config or {}
        config.update({k: v for k, v in stored.items() if k in DEFAULTS and k != "weights"})
        config["weights"].update({k: v for k, v in (stored.get("weights") or {}).items() if k in PARTS})
    return config


def quarter(value: float) -> float:
    """Nearest 0.25, halves up (12.125 → 12.25), never the banker's rounding."""
    return math.floor(value * 4 + 0.5 + 1e-9) / 4


def round2(value: float) -> float:
    """Shown values, to the hundredth, halves up."""
    return math.floor(value * 100 + 0.5 + 1e-9) / 100


def module_titles(snapshot: dict) -> list[str]:
    seen: list[str] = []
    for module in snapshot.get("modules", []):
        title = module.get("title", "")
        if title not in seen:
            seen.append(title)
    return seen


def workshop_titles(snapshot: dict, config: dict) -> set[str]:
    chosen = config.get("workshop_modules")
    if chosen is None:
        return {t for t in module_titles(snapshot) if t.strip().casefold().startswith(WORKSHOP_PREFIX)}
    return set(chosen)


class Structure:
    """Which missions belong to the course and to the workshops, and which modules are open (class level)."""

    def __init__(self, db: Session, release: CourseRelease, cohort: Cohort, config: dict):
        workshops = workshop_titles(release.student_snapshot, config)
        opened = set(db.scalars(select(BlockState.chapter_id).where(BlockState.cohort_id == cohort.id, BlockState.opened_at.is_not(None))))
        self.modules: dict[str, dict] = {}
        for block in blocks_of(release.student_snapshot):
            entry = self.modules.setdefault(block["module"], {"workshop": block["module"] in workshops, "open": False, "ids": []})
            entry["open"] = entry["open"] or block["chapter_id"] in opened
            entry["ids"] += [m["mission_version_id"] for m in block["missions"]]
        self.ids = [vid for entry in self.modules.values() for vid in entry["ids"]]

    def ids_of(self, workshop: bool, only_open: bool = True) -> list[int]:
        return [vid for entry in self.modules.values() if entry["workshop"] == workshop and (entry["open"] or not only_open)
                for vid in entry["ids"]]

    def all_open(self) -> bool:
        return all(entry["open"] for entry in self.modules.values() if entry["ids"])


def on20(points: float, possible: float) -> float | None:
    return 20 * points / possible if possible else None


def compute(structure: Structure, config: dict, scores: dict[int, MissionScore], project: dict | None) -> dict:
    """One student's final grade, with each component (pure: no database access)."""
    graded = lambda ids: [scores[v] for v in ids if v in scores and not scores[v].lesson]  # noqa: E731
    course = [s for s in graded(structure.ids_of(False)) if not s.bonus]
    course_bonus = [s for s in graded(structure.ids_of(False)) if s.bonus]
    workshops = graded(structure.ids_of(True))  # bonus or not: the whole workshop module counts
    parts = {
        "course": {"points": round(sum(s.best for s in course), 2), "possible": sum(s.possible for s in course)},
        "workshops": {"points": round(sum(s.best for s in workshops), 2), "possible": sum(s.possible for s in workshops)},
    }
    for part in parts.values():
        part["on20"] = on20(part["points"], part["possible"])
    base_project = project["base"] if project else None
    parts["project"] = {"points": base_project, "possible": 20, "on20": base_project}
    weights = config["weights"]
    present = [(weights[name], parts[name]["on20"]) for name in PARTS if parts[name]["on20"] is not None and weights[name] > 0]
    weight = sum(w for w, _ in present)
    exact = sum(w * v for w, v in present) / weight if weight else None  # the final grade uses the exact value
    project_bonus = round(config["project_bonus_max"] * min(project["bonus"] or 0, BONUS_MAX) / BONUS_MAX, 2) if project and project["bonus"] else 0.0
    bonus_possible = sum(s.possible for s in course_bonus)
    course_bonus_points = round(sum(s.best for s in course_bonus), 2)
    course_bonus_value = round(config["course_bonus_max"] * course_bonus_points / bonus_possible, 2) if bonus_possible else 0.0
    raw = None if exact is None else exact + project_bonus + course_bonus_value
    final = None if raw is None else quarter(min(config["cap"], raw))
    pending = [name for name in PARTS if parts[name]["on20"] is None and weights[name] > 0]
    provisional = bool(pending) or not structure.all_open() or not (project and project["complete"])
    shown = lambda value: None if value is None else round2(value)  # noqa: E731
    return {"parts": {name: {**parts[name], "on20": shown(parts[name]["on20"]), "pending": parts[name]["on20"] is None,
                             "weight": weights[name]} for name in PARTS},
            "base": None if exact is None else round2(exact), "project_bonus": project_bonus, "course_bonus": course_bonus_value,
            "course_bonus_points": course_bonus_points, "course_bonus_possible": bonus_possible,
            "raw": None if raw is None else round2(raw), "final": final, "capped": raw is not None and raw > config["cap"], "provisional": provisional, "pending": pending}


def project_of(db: Session, cohort_id: int) -> dict[int, dict]:
    members = db.scalars(select(ProjectMember).where(ProjectMember.cohort_id == cohort_id)).all()
    grades = {g.team_id: g for g in db.scalars(select(ProjectGrade).where(ProjectGrade.team_id.in_({m.team_id for m in members} or {0})))}
    out = {}
    for member in members:
        total = student_total(grades.get(member.team_id), member.user_id)
        out[member.user_id] = total if total["base"] is not None or total["bonus"] is not None else None
    return out


def class_final(db: Session, release: CourseRelease, cohort: Cohort, config: dict, students: list[User]) -> dict[int, dict]:
    structure = Structure(db, release, cohort, config)
    project = project_of(db, cohort.id)
    return {s.id: compute(structure, config, mission_scores(db, s.id, structure.ids), project.get(s.id)) for s in students}


def student_final(db: Session, user_id: int, release: CourseRelease) -> dict | None:
    """The final grade shown to a student, only when the teacher turned it on for one of the student's classes."""
    from app.models import Enrollment

    rows = db.execute(select(Assignment, Cohort).join(Cohort, Cohort.id == Assignment.cohort_id)
                      .join(Enrollment, Enrollment.cohort_id == Cohort.id)
                      .where(Enrollment.user_id == user_id, Assignment.course_release_id == release.id)).all()
    for assignment, cohort in rows:
        config = config_of(db, assignment.id)
        if config["visible_to_students"]:
            structure = Structure(db, release, cohort, config)
            return compute(structure, config, mission_scores(db, user_id, structure.ids), project_of(db, cohort.id).get(user_id))
    return None


# Teacher settings (Réglages > Notes) ---------------------------------------------------------------

class Weights(BaseModel):
    model_config = ConfigDict(extra="forbid")
    course: float = Field(ge=0, le=100)
    workshops: float = Field(ge=0, le=100)
    project: float = Field(ge=0, le=100)


class GradingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weights: Weights
    cap: float = Field(gt=0, le=20)
    project_bonus_max: float = Field(ge=0, le=5)
    course_bonus_max: float = Field(ge=0, le=5)
    workshop_modules: list[str] | None = Field(default=None, max_length=50)
    visible_to_students: bool = False

    @model_validator(mode="after")
    def total_100(self) -> "GradingInput":
        if round(self.weights.course + self.weights.workshops + self.weights.project, 6) != 100:
            raise ValueError("les poids doivent faire 100 %")
        return self


def settings_out(db: Session, release: CourseRelease, cohort: Cohort, assignment_id: int) -> dict:
    config = config_of(db, assignment_id)
    structure = Structure(db, release, cohort, config)
    return {"config": config, "defaults": DEFAULTS,
            "modules": [{"title": title, "workshop": entry["workshop"], "open": entry["open"]} for title, entry in structure.modules.items()]}


@router.get("/classes/{assignment_id}/grading")
def grading(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    return settings_out(db, release, cohort, assignment.id)


@router.put("/classes/{assignment_id}/grading")
def update_grading(assignment_id: int, payload: GradingInput, auth: AuthContext = Depends(require_teacher_csrf),
                   db: Session = Depends(get_db)) -> dict:
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    known = set(module_titles(release.student_snapshot))
    if payload.workshop_modules is not None and set(payload.workshop_modules) - known:
        raise HTTPException(status_code=422, detail="module inconnu dans ce cours")
    row = db.get(GradeSetting, assignment.id) or GradeSetting(assignment_id=assignment.id)
    row.config = payload.model_dump()
    row.updated_by = auth.user.id
    row.updated_at = utcnow()
    db.add(row)
    audit(db, auth, "grading.update", assignment.id, {"weights": payload.weights.model_dump(), "cap": payload.cap,
                                                      "visible_to_students": payload.visible_to_students})
    db.commit()
    return settings_out(db, release, cohort, assignment.id)


def class_grades(db: Session, auth: AuthContext, assignment_id: int) -> tuple[dict, list[User], dict[int, dict]]:
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    config = config_of(db, assignment.id)
    students = class_students(db, cohort.id)
    return config, students, class_final(db, release, cohort, config, students)
