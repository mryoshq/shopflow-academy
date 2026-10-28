"""Automatic block opening and teacher events (sprint 2, part H, ADR-0023).

Optional mode, off by default. The teacher gives an end time; the remaining time is shared
between the current block and the closed blocks in proportion to their estimated duration
(weighted schedule), shown before activation. A background check (``tick``, every 15 s)
opens each block when its time comes; after a restart it catches up with the blocks whose
time has passed. Nothing is ever closed automatically.

Controls: pause / resume (the remaining times move by the length of the pause), shift by
N minutes, advance (open the next planned block now), stop, and a recalculation proposal
when the plan no longer matches what remains (blocks opened by hand, late start). Every
action is audited; the teacher is notified 2 minutes before and after each opening.

The same check raises the teacher's events that depend on time: block completed by X %
of the class, student disconnected.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, display_name, require_teacher, require_teacher_csrf, utcnow
from app.database import get_db
from app.live import DISCONNECT_AFTER, notify, push_after_commit, teacher_event, teacher_settings
from app.models import (
    Assignment, AuditEvent, BlockPlan, BlockState, Course, CourseRelease, MissionAttempt, Presence, User,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["autoplan"])
log = logging.getLogger("academy.autoplan")
DEFAULT_BLOCK_MINUTES = 15
SOON = timedelta(minutes=2)
DRIFT = timedelta(minutes=5)
DISCONNECT_FORGET = timedelta(minutes=10)


def parse_time(value: str) -> datetime:
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="invalid time") from error
    if moment.tzinfo is None:
        raise HTTPException(status_code=422, detail="time zone required")
    return moment


def weights(db: Session, release: CourseRelease) -> list[dict]:
    """Blocks in order with their weight (estimated minutes of the main missions)."""
    from app.progress import definitions
    from app.student import blocks_of

    blocks = blocks_of(release.student_snapshot)
    ids = [m["mission_version_id"] for b in blocks for m in b["missions"]]
    defs = definitions(db, ids)
    out = []
    for block in blocks:
        minutes = sum(defs[m["mission_version_id"]].estimated_duration_minutes for m in block["missions"]
                      if m["mission_version_id"] in defs and not defs[m["mission_version_id"]].bonus)
        out.append({"chapter_id": block["chapter_id"], "title": block["title"], "minutes": minutes or DEFAULT_BLOCK_MINUTES})
    return out


def open_ids(db: Session, cohort_id: int) -> dict[int, datetime]:
    return {s.chapter_id: aware(s.opened_at) for s in db.scalars(select(BlockState).where(BlockState.cohort_id == cohort_id, BlockState.opened_at.is_not(None)))}


def schedule(blocks: list[dict], opened: dict[int, datetime], start: datetime, end: datetime) -> list[dict]:
    """Weighted plan from ``start`` to ``end`` for the closed blocks, the latest open block counting first."""
    closed = [b for b in blocks if b["chapter_id"] not in opened]
    if not closed:
        return []
    current = max((b for b in blocks if b["chapter_id"] in opened), key=lambda b: opened[b["chapter_id"]], default=None)
    segments = ([current] if current else []) + closed
    total = sum(b["minutes"] for b in segments)
    span = max(timedelta(0), end - start)
    items, elapsed = [], 0
    for block in segments:
        if block is not current:
            items.append({"chapter_id": block["chapter_id"], "title": block["title"], "minutes": block["minutes"],
                          "at": (start + span * (elapsed / total)).isoformat()})
        elapsed += block["minutes"]
    return items


def class_context(db: Session, auth: AuthContext, assignment_id: int):
    from app.teacher_dashboard import owned_class

    return owned_class(db, auth, assignment_id)


def plan_out(db: Session, plan: BlockPlan | None, release: CourseRelease, cohort_id: int, now: datetime) -> dict:
    blocks = weights(db, release)
    opened = open_ids(db, cohort_id)
    proposal: list[dict] = []
    if plan and plan.enabled and plan.end_at:
        remaining = [i for i in plan.items if i["chapter_id"] not in opened]
        fresh = schedule(blocks, opened, now, aware(plan.end_at))
        planned = {i["chapter_id"]: datetime.fromisoformat(i["at"]) for i in remaining}
        drift = (set(planned) != {i["chapter_id"] for i in fresh}
                 or any(abs(datetime.fromisoformat(i["at"]) - planned[i["chapter_id"]]) >= DRIFT for i in fresh if i["chapter_id"] in planned))
        if drift and not plan.paused_at:
            proposal = fresh
    titles = {b["chapter_id"]: b["title"] for b in blocks}
    return {
        "enabled": bool(plan and plan.enabled), "paused": bool(plan and plan.paused_at),
        "end_at": aware(plan.end_at).isoformat() if plan and plan.end_at else None,
        "items": [{**i, "title": titles.get(i["chapter_id"], i.get("title", "")), "opened": i["chapter_id"] in opened}
                  for i in (plan.items if plan else [])],
        "proposal": proposal, "server_time": now.isoformat(),
    }


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    end_at: str = Field(min_length=10, max_length=40)
    start_at: str | None = Field(default=None, max_length=40)


class ShiftInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    minutes: int = Field(ge=-120, le=240)


def checked_window(payload: PlanInput, now: datetime) -> tuple[datetime, datetime]:
    start = parse_time(payload.start_at) if payload.start_at else now
    end = parse_time(payload.end_at)
    if end <= max(start, now) or end - start > timedelta(hours=14):
        raise HTTPException(status_code=422, detail="end time must be later today")
    return start, end


@router.get("/classes/{assignment_id}/auto")
def get_plan(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    assignment, release, cohort = class_context(db, auth, assignment_id)
    return plan_out(db, db.get(BlockPlan, assignment.id), release, cohort.id, utcnow())


@router.post("/classes/{assignment_id}/auto/preview")
def preview_plan(assignment_id: int, payload: PlanInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """The weighted plan, shown before activation (nothing saved)."""
    assignment, release, cohort = class_context(db, auth, assignment_id)
    start, end = checked_window(payload, utcnow())
    return {"items": schedule(weights(db, release), open_ids(db, cohort.id), start, end), "end_at": end.isoformat()}


def save(db: Session, auth: AuthContext, assignment: Assignment, plan: BlockPlan, action: str, details: dict | None = None) -> None:
    from app.teacher_dashboard import audit

    plan.updated_by, plan.updated_at = auth.user.id, utcnow()
    audit(db, auth, action, assignment.id, details)
    db.commit()


def require_plan(db: Session, assignment: Assignment) -> BlockPlan:
    plan = db.get(BlockPlan, assignment.id)
    if plan is None or not plan.enabled:
        raise HTTPException(status_code=409, detail="automatic opening is off")
    return plan


@router.post("/classes/{assignment_id}/auto/activate")
def activate(assignment_id: int, payload: PlanInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, release, cohort = class_context(db, auth, assignment_id)
    now = utcnow()
    start, end = checked_window(payload, now)
    items = schedule(weights(db, release), open_ids(db, cohort.id), start, end)
    if not items:
        raise HTTPException(status_code=409, detail="every block is already open")
    plan = db.get(BlockPlan, assignment.id) or BlockPlan(assignment_id=assignment.id, items=[])
    db.add(plan)
    plan.enabled, plan.end_at, plan.paused_at, plan.items = True, end, None, items
    save(db, auth, assignment, plan, "auto.activate", {"end_at": end.isoformat(), "blocks": len(items)})
    return plan_out(db, plan, release, cohort.id, now)


@router.post("/classes/{assignment_id}/auto/recalculate")
def recalculate(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Accept the proposal: the remaining blocks are re-planned from now to the same end time."""
    assignment, release, cohort = class_context(db, auth, assignment_id)
    plan = require_plan(db, assignment)
    now = utcnow()
    opened = open_ids(db, cohort.id)
    plan.items = [i for i in plan.items if i["chapter_id"] in opened] + schedule(weights(db, release), opened, now, aware(plan.end_at))
    save(db, auth, assignment, plan, "auto.recalculate", {"end_at": aware(plan.end_at).isoformat()})
    return plan_out(db, plan, release, cohort.id, now)


