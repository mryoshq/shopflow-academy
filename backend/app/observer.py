"""Read-only observers (sprint 2, part J, ADR-0025).

An observer is an account created and disabled by a teacher (its owner). It sees the owner's
classes in read-only form: course preview (without answer keys unless the teacher allows it),
progress, results and their CSV, named or anonymised as the teacher chooses. Every consultation
is written to ``audit_events`` (action ``observer.view``) and listed for the owner. Observers
have no write route besides logging out; every other route answers 403 or 404.
"""

from __future__ import annotations

import csv
import re
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth import AuthContext, digest, password_hash, require_observer, require_teacher, require_teacher_csrf, utcnow
from app.classroom import readable_password
from app.database import get_db
from app.models import AuditEvent, LoginThrottle, MissionVersion, Observer, User, UserSession
from app.results import results_data
from app.teacher_dashboard import csv_cell, list_classes, overview, owned_class

router = APIRouter(prefix="/api/v1")
USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")


# Observer side --------------------------------------------------------------------------

def observer_scope(db: Session, auth: AuthContext) -> tuple[Observer, AuthContext]:
    """The observer's settings and its owner's identity, used to reuse the teacher's read-only queries."""
    row = db.get(Observer, auth.user.id)
    owner = db.get(User, row.owner_id) if row else None
    if row is None or owner is None or not owner.enabled or owner.role != "teacher":
        raise HTTPException(status_code=403, detail="forbidden")
    return row, AuthContext(user=owner, session=auth.session)


def consulted(db: Session, auth: AuthContext, view: str, assignment_id: int = 0, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action="observer.view", resource_type="assignment", resource_id=assignment_id,
                      details={"view": view, **(details or {})}))
    db.commit()


def pseudonyms(names: list[str], named: bool) -> dict[str, str]:
    """Real display names, or « Étudiant 1… N » in the class order (stable for one class)."""
    return {name: name if named else f"Étudiant {index}" for index, name in enumerate(names, start=1)}


@router.get("/observer/me", tags=["observer"])
def observer_me(response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    return {"owner": owner.user.username.split("@", 1)[0], "named": row.named, "show_answers": row.show_answers}


@router.get("/observer/classes", tags=["observer"])
def observer_classes(response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    _, owner = observer_scope(db, auth)
    classes = list_classes(owner, db)
    consulted(db, auth, "classes")
    return [{key: item[key] for key in ("id", "cohort", "course_title", "version", "paused", "student_count")} for item in classes]


@router.get("/observer/classes/{assignment_id}/course", tags=["observer"])
def observer_course(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer),
                    db: Session = Depends(get_db)) -> dict:
    """The published course as students see it; answer keys only if the teacher allowed them."""
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    _, release, cohort = owned_class(db, owner, assignment_id)
    snapshot = release.student_snapshot
    corrections: dict[str, dict] = {}
    if row.show_answers:
        ids = [m["mission_version_id"] for module in snapshot.get("modules", []) for chapter in module.get("chapters", [])
               for m in chapter.get("missions", []) if isinstance(m.get("mission_version_id"), int)]
        versions = db.scalars(select(MissionVersion).where(MissionVersion.id.in_(ids))).all() if ids else []
        private = {version.id: version.definition_private for version in versions}
        for module in snapshot.get("modules", []):
            for chapter in module.get("chapters", []):
                for mission in chapter.get("missions", []):
                    if mission.get("mission_version_id") in private:
                        corrections[str(mission["id"])] = private[mission["mission_version_id"]]
    consulted(db, auth, "course", assignment_id, {"answers": row.show_answers})
    return {"assignment_id": assignment_id, "cohort": cohort.label, "version": release.version, "title": snapshot.get("title", ""),
            "description": snapshot.get("description", ""), "modules": snapshot.get("modules", []),
            "show_answers": row.show_answers, "corrections": corrections}


@router.get("/observer/classes/{assignment_id}/progress", tags=["observer"])
def observer_progress(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer),
                      db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    data = overview(assignment_id, Response(), owner, db)
    names = pseudonyms([student["display_name"] for student in data["students"]], row.named)
    keep = ("completed", "total", "lessons_read", "lessons_total", "core_points", "core_possible", "bonus_points",
            "attempts", "hints", "current_mission", "last_activity", "active", "needs_help")
    students = [{"position": index, "display_name": names[student["display_name"]], **{key: student[key] for key in keep}}
                for index, student in enumerate(data["students"], start=1)]
    consulted(db, auth, "progress", assignment_id)
    return {"assignment_id": assignment_id, "cohort": data["cohort"], "course_title": data["course_title"], "version": data["version"],
            "paused": data["paused"], "generated_at": data["generated_at"], "named": row.named, "students": students}


def observer_results_data(db: Session, auth: AuthContext, assignment_id: int, threshold: float):
    row, owner = observer_scope(db, auth)
    data, missions, rows = results_data(db, owner, assignment_id, threshold)
    names = pseudonyms([student["display_name"] for student in data["students"]], row.named)
    for index, student in enumerate(data["students"], start=1):
        student["display_name"] = names[student.pop("display_name")]
        student.pop("id")
        student["position"] = index
    for index, line in enumerate(rows):
        line[0] = csv_cell(data["students"][index]["display_name"])
    data["named"] = row.named
    return data, missions, rows


@router.get("/observer/classes/{assignment_id}/results", tags=["observer"])
def observer_results(assignment_id: int, response: Response, threshold: float = Query(default=50, ge=0, le=100),
                     auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    data = observer_results_data(db, auth, assignment_id, threshold)[0]
    consulted(db, auth, "results", assignment_id, {"threshold": threshold})
    return data


@router.get("/observer/classes/{assignment_id}/results/export.csv", tags=["observer"])
def observer_results_csv(assignment_id: int, threshold: float = Query(default=50, ge=0, le=100),
                         auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> Response:
    data, missions, rows = observer_results_data(db, auth, assignment_id, threshold)
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["etudiant"] + [csv_cell(item["title"]) for item in missions]
                    + ["total_points", "total_possible", "bonus_points", "missions_reussies", "a_accompagner"])
    writer.writerows(rows)
    consulted(db, auth, "results.csv", assignment_id, {"threshold": threshold})
    filename = f"shopflow-resultats-observateur-classe-{assignment_id}-v{data['version']}.csv"
    return Response(content="﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


# Teacher side ---------------------------------------------------------------------------

class ObserverCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=64)
    show_answers: bool = False
    named: bool = False


class ObserverUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    show_answers: bool | None = None
    named: bool | None = None


def owned_observer(db: Session, auth: AuthContext, user_id: int) -> tuple[Observer, User]:
    row = db.get(Observer, user_id)
    user = db.get(User, user_id) if row else None
    if row is None or user is None or row.owner_id != auth.user.id:
        raise HTTPException(status_code=404, detail="observer not found")
    return row, user


def observer_out(row: Observer, user: User) -> dict:
    return {"id": user.id, "username": user.username, "enabled": user.enabled, "show_answers": row.show_answers, "named": row.named,
            "created_at": row.created_at.isoformat() if row.created_at else None}


def teacher_audit(db: Session, auth: AuthContext, action: str, user_id: int, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action=action, resource_type="observer", resource_id=user_id, details=details))


def revoke_sessions(db: Session, user: User) -> int:
    return db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
                      .values(revoked_at=utcnow())).rowcount


