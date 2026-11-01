"""Professional observer space (ADR-0025, ADR-0042).

An observer is invited by a teacher (its owner) and reads the owner's classes, never writes. Two types:

* « admin » (Administration): real names, dashboard, charts, grades (course and project), a student's file,
  published course, project, CSV export and printable PDF report; answer keys only if the teacher allows them;
* « guest » (Invité): anonymised (« Étudiant N », stable for the account), dashboard, aggregated charts and the
  published course; no individual grade, no export, no answer key.

The rights are stored per account and checked on every route. Invitations are single-use links valid 7 days;
only the SHA-256 of the token is stored; the observer chooses a password. Every consultation is written to
``audit_events`` (``observer.view``) and listed for the owner. Never shown: the text of help requests, live
presence, notifications, login data.
"""

from __future__ import annotations

import copy
import csv
import hashlib
import secrets
from datetime import timedelta
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import mailer
from app.auth import AuthContext, aware, digest, display_name, password_hash, require_observer, require_teacher, require_teacher_csrf, utcnow
from app.config import get_settings
from app.curriculum_schema import MissionDefinition
from app.database import get_db
from app.models import AuditEvent, LoginThrottle, MissionVersion, Observer, ObserverAlias, ObserverInvitation, User, UserSession
from app.final_grade import config_of
from app.observer_stats import ClassData, charts, dashboard, grade_rows, student_file
from app.teacher_dashboard import csv_cell, csv_number, list_classes, owned_class

router = APIRouter(prefix="/api/v1")
INVITATION_DAYS = 7
KINDS = ("admin", "guest")
PASSWORD_MIN, PASSWORD_MAX = 12, 128
KIND_LABEL = {"admin": "Administration", "guest": "Invité"}
KIND_SCOPE = {
    "admin": "noms réels, tableau de bord, graphiques, notes du cours et du projet, fiches des étudiants, cours publié, projet, export CSV et rapport PDF",
    "guest": "données anonymisées : tableau de bord, graphiques d'ensemble et cours publié, sans note individuelle ni export",
}


# Rights ---------------------------------------------------------------------------------------

def rights(row: Observer) -> dict:
    admin = row.kind == "admin"
    return {"named": admin, "grades": admin, "export": admin, "project": admin, "student_file": admin, "answers": admin and row.show_answers}


def observer_scope(db: Session, auth: AuthContext) -> tuple[Observer, AuthContext]:
    """The observer's settings and its owner's identity, used to reuse the teacher's read-only queries."""
    row = db.get(Observer, auth.user.id)
    owner = db.get(User, row.owner_id) if row else None
    if row is None or owner is None or not owner.enabled or owner.role != "teacher":
        raise HTTPException(status_code=403, detail="forbidden")
    return row, AuthContext(user=owner, session=auth.session)


def require_admin(row: Observer) -> None:
    if row.kind != "admin":
        raise HTTPException(status_code=403, detail="réservé aux comptes Administration")


def consulted(db: Session, auth: AuthContext, view: str, assignment_id: int = 0, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action="observer.view", resource_type="assignment", resource_id=assignment_id,
                      details={"view": view, **(details or {})}))
    db.commit()


def aliases(db: Session, observer_id: int, students: list[User]) -> dict[int, str]:
    """« Étudiant N » given once per (observer, student) in the class order, then never renumbered."""
    known = {row.student_id: row.number for row in db.scalars(select(ObserverAlias).where(ObserverAlias.observer_id == observer_id))}
    following = max(known.values(), default=0)
    for student in students:
        if student.id not in known:
            following += 1
            known[student.id] = following
            db.add(ObserverAlias(observer_id=observer_id, student_id=student.id, number=following))
    db.flush()
    return {student.id: f"Étudiant {known[student.id]}" for student in students}


def names_for(db: Session, row: Observer, students: list[User]) -> dict[int, str]:
    if rights(row)["named"]:
        return {s.id: display_name(s.username) for s in students}
    return aliases(db, row.user_id, students)


def pseudonyms(names: list[str], named: bool) -> dict[str, str]:
    """Kept for the project view of older callers: real names, or « Étudiant 1… N » in the given order."""
    return {name: name if named else f"Étudiant {index}" for index, name in enumerate(names, start=1)}