@router.post("/classes/{assignment_id}/auto/pause")
def pause(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, release, cohort = class_context(db, auth, assignment_id)
    plan = require_plan(db, assignment)
    if plan.paused_at is None:
        plan.paused_at = utcnow()
        save(db, auth, assignment, plan, "auto.pause")
    return plan_out(db, plan, release, cohort.id, utcnow())


def moved(plan: BlockPlan, opened: dict[int, datetime], delta: timedelta) -> list[dict]:
    return [i if i["chapter_id"] in opened else {**i, "at": (datetime.fromisoformat(i["at"]) + delta).isoformat()} for i in plan.items]


@router.post("/classes/{assignment_id}/auto/resume")
def resume(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Resume: the blocks still closed move by the length of the pause (end time too)."""
    assignment, release, cohort = class_context(db, auth, assignment_id)
    plan = require_plan(db, assignment)
    if plan.paused_at is not None:
        delta = utcnow() - aware(plan.paused_at)
        plan.items = moved(plan, open_ids(db, cohort.id), delta)
        plan.end_at, plan.paused_at = aware(plan.end_at) + delta, None
        save(db, auth, assignment, plan, "auto.resume", {"shift_minutes": round(delta.total_seconds() / 60)})
    return plan_out(db, plan, release, cohort.id, utcnow())


@router.post("/classes/{assignment_id}/auto/shift")
def shift(assignment_id: int, payload: ShiftInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, release, cohort = class_context(db, auth, assignment_id)
    plan = require_plan(db, assignment)
    delta = timedelta(minutes=payload.minutes)
    plan.items = moved(plan, open_ids(db, cohort.id), delta)
    plan.end_at = aware(plan.end_at) + delta
    save(db, auth, assignment, plan, "auto.shift", {"minutes": payload.minutes})
    return plan_out(db, plan, release, cohort.id, utcnow())


@router.post("/classes/{assignment_id}/auto/advance")
def advance(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Open the next planned block now (the rest of the plan is unchanged; a recalculation is proposed)."""
    from app.classroom import set_block

    assignment, release, cohort = class_context(db, auth, assignment_id)
    plan = require_plan(db, assignment)
    opened = open_ids(db, cohort.id)
    item = next((i for i in plan.items if i["chapter_id"] not in opened), None)
    if item is None:
        raise HTTPException(status_code=409, detail="every planned block is already open")
    db.add(AuditEvent(actor_id=auth.user.id, action="auto.advance", resource_type="assignment", resource_id=assignment.id,
                      details={"block": item.get("title")}))
    set_block(db, auth, assignment, release, item["chapter_id"], True)
    return plan_out(db, plan, release, cohort.id, utcnow())


@router.post("/classes/{assignment_id}/auto/stop")
def stop(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, release, cohort = class_context(db, auth, assignment_id)
    plan = db.get(BlockPlan, assignment.id)
    if plan is not None and plan.enabled:
        plan.enabled, plan.paused_at = False, None
        save(db, auth, assignment, plan, "auto.stop")
    return plan_out(db, plan, release, cohort.id, utcnow())


# Background check -------------------------------------------------------------------------

class SystemActor:
    """``set_block`` needs an AuthContext-like object: the plan acts on behalf of its teacher."""

    def __init__(self, user: User) -> None:
        self.user = user


def tick(db: Session, now: datetime | None = None) -> dict:
    """One pass: open due blocks (catching up after a restart), warn 2 min before, teacher events.

    Idempotent: a block already open is left alone, every notification has a deduplication key.
    """
    from app.classroom import set_block

    now = now or utcnow()
    opened_count = 0
    pushes: list[int] = []
    for plan in db.scalars(select(BlockPlan).where(BlockPlan.enabled.is_(True))).all():
        assignment = db.get(Assignment, plan.assignment_id)
        release = db.get(CourseRelease, assignment.course_release_id) if assignment else None
        course = db.get(Course, release.course_id) if release else None
        teacher = db.get(User, plan.updated_by or (course.created_by if course else 0))
        if assignment is None or release is None or teacher is None or plan.paused_at:
            continue
        opened = open_ids(db, assignment.cohort_id)
        for item in plan.items:
            if item["chapter_id"] in opened:
                continue
            at = datetime.fromisoformat(item["at"])
            if at <= now:
                db.add(AuditEvent(actor_id=teacher.id, action="auto.open", resource_type="assignment", resource_id=assignment.id,
                                  details={"block": item.get("title"), "planned_at": item["at"]}))
                set_block(db, SystemActor(teacher), assignment, release, item["chapter_id"], True)
                pushes += teacher_event(db, teacher.id, "auto_done", f"Ouverture automatique : « {item.get('title')} » est ouvert.",
                                        {"chapter_id": item["chapter_id"]}, dedup=f"auto_done:{assignment.id}:{item['chapter_id']}:{item['at']}")
                opened_count += 1
                opened[item["chapter_id"]] = now
            elif at - SOON <= now:
                pushes += teacher_event(db, teacher.id, "auto_soon", f"Dans 2 min : ouverture automatique de « {item.get('title')} ».",
                                        {"chapter_id": item["chapter_id"], "at": item["at"]}, dedup=f"auto_soon:{assignment.id}:{item['chapter_id']}:{item['at']}")
        db.commit()
    pushes += class_events(db, now)
    db.commit()
    if pushes:
        push_after_commit(db, pushes)
    return {"opened": opened_count}


def class_events(db: Session, now: datetime) -> list[int]:
    """Block completed by X % of the class; student disconnected during an open block."""
    from app.progress import definitions
    from app.student import blocks_of
    from app.teacher_dashboard import class_students

    pushes: list[int] = []
    rows = db.execute(select(Assignment, CourseRelease, Course).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                      .join(Course, Course.id == CourseRelease.course_id)).all()
    for assignment, release, course in rows:
        opened = open_ids(db, assignment.cohort_id)
        if not opened:
            continue
        students = [s for s in class_students(db, assignment.cohort_id) if s.enabled]
        if not students:
            continue
        settings = teacher_settings(db, course.created_by)
        ids = [s.id for s in students]
        blocks = [b for b in blocks_of(release.student_snapshot) if b["chapter_id"] in opened]
        vids = [m["mission_version_id"] for b in blocks for m in b["missions"]]
        defs = definitions(db, vids)
        solved = set(db.execute(select(MissionAttempt.user_id, MissionAttempt.mission_version_id).where(
            MissionAttempt.is_correct.is_(True), MissionAttempt.user_id.in_(ids), MissionAttempt.mission_version_id.in_(vids))).all()) if vids else set()
        threshold = int(settings.get("block_done_percent", 80))
        for block in blocks:
            core = [m["mission_version_id"] for m in block["missions"] if m["mission_version_id"] in defs and not defs[m["mission_version_id"]].bonus]
            if not core:
                continue
            done = sum(1 for sid in ids if all((sid, vid) in solved for vid in core))
            if done * 100 >= threshold * len(ids):
                pushes += teacher_event(db, course.created_by, "block_done",
                                        f"« {block['title']} » terminé par {done} étudiant{'s' if done > 1 else ''} sur {len(ids)} ({round(done * 100 / len(ids))} %).",
                                        {"chapter_id": block["chapter_id"], "done": done, "total": len(ids)},
                                        dedup=f"block_done:{assignment.id}:{block['chapter_id']}:{threshold}")
        for row in db.scalars(select(Presence).where(Presence.user_id.in_(ids))):
            gone = now - aware(row.seen_at)
            if DISCONNECT_AFTER <= gone <= DISCONNECT_FORGET and aware(row.seen_at) - aware(row.online_since) >= timedelta(seconds=30):
                name = display_name(next(s.username for s in students if s.id == row.user_id))
                pushes += teacher_event(db, course.created_by, "disconnect", f"{name} semble déconnecté (vu il y a {int(gone.total_seconds() // 60) or 1} min).",
                                        {"student_id": row.user_id}, dedup=f"disconnect:{row.user_id}:{aware(row.online_since).isoformat()}")
    return pushes


def run_forever(stop_event: threading.Event, every: int) -> None:
    from app.database import get_engine

    while not stop_event.wait(every):
        try:
            with Session(get_engine(), expire_on_commit=False) as db:
                tick(db)
        except Exception:  # noqa: BLE001 (keep the loop alive; the next pass retries)
            log.exception("live tick failed")


def start_background(every: int) -> threading.Event | None:
    """Started once by the app (first pass right away: catch up after a restart)."""
    if every <= 0:
        return None
    stop_event = threading.Event()

    def first_then_loop() -> None:
        from app.database import get_engine

        try:
            with Session(get_engine(), expire_on_commit=False) as db:
                tick(db)
        except Exception:  # noqa: BLE001
            log.exception("live tick failed")
        run_forever(stop_event, every)

    threading.Thread(target=first_then_loop, name="live-tick", daemon=True).start()
    return stop_event
