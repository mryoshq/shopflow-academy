"""Automatic announcements to students (ADR-0047), presented by Rafi on the student side.

All of them are ordinary notifications (``app.live.notify``): idempotent through their deduplication key, logged,
translated in the browser (``serverText``), and sent by the existing background pass of the backend:
- milestone reminders 3 days, 1 day before and on the day (``app.project_reminders``);
- « bloc ouvert pas encore terminé »: once per student and block, from 9:00 Morocco time the day after the block
  opened for the class, if the student has not finished its graded missions, with a link to the next mission;
- the teacher's messages (kind ``message``) take the same channel.

Also here: the next project deadline of a student (dashboard countdown) and the class-wide switch of Rafi's sounds,
kept in the teacher's own settings (``notification_settings``), so no new table is needed.
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import aware, utcnow
from app.models import Assignment, BlockState, Course, CourseRelease, Enrollment, NotificationSetting, ProjectMilestone
from app.project_reminders import SEND_HOUR, TZ, local

log = logging.getLogger("academy.announcements")
RAFI_MUTED = "rafi_muted_assignments"
_checked: dict[str, str] = {}  # last Morocco day a full pass ran in this process (the dedup keys stay the guarantee)


def open_block_text(title: str) -> str:
    return f"Le bloc « {title} » vous attend : il reste des missions à terminer. On continue ?"


def open_blocks(db: Session, now: datetime | None = None) -> list[int]:
    """One notification per student and block opened before today and not finished. Returns the users to push."""
    from app.live import notify
    from app.progress import block_done, mission_scores
    from app.student import blocks_of
    from app.teacher_dashboard import class_students

    now = now or utcnow()
    today = now.astimezone(TZ)
    if today.hour < SEND_HOUR:
        return []
    day = today.date().isoformat()
    if _checked.get("open_blocks") == day:
        return []
    start_of_day = datetime.combine(today.date(), time(0), TZ)
    pushes: list[int] = []
    rows = db.execute(select(Assignment, CourseRelease).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                      .where(Assignment.paused_at.is_(None))).all()
    for assignment, release in rows:
        opened = {s.chapter_id: aware(s.opened_at) for s in db.scalars(select(BlockState).where(
            BlockState.cohort_id == assignment.cohort_id, BlockState.opened_at.is_not(None)))}
        blocks = [b for b in blocks_of(release.student_snapshot) if b["chapter_id"] in opened and opened[b["chapter_id"]] < start_of_day]
        if not blocks:
            continue
        ids = [m["mission_version_id"] for b in blocks for m in b["missions"]]
        for student in class_students(db, assignment.cohort_id):
            if not student.enabled:
                continue
            scores = mission_scores(db, student.id, ids)
            for block in blocks:
                vids = [m["mission_version_id"] for m in block["missions"]]
                graded = [v for v in vids if v in scores and not scores[v].bonus and not scores[v].lesson]
                if not graded or block_done(scores, vids):
                    continue
                target = next(v for v in graded if not scores[v].completed)
                sent = notify(db, [student.id], "open_blocks", open_block_text(block["title"]),
                              data={"chapter_id": block["chapter_id"], "link": f"#/mission/{target}"},
                              dedup=f"open-block:{assignment.cohort_id}:{block['chapter_id']}")
                if sent:
                    log.info("open block announcement for chapter %s to student %s", block["chapter_id"], student.id)
                pushes += sent
        db.commit()
    _checked["open_blocks"] = day
    return pushes


def next_deadline(db: Session, user_id: int, now: datetime | None = None) -> dict | None:
    """The student's next project deadline (dashboard countdown), with whether their team already submitted."""
    from app.models import ProjectMember, ProjectSubmission

    now = now or utcnow()
    cohorts = list(db.scalars(select(Enrollment.cohort_id).where(Enrollment.user_id == user_id)))
    if not cohorts:
        return None
    milestone = db.scalars(select(ProjectMilestone).where(ProjectMilestone.cohort_id.in_(cohorts), ProjectMilestone.due_at.is_not(None),
                                                          ProjectMilestone.due_at > now).order_by(ProjectMilestone.due_at)).first()
    if milestone is None or aware(milestone.due_at) <= now:
        return None
    team = db.scalar(select(ProjectMember.team_id).where(ProjectMember.user_id == user_id, ProjectMember.cohort_id == milestone.cohort_id))
    submitted = bool(team and db.scalar(select(ProjectSubmission.id).where(ProjectSubmission.team_id == team,
                                                                           ProjectSubmission.milestone_id == milestone.id)))
    due = local(milestone.due_at)
    return {"milestone_id": milestone.id, "title": milestone.title, "due_at": aware(milestone.due_at).isoformat(),
            # Morocco wall-clock time from the server's tzdata (a browser may carry older rules).
            "due_local": due.strftime("%Y-%m-%dT%H:%M"), "submitted": submitted, "link": "#/projet"}


