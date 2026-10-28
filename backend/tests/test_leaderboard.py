"""K: synthetic accounts on an isolated migrated database; no course import."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.curriculum_schema import MissionDefinition
from app.leaderboard import ranked
from app.leaderboard_models import LeaderboardName, LeaderboardSettings
from app.main import app
from app.models import Assignment, BlockState, Course, CourseRelease, Enrollment, MissionAttempt, MissionVersion, User
from app.progress import course_score, mission_scores
from test_attempt_rules import set_rules
from test_student import attempt, choice_id, env, missions_of, walk_keys  # noqa: F401


def assignment(clients):
    return clients["teacher"].get("/api/v1/teacher/leaderboard/classes").json()[0]["assignment_id"]


def put(client, path, body, csrf=True):
    return client.put(path, json=body, headers={"X-CSRF-Token": client.cookies["academy_csrf"]} if csrf else {})


def enable(clients, aid, **options):
    return put(clients["teacher"], f"/api/v1/teacher/classes/{aid}/leaderboard/settings",
               {"enabled": True, "top_three": False, "hide_open_block": False, **options})


def read(client, aid, teacher=False):
    return client.get(f"/api/v1/{'teacher' if teacher else 'student'}/classes/{aid}/leaderboard")


def record(db, user_id, release_id, version_id, key, points, correct=True, at=None):
    db.add(MissionAttempt(user_id=user_id, course_release_id=release_id, mission_version_id=version_id,
                          idempotency_key=key, answer={}, is_correct=correct, points=points,
                          created_at=at or datetime.now(timezone.utc)))


def test_disabled_default_membership_roles_csrf_and_private_projection(env):
    clients, engine = env
    aid = assignment(clients)
    assert read(clients["a"], aid).status_code == 404
    assert clients["a"].get("/api/v1/student/leaderboard/classes").json() == []
    assert read(clients["teacher"], aid, teacher=True).json()["settings"]["enabled"] is False
    assert read(TestClient(app), aid).status_code == 401
    assert read(clients["a"], aid, teacher=True).status_code == 403
    assert read(clients["teacher"], aid).status_code == 403
    options = {"enabled": True, "top_three": False, "hide_open_block": False}
    path = f"/api/v1/teacher/classes/{aid}/leaderboard/settings"
    assert put(clients["teacher"], path, options, csrf=False).status_code == 403
    assert put(clients["a"], path, options).status_code == 403
    assert put(clients["teacher"], path, options).status_code == 200
    assert read(clients["out"], aid).status_code == 404
    assert read(clients["a"], 999999).status_code == 404
    response = read(clients["a"], aid)
    assert response.headers["cache-control"] == "no-store"
    assert walk_keys(response.json()) == []
    assert all(set(row) == {"rank", "display_name", "is_self", "core_points", "bonus_points", "completed_blocks", "today_blocks"}
               for row in response.json()["rows"])
    assert all(set(row) == {"rank", "display_name", "is_self", "today_blocks"} for row in response.json()["daily_rows"])
    with Session(engine) as db:
        for user in db.scalars(select(User)):
            assert user.username not in response.text
    assert "@" not in response.text
    assert clients["a"].get("/api/v1/student/leaderboard/classes").json()[0]["assignment_id"] == aid
    enable(clients, aid, enabled=False)
    assert read(clients["a"], aid).status_code == 404
    enable(clients, aid)
    with Session(engine) as db:
        db.scalar(select(Course)).status = "archived"
        db.commit()
    assert read(clients["a"], aid).status_code == 404
    assert clients["a"].get("/api/v1/student/leaderboard/classes").json() == []


def test_another_teacher_cannot_read_or_change_class(env):
    clients, engine = env
    aid = assignment(clients)
    with Session(engine) as db:
        db.add(User(username="other.teacher", password_hash=password_hash.hash("other-password"), role="teacher"))
        db.commit()
    other = TestClient(app)
    assert other.post("/api/v1/auth/login", json={"username": "other.teacher", "password": "other-password"}).status_code == 200
    assert other.get("/api/v1/teacher/leaderboard/classes").json() == []
    assert read(other, aid, teacher=True).status_code == 404
    assert put(other, f"/api/v1/teacher/classes/{aid}/leaderboard/settings", {"enabled": True, "top_three": False, "hide_open_block": False}).status_code == 404
    assert put(other, f"/api/v1/teacher/classes/{aid}/leaderboard/settings", {}).status_code == 404
    assert put(clients["teacher"], f"/api/v1/teacher/classes/{aid}/leaderboard/settings", {}).status_code == 422


@pytest.mark.parametrize("name", ["a@b.test", "a＠b.test", "\u202ePseudo", "\x00Pseudo", " ", "x" * 25])
def test_display_name_validation(env, name):
    clients, _ = env
    aid = assignment(clients)
    enable(clients, aid)
    assert put(clients["a"], f"/api/v1/student/classes/{aid}/leaderboard/name", {"display_name": name}).status_code == 422


def test_name_is_self_only_and_never_taken_from_login(env):
    clients, engine = env
    aid = assignment(clients)
    enable(clients, aid)
    path = f"/api/v1/student/classes/{aid}/leaderboard/name"
    assert put(clients["a"], path, {"display_name": "Atlas", "user_id": 3}).status_code == 422
    assert put(clients["a"], path, {"display_name": "Atlas"}, csrf=False).status_code == 403
    assert put(clients["out"], path, {"display_name": "Intrus"}).status_code == 404
    assert put(clients["a"], path, {"display_name": " Atlas "}).json() == {"display_name": "Atlas"}
    rows = read(clients["b"], aid).json()["rows"]
    assert next(row for row in rows if row["display_name"] == "Atlas")["is_self"] is False
    assert next(row for row in rows if row["is_self"])["display_name"] == "Demo Etudiant02"
    assert all("@" not in row["display_name"] for row in rows)
    with Session(engine) as db:
        assert len(db.scalars(select(LeaderboardName)).all()) == 1
    enable(clients, aid, enabled=False)
    assert put(clients["a"], path, {"display_name": "Fermé"}).status_code == 404


def test_best_main_points_then_separate_bonus_and_completion_day(env, monkeypatch):
    clients, engine = env
    aid = assignment(clients)
    enable(clients, aid)
    # A tiny fixture variant: the third public demo activity is optional.
    # Stored points, including partial credit, must never be recomputed by K.
    now = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)
    monkeypatch.setattr("app.leaderboard.utcnow", lambda: now)
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        versions = db.scalars(select(MissionVersion).order_by(MissionVersion.id)).all()
        versions[2].definition_private = {**versions[2].definition_private, "bonus": True}
        a, b = db.scalars(select(User).where(User.username.in_(["demo.etudiant01", "demo.etudiant02"])).order_by(User.id)).all()
        record(db, a.id, assigned.course_release_id, versions[0].id, "a-partial", 4, False, now - timedelta(days=1))
        record(db, a.id, assigned.course_release_id, versions[0].id, "a-correct", 10, True, now - timedelta(days=1))
        record(db, a.id, assigned.course_release_id, versions[0].id, "a-retry", 0, False, now)
        record(db, a.id, assigned.course_release_id, versions[1].id, "a-second", 10, True, now)
        record(db, a.id, assigned.course_release_id, versions[2].id, "a-bonus", 2.5, False, now)
        record(db, b.id, assigned.course_release_id, versions[0].id, "b-first", 10, True, now - timedelta(days=1))
        record(db, b.id, assigned.course_release_id, versions[1].id, "b-second", 10, True, now - timedelta(days=1))
        db.commit()
        before = [(row.id, row.points, row.answer) for row in db.scalars(select(MissionAttempt))]
        expected = course_score(mission_scores(db, a.id, [v.id for v in versions]))
    body = read(clients["a"], aid).json()
    first, second = body["rows"]
    assert (first["core_points"], first["bonus_points"], first["rank"], first["is_self"]) == (20, 2.5, 1, True)
    assert first["core_points"] == expected["core_points"]
    assert first["completed_blocks"] == second["completed_blocks"] == 1
    assert first["today_blocks"] == 1 and second["today_blocks"] == 0
    assert body["timezone"] == "Africa/Casablanca" and body["day"] == "2026-10-28"
    # Replaying a finished block today must not count it twice or move yesterday's completion.
    with Session(engine) as db:
        after = [(row.id, row.points, row.answer) for row in db.scalars(select(MissionAttempt))]
        assert before == after
    export = clients["teacher"].get(f"/api/v1/teacher/classes/{aid}/export.csv")
    assert "rank" not in export.text.lower() and "rang" not in export.text.lower()


def test_ties_competition_ranks_and_bonus_tiebreak():
    rows = [{"order": i, "display_name": str(i), "core_points": main, "bonus_points": bonus, "is_self": False}
            for i, (main, bonus) in enumerate([(8, 99), (10, 2), (10, 2), (10, 0)], 1)]
    ordered = ranked(rows, ("core_points", "bonus_points"))
    assert [(r["display_name"], r["rank"]) for r in ordered] == [("2", 1), ("3", 1), ("4", 3), ("1", 4)]


def test_ranking_uses_L_retained_points_including_decay_and_preserves_prior_scores(env):
    clients, engine = env
    aid = assignment(clients)
    enable(clients, aid)
    a, b = clients["a"], clients["b"]
    version = missions_of(a)[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{version}").json()
    right, wrong = choice_id(view, "La jointure"), choice_id(view, "Supprimer")
    # A real pre-activation success keeps its full score under L.
    assert attempt(b, version, "k-before-decay-01", choice_ids=[right]).json()["points"] == 10
    with Session(engine) as db:
        course_id = db.scalar(select(Course.id))
    set_rules(clients["teacher"], course_id, decay_enabled=True)
    assert attempt(a, version, "k-decay-wrong-01", choice_ids=[wrong]).json()["percent"] == 100
    earned = attempt(a, version, "k-decay-right-02", choice_ids=[right]).json()
    assert (earned["percent"], earned["points"], earned["score"]["best"]) == (70, 7, 7)
    # A subsequent 50% success must not replace the retained best of 7.
    again = attempt(a, version, "k-decay-right-03", choice_ids=[right]).json()
    assert (again["percent"], again["points"], again["score"]["best"]) == (50, 5, 7)
    with Session(engine) as db:
        before = [(row.id, row.points, row.percent) for row in db.scalars(select(MissionAttempt).order_by(MissionAttempt.id))]
    rows = read(a, aid).json()["rows"]
    assert [(row["rank"], row["core_points"], row["bonus_points"], row["is_self"]) for row in rows] == [
        (1, 10, 0, False), (2, 7, 0, True)]
    with Session(engine) as db:
        assert before == [(row.id, row.points, row.percent) for row in db.scalars(select(MissionAttempt).order_by(MissionAttempt.id))]


def test_top_three_and_self_are_filtered_on_server_for_both_tabs(env):
    clients, engine = env
    aid = assignment(clients)
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        first = db.scalar(select(MissionVersion).order_by(MissionVersion.id))
        own = db.scalar(select(User).where(User.username == "demo.etudiant01"))
        record(db, own.id, assigned.course_release_id, first.id, "own-partial", 1, False)
        for i in range(5):
            user = User(username=f"private-{i}@example.test", password_hash="unused", role="student")
            db.add(user); db.flush()
            db.add(Enrollment(cohort_id=assigned.cohort_id, user_id=user.id))
            record(db, user.id, assigned.course_release_id, first.id, f"leader-{i}", 10 - i, False)
        db.commit()
    enable(clients, aid, top_three=True)
    body = read(clients["a"], aid).json()
    assert [r["rank"] for r in body["rows"]] == [1, 2, 3, 6]
    assert body["rows"][-1]["is_self"]
    assert len(body["daily_rows"]) == 7  # all tied at rank 1: explicit top-three-ranks policy
    assert all("core_points" not in row and "bonus_points" not in row for row in body["daily_rows"])
    assert "@" not in str(body)
    assert len(read(clients["teacher"], aid, teacher=True).json()["rows"]) == 3


def test_hide_open_block_filters_both_tabs_and_disabled_accounts(env):
    clients, engine = env
    aid = assignment(clients)
    enable(clients, aid, hide_open_block=True)
    hidden = read(clients["a"], aid).json()
    assert hidden["hidden"] and hidden["rows"] == hidden["daily_rows"] == []
    assert read(clients["teacher"], aid, teacher=True).json()["hidden"]
    with Session(engine) as db:
        for block in db.scalars(select(BlockState)):
            block.opened_at = None
        db.scalar(select(User).where(User.username == "demo.etudiant02")).enabled = False
        db.commit()
    visible = read(clients["a"], aid).json()
    assert visible["hidden"] is False and len(visible["rows"]) == 1
    assert visible["rows"][0]["is_self"]


def test_settings_persist_across_new_release_and_revoked_enrollment_is_rechecked(env):
    clients, engine = env
    aid = assignment(clients)
    enable(clients, aid, top_three=True)
    with Session(engine) as db:
        assert db.scalar(select(LeaderboardSettings)).top_three
        assigned = db.get(Assignment, aid)
        old = db.get(CourseRelease, assigned.course_release_id)
        new = CourseRelease(course_id=old.course_id, version=old.version + 1, status="published", snapshot_hash="1" * 64,
                            student_snapshot=deepcopy(old.student_snapshot), published_by=old.published_by)
        db.add(new); db.flush()
        newer = Assignment(cohort_id=assigned.cohort_id, course_release_id=new.id)
        db.add(newer); db.commit()
        new_aid = newer.id
    assert read(clients["a"], new_aid).json()["settings"]["top_three"]
    assert clients["a"].get("/api/v1/student/leaderboard/classes").json() == [
        {"assignment_id": new_aid, "label": "Cohorte démonstration (comptes fictifs)"}]
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        db.delete(db.scalar(select(Enrollment).where(Enrollment.cohort_id == assigned.cohort_id,
                                                   Enrollment.user_id == db.scalar(select(User.id).where(User.username == "demo.etudiant01")))))
        db.commit()
    assert read(clients["a"], aid).status_code == read(clients["a"], new_aid).status_code == 404


def test_block_requires_lesson_and_day_uses_morocco_midnight_not_utc(env, monkeypatch):
    clients, engine = env
    aid = assignment(clients)
    enable(clients, aid)
    now = datetime(2026, 6, 10, 23, 45, tzinfo=timezone.utc)  # already June 11 in Morocco
    monkeypatch.setattr("app.leaderboard.utcnow", lambda: now)
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        original = db.get(CourseRelease, assigned.course_release_id)
        snapshot = deepcopy(original.student_snapshot)
        missions = snapshot["modules"][0]["chapters"][0]["missions"]
        previous = db.get(MissionVersion, missions[0]["mission_version_id"])
        definition = MissionDefinition(kind="lesson", objective_ids=previous.definition_private["objective_ids"],
                                       body="Un rappel de démonstration.", estimated_duration_minutes=1)
        lesson = MissionVersion(mission_id=previous.mission_id, version=previous.version + 1,
                                definition_private=definition.model_dump(), student_projection={})
        db.add(lesson); db.flush()
        missions[0]["mission_version_id"] = lesson.id
        newer = CourseRelease(course_id=original.course_id, version=original.version + 1, status="published", snapshot_hash="2" * 64,
                              student_snapshot=snapshot, published_by=original.published_by)
        db.add(newer); db.flush()
        next_assignment = Assignment(cohort_id=assigned.cohort_id, course_release_id=newer.id)
        db.add(next_assignment); db.flush()
        a = db.scalar(select(User).where(User.username == "demo.etudiant01"))
        for index, mission in enumerate(missions[1:]):
            record(db, a.id, newer.id, mission["mission_version_id"], f"lesson-core-{index}", 10, True, now - timedelta(days=1))
        db.commit()
        next_id, uid, release_id, vid = next_assignment.id, a.id, newer.id, lesson.id
    before = next(row for row in read(clients["a"], next_id).json()["rows"] if row["is_self"])
    assert before["completed_blocks"] == 0 and before["core_points"] == 20
    with Session(engine) as db:
        record(db, uid, release_id, vid, "lesson-understood", 0, True, now)
        db.commit()
    body = read(clients["a"], next_id).json()
    own = next(row for row in body["rows"] if row["is_self"])
    assert body["day"] == "2026-06-11"
    assert own["completed_blocks"] == own["today_blocks"] == 1
    assert own["core_points"] == 20  # reading the lesson never grants points


def test_real_name_is_taken_from_the_login_without_address():
    from app.leaderboard import real_name

    assert real_name("youssef.el-amrani@ynov.com") == "Youssef El Amrani"
    assert real_name("SALMA.BENANI@ynov.com") == "Salma Benani"
    assert real_name("imane_tazi@ynov.com") == "Imane Tazi"
    assert real_name("@ynov.com") == ""
    assert "@" not in real_name("a.b@ynov.com") and "ynov" not in real_name("a.b@ynov.com")
