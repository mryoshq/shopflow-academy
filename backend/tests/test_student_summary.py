"""Fictitious data only: the teacher summary never computes a new grade or changes attempts."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from app.models import CourseRelease, HelpRequest, MissionAttempt, User
from app.student import flatten
from app.progress import course_score, mission_scores
from app.main import app
from test_student import env, post  # noqa: F401
from test_republication import setup_course, graded, lesson
from test_teacher_dashboard import other_teacher
from test_security_matrix import observer_client


def prepared(env):
    clients, engine = env
    bonus = lambda objective: {**graded(4)(objective), "bonus": True}
    klass, _ = setup_course(clients["teacher"], engine, "fiche-fictive", {
        "Ouvert": [("ok", graded(10)), ("reprendre", graded(10)), ("jamais", graded(10)), ("bonus", bonus), ("lecon", lambda o: lesson(o, "Texte fictif"))],
        "Fermé": [("attendre", graded(10))],
    })
    with Session(engine) as db:
        release = db.get(CourseRelease, klass["release"])
        missions = flatten(release.student_snapshot)
        user = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
        by_slug = {item["slug"]: item for item in missions}
        for index, (slug, points, correct, percent) in enumerate([("ok", 7, True, 70), ("reprendre", 2.5, False, 50), ("bonus", 3, True, 75), ("lecon", 0, True, None)]):
            db.add(MissionAttempt(user_id=user, mission_version_id=by_slug[slug]["mission_version_id"], course_release_id=klass["release"], idempotency_key=f"summary-{index:04d}", answer={}, points=points, is_correct=correct, percent=percent))
        db.add(HelpRequest(user_id=user, mission_version_id=by_slug["reprendre"]["mission_version_id"], course_release_id=klass["release"], message="Aide fictive", status="pending"))
        db.commit()
    assert post(clients["teacher"], f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{by_slug['attendre']['chapter_id']}/close").status_code == 200
    return clients, engine, klass, user, by_slug


def test_summary_uses_retained_points_counts_and_separate_lessons_bonus(env):
    clients, engine, klass, user, missions = prepared(env)
    url = f"/api/v1/teacher/classes/{klass['assignment']}/students/{user}"
    got = clients["teacher"].get(url)
    assert got.status_code == 200 and got.headers["cache-control"] == "no-store"
    summary = got.json()["summary"]
    assert (summary["core_points"], summary["core_possible"], summary["bonus_points"], summary["bonus_possible"]) == (9.5, 40, 3, 4)
    assert (summary["completed"], summary["total"], summary["remaining"]) == (2, 5, 3)
    assert (summary["attempted_unfinished"], summary["not_started_open"], summary["not_started_closed"], summary["not_started_locked"]) == (1, 1, 1, 0)
    assert summary["lessons_read"] == 1 and summary["lessons_total"] == 1
    assert summary["help_pending_count"] == 1 and summary["help_pending"][0]["mission"] == "Ouvert reprendre"
    assert summary["last_activity"] is not None
    with Session(engine) as db:
        same = course_score(mission_scores(db, user, [m["mission_version_id"] for m in missions.values()]))
        assert all(summary[key] == value for key, value in same.items())
    assert "correct_ids" not in got.text and "answer" not in got.text


def test_detail_remains_owner_and_class_member_only(env):
    clients, engine, klass, user, _ = prepared(env)
    url = f"/api/v1/teacher/classes/{klass['assignment']}/students/{user}"
    assert clients["a"].get(url).status_code == 403
    assert observer_client(clients).get(url).status_code == 403
    assert other_teacher(engine).get(url).status_code == 404
    assert TestClient(app).get(url).status_code == 401
    with Session(engine) as db:
        outsider = db.scalar(select(User.id).where(User.username == "prenom.nom@example.com"))
    assert clients["teacher"].get(f"/api/v1/teacher/classes/{klass['assignment']}/students/{outsider}").status_code == 404


def test_summary_is_not_limited_to_the_last_hundred_attempts(env):
    clients, engine, klass, user, missions = prepared(env)
    with Session(engine) as db:
        for n in range(105):
            db.add(MissionAttempt(user_id=user, mission_version_id=missions["reprendre"]["mission_version_id"], course_release_id=klass["release"], idempotency_key=f"many-summary-{n:04d}", answer={}, points=0, is_correct=False))
        db.commit()
    data = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['assignment']}/students/{user}").json()
    assert len(data["attempts"]) == 100
    assert data["summary"]["core_points"] == 9.5 and data["summary"]["completed"] == 2


def test_summary_keeps_an_earlier_version_score_and_personal_block_access(env):
    from test_carryover import republish
    from app.models import MissionVersion
    clients, engine, klass, user, missions = prepared(env)
    with Session(engine) as db:
        old = db.get(MissionVersion, missions["ok"]["mission_version_id"])
        revised = dict(old.definition_private)
        revised["scenario"] = "Autre texte fictif, notation inchangée."
    republish(clients["teacher"], engine, klass, "ok", revised)
    url = f"/api/v1/teacher/classes/{klass['assignment']}/students/{user}"
    data = clients["teacher"].get(url).json()
    assert data["summary"]["core_points"] == 9.5 and data["summary"]["completed"] == 2
    assert not any(attempt["mission"] == "Ouvert ok" for attempt in data["attempts"])
    block = missions["attendre"]["chapter_id"]
    assert post(clients["teacher"], f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{block}/students/{user}/unlock").status_code == 200
    data = clients["teacher"].get(url).json()
    assert data["summary"]["not_started_closed"] == 0 and data["summary"]["not_started_open"] == 2
    assert next(m for m in data["missions"] if m["title"] == "Fermé attendre")["block_open"] is True


def test_handling_help_does_not_move_last_activity_backwards(env):
    from datetime import datetime, timezone
    clients, engine, klass, user, _ = prepared(env)
    latest = datetime(2024, 7, 2, 12, 0, tzinfo=timezone.utc)
    with Session(engine) as db:
        for attempt in db.scalars(select(MissionAttempt).where(MissionAttempt.user_id == user)):
            attempt.created_at = datetime(2024, 7, 1, 12, 0, tzinfo=timezone.utc)
        request = db.scalar(select(HelpRequest).where(HelpRequest.user_id == user))
        request.created_at = latest
        request_id = request.id
        db.commit()
    url = f"/api/v1/teacher/classes/{klass['assignment']}/students/{user}"
    before = clients["teacher"].get(url).json()["summary"]
    assert before["help_pending_count"] == 1
    assert before["last_activity"] == latest.isoformat()
    assert post(clients["teacher"], f"/api/v1/teacher/help/{request_id}/handle").status_code == 200
    after = clients["teacher"].get(url).json()["summary"]
    assert after["help_pending_count"] == 0
    assert after["last_activity"] == before["last_activity"]
    assert after["core_points"] == before["core_points"]
