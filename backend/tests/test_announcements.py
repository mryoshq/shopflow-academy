"""ADR-0047: announcements presented by Rafi (open blocks not finished, countdown, class-wide sounds)."""

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

import app.announcements as announcements
from app.announcements import open_block_text, open_blocks
from app.models import Assignment, BlockState, Chapter, MissionAttempt, MissionVersion, Notification, User
from app.progress import definitions
from app.project_reminders import TZ
from test_project import project, put  # noqa: F401  (fixture reuse)
from test_student import env, post  # noqa: F401  (fixture reuse)


def at(day: datetime, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day.date(), time(hour, minute), TZ)


def test_open_blocks_not_finished_once_per_student_and_block_from_nine_the_next_day(project):
    clients, engine, assignment = project
    a, b = clients["a"], clients["b"]
    me, other = a.get("/api/v1/auth/me").json()["id"], b.get("/api/v1/auth/me").json()["id"]
    today = datetime.now(TZ)
    with Session(engine) as db:
        klass = db.get(Assignment, assignment)
        chapter = db.scalar(select(Chapter.id).order_by(Chapter.id))
        state = db.scalar(select(BlockState).where(BlockState.cohort_id == klass.cohort_id, BlockState.chapter_id == chapter)) \
            or BlockState(cohort_id=klass.cohort_id, chapter_id=chapter)
        state.opened_at = at(today, 15)  # opened today: nothing today
        db.add(state)
        # B finishes every graded mission of the block: never reminded.
        versions = db.scalars(select(MissionVersion.id).order_by(MissionVersion.id)).all()
        defs = definitions(db, list(versions))
        for vid, definition in defs.items():
            if not definition.bonus:
                db.add(MissionAttempt(user_id=other, course_release_id=klass.course_release_id, mission_version_id=vid,
                                      idempotency_key=f"done-{vid}", answer={}, is_correct=True, points=definition.max_points))
        db.commit()
    announcements._checked.clear()
    with Session(engine) as db:
        assert open_blocks(db, at(today, 20)) == []  # opened today
    tomorrow = today + timedelta(days=1)
    announcements._checked.clear()
    with Session(engine) as db:
        assert open_blocks(db, at(tomorrow, 8, 59)) == []  # before 9:00 Morocco time
        assert open_blocks(db, at(tomorrow, 9, 1)) == [me]  # B has finished
        assert open_blocks(db, at(tomorrow, 10)) == []  # once a day in this process
        announcements._checked.clear()
        assert open_blocks(db, at(tomorrow + timedelta(days=1), 9, 30)) == []  # and once per block (dedup key)
        sent = db.scalars(select(Notification).where(Notification.kind == "open_blocks")).all()
        title = db.get(Chapter, chapter).title
        assert [(n.recipient_id, n.text) for n in sent] == [(me, open_block_text(title))]
        assert sent[0].data["link"].startswith("#/mission/") and sent[0].data["chapter_id"] == chapter
    # The student sees it in the feed (Rafi presents it), with its link.
    feed = a.get("/api/v1/notifications").json()["items"]
    assert any(item["kind"] == "open_blocks" and item["data"]["link"].startswith("#/mission/") for item in feed)


def test_countdown_and_class_wide_sounds(project):
    clients, engine, assignment = project
    a, teacher = clients["a"], clients["teacher"]
    dashboard = a.get("/api/v1/student/dashboard").json()
    assert dashboard["next_deadline"] is None and dashboard["rafi"] == {"sounds": True}
    base = f"/api/v1/teacher/classes/{assignment}/project"
    soon = datetime.combine((datetime.now(TZ) + timedelta(days=3)).date(), time(23, 59), TZ)
    later = soon + timedelta(days=7)
    post(teacher, f"{base}/milestones", {"title": "Rendu final", "due_at": later.isoformat()})
    first = post(teacher, f"{base}/milestones", {"title": "Conception", "due_at": soon.isoformat()}).json()
    post(teacher, f"{base}/milestones", {"title": "Passé", "due_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()})
    nxt = a.get("/api/v1/student/dashboard").json()["next_deadline"]
    assert (nxt["title"], nxt["submitted"], nxt["link"]) == ("Conception", False, "#/projet")
    assert nxt["due_local"] == soon.strftime("%Y-%m-%dT23:59")
    pair = [a.get("/api/v1/auth/me").json()["id"], clients["b"].get("/api/v1/auth/me").json()["id"]]
    assert post(teacher, f"{base}/teams", {"user_ids": pair}).status_code == 201
    submitted = post(a, f"/api/v1/student/project/milestones/{first['id']}/submissions", {"text": "Version 1"})
    assert submitted.status_code == 201, submitted.text
    assert a.get("/api/v1/student/dashboard").json()["next_deadline"]["submitted"] is True

    # Rafi's sounds: the teacher switches them off for the whole class; their other settings are kept.
    url = f"/api/v1/teacher/classes/{assignment}/rafi"
    assert teacher.get(url).json() == {"sounds": True}
    assert put(a, url, {"sounds": False}).status_code == 403
    assert put(teacher, url, {"sounds": False}).json() == {"sounds": False}
    assert a.get("/api/v1/student/dashboard").json()["rafi"] == {"sounds": False}
    assert a.get("/api/v1/student/rafi").json() == {"sounds": False}
    assert teacher.get("/api/v1/student/rafi").status_code == 403
    settings = teacher.get("/api/v1/teacher/notification-settings").json()
    assert "rafi_muted_assignments" not in settings
    assert put(teacher, "/api/v1/teacher/notification-settings", settings).status_code == 200
    assert a.get("/api/v1/student/dashboard").json()["rafi"] == {"sounds": False}  # kept by the other settings
    assert put(teacher, url, {"sounds": True}).json() == {"sounds": True}
    assert a.get("/api/v1/student/dashboard").json()["rafi"] == {"sounds": True}
    with Session(engine) as db:
        assert db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
