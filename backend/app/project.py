"""Project space CampusEquip (ADR-0034): teams of two students (three after a surprise draw, ADR-0041), milestones, versioned
submissions (text with tables, HTTPS link, files stored on disk), teacher comments, a project
grade on 20 apart from the course grade, defence slots.

Rights: a team sees only its own work; the teacher of the class sees and corrects everything;
an observer sees nothing unless the teacher allows it (read-only overview). Every write is audited.
"""

from __future__ import annotations

import csv
import hashlib
import re
from datetime import datetime
from io import StringIO
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.auth import (AuthContext, aware, display_name, require_observer, require_student, require_student_csrf, require_teacher,
                      require_teacher_csrf, utcnow)
from app.config import get_settings
from app.database import get_db
from app.models import (Assignment, AuditEvent, Cohort, Course, CourseRelease, Enrollment, Observer, ProjectComment, ProjectDrawEntry, ProjectFile,
                        ProjectGrade, ProjectInvitation, ProjectMember, ProjectMilestone, ProjectSlot, ProjectSubmission, ProjectTeam, User)
from app.teacher_dashboard import class_students, csv_cell, csv_number, owned_class

router = APIRouter(prefix="/api/v1", tags=["project"])
MAX_FILE = 20 * 1024 * 1024
MAX_TEXT = 50_000
TEAM_SIZE = 2
FILE_TYPES = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "md": "text/markdown; charset=utf-8", "zip": "application/zip"}
GRID = {"sql": 4, "python": 4, "nosql": 3, "airflow": 3, "reproducibility": 2}
INDIVIDUAL_MAX = 4


# Helpers -------------------------------------------------------------------------------------

def audit(db: Session, auth: AuthContext, action: str, cohort_id: int, details: dict | None = None) -> None:
    db.add(AuditEvent(actor_id=auth.user.id, action=action, resource_type="project", resource_id=cohort_id, details=details))


def iso(value: datetime | None) -> str | None:
    return aware(value).isoformat() if value else None


