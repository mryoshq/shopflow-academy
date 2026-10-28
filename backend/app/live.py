"""Live tracking (sprint 2, part H, ADR-0023).

* Presence: each open page sends a heartbeat every 30 s; « en ligne » = seen < 75 s.
* Notifications (one table for everyone): teacher messages to students (280 characters,
  read receipts, rate-limited, audited), automatic ones (block opened, help handled) and the
  teacher's notification centre (help request, blocked student, block completed by X %,
  automatic opening in 2 min / done, disconnection), each type switchable.
* Per-student block unlock (« ouvert pour vous »), audited, notified.
* Web Push without payload (``app.webpush``) when VAPID keys are configured.
* The teacher's live grid: students × blocks, presence, help, fast clicks.

Every class route is restricted to the course owner (404 otherwise), like ADR-0013.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, current_auth, display_name, require_csrf, require_student, require_teacher, require_teacher_csrf, utcnow
from app.curriculum_schema import HTML_TAG
from app.database import get_db
from app.models import (
    Assignment, BlockState, BlockUnlock, Course, CourseRelease, HelpRequest, MissionAttempt, Notification, NotificationSetting,
    Presence, PushSubscription, User,
)

router = APIRouter(prefix="/api/v1", tags=["live"])

HEARTBEAT_SECONDS = 30
ONLINE_WINDOW = timedelta(seconds=75)
DISCONNECT_AFTER = timedelta(seconds=90)
HEARTBEAT_MIN_GAP = timedelta(seconds=10)
MESSAGES_PER_MINUTE = 5
MESSAGES_PER_HOUR = 60
MAX_PUSH_SUBSCRIPTIONS = 5

TEACHER_DEFAULTS: dict = {
    # Teacher's notification centre, per type.
    "help": True, "blocked": True, "block_done": True, "block_done_percent": 80,
    "auto_soon": True, "auto_done": True, "disconnect": True,
    # Automatic notifications sent to students.
    "student_block_open": True, "student_help_handled": True,
}
TEACHER_KINDS = ("help", "blocked", "block_done", "auto_soon", "auto_done", "disconnect")


# Notifications --------------------------------------------------------------------------

def teacher_settings(db: Session, user_id: int) -> dict:
    row = db.get(NotificationSetting, user_id)
    return {**TEACHER_DEFAULTS, **(row.data if row else {})}


def notify(db: Session, recipient_ids: list[int], kind: str, text: str, *, sender_id: int | None = None,
           data: dict | None = None, dedup: str | None = None) -> list[int]:
    """Add one notification per recipient (skipped when ``dedup`` was already sent to them). Not committed."""
    created: list[int] = []
    for recipient in dict.fromkeys(recipient_ids):
        if dedup and db.scalar(select(Notification.id).where(Notification.recipient_id == recipient, Notification.dedup_key == dedup)):
            continue
        try:
            with db.begin_nested():
                db.add(Notification(recipient_id=recipient, sender_id=sender_id, kind=kind, text=text[:280], data=data, dedup_key=dedup))
            created.append(recipient)
        except IntegrityError:  # sent concurrently by another worker
            continue
    return created


def teacher_event(db: Session, teacher_id: int, kind: str, text: str, data: dict | None = None, dedup: str | None = None) -> list[int]:
    """A notification for the teacher's centre, unless this type is switched off."""
    if not teacher_settings(db, teacher_id).get(kind, True):
        return []
    return notify(db, [teacher_id], kind, text, data=data, dedup=dedup)


def push_after_commit(db: Session, user_ids: list[int]) -> None:
    from app.webpush import push_to

    push_to(db.get_bind(), user_ids)


def notification_out(item: Notification, names: dict[int, str] | None = None) -> dict:
    return {"id": item.id, "kind": item.kind, "text": item.text, "data": item.data or {},
            "sender": (names or {}).get(item.sender_id) if item.sender_id else None,
            "created_at": aware(item.created_at).isoformat(), "read_at": aware(item.read_at).isoformat() if item.read_at else None}


