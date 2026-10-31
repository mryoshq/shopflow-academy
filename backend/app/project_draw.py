"""Surprise draw of the project space (ADR-0041).

Working alone is no longer offered. A student without a team forms one by invitation (ADR-0034) or
signs up for the surprise draw. The teacher previews, then confirms, a server-side draw that pairs at
random every student still without a team, plus the one-person teams the teacher includes. An odd
number makes one group of three. Teams already formed and submissions never move.

The draw is deterministic for a given seed and pool (the preview shows exactly what the confirmation
records), recorded in ``project_draws`` and audited; confirming the same seed again replays it, and a
new draw after a first one needs an explicit confirmation.
"""

from __future__ import annotations

import hashlib
import json
import random
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, display_name, require_student_csrf, require_teacher, require_teacher_csrf, utcnow
from app.database import get_db
from app.live import notify, push_after_commit
from app.models import (ProjectComment, ProjectDraw, ProjectDrawEntry, ProjectFile, ProjectGrade, ProjectInvitation, ProjectMember,
                        ProjectSlot, ProjectSubmission, ProjectTeam, User)
from app.project import audit, iso, membership, student_cohorts, team_members
from app.teacher_dashboard import class_students, owned_class

router = APIRouter(prefix="/api/v1", tags=["project"])
SEED = r"^[0-9a-f]{8,32}$"


# The draw itself (pure) ---------------------------------------------------------------------

