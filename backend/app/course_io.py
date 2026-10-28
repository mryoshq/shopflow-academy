"""Course import/export, search, change history and editorial rollback (P0-08, ADR-0014).

Portable document ``shopflow-course`` v1: objectives are referenced by code and
prerequisites by mission slug, so a course moves between databases unchanged.
Import never overwrites: it always creates a new draft course, atomically, after a
strict validation whose report lists every error with its path. Exports contain the
private answer keys and are therefore teacher-only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import AuthContext, display_name, require_teacher, require_teacher_csrf
from app.curriculum import course_or_404, course_tree, editable_course
from app.curriculum_schema import MissionDefinition, plain
from app.database import get_db
from app.models import (
    AuditEvent, Chapter, Course, CourseModule, CourseRelease, LearningObjective, Mission, MissionVersion, User,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["content-admin"])
FORMAT = "shopflow-course"
SLUG = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class ObjectiveDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[A-Z0-9_-]{1,40}$")
    statement: str = Field(min_length=1, max_length=1000)

    @field_validator("statement")
    @classmethod
    def safe(cls, value: str) -> str:
        return plain(value)


class MissionDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(pattern=SLUG, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0, le=10_000)
    objective_codes: list[str] = Field(default_factory=list, max_length=20)
    prerequisite_slugs: list[str] = Field(default_factory=list, max_length=20)
    definition: dict | None = None

    @field_validator("title")
    @classmethod
    def safe(cls, value: str) -> str:
        return plain(value)


class ChapterDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0, le=10_000)
    missions: list[MissionDoc] = Field(default_factory=list, max_length=100)

    @field_validator("title")
    @classmethod
    def safe(cls, value: str) -> str:
        return plain(value)


class ModuleDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0, le=10_000)
    chapters: list[ChapterDoc] = Field(default_factory=list, max_length=50)

    @field_validator("title")
    @classmethod
    def safe(cls, value: str) -> str:
        return plain(value)


class CourseInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(pattern=SLUG, max_length=100)
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


class CourseDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["shopflow-course"]
    format_version: Literal[1]
    exported_at: str | None = None
    source: dict | None = None
    course: CourseInfo
    objectives: list[ObjectiveDoc] = Field(default_factory=list, max_length=100)
    modules: list[ModuleDoc] = Field(default_factory=list, max_length=50)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: dict
    slug: str | None = Field(default=None, pattern=SLUG, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=200)


class RestoreInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    release_id: int = Field(gt=0)


def _location(loc: tuple) -> str:
    return ".".join(str(part) for part in loc)


def validate_document(raw: dict) -> tuple[CourseDocument | None, list[dict]]:
    """Return the parsed document and a list of {path, message} errors."""
    try:
        document = CourseDocument.model_validate(raw)
    except ValidationError as exc:
        return None, [{"path": _location(item["loc"]), "message": item["msg"]} for item in exc.errors()[:50]]
    errors: list[dict] = []
    codes = [item.code for item in document.objectives]
    if len(set(codes)) != len(codes):
        errors.append({"path": "objectives", "message": "Codes d'objectif en double"})
    slugs = [m.slug for mod in document.modules for ch in mod.chapters for m in ch.missions]
    if len(set(slugs)) != len(slugs):
        errors.append({"path": "modules", "message": "Identifiants (slug) de mission en double"})
    for mi, module in enumerate(document.modules):
        for ci, chapter in enumerate(module.chapters):
            for xi, mission in enumerate(chapter.missions):
                path = f"modules.{mi}.chapters.{ci}.missions.{xi}"
                if len(set(mission.objective_codes)) != len(mission.objective_codes) or len(set(mission.prerequisite_slugs)) != len(mission.prerequisite_slugs):
                    errors.append({"path": path, "message": "Objectif ou prérequis cité deux fois"})
                for code in mission.objective_codes:
                    if code not in codes:
                        errors.append({"path": f"{path}.objective_codes", "message": f"Objectif inconnu : {code}"})
                for slug in mission.prerequisite_slugs:
                    if slug not in slugs or slug == mission.slug:
                        errors.append({"path": f"{path}.prerequisite_slugs", "message": f"Prérequis invalide : {slug}"})
                if mission.definition is not None:
                    candidate = {**mission.definition, "objective_ids": list(range(1, len(mission.objective_codes) + 1)),
                                 "prerequisite_mission_ids": []}
                    try:
                        MissionDefinition.model_validate(candidate)
                    except ValidationError as exc:
                        for item in exc.errors()[:10]:
                            errors.append({"path": f"{path}.definition.{_location(item['loc'])}".rstrip("."), "message": item["msg"]})
                    if any(key in mission.definition for key in ("objective_ids", "prerequisite_mission_ids")):
                        errors.append({"path": f"{path}.definition", "message": "Utiliser objective_codes et prerequisite_slugs"})
    return (document if not errors else None), errors


def summary(document: CourseDocument) -> dict:
    missions = [m for mod in document.modules for ch in mod.chapters for m in ch.missions]
    return {"title": document.course.title, "slug": document.course.slug, "objectives": len(document.objectives),
            "modules": len(document.modules), "chapters": sum(len(mod.chapters) for mod in document.modules),
            "missions": len(missions), "missions_without_definition": sum(1 for m in missions if m.definition is None)}


def export_tree(tree: dict, definitions: dict[int, dict], source: dict) -> dict:
    """Build a portable document from a course tree and private definitions by mission id."""
    objective_codes = {item["id"]: item["code"] for item in tree["objectives"]}
    slugs = {m["id"]: m["slug"] for mod in tree["modules"] for ch in mod["chapters"] for m in ch["missions"]}
    modules = []
    for module in tree["modules"]:
        chapters = []
        for chapter in module["chapters"]:
            missions = []
            for mission in chapter["missions"]:
                definition = definitions.get(mission["id"])
                body = None
                codes: list[str] = []
                prerequisites: list[str] = []
                if definition:
                    body = {k: v for k, v in definition.items() if k not in {"objective_ids", "prerequisite_mission_ids"}}
                    codes = [objective_codes[i] for i in definition.get("objective_ids", []) if i in objective_codes]
                    prerequisites = [slugs[i] for i in definition.get("prerequisite_mission_ids", []) if i in slugs]
                missions.append({"slug": mission["slug"], "title": mission["title"], "sort_order": mission["sort_order"],
                                 "objective_codes": codes, "prerequisite_slugs": prerequisites, "definition": body})
            chapters.append({"title": chapter["title"], "sort_order": chapter["sort_order"], "missions": missions})
        modules.append({"title": module["title"], "sort_order": module["sort_order"], "chapters": chapters})
    return {
        "format": FORMAT, "format_version": 1, "exported_at": datetime.now(timezone.utc).isoformat(), "source": source,
        "course": {"slug": tree["slug"], "title": tree["title"], "description": tree.get("description", "")},
        "objectives": [{"code": item["code"], "statement": item["statement"]} for item in tree["objectives"]],
        "modules": modules,
    }


def draft_document(db: Session, course: Course) -> dict:
    tree = course_tree(db, course, private=True)
    definitions = {m["id"]: m["definition"] for mod in tree["modules"] for ch in mod["chapters"] for m in ch["missions"] if m["definition"]}
    return export_tree(tree, definitions, {"kind": "draft", "course_id": course.id})


def release_document(db: Session, course: Course, release: CourseRelease) -> dict:
    """Rebuild the exact published content (private definitions) of a release."""
    snapshot = release.student_snapshot
    version_ids = {m["id"]: m.get("mission_version_id") for mod in snapshot.get("modules", []) for ch in mod.get("chapters", [])
                   for m in ch.get("missions", [])}
    versions = {v.id: v for v in db.scalars(select(MissionVersion).where(MissionVersion.id.in_([i for i in version_ids.values() if i])))}
    definitions = {mid: versions[vid].definition_private for mid, vid in version_ids.items() if vid in versions}
    tree = {**snapshot, "objectives": snapshot.get("objectives", [])}
    return export_tree(tree, definitions, {"kind": "release", "course_id": course.id, "release_id": release.id, "version": release.version})


def audit(db: Session, auth: AuthContext, action: str, course_id: int, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action=action, resource_type="course", resource_id=course_id, details=details))


@router.get("/course-search")
def search_courses(q: str = Query(default="", max_length=100), status: Literal["", "draft", "published", "archived"] = "",
                   sort: Literal["title", "recent"] = "recent", auth: AuthContext = Depends(require_teacher),
                   db: Session = Depends(get_db)) -> list[dict]:
    query = select(Course)
    if q.strip():
        pattern = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(Course.title).like(pattern), func.lower(Course.slug).like(pattern)))
    if status:
        query = query.where(Course.status == status)
    query = query.order_by(func.lower(Course.title)) if sort == "title" else query.order_by(Course.id.desc())
    courses = db.scalars(query.limit(200)).all()
    owners = {u.id: display_name(u.username) for u in db.scalars(select(User).where(User.id.in_({c.created_by for c in courses})))} if courses else {}
    return [{"id": c.id, "slug": c.slug, "title": c.title, "status": c.status, "owner": owners.get(c.created_by, "?"),
             "created_at": c.created_at.isoformat() if c.created_at else None} for c in courses]


@router.get("/courses/{course_id}/export")
def export_course(course_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    course = course_or_404(db, course_id)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Disposition"] = f'attachment; filename="{course.slug}-brouillon.json"'
    return draft_document(db, course)


@router.get("/releases/{release_id}/export")
def export_release(release_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    release = db.get(CourseRelease, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="release not found")
    course = course_or_404(db, release.course_id)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Disposition"] = f'attachment; filename="{course.slug}-v{release.version}.json"'
    return release_document(db, course, release)


@router.post("/courses/import")
def import_course(payload: ImportRequest, response: Response, dry_run: bool = Query(default=False),
                  auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    document, errors = validate_document(payload.document)
    if document is None:
        raise HTTPException(status_code=422, detail={"message": "invalid course document", "errors": errors})
    slug = payload.slug or document.course.slug
    title = plain(payload.title) if payload.title else document.course.title
    conflict = db.scalar(select(Course.id).where(Course.slug == slug)) is not None
    report = {**summary(document), "slug": slug, "title": title, "slug_available": not conflict}
    if dry_run:
        return {"dry_run": True, "valid": True, **report}
    if conflict:
        raise HTTPException(status_code=409, detail={"message": "slug already used", "slug": slug})
    course = Course(slug=slug, title=title, description=document.course.description, created_by=auth.user.id)
    db.add(course)
    db.flush()
    objective_ids: dict[str, int] = {}
    for item in document.objectives:
        objective = LearningObjective(course_id=course.id, code=item.code, statement=item.statement)
        db.add(objective)
        db.flush()
        objective_ids[item.code] = objective.id
    created: list[tuple[Mission, MissionDoc]] = []
    for module_doc in document.modules:
        module = CourseModule(course_id=course.id, title=module_doc.title, sort_order=module_doc.sort_order)
        db.add(module)
        db.flush()
        for chapter_doc in module_doc.chapters:
            chapter = Chapter(module_id=module.id, title=chapter_doc.title, sort_order=chapter_doc.sort_order)
            db.add(chapter)
            db.flush()
            for mission_doc in chapter_doc.missions:
                mission = Mission(chapter_id=chapter.id, slug=mission_doc.slug, title=mission_doc.title, sort_order=mission_doc.sort_order)
                db.add(mission)
                db.flush()
                created.append((mission, mission_doc))
    mission_ids = {doc.slug: mission.id for mission, doc in created}
    for mission, doc in created:
        if doc.definition is not None:
            body = {**doc.definition, "objective_ids": [objective_ids[c] for c in doc.objective_codes],
                    "prerequisite_mission_ids": [mission_ids[s] for s in doc.prerequisite_slugs]}
            mission.draft_definition = MissionDefinition.model_validate(body).model_dump()
    audit(db, auth, "course.import", course.id, {"source": document.source or {}, "missions": len(created)})
    db.commit()
    response.status_code = 201
    return {"dry_run": False, "id": course.id, **report, "slug_available": True}


@router.post("/courses/{course_id}/restore")
def restore_draft(course_id: int, payload: RestoreInput, auth: AuthContext = Depends(require_teacher_csrf),
                  db: Session = Depends(get_db)) -> dict:
    """Editorial rollback: put a published version's content back into the draft.

    Published releases are never modified. The current draft is saved in the audit
    log first, so the rollback itself can be undone by importing that saved draft.
    """
    course = editable_course(db, course_id)
    release = db.get(CourseRelease, payload.release_id)
    if release is None or release.course_id != course.id:
        raise HTTPException(status_code=404, detail="release not found")
    backup = draft_document(db, course)
    restored = 0
    for module in release.student_snapshot.get("modules", []):
        for chapter in module.get("chapters", []):
            for item in chapter.get("missions", []):
                mission = db.get(Mission, item["id"])
                version = db.get(MissionVersion, item.get("mission_version_id") or 0)
                if mission is None or version is None:
                    continue
                mission.title = item["title"]
                mission.draft_definition = dict(version.definition_private)
                restored += 1
    audit(db, auth, "course.restore", course.id, {"release_version": release.version, "missions": restored, "previous_draft": backup})
    db.commit()
    return {"restored_missions": restored, "release_version": release.version}


@router.get("/courses/{course_id}/history")
def course_history(course_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    course = course_or_404(db, course_id)
    module_ids = list(db.scalars(select(CourseModule.id).where(CourseModule.course_id == course.id)))
    chapter_ids = list(db.scalars(select(Chapter.id).where(Chapter.module_id.in_(module_ids)))) if module_ids else []
    mission_ids = list(db.scalars(select(Mission.id).where(Mission.chapter_id.in_(chapter_ids)))) if chapter_ids else []
    objective_ids = list(db.scalars(select(LearningObjective.id).where(LearningObjective.course_id == course.id)))
    release_ids = list(db.scalars(select(CourseRelease.id).where(CourseRelease.course_id == course.id)))
    clauses = [(AuditEvent.resource_type == "course") & (AuditEvent.resource_id == course.id)]
    for kind, ids in (("module", module_ids), ("chapter", chapter_ids), ("mission", mission_ids), ("objective", objective_ids), ("release", release_ids)):
        if ids:
            clauses.append((AuditEvent.resource_type == kind) & (AuditEvent.resource_id.in_(ids)))
    events = db.scalars(select(AuditEvent).where(or_(*clauses)).order_by(AuditEvent.id.desc()).limit(200)).all()
    actors = {u.id: display_name(u.username) for u in db.scalars(select(User).where(User.id.in_({e.actor_id for e in events})))} if events else {}
    return [{"id": e.id, "action": e.action, "resource_type": e.resource_type, "resource_id": e.resource_id,
             "actor": actors.get(e.actor_id, "?"), "created_at": e.created_at.isoformat() if e.created_at else None,
             "has_backup": bool((e.details or {}).get("previous_draft"))} for e in events]


@router.get("/history/{event_id}/backup")
def history_backup(event_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    event = db.get(AuditEvent, event_id)
    if event is None or not (event.details or {}).get("previous_draft"):
        raise HTTPException(status_code=404, detail="backup not found")
    response.headers["Content-Disposition"] = f'attachment; filename="sauvegarde-brouillon-{event.id}.json"'
    return event.details["previous_draft"]