@router.get("/notifications")
def my_notifications(response: Response, after: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                     auth: AuthContext = Depends(current_auth), db: Session = Depends(get_db)) -> dict:
    """The current user's notifications, newest first (``after``: only newer than this id)."""
    response.headers["Cache-Control"] = "no-store"
    query = select(Notification).where(Notification.recipient_id == auth.user.id, Notification.id > after)
    items = db.scalars(query.order_by(Notification.id.desc()).limit(limit)).all()
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.recipient_id == auth.user.id, Notification.read_at.is_(None))) or 0
    senders = {u.id: display_name(u.username) for u in db.scalars(select(User).where(User.id.in_({i.sender_id for i in items if i.sender_id})))}
    return {"unread": unread, "items": [notification_out(item, senders) for item in items]}


@router.post("/notifications/{notification_id}/read")
def read_notification(notification_id: int, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    item = db.get(Notification, notification_id)
    if item is None or item.recipient_id != auth.user.id:
        raise HTTPException(status_code=404, detail="notification not found")
    if item.read_at is None:
        item.read_at = utcnow()
        db.commit()
    return {"id": item.id, "read_at": aware(item.read_at).isoformat()}


@router.post("/notifications/read-all")
def read_all(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    now = utcnow()
    count = 0
    for item in db.scalars(select(Notification).where(Notification.recipient_id == auth.user.id, Notification.read_at.is_(None))):
        item.read_at, count = now, count + 1
    db.commit()
    return {"read": count}


# Presence ---------------------------------------------------------------------------------

class HeartbeatInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mission_version_id: int | None = Field(default=None, gt=0)


@router.post("/presence")
def heartbeat(payload: HeartbeatInput, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    """Every 30 s from an open page. Extra beats within 10 s are not written (cheap for 10 students)."""
    now = utcnow()
    row = db.get(Presence, auth.user.id)
    if row is None:
        db.add(Presence(user_id=auth.user.id, seen_at=now, online_since=now, mission_version_id=payload.mission_version_id))
    elif now - aware(row.seen_at) >= HEARTBEAT_MIN_GAP or row.mission_version_id != payload.mission_version_id:
        if now - aware(row.seen_at) > ONLINE_WINDOW:
            row.online_since = now
        row.seen_at, row.mission_version_id = now, payload.mission_version_id
    db.commit()
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.recipient_id == auth.user.id, Notification.read_at.is_(None))) or 0
    return {"interval_seconds": HEARTBEAT_SECONDS, "unread": unread}


def presence_of(db: Session, user_ids: list[int], now: datetime) -> dict[int, dict]:
    rows = {p.user_id: p for p in db.scalars(select(Presence).where(Presence.user_id.in_(user_ids)))} if user_ids else {}
    out = {}
    for uid in user_ids:
        row = rows.get(uid)
        seen = aware(row.seen_at) if row else None
        out[uid] = {"online": bool(seen and now - seen <= ONLINE_WINDOW), "seen_at": seen.isoformat() if seen else None,
                    "mission_version_id": row.mission_version_id if row and seen and now - seen <= ONLINE_WINDOW else None}
    return out


# Web Push subscriptions ------------------------------------------------------------------

class PushInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = Field(min_length=10, max_length=600)


@router.get("/push/key")
def push_key(response: Response, auth: AuthContext = Depends(current_auth)) -> dict:
    from app.config import get_settings
    from app.webpush import enabled

    response.headers["Cache-Control"] = "no-store"
    return {"enabled": enabled(), "public_key": get_settings().vapid_public_key if enabled() else None}


@router.post("/push/subscribe", status_code=201)
def push_subscribe(payload: PushInput, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    from app.webpush import allowed_endpoint, enabled

    if not enabled():
        raise HTTPException(status_code=409, detail="web push is not configured")
    if not allowed_endpoint(payload.endpoint):
        raise HTTPException(status_code=422, detail="unknown push service")
    existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if existing is not None:
        existing.user_id, existing.failures = auth.user.id, 0
    else:
        mine = db.scalars(select(PushSubscription).where(PushSubscription.user_id == auth.user.id).order_by(PushSubscription.id)).all()
        for old in mine[: max(0, len(mine) - MAX_PUSH_SUBSCRIPTIONS + 1)]:
            db.delete(old)
        db.add(PushSubscription(user_id=auth.user.id, endpoint=payload.endpoint))
    db.commit()
    return {"subscribed": True}


@router.post("/push/unsubscribe")
def push_unsubscribe(payload: PushInput, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    item = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint, PushSubscription.user_id == auth.user.id))
    if item is not None:
        db.delete(item)
        db.commit()
    return {"subscribed": False}


# Teacher settings ---------------------------------------------------------------------------

class SettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    help: bool = True
    blocked: bool = True
    block_done: bool = True
    block_done_percent: int = Field(default=80, ge=10, le=100)
    auto_soon: bool = True
    auto_done: bool = True
    disconnect: bool = True
    student_block_open: bool = True
    student_help_handled: bool = True


@router.get("/teacher/notification-settings")
def get_settings_route(response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return teacher_settings(db, auth.user.id)


@router.put("/teacher/notification-settings")
def put_settings(payload: SettingsInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    row = db.get(NotificationSetting, auth.user.id)
    if row is None:
        db.add(NotificationSetting(user_id=auth.user.id, data=payload.model_dump()))
    else:
        row.data = payload.model_dump()
    db.commit()
    return teacher_settings(db, auth.user.id)


# Teacher messages to students ---------------------------------------------------------------

class MessageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=280)
    # Empty or missing = the whole class.
    student_ids: list[int] = Field(default_factory=list, max_length=200)

    @field_validator("text")
    @classmethod
    def plain(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value or HTML_TAG.search(value):
            raise ValueError("Message: plain text, 280 characters at most")
        return value


def class_of(db: Session, auth: AuthContext, assignment_id: int):
    from app.teacher_dashboard import class_students, owned_class

    assignment, release, cohort = owned_class(db, auth, assignment_id)
    return assignment, release, cohort, class_students(db, cohort.id)


@router.post("/teacher/classes/{assignment_id}/messages", status_code=201)
def send_message(assignment_id: int, payload: MessageInput, auth: AuthContext = Depends(require_teacher_csrf),
                 db: Session = Depends(get_db)) -> dict:
    """Message to the class or to some students: shown as a toast, kept in their history, read receipts."""
    from app.teacher_dashboard import audit

    assignment, _, _, students = class_of(db, auth, assignment_id)
    ids = {s.id for s in students if s.enabled}
    targets = sorted(ids if not payload.student_ids else ids & set(payload.student_ids))
    if payload.student_ids and len(targets) != len(set(payload.student_ids)):
        raise HTTPException(status_code=404, detail="student not found")
    if not targets:
        raise HTTPException(status_code=422, detail="no recipient")
    now = utcnow()
    recent = db.execute(select(Notification.data, Notification.created_at).where(
        Notification.sender_id == auth.user.id, Notification.kind == "message", Notification.created_at >= now - timedelta(hours=1))).all()
    per_hour = {(d or {}).get("message_id") for d, _ in recent}
    per_minute = {(d or {}).get("message_id") for d, created in recent if aware(created) >= now - timedelta(minutes=1)}
    if len(per_minute) >= MESSAGES_PER_MINUTE or len(per_hour) >= MESSAGES_PER_HOUR:
        raise HTTPException(status_code=429, detail={"code": "messages", "retry_after": 60, "message": "Trop de messages : attendez une minute."},
                            headers={"Retry-After": "60"})
    message_id = uuid.uuid4().hex
    created = notify(db, targets, "message", payload.text, sender_id=auth.user.id,
                     data={"message_id": message_id, "assignment_id": assignment.id, "whole_class": not payload.student_ids})
    audit(db, auth, "message.send", assignment.id, {"message_id": message_id, "recipients": len(created), "whole_class": not payload.student_ids,
                                                    "text": payload.text})
    db.commit()
    push_after_commit(db, created)
    return {"message_id": message_id, "recipients": len(created)}


@router.get("/teacher/classes/{assignment_id}/messages")
def sent_messages(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> list[dict]:
    """Messages sent to this class, newest first, with read receipts per student."""
    response.headers["Cache-Control"] = "no-store"
    _, _, _, students = class_of(db, auth, assignment_id)
    names = {s.id: display_name(s.username) for s in students}
    rows = db.scalars(select(Notification).where(Notification.sender_id == auth.user.id, Notification.kind == "message",
                                                 Notification.recipient_id.in_(list(names))).order_by(Notification.id.desc()).limit(600)).all()
    grouped: dict[str, dict] = {}
    for item in rows:
        data = item.data or {}
        if data.get("assignment_id") != assignment_id:
            continue
        entry = grouped.setdefault(data.get("message_id", str(item.id)), {
            "message_id": data.get("message_id"), "text": item.text, "created_at": aware(item.created_at).isoformat(),
            "whole_class": bool(data.get("whole_class")), "recipients": []})
        entry["recipients"].append({"student": names.get(item.recipient_id, "?"),
                                    "read_at": aware(item.read_at).isoformat() if item.read_at else None})
    out = list(grouped.values())[:50]
    for entry in out:
        entry["recipients"].sort(key=lambda r: r["student"])
        entry["read_count"] = sum(1 for r in entry["recipients"] if r["read_at"])
    return out


# Per-student block unlock -------------------------------------------------------------------

def personal_blocks(db: Session, user_id: int, cohort_ids: list[int]) -> set[int]:
    if not cohort_ids:
        return set()
    return set(db.scalars(select(BlockUnlock.chapter_id).where(BlockUnlock.user_id == user_id, BlockUnlock.cohort_id.in_(cohort_ids))).all())


def find_block(release: CourseRelease, chapter_id: int) -> dict:
    from app.student import blocks_of

    block = next((item for item in blocks_of(release.student_snapshot) if item["chapter_id"] == chapter_id), None)
    if block is None:
        raise HTTPException(status_code=404, detail="block not found")
    return block


@router.post("/teacher/classes/{assignment_id}/blocks/{chapter_id}/students/{user_id}/unlock")
def unlock_block_for(assignment_id: int, chapter_id: int, user_id: int, auth: AuthContext = Depends(require_teacher_csrf),
                     db: Session = Depends(get_db)) -> dict:
    """Open one block for one student only. Idempotent, audited, the student is notified."""
    from app.teacher_dashboard import audit

    assignment, release, cohort, students = class_of(db, auth, assignment_id)
    student = next((s for s in students if s.id == user_id and s.enabled), None)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")
    block = find_block(release, chapter_id)
    exists = db.scalar(select(BlockUnlock).where(BlockUnlock.cohort_id == cohort.id, BlockUnlock.chapter_id == chapter_id, BlockUnlock.user_id == user_id))
    created: list[int] = []
    if exists is None:
        db.add(BlockUnlock(cohort_id=cohort.id, chapter_id=chapter_id, user_id=user_id, unlocked_by=auth.user.id))
        audit(db, auth, "block.unlock_student", assignment.id, {"block": block["title"], "student": display_name(student.username)})
        created = notify(db, [user_id], "block_unlocked", f"Le bloc « {block['title']} » est ouvert pour vous.", sender_id=auth.user.id,
                         data={"chapter_id": chapter_id}, dedup=f"unlock:{cohort.id}:{chapter_id}")
        db.commit()
        push_after_commit(db, created)
    return {"chapter_id": chapter_id, "user_id": user_id, "unlocked": True, "changed": exists is None}


@router.post("/teacher/classes/{assignment_id}/blocks/{chapter_id}/students/{user_id}/relock")
def relock_block_for(assignment_id: int, chapter_id: int, user_id: int, auth: AuthContext = Depends(require_teacher_csrf),
                     db: Session = Depends(get_db)) -> dict:
    """Withdraw a per-student opening (the block stays open if the whole class has it). Audited."""
    from app.teacher_dashboard import audit

    assignment, release, cohort, students = class_of(db, auth, assignment_id)
    student = next((s for s in students if s.id == user_id), None)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")
    block = find_block(release, chapter_id)
    item = db.scalar(select(BlockUnlock).where(BlockUnlock.cohort_id == cohort.id, BlockUnlock.chapter_id == chapter_id, BlockUnlock.user_id == user_id))
    if item is not None:
        db.delete(item)
        audit(db, auth, "block.relock_student", assignment.id, {"block": block["title"], "student": display_name(student.username)})
        db.commit()
    return {"chapter_id": chapter_id, "user_id": user_id, "unlocked": False, "changed": item is not None}


# The teacher's live grid ---------------------------------------------------------------------

@router.get("/teacher/classes/{assignment_id}/live")
def live_grid(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    """Students × blocks: done / in progress / not started / closed, « ouvert pour lui », presence, help, fast clicks."""
    from app.progress import definitions
    from app.student import blocks_of, flatten

    response.headers["Cache-Control"] = "no-store"
    assignment, release, cohort, students = class_of(db, auth, assignment_id)
    now = utcnow()
    ids = [s.id for s in students]
    missions = flatten(release.student_snapshot)
    vids = [m["mission_version_id"] for m in missions]
    defs = definitions(db, vids)
    titles = {m["mission_version_id"]: m["title"] for m in missions}
    solved: set[tuple[int, int]] = set()
    tried: set[tuple[int, int]] = set()
    fast: dict[int, int] = {}
    for item in db.scalars(select(MissionAttempt).where(MissionAttempt.user_id.in_(ids), MissionAttempt.mission_version_id.in_(vids))).all() if ids and vids else []:
        tried.add((item.user_id, item.mission_version_id))
        if item.is_correct:
            solved.add((item.user_id, item.mission_version_id))
        if item.fast:
            fast[item.user_id] = fast.get(item.user_id, 0) + 1
    help_by = {h.user_id for h in db.scalars(select(HelpRequest).where(HelpRequest.user_id.in_(ids), HelpRequest.status == "pending",
                                                                      HelpRequest.mission_version_id.in_(vids))).all()} if ids and vids else set()
    opened = {s.chapter_id for s in db.scalars(select(BlockState).where(BlockState.cohort_id == cohort.id, BlockState.opened_at.is_not(None)))}
    personal: dict[int, set[int]] = {}
    for item in db.scalars(select(BlockUnlock).where(BlockUnlock.cohort_id == cohort.id)):
        personal.setdefault(item.user_id, set()).add(item.chapter_id)
    presence = presence_of(db, ids, now)
    blocks = []
    for position, block in enumerate(blocks_of(release.student_snapshot), start=1):
        core = [m["mission_version_id"] for m in block["missions"] if m["mission_version_id"] in defs and not defs[m["mission_version_id"]].bonus]
        blocks.append({"chapter_id": block["chapter_id"], "position": position, "title": block["title"], "module": block["module"],
                       "open": block["chapter_id"] in opened, "core": core})
    rows = []
    for student in students:
        cells = []
        for block in blocks:
            mine = block["chapter_id"] in personal.get(student.id, set())
            available = block["open"] or mine
            done = sum(1 for vid in block["core"] if (student.id, vid) in solved)
            started = any((student.id, vid) in tried for vid in block["core"])
            state = ("closed" if not available else "done" if block["core"] and done == len(block["core"])
                     else "in_progress" if started else "not_started")
            cells.append({"chapter_id": block["chapter_id"], "state": state, "done": done, "total": len(block["core"]), "for_student": mine and not block["open"]})
        here = presence[student.id]
        rows.append({"id": student.id, "name": display_name(student.username), "online": here["online"], "seen_at": here["seen_at"],
                     "mission": titles.get(here["mission_version_id"]) if here["mission_version_id"] else None,
                     "help": student.id in help_by, "fast_attempts": fast.get(student.id, 0), "cells": cells})
    return {"generated_at": now.isoformat(), "assignment_id": assignment.id,
            "online_count": sum(1 for r in rows if r["online"]), "student_count": len(rows),
            "blocks": [{k: v for k, v in b.items() if k != "core"} | {"mission_count": len(b["core"])} for b in blocks], "students": rows}