def names(db: Session, user_ids: list[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    return {user.id: display_name(user.username) for user in db.scalars(select(User).where(User.id.in_(user_ids)))}


def student_cohorts(db: Session, user_id: int) -> list[Cohort]:
    """Classes of the student that have a course (an assignment)."""
    return list(db.scalars(select(Cohort).join(Enrollment, Enrollment.cohort_id == Cohort.id)
                           .join(Assignment, Assignment.cohort_id == Cohort.id)
                           .where(Enrollment.user_id == user_id).distinct().order_by(Cohort.id)).all())


def drop_draw_entry(db: Session, cohort_id: int, user_id: int) -> None:
    """ADR-0041: joining a team takes the student out of the surprise draw."""
    db.execute(delete(ProjectDrawEntry).where(ProjectDrawEntry.cohort_id == cohort_id, ProjectDrawEntry.user_id == user_id))


def membership(db: Session, cohort_id: int, user_id: int) -> ProjectMember | None:
    return db.scalar(select(ProjectMember).where(ProjectMember.cohort_id == cohort_id, ProjectMember.user_id == user_id))


def team_members(db: Session, team_id: int) -> list[int]:
    return list(db.scalars(select(ProjectMember.user_id).where(ProjectMember.team_id == team_id).order_by(ProjectMember.id)).all())


def my_team(db: Session, auth: AuthContext, cohort_id: int | None = None) -> tuple[ProjectTeam, int]:
    """The caller's team (404 when none) and its class."""
    cohorts = [cohort_id] if cohort_id else [c.id for c in student_cohorts(db, auth.user.id)]
    for cid in cohorts:
        member = membership(db, cid, auth.user.id)
        if member:
            return db.get(ProjectTeam, member.team_id), cid
    raise HTTPException(status_code=404, detail="no team")


def teacher_cohort(db: Session, auth: AuthContext, cohort_id: int) -> None:
    """404 unless one of the teacher's own courses is given to this class."""
    owned = db.scalar(select(Assignment.id).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                      .join(Course, Course.id == CourseRelease.course_id)
                      .where(Assignment.cohort_id == cohort_id, Course.created_by == auth.user.id).limit(1))
    if owned is None:
        raise HTTPException(status_code=404, detail="class not found")


def owned_team(db: Session, auth: AuthContext, team_id: int) -> ProjectTeam:
    team = db.get(ProjectTeam, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="team not found")
    teacher_cohort(db, auth, team.cohort_id)
    return team


def files_out(db: Session, ids: list[int]) -> list[dict]:
    if not ids:
        return []
    rows = {row.id: row for row in db.scalars(select(ProjectFile).where(ProjectFile.id.in_(ids)))}
    return [{"id": row.id, "name": row.name, "size": row.size} for fid in ids if (row := rows.get(fid))]


def submission_out(db: Session, item: ProjectSubmission, who: dict[int, str]) -> dict:
    return {"id": item.id, "milestone_id": item.milestone_id, "version": item.version, "text": item.text, "link": item.link,
            "files": files_out(db, list(item.file_ids or [])), "late": item.late, "submitted_by": who.get(item.submitted_by, ""),
            "created_at": iso(item.created_at)}


def milestone_out(item: ProjectMilestone) -> dict:
    return {"id": item.id, "title": item.title, "instructions": item.instructions, "due_at": iso(item.due_at),
            "deliverables": list(item.deliverables or []), "sort_order": item.sort_order}


def milestones_of(db: Session, cohort_id: int) -> list[ProjectMilestone]:
    return list(db.scalars(select(ProjectMilestone).where(ProjectMilestone.cohort_id == cohort_id)
                           .order_by(ProjectMilestone.sort_order, ProjectMilestone.id)).all())


def slots_out(db: Session, cohort_id: int, teams: dict[int, list[str]], mine: int | None = None) -> list[dict]:
    rows = db.scalars(select(ProjectSlot).where(ProjectSlot.cohort_id == cohort_id).order_by(ProjectSlot.starts_at, ProjectSlot.id)).all()
    return [{"id": row.id, "starts_at": iso(row.starts_at), "ends_at": iso(row.ends_at), "label": row.label, "team_id": row.team_id,
             "team": teams.get(row.team_id, []) if row.team_id else [], "mine": mine is not None and row.team_id == mine} for row in rows]


def all_teams(db: Session, cohort_id: int) -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    for member in db.scalars(select(ProjectMember).where(ProjectMember.cohort_id == cohort_id).order_by(ProjectMember.id)):
        result.setdefault(member.team_id, []).append(member.user_id)
    for team in db.scalars(select(ProjectTeam.id).where(ProjectTeam.cohort_id == cohort_id)):
        result.setdefault(team, [])
    return result


def total(grade: ProjectGrade | None, user_id: int) -> dict:
    if grade is None:
        return {"common": None, "individual": None, "total": None}
    parts = [grade.sql, grade.python, grade.nosql, grade.airflow, grade.reproducibility]
    common = round(sum(part for part in parts if part is not None), 2) if any(part is not None for part in parts) else None
    individual = (grade.individual or {}).get(str(user_id))
    return {"common": common, "individual": individual,
            "total": round((common or 0) + (individual or 0), 2) if common is not None or individual is not None else None}


# Student -------------------------------------------------------------------------------------

@router.get("/student/project")
def student_project(response: Response, cohort_id: int | None = Query(default=None), auth: AuthContext = Depends(require_student),
                    db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    cohorts = student_cohorts(db, auth.user.id)
    cohort = next((c for c in cohorts if cohort_id is None or c.id == cohort_id), None)
    if cohort is None:
        return {"cohort_id": None, "cohorts": []}
    teams = all_teams(db, cohort.id)
    member = membership(db, cohort.id, auth.user.id)
    students = class_students(db, cohort.id)
    who = {student.id: display_name(student.username) for student in students}
    in_team = {uid for members in teams.values() for uid in members}
    team = None
    milestones = []
    if member:
        members = teams.get(member.team_id, [])
        pending = db.scalars(select(ProjectInvitation).where(ProjectInvitation.team_id == member.team_id, ProjectInvitation.status == "pending")).all()
        team = {"id": member.team_id, "members": [{"id": uid, "name": who.get(uid, "")} for uid in members],
                "invitations": [{"id": item.id, "user_id": item.user_id, "name": who.get(item.user_id, "")} for item in pending],
                "full": len(members) >= TEAM_SIZE}
    for item in milestones_of(db, cohort.id):
        entry = milestone_out(item)
        if member:
            versions = db.scalars(select(ProjectSubmission).where(ProjectSubmission.team_id == member.team_id, ProjectSubmission.milestone_id == item.id)
                                  .order_by(ProjectSubmission.version.desc())).all()
            comments = db.scalars(select(ProjectComment).where(ProjectComment.team_id == member.team_id, ProjectComment.milestone_id == item.id)
                                  .order_by(ProjectComment.id)).all()
            entry["submissions"] = [submission_out(db, version, who) for version in versions]
            entry["comments"] = [{"id": c.id, "text": c.text, "created_at": iso(c.created_at)} for c in comments]
        milestones.append(entry)
    received = db.scalars(select(ProjectInvitation).where(ProjectInvitation.user_id == auth.user.id, ProjectInvitation.status == "pending")
                          .order_by(ProjectInvitation.id)).all()
    received = [item for item in received if db.get(ProjectTeam, item.team_id) and db.get(ProjectTeam, item.team_id).cohort_id == cohort.id]
    team_names = {tid: [who.get(uid, "") for uid in uids] for tid, uids in teams.items()}
    from app.project_draw import student_draw_state  # ADR-0041 (imports this module)
    draw, surprise = student_draw_state(db, cohort.id, auth.user.id, member)
    return {"cohort_id": cohort.id, "cohort": cohort.label, "draw": draw, "surprise": surprise, "cohorts": [{"id": c.id, "label": c.label} for c in cohorts], "team": team,
            "invitations": [{"id": item.id, "team_id": item.team_id, "from": who.get(item.invited_by, ""),
                             "members": team_names.get(item.team_id, [])} for item in received],
            "classmates": [{"id": s.id, "name": who[s.id], "available": s.id not in in_team} for s in students if s.id != auth.user.id],
            "milestones": milestones, "slots": slots_out(db, cohort.id, team_names, member.team_id if member else None)}


class CohortInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cohort_id: int


@router.post("/student/project/team", status_code=201)
def create_team(payload: CohortInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    if payload.cohort_id not in {c.id for c in student_cohorts(db, auth.user.id)}:
        raise HTTPException(status_code=404, detail="class not found")
    if membership(db, payload.cohort_id, auth.user.id):
        raise HTTPException(status_code=409, detail="vous faites déjà partie d'un binôme")
    team = ProjectTeam(cohort_id=payload.cohort_id)
    db.add(team)
    db.flush()
    db.add(ProjectMember(cohort_id=payload.cohort_id, team_id=team.id, user_id=auth.user.id))
    drop_draw_entry(db, payload.cohort_id, auth.user.id)
    audit(db, auth, "project.team_create", payload.cohort_id, {"team": team.id})
    db.commit()
    return {"team_id": team.id}


class InviteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int


@router.post("/student/project/invitations", status_code=201)
def invite(payload: InviteInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    team, cohort_id = my_team(db, auth)
    if len(team_members(db, team.id)) >= TEAM_SIZE:
        raise HTTPException(status_code=409, detail="le binôme est complet")
    if payload.user_id == auth.user.id or payload.user_id not in {s.id for s in class_students(db, cohort_id)}:
        raise HTTPException(status_code=404, detail="student not found")
    if membership(db, cohort_id, payload.user_id):
        raise HTTPException(status_code=409, detail="cet étudiant fait déjà partie d'un binôme")
    if db.scalar(select(ProjectInvitation.id).where(ProjectInvitation.team_id == team.id, ProjectInvitation.user_id == payload.user_id,
                                                    ProjectInvitation.status == "pending")):
        raise HTTPException(status_code=409, detail="invitation déjà envoyée")
    invitation = ProjectInvitation(team_id=team.id, user_id=payload.user_id, invited_by=auth.user.id, status="pending")
    db.add(invitation)
    audit(db, auth, "project.invite", cohort_id, {"team": team.id, "user": payload.user_id})
    db.commit()
    return {"id": invitation.id}


def own_invitation(db: Session, auth: AuthContext, invitation_id: int) -> ProjectInvitation:
    invitation = db.get(ProjectInvitation, invitation_id)
    if invitation is None or invitation.user_id != auth.user.id or invitation.status != "pending":
        raise HTTPException(status_code=404, detail="invitation not found")
    return invitation


@router.post("/student/project/invitations/{invitation_id}/accept")
def accept(invitation_id: int, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    invitation = own_invitation(db, auth, invitation_id)
    team = db.get(ProjectTeam, invitation.team_id)
    if membership(db, team.cohort_id, auth.user.id):
        raise HTTPException(status_code=409, detail="vous faites déjà partie d'un binôme : quittez-le d'abord")
    if len(team_members(db, team.id)) >= TEAM_SIZE:
        invitation.status = "expired"
        db.commit()
        raise HTTPException(status_code=409, detail="le binôme est déjà complet")
    db.add(ProjectMember(cohort_id=team.cohort_id, team_id=team.id, user_id=auth.user.id))
    invitation.status = "accepted"
    drop_draw_entry(db, team.cohort_id, auth.user.id)
    for other in db.scalars(select(ProjectInvitation).where(ProjectInvitation.user_id == auth.user.id, ProjectInvitation.status == "pending")):
        other.status = "expired"
    audit(db, auth, "project.accept", team.cohort_id, {"team": team.id})
    db.commit()
    return {"team_id": team.id}


@router.post("/student/project/invitations/{invitation_id}/decline")
def decline(invitation_id: int, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    invitation = own_invitation(db, auth, invitation_id)
    invitation.status = "declined"
    audit(db, auth, "project.decline", db.get(ProjectTeam, invitation.team_id).cohort_id, {"team": invitation.team_id})
    db.commit()
    return {"declined": True}


@router.post("/student/project/leave")
def leave(auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    team, cohort_id = my_team(db, auth)
    if db.scalar(select(ProjectSubmission.id).where(ProjectSubmission.team_id == team.id).limit(1)):
        raise HTTPException(status_code=409, detail="le binôme a déjà déposé : demandez à l'enseignant de modifier la composition")
    db.execute(delete(ProjectMember).where(ProjectMember.team_id == team.id, ProjectMember.user_id == auth.user.id))
    if not team_members(db, team.id):
        db.delete(team)
    audit(db, auth, "project.leave", cohort_id, {"team": team.id})
    db.commit()
    return {"left": True}


def check_file(name: str, content: bytes) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    ext = "jpg" if ext == "jpeg" else ext
    if ext not in FILE_TYPES:
        raise HTTPException(status_code=422, detail="format accepté : pdf, png, jpg, md ou zip")
    magic = {"pdf": content.startswith(b"%PDF-"), "png": content.startswith(b"\x89PNG\r\n\x1a\n"), "jpg": content.startswith(b"\xff\xd8\xff"),
             "zip": content.startswith(b"PK\x03\x04")}
    if ext in magic and not magic[ext]:
        raise HTTPException(status_code=422, detail=f"le fichier n'est pas un {ext.upper()} valide")
    if ext == "md":
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=422, detail="un fichier .md doit être en UTF-8") from exc
    return ext


@router.post("/student/project/files", status_code=201)
async def upload(request: Request, name: str = Query(min_length=1, max_length=160), auth: AuthContext = Depends(require_student_csrf),
                 db: Session = Depends(get_db)) -> dict:
    """Raw body upload (20 Mo at most), referenced afterwards by a submission."""
    team, cohort_id = my_team(db, auth)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_FILE:
            raise HTTPException(status_code=413, detail="fichier trop volumineux (20 Mo au plus)")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=422, detail="fichier vide")
    safe = re.sub(r"[^A-Za-z0-9._ -]", "_", Path(name).name).strip() or "fichier"
    ext = check_file(safe, content)
    stored = f"{hashlib.sha256(content).hexdigest()[:32]}.{ext}"
    folder = Path(get_settings().project_dir)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / stored
    if not target.exists():
        temporary = target.with_suffix(target.suffix + ".part")
        temporary.write_bytes(content)
        temporary.replace(target)
    row = ProjectFile(team_id=team.id, name=safe[:160], stored=stored, size=len(content), uploaded_by=auth.user.id)
    db.add(row)
    audit(db, auth, "project.upload", cohort_id, {"team": team.id, "name": row.name, "size": row.size})
    db.commit()
    return {"id": row.id, "name": row.name, "size": row.size}


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(default="", max_length=MAX_TEXT)
    link: str | None = Field(default=None, max_length=500)
    file_ids: list[int] = Field(default_factory=list, max_length=20)


@router.post("/student/project/milestones/{milestone_id}/submissions", status_code=201)
def submit(milestone_id: int, payload: SubmissionInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    milestone = db.get(ProjectMilestone, milestone_id)
    if milestone is None:
        raise HTTPException(status_code=404, detail="milestone not found")
    team, cohort_id = my_team(db, auth, milestone.cohort_id)
    if len(team_members(db, team.id)) < TEAM_SIZE:  # ADR-0041: no individual work
        raise HTTPException(status_code=409, detail="le travail individuel n'est plus permis : formez un binôme ou tentez le binôme surprise")
    link = (payload.link or "").strip() or None
    if link:
        parsed = urlparse(link)
        if parsed.scheme != "https" or not parsed.netloc:
            raise HTTPException(status_code=422, detail="le lien doit commencer par https://")
    if not payload.text.strip() and not link and not payload.file_ids:
        raise HTTPException(status_code=422, detail="déposez un texte, un lien ou un fichier")
    owned = set(db.scalars(select(ProjectFile.id).where(ProjectFile.team_id == team.id, ProjectFile.id.in_(payload.file_ids or [0]))))
    if set(payload.file_ids) - owned:
        raise HTTPException(status_code=404, detail="file not found")
    version = (db.scalar(select(func.max(ProjectSubmission.version)).where(ProjectSubmission.team_id == team.id,
                                                                           ProjectSubmission.milestone_id == milestone.id)) or 0) + 1
    now = utcnow()
    late = milestone.due_at is not None and now > aware(milestone.due_at)
    row = ProjectSubmission(team_id=team.id, milestone_id=milestone.id, version=version, text=payload.text, link=link,
                            file_ids=list(dict.fromkeys(payload.file_ids)), late=late, submitted_by=auth.user.id, created_at=now)
    db.add(row)
    audit(db, auth, "project.submit", cohort_id, {"team": team.id, "milestone": milestone.id, "version": version, "late": late})
    db.commit()
    return {"id": row.id, "version": version, "late": late}


def send_file(row: ProjectFile) -> FileResponse:
    path = Path(get_settings().project_dir) / row.stored
    if not path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(path, media_type=FILE_TYPES[row.stored.rsplit(".", 1)[1]], filename=row.name,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                                 "Content-Security-Policy": "default-src 'none'; sandbox"})


@router.get("/student/project/files/{file_id}")
def student_file(file_id: int, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> FileResponse:
    row = db.get(ProjectFile, file_id)
    team = db.get(ProjectTeam, row.team_id) if row else None
    if row is None or team is None or not (member := membership(db, team.cohort_id, auth.user.id)) or member.team_id != team.id:
        raise HTTPException(status_code=404, detail="file not found")
    return send_file(row)


# Teacher -------------------------------------------------------------------------------------

def teacher_view(db: Session, cohort_id: int) -> dict:
    teams = all_teams(db, cohort_id)
    students = class_students(db, cohort_id)
    who = {s.id: display_name(s.username) for s in students}
    milestones = milestones_of(db, cohort_id)
    latest: dict[tuple[int, int], ProjectSubmission] = {}
    counts: dict[tuple[int, int], int] = {}
    for item in db.scalars(select(ProjectSubmission).join(ProjectTeam, ProjectTeam.id == ProjectSubmission.team_id)
                           .where(ProjectTeam.cohort_id == cohort_id).order_by(ProjectSubmission.version)):
        latest[(item.team_id, item.milestone_id)] = item
        counts[(item.team_id, item.milestone_id)] = counts.get((item.team_id, item.milestone_id), 0) + 1
    grades = {g.team_id: g for g in db.scalars(select(ProjectGrade).where(ProjectGrade.team_id.in_(list(teams) or [0])))}
    in_team = {uid for members in teams.values() for uid in members}
    team_names = {tid: [who.get(uid, "") for uid in uids] for tid, uids in teams.items()}
    return {
        "cohort_id": cohort_id,
        "teams": [{"id": tid, "members": [{"id": uid, "name": who.get(uid, "")} for uid in uids],
                   "grade": grade_out(grades.get(tid), uids, who)} for tid, uids in sorted(teams.items())],
        "alone": [{"id": s.id, "name": who[s.id]} for s in students if s.id not in in_team],
        "milestones": [{**milestone_out(m), "submissions": [{"team_id": tid, "version": latest[(tid, m.id)].version,
                       "versions": counts[(tid, m.id)], "late": latest[(tid, m.id)].late, "created_at": iso(latest[(tid, m.id)].created_at)}
                       for tid in sorted(teams) if (tid, m.id) in latest]} for m in milestones],
        "slots": slots_out(db, cohort_id, team_names),
        "grid": GRID, "individual_max": INDIVIDUAL_MAX,
    }


def grade_out(grade: ProjectGrade | None, members: list[int], who: dict[int, str]) -> dict:
    return {"sql": grade.sql if grade else None, "python": grade.python if grade else None, "nosql": grade.nosql if grade else None,
            "airflow": grade.airflow if grade else None, "reproducibility": grade.reproducibility if grade else None,
            "comment": grade.comment if grade else "",
            "students": [{"id": uid, "name": who.get(uid, ""), **total(grade, uid)} for uid in members]}


@router.get("/teacher/classes/{assignment_id}/project")
def teacher_project(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, _, cohort = owned_class(db, auth, assignment_id)
    return {**teacher_view(db, cohort.id), "assignment_id": assignment_id, "cohort": cohort.label}


class TeamInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_ids: list[int] = Field(min_length=1, max_length=TEAM_SIZE)


def set_members(db: Session, cohort_id: int, team: ProjectTeam, user_ids: list[int]) -> None:
    students = {s.id for s in class_students(db, cohort_id)}
    if set(user_ids) - students or len(set(user_ids)) != len(user_ids):
        raise HTTPException(status_code=422, detail="étudiants de la classe uniquement, sans doublon")
    for uid in user_ids:
        current = membership(db, cohort_id, uid)
        if current and current.team_id != team.id:
            raise HTTPException(status_code=409, detail=f"{display_name(db.get(User, uid).username)} fait déjà partie d'un autre binôme")
    db.execute(delete(ProjectMember).where(ProjectMember.team_id == team.id, ProjectMember.user_id.not_in(user_ids)))
    present = set(team_members(db, team.id))
    for uid in user_ids:
        if uid not in present:
            db.add(ProjectMember(cohort_id=cohort_id, team_id=team.id, user_id=uid))
    for invitation in db.scalars(select(ProjectInvitation).where(ProjectInvitation.status == "pending", ProjectInvitation.user_id.in_(user_ids))):
        invitation.status = "expired"


@router.post("/teacher/classes/{assignment_id}/project/teams", status_code=201)
def teacher_create_team(assignment_id: int, payload: TeamInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    _, _, cohort = owned_class(db, auth, assignment_id)
    team = ProjectTeam(cohort_id=cohort.id)
    db.add(team)
    db.flush()
    set_members(db, cohort.id, team, payload.user_ids)
    audit(db, auth, "project.team_set", cohort.id, {"team": team.id, "users": payload.user_ids})
    db.commit()
    return {"team_id": team.id}


@router.put("/teacher/project/teams/{team_id}")
def teacher_set_team(team_id: int, payload: TeamInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    team = owned_team(db, auth, team_id)
    set_members(db, team.cohort_id, team, payload.user_ids)
    audit(db, auth, "project.team_set", team.cohort_id, {"team": team.id, "users": payload.user_ids})
    db.commit()
    return {"team_id": team.id, "members": team_members(db, team.id)}


@router.delete("/teacher/project/teams/{team_id}")
def teacher_delete_team(team_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    team = owned_team(db, auth, team_id)
    if db.scalar(select(ProjectSubmission.id).where(ProjectSubmission.team_id == team.id).limit(1)):
        raise HTTPException(status_code=409, detail="ce binôme a des dépôts : modifiez sa composition plutôt que de le supprimer")
    audit(db, auth, "project.team_delete", team.cohort_id, {"team": team.id})
    db.delete(team)
    db.commit()
    return {"deleted": True}


class MilestoneInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    instructions: str = Field(default="", max_length=8000)
    due_at: datetime | None = None
    deliverables: list[str] = Field(default_factory=list, max_length=20)
    sort_order: int = Field(default=0, ge=0, le=1000)


class MilestonePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    instructions: str | None = Field(default=None, max_length=8000)
    due_at: datetime | None = None
    clear_due: bool = False
    deliverables: list[str] | None = Field(default=None, max_length=20)
    sort_order: int | None = Field(default=None, ge=0, le=1000)


def clean_deliverables(items: list[str]) -> list[str]:
    return [item.strip()[:200] for item in items if item.strip()]


@router.post("/teacher/classes/{assignment_id}/project/milestones", status_code=201)
def create_milestone(assignment_id: int, payload: MilestoneInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    _, _, cohort = owned_class(db, auth, assignment_id)
    row = ProjectMilestone(cohort_id=cohort.id, title=payload.title.strip(), instructions=payload.instructions, due_at=payload.due_at,
                           deliverables=clean_deliverables(payload.deliverables), sort_order=payload.sort_order)
    db.add(row)
    db.flush()
    audit(db, auth, "project.milestone_create", cohort.id, {"milestone": row.id, "title": row.title})
    db.commit()
    return milestone_out(row)


def owned_milestone(db: Session, auth: AuthContext, milestone_id: int) -> ProjectMilestone:
    row = db.get(ProjectMilestone, milestone_id)
    if row is None:
        raise HTTPException(status_code=404, detail="milestone not found")
    teacher_cohort(db, auth, row.cohort_id)
    return row


@router.patch("/teacher/project/milestones/{milestone_id}")
def update_milestone(milestone_id: int, payload: MilestonePatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    row = owned_milestone(db, auth, milestone_id)
    if payload.title is not None:
        row.title = payload.title.strip()
    if payload.instructions is not None:
        row.instructions = payload.instructions
    if payload.due_at is not None or payload.clear_due:
        row.due_at = None if payload.clear_due else payload.due_at
    if payload.deliverables is not None:
        row.deliverables = clean_deliverables(payload.deliverables)
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    audit(db, auth, "project.milestone_update", row.cohort_id, {"milestone": row.id})
    db.commit()
    return milestone_out(row)


@router.delete("/teacher/project/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    row = owned_milestone(db, auth, milestone_id)
    if db.scalar(select(ProjectSubmission.id).where(ProjectSubmission.milestone_id == row.id).limit(1)):
        raise HTTPException(status_code=409, detail="ce jalon a déjà des dépôts")
    audit(db, auth, "project.milestone_delete", row.cohort_id, {"milestone": row.id, "title": row.title})
    db.delete(row)
    db.commit()
    return {"deleted": True}


@router.get("/teacher/project/teams/{team_id}/milestones/{milestone_id}")
def team_milestone(team_id: int, milestone_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    team = owned_team(db, auth, team_id)
    milestone = db.get(ProjectMilestone, milestone_id)
    if milestone is None or milestone.cohort_id != team.cohort_id:
        raise HTTPException(status_code=404, detail="milestone not found")
    members = team_members(db, team.id)
    versions = db.scalars(select(ProjectSubmission).where(ProjectSubmission.team_id == team.id, ProjectSubmission.milestone_id == milestone.id)
                          .order_by(ProjectSubmission.version.desc())).all()
    who = names(db, members + [v.submitted_by for v in versions])
    comments = db.scalars(select(ProjectComment).where(ProjectComment.team_id == team.id, ProjectComment.milestone_id == milestone.id)
                          .order_by(ProjectComment.id)).all()
    return {"team": {"id": team.id, "members": [who.get(uid, "") for uid in members]}, "milestone": milestone_out(milestone),
            "submissions": [submission_out(db, v, who) for v in versions],
            "comments": [{"id": c.id, "text": c.text, "created_at": iso(c.created_at)} for c in comments]}


@router.get("/teacher/project/files/{file_id}")
def teacher_file(file_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> FileResponse:
    row = db.get(ProjectFile, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="file not found")
    owned_team(db, auth, row.team_id)
    return send_file(row)


class CommentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    milestone_id: int | None = None
    text: str = Field(min_length=1, max_length=4000)


@router.post("/teacher/project/teams/{team_id}/comments", status_code=201)
def comment(team_id: int, payload: CommentInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    team = owned_team(db, auth, team_id)
    if payload.milestone_id is not None:
        milestone = db.get(ProjectMilestone, payload.milestone_id)
        if milestone is None or milestone.cohort_id != team.cohort_id:
            raise HTTPException(status_code=404, detail="milestone not found")
    row = ProjectComment(team_id=team.id, milestone_id=payload.milestone_id, author_id=auth.user.id, text=payload.text.strip())
    db.add(row)
    audit(db, auth, "project.comment", team.cohort_id, {"team": team.id, "milestone": payload.milestone_id})
    db.commit()
    return {"id": row.id}


class GradeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sql: float | None = Field(default=None, ge=0, le=GRID["sql"])
    python: float | None = Field(default=None, ge=0, le=GRID["python"])
    nosql: float | None = Field(default=None, ge=0, le=GRID["nosql"])
    airflow: float | None = Field(default=None, ge=0, le=GRID["airflow"])
    reproducibility: float | None = Field(default=None, ge=0, le=GRID["reproducibility"])
    individual: dict[str, float] = Field(default_factory=dict)
    comment: str = Field(default="", max_length=4000)


@router.put("/teacher/project/teams/{team_id}/grade")
def grade(team_id: int, payload: GradeInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    team = owned_team(db, auth, team_id)
    members = {str(uid) for uid in team_members(db, team.id)}
    if set(payload.individual) - members or any(not 0 <= value <= INDIVIDUAL_MAX for value in payload.individual.values()):
        raise HTTPException(status_code=422, detail="compréhension individuelle : membres du binôme, de 0 à 4")
    row = db.get(ProjectGrade, team.id) or ProjectGrade(team_id=team.id, individual={})
    for key in GRID:
        setattr(row, key, getattr(payload, key))
    row.individual = {key: round(value, 2) for key, value in payload.individual.items()}
    row.comment = payload.comment
    row.updated_by = auth.user.id
    row.updated_at = utcnow()
    db.add(row)
    audit(db, auth, "project.grade", team.cohort_id, {"team": team.id})
    db.commit()
    who = names(db, [int(uid) for uid in members])
    return grade_out(row, [int(uid) for uid in sorted(members)], who)


@router.get("/teacher/classes/{assignment_id}/project/grades.csv")
def grades_csv(assignment_id: int, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> Response:
    _, _, cohort = owned_class(db, auth, assignment_id)
    teams = all_teams(db, cohort.id)
    grades = {g.team_id: g for g in db.scalars(select(ProjectGrade).where(ProjectGrade.team_id.in_(list(teams) or [0])))}
    who = {s.id: display_name(s.username) for s in class_students(db, cohort.id)}
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["etudiant", "binome", "sql_4", "python_4", "mongodb_redis_3", "airflow_3", "reproductibilite_2",
                     "commun_16", "individuel_4", "total_20"])
    cell = lambda value: "" if value is None else csv_number(value)  # noqa: E731
    for tid, uids in sorted(teams.items()):
        g = grades.get(tid)
        partner = " + ".join(who.get(uid, "") for uid in uids)
        for uid in uids:
            t = total(g, uid)
            writer.writerow([csv_cell(who.get(uid, "")), csv_cell(partner)] + [cell(getattr(g, key) if g else None) for key in GRID]
                            + [cell(t["common"]), cell(t["individual"]), cell(t["total"])])
    audit(db, auth, "project.export", cohort.id)
    db.commit()
    return Response(content="﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="shopflow-projet-notes-classe-{assignment_id}.csv"',
                             "Cache-Control": "no-store"})


class SlotInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: datetime
    ends_at: datetime
    label: str = Field(default="", max_length=120)
    team_id: int | None = None


class SlotPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    team_id: int | None = None
    clear_team: bool = False
    label: str | None = Field(default=None, max_length=120)


def check_slot_team(db: Session, cohort_id: int, team_id: int | None, slot_id: int | None = None) -> None:
    if team_id is None:
        return
    team = db.get(ProjectTeam, team_id)
    if team is None or team.cohort_id != cohort_id:
        raise HTTPException(status_code=404, detail="team not found")
    taken = db.scalar(select(ProjectSlot.id).where(ProjectSlot.team_id == team_id, ProjectSlot.id != (slot_id or 0)))
    if taken:
        raise HTTPException(status_code=409, detail="ce binôme a déjà un créneau")


@router.post("/teacher/classes/{assignment_id}/project/slots", status_code=201)
def create_slot(assignment_id: int, payload: SlotInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    _, _, cohort = owned_class(db, auth, assignment_id)
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail="la fin du créneau doit suivre son début")
    check_slot_team(db, cohort.id, payload.team_id)
    row = ProjectSlot(cohort_id=cohort.id, starts_at=payload.starts_at, ends_at=payload.ends_at, label=payload.label.strip(), team_id=payload.team_id)
    db.add(row)
    db.flush()
    audit(db, auth, "project.slot_create", cohort.id, {"slot": row.id})
    db.commit()
    return {"id": row.id}


def owned_slot(db: Session, auth: AuthContext, slot_id: int) -> ProjectSlot:
    row = db.get(ProjectSlot, slot_id)
    if row is None:
        raise HTTPException(status_code=404, detail="slot not found")
    teacher_cohort(db, auth, row.cohort_id)
    return row


@router.patch("/teacher/project/slots/{slot_id}")
def update_slot(slot_id: int, payload: SlotPatch, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    row = owned_slot(db, auth, slot_id)
    if payload.clear_team:
        row.team_id = None
    elif payload.team_id is not None:
        check_slot_team(db, row.cohort_id, payload.team_id, row.id)
        row.team_id = payload.team_id
    if payload.label is not None:
        row.label = payload.label.strip()
    audit(db, auth, "project.slot_update", row.cohort_id, {"slot": row.id, "team": row.team_id})
    db.commit()
    return {"id": row.id, "team_id": row.team_id}


@router.delete("/teacher/project/slots/{slot_id}")
def delete_slot(slot_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    row = owned_slot(db, auth, slot_id)
    audit(db, auth, "project.slot_delete", row.cohort_id, {"slot": row.id})
    db.delete(row)
    db.commit()
    return {"deleted": True}


# Observer (only with the teacher's permission) -------------------------------------------------

@router.get("/observer/classes/{assignment_id}/project")
def observer_project(assignment_id: int, response: Response, auth: AuthContext = Depends(require_observer), db: Session = Depends(get_db)) -> dict:
    from app.observer import consulted, observer_scope

    response.headers["Cache-Control"] = "no-store"
    row, owner = observer_scope(db, auth)
    if not db.get(Observer, auth.user.id).project_access:
        raise HTTPException(status_code=403, detail="forbidden")
    _, _, cohort = owned_class(db, owner, assignment_id)
    view = teacher_view(db, cohort.id)
    if not row.named:
        positions: dict[str, str] = {}
        for team in view["teams"]:
            for member in team["members"]:
                member["name"] = positions.setdefault(member["name"], f"Étudiant {len(positions) + 1}")
                member["id"] = 0
            for student in team["grade"]["students"]:
                student["name"] = positions.get(student["name"], student["name"])
                student["id"] = 0
        view["alone"] = [{"id": 0, "name": positions.setdefault(s["name"], f"Étudiant {len(positions) + 1}")} for s in view["alone"]]
        for slot in view["slots"]:
            slot["team"] = [positions.get(name, name) for name in slot["team"]]
    consulted(db, auth, "project", assignment_id)
    return {**view, "assignment_id": assignment_id, "cohort": cohort.label}
