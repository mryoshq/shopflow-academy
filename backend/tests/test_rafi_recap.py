"""Rafi's class settings, scheduled recaps and real completion transitions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.announcements import record_attempt, session_recaps
from app.models import Assignment, BlockState, Course, CourseRelease, MissionAttempt, Notification
from app.project_reminders import TZ
from app.student import flatten
from test_classroom import definition, give_to_class, two_block_course
from test_project import put
from test_student import attempt, choice_id, env, post  # noqa: F401
from test_teacher_dashboard import other_teacher


def uid(client):
    return client.get("/api/v1/auth/me").json()["id"]


def fixture(clients, engine):
    teacher = clients["teacher"]
    built = two_block_course(teacher, "rafi-recap-fictif")
    objective = post(teacher, f"/api/v1/teacher/courses/{built['course']}/objectives",
                     {"code": "REC", "statement": "Activité fictive"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{built['course']}/modules", {"title": "Lectures fictives"}).json()["id"]
    lesson_block = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Lecture"}).json()["id"]
    specs = [
        (built["chapters"]["Bloc A"], "a3", definition(objective, "a3")),
        (built["chapters"]["Bloc A"], "a4", {"kind": "lesson", "scenario": "Texte fictif", "body": "Lire.", "instructions": "Lire.",
                                             "objective_ids": [objective], "max_points": 0, "estimated_duration_minutes": 1}),
        (lesson_block, "lesson", {"kind": "lesson", "scenario": "Texte fictif", "body": "Lire.", "instructions": "Lire.",
                                 "objective_ids": [objective], "max_points": 0, "estimated_duration_minutes": 1}),
    ]
    for chapter, slug, content in specs:
        reply = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": slug, "title": slug, "sort_order": 8, "definition": content})
        assert reply.status_code == 201, reply.text
    klass = give_to_class(teacher, engine, built["course"])
    prefix = f"/api/v1/teacher/classes/{klass['assignment']}"
    for chapter in (built["chapters"]["Bloc A"], lesson_block):
        assert post(teacher, f"{prefix}/blocks/{chapter}/open").status_code == 200
    with Session(engine) as db:
        release = db.get(CourseRelease, klass["release"])
        versions = {m["slug"]: m["mission_version_id"] for m in flatten(release.student_snapshot)}
    return built, klass, versions


def rows(db, kind):
    return db.scalars(select(Notification).where(Notification.kind == kind).order_by(Notification.id)).all()


def test_silence_settings_independent_and_class_scoped(env):
    clients, engine = env
    _, klass, _ = fixture(clients, engine)
    a, teacher, outsider = clients["a"], clients["teacher"], clients["out"]
    url = f"/api/v1/teacher/classes/{klass['assignment']}/rafi"
    assert put(a, url, {"silent": True}).status_code == 403
    assert put(other_teacher(engine), url, {"silent": True}).status_code == 404
    assert put(teacher, url, {"recap_at": "25:00"}).status_code == 422
    assert put(teacher, url, {"silent": True, "recap_at": "17:30"}).json() == {"silent": True, "recap_at": "17:30", "sounds": True}
    cfg = a.get("/api/v1/student/rafi").json()
    assert cfg["silent"] is True and cfg["sounds"] is True and cfg["next"]["kind"] == "mission"
    assert "next" not in a.get("/api/v1/student/rafi?settings_only=true").json()
    assert outsider.get("/api/v1/student/rafi").json()["silent"] is False
    general = teacher.get("/api/v1/teacher/notification-settings").json()
    assert "rafi_class_announcements" not in general
    assert put(teacher, "/api/v1/teacher/notification-settings", general).status_code == 200
    assert put(teacher, url, {"sounds": False}).json() == {"silent": True, "recap_at": "17:30", "sounds": False}
    assert put(teacher, url, {"recap_at": None}).json()["recap_at"] is None


@pytest.mark.parametrize("date", [(2026, 1, 15), (2026, 3, 1)])
def test_recap_local_hour_single_per_day_and_archives(env, date):
    clients, engine = env
    built, klass, versions = fixture(clients, engine)
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    aid, bid = uid(a), uid(b)
    url = f"/api/v1/teacher/classes/{klass['assignment']}/rafi"
    now = datetime(*date, 17, 30, tzinfo=TZ).astimezone(timezone.utc)
    with Session(engine) as db:
        for row in db.scalars(select(BlockState).where(BlockState.cohort_id == klass["cohort"])):
            row.opened_at = now - timedelta(hours=5)
        db.add(MissionAttempt(user_id=aid, mission_version_id=versions["a1"], course_release_id=klass["release"],
                              idempotency_key="recap-a1-done", answer={}, is_correct=True, points=5, created_at=now - timedelta(hours=1)))
        db.commit()
        assert session_recaps(db, now) == []  # disabled until the teacher sets an hour
    assert put(teacher, url, {"recap_at": "17:30"}).status_code == 200
    with Session(engine) as db:
        assert session_recaps(db, now - timedelta(minutes=1)) == []
        assignment = db.get(Assignment, klass["assignment"])
        assignment.paused_at = now
        db.commit()
        assert session_recaps(db, now) == []
        assignment.paused_at = None
        db.commit()
    # Two independent workers can see the same due recap, but only one row per student is committed.
    def tick():
        with Session(engine) as db:
            return session_recaps(db, now)
    with ThreadPoolExecutor(2) as pool:
        assert sorted([user for result in pool.map(lambda _: tick(), range(2)) for user in result]) == sorted([aid, bid])
    with Session(engine) as db:
        notes = {n.recipient_id: n for n in rows(db, "session_recap")}
        assert notes[aid].data == {"remaining": 1, "assignment_id": klass["assignment"], "link": f"#/mission/{versions['a3']}"}
        assert notes[bid].data["remaining"] == 2
        assert notes[aid].dedup_key.endswith(datetime(*date).date().isoformat())
        note_id = notes[aid].id
    assert put(teacher, url, {"recap_at": "18:00"}).status_code == 200
    with Session(engine) as db:
        assert session_recaps(db, now + timedelta(minutes=60)) == []
        assert session_recaps(db, now + timedelta(hours=7)) == []  # after local midnight
        assert session_recaps(db, now + timedelta(days=1, hours=1)) == []  # no class activity on this day
        db.get(Course, built["course"]).status = "archived"
        db.commit()
        assert session_recaps(db, now + timedelta(days=2)) == []
    assert all(item["kind"] != "session_recap" for item in a.get("/api/v1/notifications").json()["items"])
    assert post(a, f"/api/v1/notifications/{note_id}/read").status_code == 404
    assert all(item["kind"] != "session_recap" for item in clients["out"].get("/api/v1/notifications").json()["items"])


def test_congratulations_on_transition_only_and_once_under_concurrency(env):
    clients, engine = env
    built, klass, versions = fixture(clients, engine)
    a = clients["a"]
    aid = uid(a)
    a.get("/api/v1/student/dashboard")
    with Session(engine) as db:
        assert rows(db, "block_congratulation") == []
    bonus = versions["a2"]
    view = a.get(f"/api/v1/student/missions/{bonus}").json()
    assert attempt(a, bonus, "bonus-fictif-001", choice_ids=[choice_id(view, "Bonne réponse")]).status_code == 201
    with Session(engine) as db:
        assert rows(db, "block_congratulation") == []

    def solve(vid):
        with Session(engine) as db:
            item = MissionAttempt(user_id=aid, mission_version_id=vid, course_release_id=klass["release"],
                                  idempotency_key=f"rafi-test-{vid}", answer={}, is_correct=True, points=5)
            recipients = record_attempt(db, db.get(CourseRelease, klass["release"]), item)
            db.commit()
            return recipients

    with ThreadPoolExecutor(2) as pool:
        assert [user for result in pool.map(solve, [versions["a1"], versions["a3"]]) for user in result] == [aid]
    assert post(a, f"/api/v1/student/missions/{versions['lesson']}/understood").status_code == 201
    assert post(a, f"/api/v1/student/missions/{versions['lesson']}/understood").status_code == 200
    version = versions["a1"]
    view = a.get(f"/api/v1/student/missions/{version}").json()
    assert attempt(a, version, "rafi-encore-001", choice_ids=[choice_id(view, "Bonne réponse")]).status_code == 201
    with Session(engine) as db:
        sent = rows(db, "block_congratulation")
        assert len(sent) == 2
        assert sent[0].data["chapter_id"] == built["chapters"]["Bloc A"]
        assert {item.recipient_id for item in sent} == {aid}
        assert all(item.data["assignment_id"] == klass["assignment"] for item in sent)
        db.get(Course, built["course"]).status = "archived"
        db.commit()
    assert all(item["kind"] != "block_congratulation" for item in a.get("/api/v1/notifications").json()["items"])


def test_preexisting_completion_does_not_congratulate_after_republication(env):
    from app.models import MissionVersion

    clients, engine = env
    built, klass, versions = fixture(clients, engine)
    a, teacher = clients["a"], clients["teacher"]
    aid = uid(a)
    with Session(engine) as db:
        for slug in ("a1", "a3"):
            db.add(MissionAttempt(user_id=aid, mission_version_id=versions[slug], course_release_id=klass["release"],
                                  idempotency_key=f"rafi-ancien-{slug}", answer={}, is_correct=True, points=5))
        old = db.get(MissionVersion, versions["a1"])
        mission_id = old.mission_id
        revised = {**old.definition_private, "scenario": "Nouveau texte fictif, mêmes réponses."}
        db.commit()
    assert put(teacher, f"/api/v1/teacher/missions/{mission_id}/draft", revised).status_code == 200
    release = post(teacher, f"/api/v1/teacher/courses/{built['course']}/publish").json()["id"]
    with Session(engine) as db:
        db.get(Assignment, klass["assignment"]).course_release_id = release
        updated = next(m["mission_version_id"] for m in flatten(db.get(CourseRelease, release).student_snapshot) if m["slug"] == "a1")
        assert updated != versions["a1"]
        db.commit()
    view = a.get(f"/api/v1/student/missions/{updated}").json()
    assert view["status"] == "completed"
    assert attempt(a, updated, "rafi-nouveau-001", choice_ids=[choice_id(view, "Bonne réponse")]).status_code == 201
    with Session(engine) as db:
        assert rows(db, "block_congratulation") == []