@router.get("/teacher/observers", tags=["teacher"])
def list_observers(response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    rows = db.execute(select(Observer, User).join(User, User.id == Observer.user_id)
                      .where(Observer.owner_id == auth.user.id).order_by(User.username)).all()
    return [observer_out(row, user) for row, user in rows]


@router.post("/teacher/observers", status_code=201, tags=["teacher"])
def create_observer(payload: ObserverCreate, response: Response, auth: AuthContext = Depends(require_teacher_csrf),
                    db: Session = Depends(get_db)) -> dict:
    """New observer account; its password is returned once and never stored in clear."""
    response.headers["Cache-Control"] = "no-store"
    username = payload.username.strip().casefold()
    if not USERNAME.fullmatch(username):
        raise HTTPException(status_code=422, detail="identifiant : 3 à 64 caractères, lettres minuscules, chiffres, . _ -")
    if db.scalar(select(User.id).where(User.username == username)) is not None:
        raise HTTPException(status_code=409, detail="identifiant déjà utilisé")
    password = readable_password()
    user = User(username=username, password_hash=password_hash.hash(password), role="observer")
    db.add(user)
    db.flush()
    row = Observer(user_id=user.id, owner_id=auth.user.id, show_answers=payload.show_answers, named=payload.named)
    db.add(row)
    teacher_audit(db, auth, "observer.create", user.id, {"show_answers": payload.show_answers, "named": payload.named})
    db.commit()
    return {**observer_out(row, user), "password": password}


@router.patch("/teacher/observers/{user_id}", tags=["teacher"])
def update_observer(user_id: int, payload: ObserverUpdate, response: Response, auth: AuthContext = Depends(require_teacher_csrf),
                    db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, user = owned_observer(db, auth, user_id)
    changes = payload.model_dump(exclude_none=True)
    if "enabled" in changes:
        user.enabled = changes["enabled"]
        if not user.enabled:
            revoke_sessions(db, user)
    if "show_answers" in changes:
        row.show_answers = changes["show_answers"]
    if "named" in changes:
        row.named = changes["named"]
    teacher_audit(db, auth, "observer.update", user.id, changes)
    db.commit()
    return observer_out(row, user)


@router.post("/teacher/observers/{user_id}/reset-password", tags=["teacher"])
def reset_observer_password(user_id: int, response: Response, auth: AuthContext = Depends(require_teacher_csrf),
                            db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, user = owned_observer(db, auth, user_id)
    password = readable_password()
    user.password_hash = password_hash.hash(password)
    revoked = revoke_sessions(db, user)
    throttle = db.get(LoginThrottle, digest(user.username))
    if throttle is not None:
        db.delete(throttle)
    teacher_audit(db, auth, "observer.password_reset", user.id, {"sessions_revoked": revoked})
    db.commit()
    return {"id": user.id, "username": user.username, "password": password, "sessions_revoked": revoked}


@router.get("/teacher/observers/views", tags=["teacher"])
def observer_views(response: Response, limit: int = Query(default=200, ge=1, le=1000), auth: AuthContext = Depends(require_teacher),
                   db: Session = Depends(get_db)) -> list[dict]:
    """Every consultation by this teacher's observers, newest first."""
    response.headers["Cache-Control"] = "no-store"
    rows = db.execute(select(AuditEvent, User).join(User, User.id == AuditEvent.actor_id).join(Observer, Observer.user_id == User.id)
                      .where(Observer.owner_id == auth.user.id, AuditEvent.action == "observer.view")
                      .order_by(AuditEvent.id.desc()).limit(limit)).all()
    return [{"id": event.id, "observer": user.username, "view": (event.details or {}).get("view", ""),
             "assignment_id": event.resource_id or None, "details": {k: v for k, v in (event.details or {}).items() if k != "view"},
             "created_at": event.created_at.isoformat() if event.created_at else None} for event, user in rows]