def muted_assignments(db: Session, teacher_id: int) -> set[int]:
    row = db.get(NotificationSetting, teacher_id)
    return set((row.data or {}).get(RAFI_MUTED, [])) if row else set()


def set_class_sounds(db: Session, teacher_id: int, assignment_id: int, sounds: bool) -> None:
    row = db.get(NotificationSetting, teacher_id)
    data = dict(row.data or {}) if row else {}
    muted = set(data.get(RAFI_MUTED, []))
    (muted.discard if sounds else muted.add)(assignment_id)
    data[RAFI_MUTED] = sorted(muted)
    if row is None:
        db.add(NotificationSetting(user_id=teacher_id, data=data))
    else:
        row.data = data


def class_sounds(db: Session, user_id: int) -> bool:
    """Rafi's sounds for a student: off as soon as the teacher of one of their classes switched them off."""
    rows = db.execute(select(Assignment.id, Course.created_by).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                      .join(Course, Course.id == CourseRelease.course_id).join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
                      .where(Enrollment.user_id == user_id)).all()
    return not any(assignment_id in muted_assignments(db, teacher) for assignment_id, teacher in rows)


def day_after(value: datetime) -> datetime:
    """The start of the next Morocco day (used by the tests)."""
    return datetime.combine(value.astimezone(TZ).date() + timedelta(days=1), time(0), TZ)


# Teacher: Rafi's sounds for the whole class ------------------------------------------------------

from fastapi import APIRouter, Depends, Response  # noqa: E402
from pydantic import BaseModel, ConfigDict  # noqa: E402

from app.auth import AuthContext, require_student, require_teacher, require_teacher_csrf  # noqa: E402
from app.database import get_db  # noqa: E402

router = APIRouter(prefix="/api/v1/teacher", tags=["announcements"])


class SoundsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sounds: bool


@router.get("/classes/{assignment_id}/rafi")
def rafi_settings(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    from app.teacher_dashboard import owned_class

    response.headers["Cache-Control"] = "no-store"
    assignment, _, _ = owned_class(db, auth, assignment_id)
    return {"sounds": assignment.id not in muted_assignments(db, auth.user.id)}


@router.put("/classes/{assignment_id}/rafi")
def update_rafi(assignment_id: int, payload: SoundsInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    from app.teacher_dashboard import audit, owned_class

    assignment, _, _ = owned_class(db, auth, assignment_id)
    set_class_sounds(db, auth.user.id, assignment.id, payload.sounds)
    audit(db, auth, "rafi.sounds", assignment.id, {"sounds": payload.sounds})
    db.commit()
    return {"sounds": payload.sounds}


student_router = APIRouter(prefix="/api/v1/student", tags=["announcements"])


@student_router.get("/rafi")
def student_rafi(response: Response, auth: AuthContext = Depends(require_student), db: Session = Depends(get_db)) -> dict:
    """What Rafi needs on the student side: may it play its sounds (class-wide switch of the teacher)."""
    response.headers["Cache-Control"] = "no-store"
    return {"sounds": class_sounds(db, auth.user.id), "next": next_step(db, auth.user.id)}


def next_step(db: Session, user_id: int, now: datetime | None = None) -> dict:
    """« Que faire maintenant ? » (ADR-0050): the first unfinished graded mission of an open block, else an open
    bonus, else the next project deadline, else nothing to do. Only titles the student can already see."""
    from app.progress import mission_scores
    from app.student import assigned_releases, flatten, statuses, visible_missions

    bonus: dict | None = None
    for release in assigned_releases(db, user_id):
        missions = flatten(release.student_snapshot)
        visible = visible_missions(db, user_id, release, missions)
        if not visible:
            continue
        ids = [item["mission_version_id"] for item in visible]
        state = statuses(db, user_id, missions, set(ids))
        scores = mission_scores(db, user_id, ids)
        for item in visible:
            vid = item["mission_version_id"]
            score = scores.get(vid)
            if score is None or score.lesson or state[vid]["status"] not in ("not_started", "in_progress"):
                continue
            step = {"title": item["title"], "chapter": item.get("chapter"), "link": f"#/mission/{vid}",
                    "started": state[vid]["status"] == "in_progress"}
            if not score.bonus:
                return {"kind": "mission", **step}
            bonus = bonus or {"kind": "bonus", **step}
    if bonus:
        return bonus
    deadline = next_deadline(db, user_id, now)
    if deadline and not deadline["submitted"]:
        return {"kind": "deadline", "title": deadline["title"], "due_local": deadline["due_local"], "link": deadline["link"]}
    return {"kind": "done"}
