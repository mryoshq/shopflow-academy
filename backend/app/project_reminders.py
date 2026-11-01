"""Automatic reminders of the project milestones (ADR-0034, ADR-0045).

For each milestone with a deadline (and reminders on), a short, encouraging notification goes out 3 days,
1 day before and on the day itself (ADR-0047), at 9:00 Morocco time, to the members of the teams that have not submitted anything for it.
For the « Binôme formé » milestone, it goes to the students without a team who did not sign up for the
surprise draw. Sent by the existing background pass of the backend (``autoplan.tick``, every few seconds):
a reminder missed while the server was down goes out later the same day, never on another day.

Idempotent: one row per milestone, reminder and target in ``project_reminders`` (unique), which is also the
log; the notification itself has a deduplication key per recipient.
"""

from __future__ import annotations

import logging
import unicodedata
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import aware, utcnow
from app.models import ProjectDrawEntry, ProjectMember, ProjectMilestone, ProjectReminder, ProjectSubmission, ProjectTeam, User

log = logging.getLogger("academy.reminders")
TZ = ZoneInfo("Africa/Casablanca")
SEND_HOUR = 9
REMINDERS = (("j3", 3), ("j1", 1), ("j0", 0))  # key, days before the deadline (Morocco calendar); j0: ADR-0047
LINK = "#/projet"


def local(value: datetime) -> datetime:
    return aware(value).astimezone(TZ)


def schedule(due_at: datetime) -> list[dict]:
    """The planned reminders of a deadline: key, days, send time (9:00 Morocco time) and end of their window."""
    due = local(due_at)
    plan = []
    for key, days in REMINDERS:
        day = due.date() - timedelta(days=days)
        send_at = datetime.combine(day, time(SEND_HOUR), TZ)
        # Catch-up after a restart: the same day only (until midnight in Morocco), and never past the deadline.
        until = min(datetime.combine(day + timedelta(days=1), time(0), TZ), due)
        if send_at >= due:
            continue  # a deadline before 9:00 has no reminder on its own day
        plan.append({"key": key, "days": days, "send_at": send_at, "until": until})
    return plan


def due_now(milestone: ProjectMilestone, now: datetime) -> dict | None:
    """The reminder to send now for this milestone, if any (the latest one whose window is open)."""
    if not milestone.reminders or milestone.due_at is None or now >= aware(milestone.due_at):
        return None
    current = [item for item in schedule(milestone.due_at) if item["send_at"] <= now < item["until"]]
    return current[-1] if current else None


def plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


def is_pairing(milestone: ProjectMilestone) -> bool:
    """The « Binôme formé » milestone (title, accents and case ignored)."""
    return "binome forme" in plain(milestone.title)


def targets(db: Session, milestone: ProjectMilestone) -> list[tuple[str, list[int]]]:
    """(target key, recipients): teams with nothing submitted, or, for « Binôme formé », students left alone."""
    from app.teacher_dashboard import class_students

    if is_pairing(milestone):
        in_team = set(db.scalars(select(ProjectMember.user_id).where(ProjectMember.cohort_id == milestone.cohort_id)))
        signed_up = set(db.scalars(select(ProjectDrawEntry.user_id).where(ProjectDrawEntry.cohort_id == milestone.cohort_id)))
        return [(f"user:{s.id}", [s.id]) for s in class_students(db, milestone.cohort_id)
                if s.enabled and s.id not in in_team and s.id not in signed_up]
    submitted = set(db.scalars(select(ProjectSubmission.team_id).where(ProjectSubmission.milestone_id == milestone.id)))
    enabled = {u.id for u in db.scalars(select(User).join(ProjectMember, ProjectMember.user_id == User.id)
                                         .where(ProjectMember.cohort_id == milestone.cohort_id, User.enabled.is_(True)))}
    out = []
    for team_id in db.scalars(select(ProjectTeam.id).where(ProjectTeam.cohort_id == milestone.cohort_id).order_by(ProjectTeam.id)):
        if team_id in submitted:
            continue
        members = [uid for uid in db.scalars(select(ProjectMember.user_id).where(ProjectMember.team_id == team_id)) if uid in enabled]
        if members:
            out.append((f"team:{team_id}", members))
    return out


def message(milestone: ProjectMilestone, now: datetime) -> str:
    due = local(milestone.due_at)
    left = (due.date() - now.astimezone(TZ).date()).days
    if left <= 0:
        return f"C’est aujourd’hui : « {milestone.title} » est attendu à {due:%H:%M}. Vous y êtes presque !"
    return (f"Rappel : « {milestone.title} » est attendu le {due:%d/%m/%Y} à {due:%H:%M}. "
            f"Il vous reste {left} jour{'s' if left > 1 else ''}.")


def run(db: Session, now: datetime | None = None) -> list[int]:
    """One pass over every milestone; returns the users to push. Commits what it sends."""
    from app.live import notify

    now = now or utcnow()
    pushes: list[int] = []
    for milestone in db.scalars(select(ProjectMilestone).where(ProjectMilestone.due_at.is_not(None), ProjectMilestone.reminders.is_(True))):
        reminder = due_now(milestone, now)
        if reminder is None:
            continue
        sent = set(db.scalars(select(ProjectReminder.target).where(ProjectReminder.milestone_id == milestone.id,
                                                                    ProjectReminder.reminder == reminder["key"])))
        text = message(milestone, now)
        for target, recipients in targets(db, milestone):
            if target in sent:
                continue
            try:
                with db.begin_nested():
                    db.add(ProjectReminder(milestone_id=milestone.id, reminder=reminder["key"], target=target, recipients=recipients))
            except IntegrityError:
                continue  # sent at the same moment by another worker
            pushes += notify(db, recipients, "project_reminder", text, data={"milestone_id": milestone.id, "reminder": reminder["key"], "link": LINK},
                             dedup=f"reminder:{milestone.id}:{reminder['key']}")
            log.info("project reminder %s sent for milestone %s to %s (%d recipients)", reminder["key"], milestone.id, target, len(recipients))
        db.commit()
    return pushes


def plan_out(db: Session, milestone: ProjectMilestone, now: datetime | None = None) -> dict:
    """What the teacher sees under a milestone: each reminder with its time (Morocco) and status."""
    now = now or utcnow()
    if milestone.due_at is None:
        return {"enabled": milestone.reminders, "items": []}
    counts: dict[str, int] = {}
    for key in db.scalars(select(ProjectReminder.reminder).where(ProjectReminder.milestone_id == milestone.id)):
        counts[key] = counts.get(key, 0) + 1
    items = []
    for item in schedule(milestone.due_at):
        if counts.get(item["key"]):
            status = "sent"
        elif not milestone.reminders:
            status = "off"
        elif now >= item["until"]:
            status = "passed"
        else:
            status = "planned"
        items.append({"key": item["key"], "days": item["days"], "send_at": item["send_at"].isoformat(),
                      # Morocco wall-clock time, from the server's tzdata (a browser may carry older rules).
                      "local": item["send_at"].strftime("%Y-%m-%dT%H:%M"), "status": status,
                      "sent": counts.get(item["key"], 0)})
    return {"enabled": milestone.reminders, "pairing": is_pairing(milestone), "items": items}