# Observer side --------------------------------------------------------------------------

@router.get("/observer/me", tags=["observer"])
def observer_me(response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    granted = rights(row)
    return {"owner": display_name(owner.user.username), "full_name": row.full_name, "kind": row.kind, "rights": granted,
            # Former fields (ADR-0025), kept for compatibility.
            "named": granted["named"], "show_answers": granted["answers"], "project_access": granted["project"]}


@router.get("/observer/classes", tags=["observer"])
def observer_classes(response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    _, owner = observer_scope(db, auth)
    classes = list_classes(owner, db)
    consulted(db, auth, "classes")
    return [{key: item[key] for key in ("id", "cohort", "course_title", "version", "paused", "student_count")} for item in classes]


@router.get("/observer/classes/{assignment_id}/dashboard", tags=["observer"])
def observer_dashboard(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    data = ClassData(db, owner, assignment_id)
    names = names_for(db, row, data.students)
    students = [{"name": names[s.id], "completed": data.summary(s.id)["completed"], "total": data.summary(s.id)["total"]}
                for s in data.students]
    if not rights(row)["named"]:
        students.sort(key=lambda item: int(item["name"].rsplit(" ", 1)[-1]))
    consulted(db, auth, "dashboard", assignment_id)
    return {**dashboard(db, data), "progress": students, "named": rights(row)["named"]}


@router.get("/observer/classes/{assignment_id}/charts", tags=["observer"])
def observer_charts(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, owner = observer_scope(db, auth)
    data = ClassData(db, owner, assignment_id)
    consulted(db, auth, "charts", assignment_id)
    return charts(db, data)


@router.get("/observer/classes/{assignment_id}/course", tags=["observer"])
def observer_course(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer),
                    db: Session = Depends(get_db)) -> dict:
    """The published course as students see it (without answering); answer keys only for Administration, if allowed."""
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    answers = rights(row)["answers"]
    _, release, cohort = owned_class(db, owner, assignment_id)
    snapshot = copy.deepcopy(release.student_snapshot)
    missions = [m for module in snapshot.get("modules", []) for chapter in module.get("chapters", [])
                for m in chapter.get("missions", []) if isinstance(m.get("mission_version_id"), int)]
    ids = [m["mission_version_id"] for m in missions]
    versions = db.scalars(select(MissionVersion).where(MissionVersion.id.in_(ids))).all() if ids else []
    private = {version.id: version.definition_private for version in versions}
    corrections: dict[str, dict] = {}
    for mission in missions:
        definition = private.get(mission["mission_version_id"])
        if definition is None:
            continue
        # Same view as the teacher's preview (student view plus hints), never an answer key.
        mission["definition"] = MissionDefinition.model_validate(definition).preview_projection()
        if answers:
            corrections[str(mission["id"])] = definition
    consulted(db, auth, "course", assignment_id, {"answers": answers})
    return {"assignment_id": assignment_id, "cohort": cohort.label, "version": release.version, "title": snapshot.get("title", ""),
            "description": snapshot.get("description", ""), "modules": snapshot.get("modules", []),
            "show_answers": answers, "corrections": corrections}


@router.get("/observer/classes/{assignment_id}/grades", tags=["observer"])
def observer_grades(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    require_admin(row)
    data = ClassData(db, owner, assignment_id)
    consulted(db, auth, "grades", assignment_id)
    return {"cohort": data.cohort.label, "course_title": data.release.student_snapshot.get("title", ""), "version": data.release.version,
            "generated_at": utcnow().isoformat(), "students": grade_rows(db, data),
            "grading": config_of(db, data.assignment.id)}  # ADR-0046: weights shown beside the final grade


@router.get("/observer/classes/{assignment_id}/grades.csv", tags=["observer"])
def observer_grades_csv(assignment_id: int, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> Response:
    row, owner = observer_scope(db, auth)
    require_admin(row)
    data = ClassData(db, owner, assignment_id)
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["etudiant", "points_cours", "points_possibles", "pourcentage", "missions_reussies", "missions", "points_bonus",
                     "lecons_lues", "lecons", "projet_sur_20", "note_finale_20", "provisoire"])
    for item in grade_rows(db, data):
        writer.writerow([csv_cell(item["name"]), csv_number(item["core_points"]), item["core_possible"], csv_number(item["percent"]),
                         item["completed"], item["total"], csv_number(item["bonus_points"]), item["lessons_read"], item["lessons_total"],
                         "" if item["project_total"] is None else csv_number(item["project_total"]),
                         "" if item["final_grade"]["final"] is None else csv_number(item["final_grade"]["final"]),
                         "oui" if item["final_grade"]["provisional"] else "non"])
    consulted(db, auth, "grades.csv", assignment_id)
    filename = f"rapidfox-notes-classe-{assignment_id}-v{data.release.version}-{utcnow():%Y-%m-%d}.csv"
    return Response(content="﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/observer/classes/{assignment_id}/students/{student_id}", tags=["observer"])
def observer_student(assignment_id: int, student_id: int, response: Response, auth: AuthContext = Depends(require_observer),
                     db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    require_admin(row)
    data = ClassData(db, owner, assignment_id)
    student = next((s for s in data.students if s.id == student_id), None)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")
    consulted(db, auth, "student", assignment_id, {"student": student_id})
    return student_file(db, data, student)


@router.get("/observer/classes/{assignment_id}/report.pdf", tags=["observer"])
def observer_report(assignment_id: int, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> Response:
    from app.pdf_report import Report

    row, owner = observer_scope(db, auth)
    require_admin(row)
    data = ClassData(db, owner, assignment_id)
    summary = dashboard(db, data)
    figures = charts(db, data)
    now = utcnow()
    title = f"Rapport de classe — {data.cohort.label}"
    report = Report(title, f"Rapidfox Academy · rapport généré le {now:%d/%m/%Y à %H:%M} (UTC) · lecture seule")
    report.write("Rapidfox Academy", 9, True)
    report.write(title, 17, True, gap=24)
    report.write(f"{summary['course_title']} · version {summary['version']} · généré le {now:%d/%m/%Y à %H:%M} (UTC)", 9.5)
    report.rule()
    report.write("Indicateurs", 12, True)
    for label, value in [
        ("Étudiants", summary["students"]),
        ("Progression moyenne", "—" if summary["mean_progress"] is None else f"{summary['mean_progress']} %"),
        ("Taux de réussite des essais", "—" if summary["success_rate"] is None else f"{summary['success_rate']} %"),
        ("Points bonus (étudiants concernés)", f"{summary['bonus_points']} ({summary['bonus_students']})"),
        ("Temps de travail estimé (moyenne)", f"{summary['work_minutes_mean']} min"),
        ("Blocs ouverts", f"{summary['blocks_open']} sur {summary['blocks_total']}"),
    ]:
        report.write(f"{label} : {value}", 10)
    report.rule()
    report.write("Notes", 12, True)
    report.table(["Étudiant", "Cours", "%", "Missions", "Bonus", "Projet /20", "Note /20"],
                 [[item["name"], f"{item['core_points']} / {item['core_possible']}", f"{item['percent']} %",
                   f"{item['completed']} / {item['total']}", str(item["bonus_points"]),
                   "—" if item["project_total"] is None else str(item["project_total"]),
                   "—" if item["final_grade"]["final"] is None
                   else f"{item['final_grade']['final']}{' (prov.)' if item['final_grade']['provisional'] else ''}"] for item in grade_rows(db, data)],
                 [140, 80, 45, 62, 45, 58, 70])
    report.rule()
    report.write("Réussite par module", 12, True)
    for item in figures["modules"]:
        report.write(f"{item['label']} : {item['percent']} %", 10)
    report.write("Répartition des notes du cours (nombre d'étudiants, sans nom)", 12, True)
    report.write(" · ".join(f"{item['label']} : {item['count']}" for item in figures["grades"]), 9)
    consulted(db, auth, "report.pdf", assignment_id)
    filename = f"rapidfox-rapport-classe-{assignment_id}-{now:%Y-%m-%d}.pdf"
    return Response(content=report.bytes(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


# Teacher side ---------------------------------------------------------------------------

class ObserverCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    kind: str = Field(pattern=r"^(admin|guest)$")
    show_answers: bool = False


class ObserverUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    kind: str | None = Field(default=None, pattern=r"^(admin|guest)$")
    show_answers: bool | None = None


class MailTest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to: EmailStr


def owned_observer(db: Session, auth: AuthContext, user_id: int) -> tuple[Observer, User]:
    row = db.get(Observer, user_id)
    user = db.get(User, user_id) if row else None
    if row is None or user is None or row.owner_id != auth.user.id:
        raise HTTPException(status_code=404, detail="observer not found")
    return row, user


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def status_of(db: Session, row: Observer, user: User) -> tuple[str, str | None]:
    """« disabled », « active » (password chosen, or an account from before invitations), « pending » or « expired »."""
    if not user.enabled:
        return "disabled", None
    invitations = db.scalars(select(ObserverInvitation).where(ObserverInvitation.observer_id == user.id).order_by(ObserverInvitation.id.desc())).all()
    if not invitations or any(item.used_at for item in invitations):
        return "active", None
    latest = invitations[0]
    if latest.revoked_at is None and aware(latest.expires_at) > utcnow():
        return "pending", aware(latest.expires_at).isoformat()
    return "expired", aware(latest.expires_at).isoformat()


def observer_out(db: Session, row: Observer, user: User) -> dict:
    status, expires = status_of(db, row, user)
    return {"id": user.id, "full_name": row.full_name, "email": row.email, "username": user.username, "kind": row.kind,
            "show_answers": row.show_answers and row.kind == "admin", "enabled": user.enabled, "status": status, "invitation_expires_at": expires,
            "created_at": row.created_at.isoformat() if row.created_at else None}


def teacher_audit(db: Session, auth: AuthContext, action: str, user_id: int, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action=action, resource_type="observer", resource_id=user_id, details=details))


def revoke_sessions(db: Session, user: User) -> int:
    return db.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
                      .values(revoked_at=utcnow())).rowcount


def revoke_invitations(db: Session, user_id: int) -> int:
    return db.execute(update(ObserverInvitation).where(ObserverInvitation.observer_id == user_id, ObserverInvitation.used_at.is_(None),
                                                       ObserverInvitation.revoked_at.is_(None)).values(revoked_at=utcnow())).rowcount


def invitation_text(teacher: User, row: Observer, email: str, link: str, expires) -> tuple[str, str]:
    subject = "Invitation à l'espace observateur — Rapidfox Academy"
    body = f"""Bonjour {row.full_name},

{display_name(teacher.username)} vous invite à suivre, en lecture seule, ses classes sur Rapidfox Academy (module Python Data Engineering & SQL Avancé).

Type d'accès : {KIND_LABEL[row.kind]} ({KIND_SCOPE[row.kind]}).

Pour activer votre compte, choisissez votre mot de passe en ouvrant ce lien personnel :
{link}

Ce lien est à usage unique et reste valable jusqu'au {expires:%d/%m/%Y à %H:%M} (UTC), soit 7 jours. Votre identifiant de connexion sera votre adresse e-mail : {email}.

Chaque consultation est enregistrée et visible par l'enseignant. Si vous n'attendiez pas ce message, vous pouvez l'ignorer : sans activation, aucun compte n'est utilisable.

Cordialement,
L'équipe Rapidfox Academy
"""
    return subject, body


def invite(db: Session, auth: AuthContext, row: Observer, user: User) -> dict:
    """A new single-use link (the previous ones are revoked); sent by e-mail when SMTP is configured."""
    revoke_invitations(db, user.id)
    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(days=INVITATION_DAYS)
    invitation = ObserverInvitation(observer_id=user.id, token_hash=token_digest(token), expires_at=expires, created_by=auth.user.id)
    db.add(invitation)
    link = f"{get_settings().app_base_url.rstrip('/')}/#/invitation/{token}"
    subject, body = invitation_text(auth.user, row, row.email or user.username, link, expires)
    delivery, error = "manual", None
    if mailer.configured():
        try:
            mailer.send(row.email or user.username, subject, body)
            delivery = "smtp"
        except mailer.MailError as exc:
            error = f"{exc} Utilisez « Copier le lien » ou « Préparer l'e-mail »."
    invitation.delivery = delivery
    teacher_audit(db, auth, "observer.invite", user.id, {"delivery": delivery, "expires_at": expires.isoformat()})
    db.commit()
    return {"link": link, "expires_at": expires.isoformat(), "delivery": delivery, "error": error,
            "mail": {"to": row.email or user.username, "subject": subject, "body": body}}


@router.get("/teacher/observers", tags=["teacher"])
def list_observers(response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    rows = db.execute(select(Observer, User).join(User, User.id == Observer.user_id)
                      .where(Observer.owner_id == auth.user.id).order_by(Observer.full_name, User.username)).all()
    return [observer_out(db, row, user) for row, user in rows]


@router.get("/teacher/observers/mail", tags=["teacher"])
def mail_status(response: Response, auth: AuthContext = Depends(require_teacher)) -> dict:
    """Only whether sending is configured; never the configuration itself."""
    response.headers["Cache-Control"] = "no-store"
    return {"configured": mailer.configured()}


@router.post("/teacher/observers/mail-test", tags=["teacher"])
def mail_test(payload: MailTest, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    if not mailer.configured():
        raise HTTPException(status_code=409, detail="L'envoi d'e-mails n'est pas configuré sur le serveur : les invitations se font par lien copié ou e-mail préparé.")
    try:
        mailer.send(str(payload.to), "E-mail de test — Rapidfox Academy",
                    "Bonjour,\n\nCet e-mail de test confirme que Rapidfox Academy peut envoyer les invitations des observateurs.\n\nL'équipe Rapidfox Academy\n")
    except mailer.MailError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    db.add(AuditEvent(actor_id=auth.user.id, action="observer.mail_test", resource_type="observer", resource_id=0, details={}))
    db.commit()
    return {"sent": True}


@router.post("/teacher/observers", status_code=201, tags=["teacher"])
def create_observer(payload: ObserverCreate, response: Response, auth: AuthContext = Depends(require_teacher_csrf),
                    db: Session = Depends(get_db)) -> dict:
    """New observer and its invitation; the account cannot sign in until the observer chooses a password."""
    response.headers["Cache-Control"] = "no-store"
    email = str(payload.email).strip().casefold()
    if db.scalar(select(User.id).where(func.lower(User.username) == email)) is not None:
        raise HTTPException(status_code=409, detail="cette adresse e-mail a déjà un compte")
    user = User(username=email, password_hash=password_hash.hash(secrets.token_urlsafe(32)), role="observer")
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="cette adresse e-mail a déjà un compte") from exc
    row = Observer(user_id=user.id, owner_id=auth.user.id, kind=payload.kind, full_name=payload.full_name.strip(), email=email,
                   show_answers=payload.show_answers and payload.kind == "admin", named=payload.kind == "admin", project_access=payload.kind == "admin")
    db.add(row)
    teacher_audit(db, auth, "observer.create", user.id, {"kind": payload.kind, "show_answers": row.show_answers})
    invitation = invite(db, auth, row, user)
    return {"observer": observer_out(db, row, user), "invitation": invitation}


@router.post("/teacher/observers/{user_id}/invitation", tags=["teacher"])
def resend_invitation(user_id: int, response: Response, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    row, user = owned_observer(db, auth, user_id)
    if not user.enabled:
        raise HTTPException(status_code=409, detail="réactivez d'abord le compte")
    invitation = invite(db, auth, row, user)
    return {"observer": observer_out(db, row, user), "invitation": invitation}


@router.delete("/teacher/observers/{user_id}/invitation", tags=["teacher"])
def revoke_invitation(user_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    row, user = owned_observer(db, auth, user_id)
    revoked = revoke_invitations(db, user.id)
    teacher_audit(db, auth, "observer.invitation_revoke", user.id, {"revoked": revoked})
    db.commit()
    return observer_out(db, row, user)


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
            revoke_invitations(db, user.id)
    if "kind" in changes:
        row.kind = changes["kind"]
        row.named = row.project_access = row.kind == "admin"
        revoke_sessions(db, user)  # the new rights apply at the next sign-in
    if "show_answers" in changes:
        row.show_answers = changes["show_answers"]
    if row.kind != "admin":
        row.show_answers = False  # a guest never sees answer keys
    teacher_audit(db, auth, "observer.update", user.id, changes)
    db.commit()
    return observer_out(db, row, user)


@router.get("/teacher/observers/views", tags=["teacher"])
def observer_views(response: Response, limit: int = 200, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    """Every consultation by this teacher's observers (who, what, when), newest first."""
    response.headers["Cache-Control"] = "no-store"
    limit = max(1, min(limit, 1000))
    rows = db.execute(select(AuditEvent, User, Observer).join(User, User.id == AuditEvent.actor_id).join(Observer, Observer.user_id == User.id)
                      .where(Observer.owner_id == auth.user.id, AuditEvent.action == "observer.view")
                      .order_by(AuditEvent.id.desc()).limit(limit)).all()
    return [{"id": event.id, "observer": observer.full_name or user.username, "email": observer.email or user.username, "kind": observer.kind,
             "view": (event.details or {}).get("view", ""), "assignment_id": event.resource_id or None,
             "details": {k: v for k, v in (event.details or {}).items() if k != "view"},
             "created_at": event.created_at.isoformat() if event.created_at else None} for event, user, observer in rows]


# Invitation (no account yet) --------------------------------------------------------------

class Activation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)


def pending_invitation(db: Session, token: str) -> tuple[ObserverInvitation, Observer, User]:
    invitation = db.scalar(select(ObserverInvitation).where(ObserverInvitation.token_hash == token_digest(token))) if 20 <= len(token) <= 100 else None
    row = db.get(Observer, invitation.observer_id) if invitation else None
    user = db.get(User, invitation.observer_id) if invitation else None
    if invitation is None or row is None or user is None or invitation.revoked_at is not None or not user.enabled:
        raise HTTPException(status_code=404, detail="Ce lien d'invitation n'est pas valide. Demandez-en un nouveau à l'enseignant.")
    if invitation.used_at is not None:
        raise HTTPException(status_code=410, detail="Ce lien a déjà été utilisé : connectez-vous avec votre adresse e-mail.")
    if aware(invitation.expires_at) <= utcnow():
        raise HTTPException(status_code=410, detail="Ce lien a expiré. Demandez-en un nouveau à l'enseignant.")
    return invitation, row, user


def password_problem(password: str, email: str) -> str | None:
    """Same rule as every chosen password: 12 to 128 characters, not built on the address, not one repeated character."""
    if len(password) < PASSWORD_MIN:
        return f"Le mot de passe doit contenir au moins {PASSWORD_MIN} caractères."
    local = email.split("@", 1)[0].casefold()
    if len(local) >= 3 and local in password.casefold():
        return "Le mot de passe ne doit pas reprendre votre adresse e-mail."
    if len(set(password)) < 4:
        return "Le mot de passe est trop simple : variez les caractères."
    return None


@router.get("/invitations/{token}", tags=["public"])
def read_invitation(token: str, response: Response, db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    invitation, row, user = pending_invitation(db, token)
    return {"full_name": row.full_name, "email": row.email or user.username, "kind": row.kind, "kind_label": KIND_LABEL[row.kind],
            "expires_at": aware(invitation.expires_at).isoformat(), "password_min": PASSWORD_MIN}


@router.post("/invitations/{token}/accept", tags=["public"])
def accept_invitation(token: str, payload: Activation, response: Response, db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    invitation, row, user = pending_invitation(db, token)
    problem = password_problem(payload.password, row.email or user.username)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    now = utcnow()
    # Single use, even with two requests at once: only the one that marks it used goes on.
    marked = db.execute(update(ObserverInvitation).where(ObserverInvitation.id == invitation.id, ObserverInvitation.used_at.is_(None))
                        .values(used_at=now)).rowcount
    if not marked:
        db.rollback()
        raise HTTPException(status_code=410, detail="Ce lien a déjà été utilisé : connectez-vous avec votre adresse e-mail.")
    user.password_hash = password_hash.hash(payload.password)
    revoke_sessions(db, user)
    revoke_invitations(db, user.id)
    throttle = db.get(LoginThrottle, digest(user.username))
    if throttle is not None:
        db.delete(throttle)
    db.add(AuditEvent(actor_id=user.id, action="observer.activate", resource_type="observer", resource_id=user.id, details={}))
    db.commit()
    return {"activated": True, "username": user.username}
