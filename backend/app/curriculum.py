"""Teacher draft API and immutable student-safe course releases."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_student, require_teacher, require_teacher_csrf
from app.curriculum_schema import DisplayData, MissionDefinition, plain
from app.database import get_db
from app.projection import student_definition
from app.models import (
    Assignment, AuditEvent, Chapter, Cohort, Course, CourseModule, CourseRelease,
    Enrollment, LearningObjective, Mission, MissionVersion, User,
)

router = APIRouter(prefix="/api/v1", tags=["curriculum"])
PUBLIC_DEFINITION_FIELDS = {
    "schema_version", "kind", "scenario", "instructions", "objective_ids",
    "prerequisite_mission_ids", "choices", "match_targets", "display_data",
    "resources", "hint_count", "estimated_duration_minutes", "bonus",
}
display_adapter = TypeAdapter(DisplayData)


class CourseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)

    @field_validator("description")
    @classmethod
    def safe_description(cls, value: str) -> str:
        return plain(value) if value.strip() else ""


class CoursePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str | None) -> str | None:
        return plain(value) if value is not None else None

    @field_validator("description")
    @classmethod
    def safe_description(cls, value: str | None) -> str | None:
        return plain(value) if value and value.strip() else "" if value is not None else None


class ObjectiveInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[A-Z0-9_-]{1,40}$")
    statement: str = Field(min_length=1, max_length=1000)

    @field_validator("statement")
    @classmethod
    def safe_statement(cls, value: str) -> str:
        return plain(value)


class ObjectivePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str | None = Field(default=None, pattern=r"^[A-Z0-9_-]{1,40}$")
    statement: str | None = Field(default=None, min_length=1, max_length=1000)

    @field_validator("statement")
    @classmethod
    def safe_statement(cls, value: str | None) -> str | None:
        return plain(value) if value is not None else None


class TitleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0, le=10_000)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)


class TitlePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    sort_order: int | None = Field(default=None, ge=0, le=10_000)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str | None) -> str | None:
        return plain(value) if value is not None else None


class MissionInput(TitleInput):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)
    definition: MissionDefinition | None = None


class MissionPatch(TitlePatch):
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)


class CohortInput(BaseModel):
    label: str = Field(min_length=1, max_length=200)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)


class EnrollmentInput(BaseModel):
    user_id: int = Field(gt=0)


class AssignmentInput(BaseModel):
    course_release_id: int = Field(gt=0)


def save(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="conflicting curriculum record") from exc


def flush(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="conflicting curriculum record") from exc


def audit(db: Session, actor: AuthContext, action: str, resource_type: str, resource_id: int) -> None:
    db.add(AuditEvent(actor_id=actor.user.id, action=action, resource_type=resource_type, resource_id=resource_id))


def apply_patch(record: object, payload: BaseModel) -> None:
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            raise HTTPException(status_code=422, detail="null is not a valid update")
        setattr(record, key, value)


def course_or_404(db: Session, course_id: int, auth: AuthContext) -> Course:
    """A course exists for a teacher only if they own it (404 otherwise, nothing leaks)."""
    item = db.get(Course, course_id)
    if item is None or item.created_by != auth.user.id:
        raise HTTPException(status_code=404, detail="course not found")
    return item


def editable_course(db: Session, course_id: int, auth: AuthContext) -> Course:
    course = course_or_404(db, course_id, auth)
    if course.status == "archived":
        raise HTTPException(status_code=409, detail="course archived")
    return course


def deletable_course(db: Session, course_id: int, auth: AuthContext) -> Course:
    course = editable_course(db, course_id, auth)
    if db.scalar(select(CourseRelease.id).where(CourseRelease.course_id == course_id).limit(1)) is not None:
        raise HTTPException(status_code=409, detail="published course structure cannot be deleted")
    return course


def module_or_404(db: Session, module_id: int) -> CourseModule:
    item = db.get(CourseModule, module_id)
    if item is None:
        raise HTTPException(status_code=404, detail="module not found")
    return item


def chapter_or_404(db: Session, chapter_id: int) -> Chapter:
    item = db.get(Chapter, chapter_id)
    if item is None:
        raise HTTPException(status_code=404, detail="chapter not found")
    return item


def mission_course(db: Session, mission_id: int, auth: AuthContext) -> tuple[Mission, Course]:
    mission = db.get(Mission, mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail="mission not found")
    chapter = chapter_or_404(db, mission.chapter_id)
    module = module_or_404(db, chapter.module_id)
    return mission, course_or_404(db, module.course_id, auth)


def course_tree(db: Session, course: Course, *, private: bool) -> dict:
    objectives = db.scalars(select(LearningObjective).where(LearningObjective.course_id == course.id).order_by(LearningObjective.id)).all()
    modules = db.scalars(select(CourseModule).where(CourseModule.course_id == course.id).order_by(CourseModule.sort_order, CourseModule.id)).all()
    result = {
        "id": course.id, "slug": course.slug, "title": course.title,
        "description": course.description, "status": course.status,
        "objectives": [{"id": o.id, "code": o.code, "statement": o.statement} for o in objectives],
        "modules": [],
    }
    for module in modules:
        module_data = {"id": module.id, "title": module.title, "sort_order": module.sort_order, "chapters": []}
        chapters = db.scalars(select(Chapter).where(Chapter.module_id == module.id).order_by(Chapter.sort_order, Chapter.id)).all()
        for chapter in chapters:
            chapter_data = {"id": chapter.id, "title": chapter.title, "sort_order": chapter.sort_order, "missions": []}
            missions = db.scalars(select(Mission).where(Mission.chapter_id == chapter.id).order_by(Mission.sort_order, Mission.id)).all()
            for mission in missions:
                definition = mission.draft_definition
                if definition and not private:
                    try:
                        definition = MissionDefinition.model_validate(definition).preview_projection()
                    except ValidationError as exc:
                        raise HTTPException(status_code=422, detail="draft definition needs correction") from exc
                chapter_data["missions"].append({
                    "id": mission.id, "slug": mission.slug, "title": mission.title,
                    "sort_order": mission.sort_order, "definition": definition,
                })
            module_data["chapters"].append(chapter_data)
        result["modules"].append(module_data)
    return result


def student_safe_snapshot(snapshot: dict, private_by_version: dict[int, dict] | None = None) -> dict:
    """Defend even older stored releases against accidental answer-key exposure.

    Missions linked to a mission version also get opaque choice IDs and a shuffled
    order (see ``app.projection``), so ordering/matching answers are not revealed.
    """
    safe = deepcopy(snapshot)
    for module in safe.get("modules", []):
        for chapter in module.get("chapters", []):
            for mission in chapter.get("missions", []):
                raw = mission.get("definition")
                if not isinstance(raw, dict):
                    mission["definition"] = None
                    continue
                projected = {key: value for key, value in raw.items() if key in PUBLIC_DEFINITION_FIELDS}
                if "hint_count" not in projected:
                    hints = raw.get("hints")
                    projected["hint_count"] = len(hints) if isinstance(hints, list) else 0
                if "display_data" in projected and projected["display_data"] is not None:
                    try:
                        projected["display_data"] = display_adapter.validate_python(projected["display_data"]).model_dump()
                    except ValidationError:
                        projected.pop("display_data")
                version_id = mission.get("mission_version_id")
                if isinstance(version_id, int):
                    projected = student_definition(projected, version_id, (private_by_version or {}).get(version_id))
                mission["definition"] = projected
    return safe


def release_private_definitions(db: Session, snapshot: dict) -> dict[int, dict]:
    ids = [mission["mission_version_id"] for module in snapshot.get("modules", []) for chapter in module.get("chapters", [])
           for mission in chapter.get("missions", []) if isinstance(mission.get("mission_version_id"), int)]
    if not ids:
        return {}
    return {item.id: item.definition_private for item in db.scalars(select(MissionVersion).where(MissionVersion.id.in_(ids)))}


@router.get("/teacher/courses")
def list_courses(auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    courses = db.scalars(select(Course).where(Course.created_by == auth.user.id).order_by(Course.id)).all()
    return [{"id": c.id, "slug": c.slug, "title": c.title, "status": c.status} for c in courses]


@router.post("/teacher/courses", status_code=201)
def create_course(payload: CourseInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = Course(**payload.model_dump(), created_by=auth.user.id)
    db.add(course)
    flush(db)
    audit(db, auth, "course.create", "course", course.id)
    save(db)
    return {"id": course.id, "slug": course.slug, "title": course.title}


@router.get("/teacher/courses/{course_id}")
def get_course(course_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    return course_tree(db, course_or_404(db, course_id, auth), private=True)


@router.patch("/teacher/courses/{course_id}")
def update_course(course_id: int, payload: CoursePatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = editable_course(db, course_id, auth)
    apply_patch(course, payload)
    audit(db, auth, "course.update", "course", course.id)
    save(db)
    return course_tree(db, course, private=True)


@router.delete("/teacher/courses/{course_id}", status_code=204)
def delete_course(course_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> None:
    course = deletable_course(db, course_id, auth)
    audit(db, auth, "course.delete", "course", course_id)
    db.delete(course)
    save(db)


@router.post("/teacher/courses/{course_id}/objectives", status_code=201)
def add_objective(course_id: int, payload: ObjectiveInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    editable_course(db, course_id, auth)
    objective = LearningObjective(course_id=course_id, **payload.model_dump())
    db.add(objective)
    flush(db)
    audit(db, auth, "objective.create", "objective", objective.id)
    save(db)
    return {"id": objective.id, **payload.model_dump()}


@router.patch("/teacher/objectives/{objective_id}")
def update_objective(objective_id: int, payload: ObjectivePatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    objective = db.get(LearningObjective, objective_id)
    if objective is None:
        raise HTTPException(status_code=404, detail="objective not found")
    editable_course(db, objective.course_id, auth)
    apply_patch(objective, payload)
    audit(db, auth, "objective.update", "objective", objective.id)
    save(db)
    return {"id": objective.id, "code": objective.code, "statement": objective.statement}


@router.delete("/teacher/objectives/{objective_id}", status_code=204)
def delete_objective(objective_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> None:
    objective = db.get(LearningObjective, objective_id)
    if objective is None:
        raise HTTPException(status_code=404, detail="objective not found")
    deletable_course(db, objective.course_id, auth)
    for module in db.scalars(select(CourseModule).where(CourseModule.course_id == objective.course_id)):
        for chapter in db.scalars(select(Chapter).where(Chapter.module_id == module.id)):
            for mission in db.scalars(select(Mission).where(Mission.chapter_id == chapter.id)):
                if mission.draft_definition and objective.id in mission.draft_definition.get("objective_ids", []):
                    raise HTTPException(status_code=409, detail="objective is used by a draft mission")
    audit(db, auth, "objective.delete", "objective", objective.id)
    db.delete(objective)
    save(db)


@router.post("/teacher/courses/{course_id}/modules", status_code=201)
def add_module(course_id: int, payload: TitleInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    editable_course(db, course_id, auth)
    module = CourseModule(course_id=course_id, **payload.model_dump())
    db.add(module)
    flush(db)
    audit(db, auth, "module.create", "module", module.id)
    save(db)
    return {"id": module.id, **payload.model_dump()}


@router.patch("/teacher/modules/{module_id}")
def update_module(module_id: int, payload: TitlePatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    module = module_or_404(db, module_id)
    editable_course(db, module.course_id, auth)
    apply_patch(module, payload)
    audit(db, auth, "module.update", "module", module.id)
    save(db)
    return {"id": module.id, "title": module.title, "sort_order": module.sort_order}


@router.delete("/teacher/modules/{module_id}", status_code=204)
def delete_module(module_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> None:
    module = module_or_404(db, module_id)
    deletable_course(db, module.course_id, auth)
    audit(db, auth, "module.delete", "module", module.id)
    db.delete(module)
    save(db)


@router.post("/teacher/modules/{module_id}/chapters", status_code=201)
def add_chapter(module_id: int, payload: TitleInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    module = module_or_404(db, module_id)
    editable_course(db, module.course_id, auth)
    chapter = Chapter(module_id=module_id, **payload.model_dump())
    db.add(chapter)
    flush(db)
    audit(db, auth, "chapter.create", "chapter", chapter.id)
    save(db)
    return {"id": chapter.id, **payload.model_dump()}


@router.patch("/teacher/chapters/{chapter_id}")
def update_chapter(chapter_id: int, payload: TitlePatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    chapter = chapter_or_404(db, chapter_id)
    editable_course(db, module_or_404(db, chapter.module_id).course_id, auth)
    apply_patch(chapter, payload)
    audit(db, auth, "chapter.update", "chapter", chapter.id)
    save(db)
    return {"id": chapter.id, "title": chapter.title, "sort_order": chapter.sort_order}


@router.delete("/teacher/chapters/{chapter_id}", status_code=204)
def delete_chapter(chapter_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> None:
    chapter = chapter_or_404(db, chapter_id)
    deletable_course(db, module_or_404(db, chapter.module_id).course_id, auth)
    audit(db, auth, "chapter.delete", "chapter", chapter.id)
    db.delete(chapter)
    save(db)


@router.post("/teacher/chapters/{chapter_id}/missions", status_code=201)
def add_mission(chapter_id: int, payload: MissionInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    chapter = chapter_or_404(db, chapter_id)
    course = editable_course(db, module_or_404(db, chapter.module_id).course_id, auth)
    if payload.definition:
        check_objectives(db, course.id, payload.definition)
    mission = Mission(chapter_id=chapter_id, slug=payload.slug, title=payload.title, sort_order=payload.sort_order,
                      draft_definition=payload.definition.model_dump() if payload.definition else None)
    db.add(mission)
    flush(db)
    audit(db, auth, "mission.create", "mission", mission.id)
    save(db)
    return {"id": mission.id, "slug": mission.slug, "title": mission.title}


@router.patch("/teacher/missions/{mission_id}")
def update_mission(mission_id: int, payload: MissionPatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    mission, course = mission_course(db, mission_id, auth)
    editable_course(db, course.id, auth)
    apply_patch(mission, payload)
    audit(db, auth, "mission.meta.update", "mission", mission.id)
    save(db)
    return {"id": mission.id, "slug": mission.slug, "title": mission.title, "sort_order": mission.sort_order}


@router.delete("/teacher/missions/{mission_id}", status_code=204)
def delete_mission(mission_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> None:
    mission, course = mission_course(db, mission_id, auth)
    deletable_course(db, course.id, auth)
    audit(db, auth, "mission.delete", "mission", mission.id)
    db.delete(mission)
    save(db)


def check_objectives(db: Session, course_id: int, definition: MissionDefinition) -> None:
    found = set(db.scalars(select(LearningObjective.id).where(LearningObjective.course_id == course_id,
                                                                 LearningObjective.id.in_(definition.objective_ids))).all())
    if found != set(definition.objective_ids):
        raise HTTPException(status_code=422, detail="mission references an objective outside this course")
    if definition.prerequisite_mission_ids:
        prior = set(db.scalars(
            select(Mission.id).join(Chapter, Chapter.id == Mission.chapter_id)
            .join(CourseModule, CourseModule.id == Chapter.module_id)
            .where(CourseModule.course_id == course_id, Mission.id.in_(definition.prerequisite_mission_ids))
        ).all())
        if prior != set(definition.prerequisite_mission_ids):
            raise HTTPException(status_code=422, detail="mission references a prerequisite outside this course")


@router.put("/teacher/missions/{mission_id}/draft")
def update_mission_draft(mission_id: int, definition: MissionDefinition,
                         auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    mission, course = mission_course(db, mission_id, auth)
    editable_course(db, course.id, auth)
    check_objectives(db, course.id, definition)
    if mission.id in definition.prerequisite_mission_ids:
        raise HTTPException(status_code=422, detail="mission cannot require itself")
    mission.draft_definition = definition.model_dump()
    audit(db, auth, "mission.update", "mission", mission.id)
    save(db)
    return {"id": mission.id, "definition": mission.draft_definition}


@router.post("/teacher/courses/{course_id}/preview")
def preview_course(course_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = course_or_404(db, course_id, auth)
    return course_tree(db, course, private=False)


def validated_tree(db: Session, course: Course) -> tuple[dict, list[dict]]:
    tree = course_tree(db, course, private=True)
    missions = [mission for module in tree["modules"] for chapter in module["chapters"] for mission in chapter["missions"]]
    if not missions:
        raise HTTPException(status_code=422, detail="course needs at least one mission")
    for mission in missions:
        if mission["definition"] is None:
            raise HTTPException(status_code=422, detail="all missions need a valid definition")
        try:
            definition = MissionDefinition.model_validate(mission["definition"])
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail="draft definition needs correction") from exc
        check_objectives(db, course.id, definition)
    dependencies = {item["id"]: set(item["definition"].get("prerequisite_mission_ids", [])) if item["definition"] else set() for item in missions}
    visiting: set[int] = set()
    visited: set[int] = set()

    def visit(mission_id: int) -> None:
        if mission_id in visiting:
            raise HTTPException(status_code=422, detail="prerequisite cycle")
        if mission_id in visited:
            return
        visiting.add(mission_id)
        for prerequisite in dependencies[mission_id]:
            if prerequisite not in dependencies:
                raise HTTPException(status_code=422, detail="prerequisite not in release")
            visit(prerequisite)
        visiting.remove(mission_id)
        visited.add(mission_id)

    for mission_id in dependencies:
        visit(mission_id)
    return tree, missions


@router.post("/teacher/courses/{course_id}/validate")
def validate_course(course_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = editable_course(db, course_id, auth)
    _, missions = validated_tree(db, course)
    return {"valid": True, "mission_count": len(missions)}


@router.post("/teacher/courses/{course_id}/publish", status_code=201)
def publish_course(course_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = db.scalar(select(Course).where(Course.id == course_id).with_for_update())
    if course is None or course.created_by != auth.user.id:
        raise HTTPException(status_code=404, detail="course not found")
    if course.status == "archived":
        raise HTTPException(status_code=409, detail="course archived")
    tree, _ = validated_tree(db, course)
    latest = db.scalar(select(func.max(CourseRelease.version)).where(CourseRelease.course_id == course.id)) or 0
    public = {key: value for key, value in tree.items() if key != "status"}
    public["version"] = latest + 1
    private_for_hash = []
    for module in public["modules"]:
        for chapter in module["chapters"]:
            for item in chapter["missions"]:
                definition = item["definition"]
                if definition is None:
                    raise HTTPException(status_code=422, detail="all missions need a valid definition")
                parsed = MissionDefinition.model_validate(definition)
                check_objectives(db, course.id, parsed)
                latest_mission = db.scalar(select(func.max(MissionVersion.version)).where(MissionVersion.mission_id == item["id"])) or 0
                version = MissionVersion(mission_id=item["id"], version=latest_mission + 1,
                                         definition_private=parsed.model_dump(), student_projection=parsed.student_projection())
                db.add(version)
                flush(db)
                private_for_hash.append({"id": version.id, "definition": version.definition_private})
                item["mission_version_id"] = version.id
                item["definition"] = version.student_projection
    canonical = json.dumps({"public": public, "private": private_for_hash}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    release = CourseRelease(course_id=course.id, version=latest + 1, status="published",
                            snapshot_hash=sha256(canonical.encode()).hexdigest(),
                            student_snapshot=public, published_by=auth.user.id)
    db.add(release)
    flush(db)
    course.status = "published"
    audit(db, auth, "course.publish", "release", release.id)
    save(db)
    return {"id": release.id, "course_id": course.id, "version": release.version, "snapshot_hash": release.snapshot_hash}


@router.post("/teacher/courses/{course_id}/archive")
def archive_course(course_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = editable_course(db, course_id, auth)
    course.status = "archived"
    for release in db.scalars(select(CourseRelease).where(CourseRelease.course_id == course_id)):
        release.status = "archived"
    audit(db, auth, "course.archive", "course", course.id)
    save(db)
    return {"id": course.id, "status": course.status}


@router.get("/teacher/courses/{course_id}/releases")
def list_releases(course_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    course_or_404(db, course_id, auth)
    releases = db.scalars(select(CourseRelease).where(CourseRelease.course_id == course_id).order_by(CourseRelease.version.desc())).all()
    return [{"id": item.id, "version": item.version, "status": item.status,
             "published_at": item.published_at.isoformat()} for item in releases]


@router.post("/teacher/cohorts", status_code=201)
def create_cohort(payload: CohortInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    cohort = Cohort(label=payload.label)
    db.add(cohort)
    flush(db)
    audit(db, auth, "cohort.create", "cohort", cohort.id)
    save(db)
    return {"id": cohort.id, "label": cohort.label}


@router.get("/teacher/cohorts")
def list_cohorts(auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    cohorts = db.scalars(select(Cohort).order_by(Cohort.id)).all()
    return [{"id": cohort.id, "label": cohort.label} for cohort in cohorts]


@router.get("/teacher/cohorts/{cohort_id}")
def get_cohort(cohort_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    cohort = db.get(Cohort, cohort_id)
    if cohort is None:
        raise HTTPException(status_code=404, detail="cohort not found")
    enrolled = db.scalars(select(Enrollment.user_id).where(Enrollment.cohort_id == cohort_id)).all()
    assigned = db.scalars(select(Assignment.course_release_id).where(Assignment.cohort_id == cohort_id)).all()
    return {"id": cohort.id, "label": cohort.label, "student_ids": enrolled, "release_ids": assigned}


@router.get("/teacher/students")
def list_students(auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    students = db.scalars(select(User).where(User.role == "student", User.enabled.is_(True)).order_by(User.id)).all()
    return [{"id": student.id, "username": student.username} for student in students]


@router.post("/teacher/cohorts/{cohort_id}/enrollments", status_code=201)
def enroll_student(cohort_id: int, payload: EnrollmentInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    if db.get(Cohort, cohort_id) is None:
        raise HTTPException(status_code=404, detail="cohort not found")
    student = db.get(User, payload.user_id)
    if student is None or student.role != "student":
        raise HTTPException(status_code=422, detail="student required")
    enrollment = Enrollment(cohort_id=cohort_id, user_id=student.id)
    db.add(enrollment)
    flush(db)
    audit(db, auth, "student.enroll", "enrollment", enrollment.id)
    save(db)
    return {"id": enrollment.id, "cohort_id": cohort_id, "user_id": student.id}


@router.post("/teacher/cohorts/{cohort_id}/assignments", status_code=201)
def assign_release(cohort_id: int, payload: AssignmentInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    if db.get(Cohort, cohort_id) is None:
        raise HTTPException(status_code=404, detail="cohort not found")
    release = db.get(CourseRelease, payload.course_release_id)
    if release is None or release.status != "published" or course_or_404(db, release.course_id, auth).status == "archived":
        raise HTTPException(status_code=422, detail="published release required")
    assignment = Assignment(cohort_id=cohort_id, course_release_id=release.id)
    db.add(assignment)
    flush(db)
    audit(db, auth, "release.assign", "assignment", assignment.id)
    save(db)
    return {"id": assignment.id, "cohort_id": cohort_id, "course_release_id": release.id}


@router.get("/student/courses")
def student_courses(auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> list[dict]:
    releases = db.scalars(
        select(CourseRelease).join(Assignment, Assignment.course_release_id == CourseRelease.id)
        .join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
        .where(Enrollment.user_id == auth.user.id, CourseRelease.status == "published")
        .order_by(CourseRelease.id)
    ).all()
    unique = {item.id: item for item in releases}
    return [{"id": item.id, "course_id": item.course_id, "version": item.version,
             "title": item.student_snapshot["title"]} for item in unique.values()]


@router.get("/student/courses/{release_id}")
def student_course(release_id: int, response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    release = db.scalar(
        select(CourseRelease).join(Assignment, Assignment.course_release_id == CourseRelease.id)
        .join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
        .where(CourseRelease.id == release_id, Enrollment.user_id == auth.user.id,
               CourseRelease.status == "published")
    )
    if release is None:
        raise HTTPException(status_code=404, detail="course not found")
    response.headers["Cache-Control"] = "no-store"
    from app.student import visible_snapshot

    # Closed blocks keep their title only: no mission, no content (sprint 2, part A).
    snapshot = visible_snapshot(db, auth.user.id, release)
    return student_safe_snapshot(snapshot, release_private_definitions(db, snapshot))