def draw_groups(free: list[int], solo: list[tuple[int, int, bool]], seed: str) -> tuple[list[dict], list[int]]:
    """Groups of two (one of three when the count is odd) and the people left out.

    ``free``: students without a team. ``solo``: included one-person teams as (team_id, user_id, has_work).
    A team that already holds work (a submission or a file) keeps it: it becomes the group's team, so
    two such teams are never put together; any excess is left out for the teacher to pair by hand.
    """
    rng = random.Random(seed)
    hosts = sorted((team_id, user_id) for team_id, user_id, has_work in solo if has_work)
    others = sorted(free) + sorted(user_id for _, user_id, has_work in solo if not has_work)
    rng.shuffle(hosts)
    rng.shuffle(others)
    left_out: list[int] = []
    while hosts and len(hosts) > (len(hosts) + len(others)) // 2:
        left_out.append(hosts.pop()[1])
    total = len(hosts) + len(others)
    if total < 2:
        return [], sorted(left_out + [user for _, user in hosts] + others)
    sizes = [2] * (total // 2)
    if total % 2:
        sizes[-1] = 3
    groups, queue = [], list(others)
    for index, size in enumerate(sizes):
        members, host_team = [], None
        if index < len(hosts):
            host_team, host_user = hosts[index]
            members.append(host_user)
        while len(members) < size:
            members.append(queue.pop(0))
        groups.append({"host_team": host_team, "members": sorted(members)})
    return groups, sorted(left_out)


# Pool --------------------------------------------------------------------------------------

def active_students(db: Session, cohort_id: int) -> list[User]:
    return [student for student in class_students(db, cohort_id) if student.enabled]


def solo_teams(db: Session, cohort_id: int) -> list[tuple[int, int, bool]]:
    """(team_id, user_id, has_work) for every one-person team of the class."""
    result = []
    for team_id in db.scalars(select(ProjectTeam.id).where(ProjectTeam.cohort_id == cohort_id).order_by(ProjectTeam.id)):
        members = team_members(db, team_id)
        if len(members) != 1:
            continue
        # Work of any kind (submission, file, comment, grade, defence slot) stays with its team.
        work = any(db.scalar(select(model.team_id).where(model.team_id == team_id).limit(1)) is not None
                   for model in (ProjectSubmission, ProjectFile, ProjectComment, ProjectGrade, ProjectSlot))
        result.append((team_id, members[0], bool(work)))
    return result


def pool(db: Session, cohort_id: int, include_team_ids: list[int]) -> tuple[list[int], list[tuple[int, int, bool]]]:
    in_team = set(db.scalars(select(ProjectMember.user_id).where(ProjectMember.cohort_id == cohort_id)))
    free = sorted(s.id for s in active_students(db, cohort_id) if s.id not in in_team)
    solos = {team_id: (team_id, user_id, work) for team_id, user_id, work in solo_teams(db, cohort_id)}
    unknown = set(include_team_ids) - set(solos)
    if unknown:
        raise HTTPException(status_code=422, detail="seules les équipes d'une seule personne de la classe peuvent rejoindre le tirage")
    return free, [solos[team_id] for team_id in sorted(set(include_team_ids))]


def fingerprint(free: list[int], solo: list[tuple[int, int, bool]]) -> str:
    return hashlib.sha256(json.dumps({"free": free, "solo": solo}).encode()).hexdigest()[:16]


def names_of(db: Session, user_ids: list[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    return {u.id: display_name(u.username) for u in db.scalars(select(User).where(User.id.in_(user_ids)))}


def draw_out(db: Session, row: ProjectDraw) -> dict:
    people = [uid for group in row.groups for uid in group["members"]] + list(row.left_out)
    who = names_of(db, people + ([row.created_by] if row.created_by else []))
    return {"id": row.id, "created_at": iso(row.created_at), "by": who.get(row.created_by, "") if row.created_by else "",
            "groups": [[who.get(uid, "") for uid in group["members"]] for group in row.groups],
            "left_out": [who.get(uid, "") for uid in row.left_out]}


def last_draw(db: Session, cohort_id: int) -> ProjectDraw | None:
    return db.scalar(select(ProjectDraw).where(ProjectDraw.cohort_id == cohort_id).order_by(ProjectDraw.id.desc()).limit(1))


# Student -----------------------------------------------------------------------------------

def student_draw_state(db: Session, cohort_id: int, user_id: int, member: ProjectMember | None) -> tuple[dict, dict | None]:
    """The « draw » block of the student page and, once, the surprise to reveal."""
    entries = set(db.scalars(select(ProjectDrawEntry.user_id).where(ProjectDrawEntry.cohort_id == cohort_id)))
    state = {"registered": user_id in entries, "registered_count": len(entries), "done": last_draw(db, cohort_id) is not None}
    surprise = None
    if member is not None and member.draw_id is not None and member.revealed_at is None:
        others = [uid for uid in team_members(db, member.team_id) if uid != user_id]
        who = names_of(db, others)
        surprise = {"draw_id": member.draw_id, "partners": [who.get(uid, "") for uid in others]}
    return state, surprise


class CohortInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cohort_id: int


def own_cohort(db: Session, auth: AuthContext, cohort_id: int) -> int:
    if cohort_id not in {c.id for c in student_cohorts(db, auth.user.id)}:
        raise HTTPException(status_code=404, detail="class not found")
    return cohort_id


@router.post("/student/project/draw/join")
def join_draw(payload: CohortInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    cohort_id = own_cohort(db, auth, payload.cohort_id)
    if membership(db, cohort_id, auth.user.id):
        raise HTTPException(status_code=409, detail="vous faites déjà partie d'un binôme")
    if db.scalar(select(ProjectDrawEntry.id).where(ProjectDrawEntry.cohort_id == cohort_id, ProjectDrawEntry.user_id == auth.user.id)) is None:
        try:
            with db.begin_nested():
                db.add(ProjectDrawEntry(cohort_id=cohort_id, user_id=auth.user.id))
        except IntegrityError:
            pass  # signed up concurrently
        audit(db, auth, "project.draw_join", cohort_id)
    db.commit()
    return {"registered": True}


@router.post("/student/project/draw/leave")
def leave_draw(payload: CohortInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    cohort_id = own_cohort(db, auth, payload.cohort_id)
    if membership(db, cohort_id, auth.user.id):
        raise HTTPException(status_code=409, detail="le tirage a déjà eu lieu : vous faites partie d'un binôme")
    removed = db.execute(delete(ProjectDrawEntry).where(ProjectDrawEntry.cohort_id == cohort_id, ProjectDrawEntry.user_id == auth.user.id))
    if removed.rowcount:
        audit(db, auth, "project.draw_leave", cohort_id)
    db.commit()
    return {"registered": False}


@router.post("/student/project/surprise/seen")
def surprise_seen(payload: CohortInput, auth: AuthContext = Depends(require_student_csrf), db: Session = Depends(get_db)) -> dict:
    cohort_id = own_cohort(db, auth, payload.cohort_id)
    member = membership(db, cohort_id, auth.user.id)
    if member is not None and member.draw_id is not None and member.revealed_at is None:
        member.revealed_at = utcnow()
        db.commit()
    return {"seen": True}


# Teacher -----------------------------------------------------------------------------------

@router.get("/teacher/classes/{assignment_id}/project/draw")
def draw_overview(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, _, cohort = owned_class(db, auth, assignment_id)
    free, _ = pool(db, cohort.id, [])
    entries = set(db.scalars(select(ProjectDrawEntry.user_id).where(ProjectDrawEntry.cohort_id == cohort.id)))
    solos = solo_teams(db, cohort.id)
    who = names_of(db, free + [user_id for _, user_id, _ in solos])
    draws = db.scalars(select(ProjectDraw).where(ProjectDraw.cohort_id == cohort.id).order_by(ProjectDraw.id.desc())).all()
    return {"free": [{"id": uid, "name": who.get(uid, ""), "registered": uid in entries} for uid in free],
            "solo_teams": [{"team_id": team_id, "name": who.get(user_id, ""), "has_work": work} for team_id, user_id, work in solos],
            "draws": [draw_out(db, row) for row in draws]}


class PreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    include_team_ids: list[int] = Field(default_factory=list, max_length=200)
    seed: str | None = Field(default=None, pattern=SEED)


def preview_out(db: Session, seed: str, free: list[int], solo: list[tuple[int, int, bool]]) -> dict:
    groups, left_out = draw_groups(free, solo, seed)
    who = names_of(db, free + [user_id for _, user_id, _ in solo])
    return {"seed": seed, "fingerprint": fingerprint(free, solo), "pool_size": len(free) + len(solo),
            "groups": [{"members": [who.get(uid, "") for uid in group["members"]], "existing_team": group["host_team"] is not None}
                       for group in groups],
            "left_out": [who.get(uid, "") for uid in left_out]}


@router.post("/teacher/classes/{assignment_id}/project/draw/preview")
def draw_preview(assignment_id: int, payload: PreviewInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """What the draw would give with this seed; nothing is written."""
    _, _, cohort = owned_class(db, auth, assignment_id)
    free, solo = pool(db, cohort.id, payload.include_team_ids)
    previous = last_draw(db, cohort.id)
    return {**preview_out(db, payload.seed or secrets.token_hex(8), free, solo),
            "previous": draw_out(db, previous) if previous else None}


class DrawInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seed: str = Field(pattern=SEED)
    fingerprint: str = Field(min_length=16, max_length=16)
    include_team_ids: list[int] = Field(default_factory=list, max_length=200)
    confirm_again: bool = False


@router.post("/teacher/classes/{assignment_id}/project/draw")
def run_draw(assignment_id: int, payload: DrawInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    _, _, cohort = owned_class(db, auth, assignment_id)
    same = db.scalar(select(ProjectDraw).where(ProjectDraw.cohort_id == cohort.id, ProjectDraw.seed == payload.seed))
    if same is not None:
        return {**draw_out(db, same), "replayed": True}
    if last_draw(db, cohort.id) is not None and not payload.confirm_again:
        raise HTTPException(status_code=409, detail="un tirage a déjà eu lieu : confirmez pour en lancer un autre (les équipes formées ne bougent pas)")
    free, solo = pool(db, cohort.id, payload.include_team_ids)
    if fingerprint(free, solo) != payload.fingerprint:
        raise HTTPException(status_code=409, detail="la classe a changé depuis l'aperçu : refaites l'aperçu")
    groups, left_out = draw_groups(free, solo, payload.seed)
    if not groups:
        raise HTTPException(status_code=409, detail="moins de deux personnes à apparier : ajoutez-la à la main à un binôme")
    solo_team = {user_id: team_id for team_id, user_id, _ in solo}
    row = ProjectDraw(cohort_id=cohort.id, seed=payload.seed, pool=free, included_teams=[list(item) for item in solo],
                      groups=[], left_out=left_out, created_by=auth.user.id)
    try:
        db.add(row)
        db.flush()
        recorded = []
        for group in groups:
            members = group["members"]
            team_id = group["host_team"] or next((solo_team[uid] for uid in members if uid in solo_team), None)
            if team_id is None:
                team = ProjectTeam(cohort_id=cohort.id)
                db.add(team)
                db.flush()
                team_id = team.id
            for uid in members:
                previous = solo_team.get(uid)
                if previous == team_id:
                    current = membership(db, cohort.id, uid)
                    current.draw_id = row.id
                    continue
                if previous is not None:  # a one-person team without work: replaced by the group's team
                    db.execute(delete(ProjectMember).where(ProjectMember.team_id == previous))
                    db.execute(delete(ProjectInvitation).where(ProjectInvitation.team_id == previous))
                    db.execute(delete(ProjectTeam).where(ProjectTeam.id == previous))
                db.flush()
                db.add(ProjectMember(cohort_id=cohort.id, team_id=team_id, user_id=uid, draw_id=row.id))
            recorded.append({"team_id": team_id, "members": members})
        row.groups = recorded
        people = [uid for group in groups for uid in group["members"]]
        for invitation in db.scalars(select(ProjectInvitation).where(ProjectInvitation.status == "pending", ProjectInvitation.user_id.in_(people))):
            invitation.status = "expired"
        teams = [group["team_id"] for group in recorded]
        for invitation in db.scalars(select(ProjectInvitation).where(ProjectInvitation.status == "pending", ProjectInvitation.team_id.in_(teams))):
            invitation.status = "expired"
        db.execute(delete(ProjectDrawEntry).where(ProjectDrawEntry.cohort_id == cohort.id, ProjectDrawEntry.user_id.in_(people)))
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="la classe a changé pendant le tirage : refaites l'aperçu") from exc
    who = names_of(db, people)
    for group in recorded:
        for uid in group["members"]:
            others = [who.get(other, "") for other in group["members"] if other != uid]
            notify(db, [uid], "project_draw", f"Binôme surprise : vous travaillerez avec {' et '.join(others)}.",
                   sender_id=auth.user.id, data={"cohort_id": cohort.id, "draw_id": row.id}, dedup=f"project_draw:{row.id}")
    audit(db, auth, "project.draw", cohort.id, {"draw": row.id, "seed": row.seed, "groups": recorded, "left_out": left_out,
                                               "included_teams": [item[0] for item in solo]})
    db.commit()
    push_after_commit(db, people)
    return {**draw_out(db, row), "replayed": False}
