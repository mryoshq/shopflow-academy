"""Results read the platform's retained scores; they never regrade an answer."""

import csv
from io import StringIO

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import Assignment, AuditEvent, Chapter, CourseRelease, Enrollment, Mission, MissionAttempt, MissionVersion, User
from app.progress import course_score, mission_scores
from test_attempt_rules import set_rules
from test_student import attempt, choice_id, env, missions_of, walk_keys  # noqa: F401
from test_teacher_dashboard import other_teacher, the_class


def read(client, aid, suffix="", threshold=50):
    return client.get(f"/api/v1/teacher/classes/{aid}/results{suffix}?threshold={threshold}")


def test_results_and_csv_are_owner_only_without_student_answers(env):
    clients, engine = env
    aid = the_class(clients["teacher"])["id"]
    intruder = other_teacher(engine)
    for suffix in ("", "/export.csv"):
        assert read(TestClient(app), aid, suffix).status_code == 401
        assert read(clients["a"], aid, suffix).status_code == 403
        assert read(intruder, aid, suffix).status_code == 404
        assert read(clients["teacher"], 999999, suffix).status_code == 404
        response = read(clients["teacher"], aid, suffix)
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    body = read(clients["teacher"], aid).json()
    assert walk_keys(body) == []
    assert len(body["students"]) == 2
    assert body["threshold"] == 50
    assert all(row["needs_support"] for row in body["students"])


@pytest.mark.parametrize("threshold", [-1, 101, "nan", "inf", "oops"])
def test_invalid_threshold_is_refused_in_both_formats(env, threshold):
    clients, _ = env
    aid = the_class(clients["teacher"])["id"]
    assert read(clients["teacher"], aid, threshold=threshold).status_code == 422
    assert read(clients["teacher"], aid, "/export.csv", threshold=threshold).status_code == 422


def test_retained_decreasing_points_and_non_retroactivity_match_the_platform(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    aid = the_class(teacher)["id"]
    version = missions_of(a)[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{version}").json()
    right, wrong = choice_id(view, "La jointure"), choice_id(view, "Supprimer")
    assert attempt(b, version, "results-before-rule", choice_ids=[right]).json()["points"] == 10
    with Session(engine) as db:
        assignment = db.get(Assignment, aid)
        release = db.get(CourseRelease, assignment.course_release_id)
        course_id = release.course_id
    set_rules(teacher, course_id, decay_enabled=True)
    attempt(a, version, "results-wrong-01", choice_ids=[wrong])
    assert attempt(a, version, "results-right-02", choice_ids=[right]).json()["points"] == 7
    assert attempt(a, version, "results-right-03", choice_ids=[right]).json()["points"] == 5
    with Session(engine) as db:
        user_id = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
        ids = [item["mission_version_id"] for item in missions_of(a)]
        expected = course_score(mission_scores(db, user_id, ids))
        before = [(row.id, row.points, row.percent) for row in db.scalars(select(MissionAttempt).order_by(MissionAttempt.id))]
    body = read(teacher, aid).json()
    own = next(row for row in body["students"] if row["display_name"] == "demo.etudiant01")
    other = next(row for row in body["students"] if row["display_name"] == "demo.etudiant02")
    assert own["core_points"] == expected["core_points"] == 7
    assert other["core_points"] == 10
    assert own["completed"] == 1 and own["total"] == 3 and own["unsuccessful_count"] == 2
    assert own["percentage"] == 23.33
    assert all(item["mission_version_id"] != version for item in own["unsuccessful_missions"])
    read(teacher, aid, "/export.csv")
    with Session(engine) as db:
        assert before == [(row.id, row.points, row.percent) for row in db.scalars(select(MissionAttempt).order_by(MissionAttempt.id))]


def test_lessons_and_bonus_never_become_weak_points_and_bonus_does_not_raise_percentage(env):
    clients, engine = env
    aid = the_class(clients["teacher"])["id"]
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        versions = db.scalars(select(MissionVersion).order_by(MissionVersion.id)).all()
        # Synthetic fixture variant before any attempt: one lesson, one main mission, one bonus.
        versions[0].definition_private = {"kind": "lesson", "body": "Rappel fictif.", "objective_ids": [1], "estimated_duration_minutes": 1}
        versions[2].definition_private = {**versions[2].definition_private, "bonus": True}
        a = db.scalar(select(User).where(User.username == "demo.etudiant01"))
        db.add(MissionAttempt(user_id=a.id, course_release_id=assigned.course_release_id, mission_version_id=versions[2].id,
                              idempotency_key="results-only-bonus", answer={}, is_correct=True, points=10))
        db.commit()
        main_id = versions[1].id
    body = read(clients["teacher"], aid).json()
    row = next(row for row in body["students"] if row["display_name"] == "demo.etudiant01")
    assert (row["core_points"], row["core_possible"], row["bonus_points"], row["percentage"]) == (0, 10, 10, 0)
    assert (row["completed"], row["total"], row["unsuccessful_count"]) == (0, 1, 1)
    assert [item["mission_version_id"] for item in row["unsuccessful_missions"]] == [main_id]
    assert [item["mission_version_id"] for item in body["weakest_missions"]] == [main_id]
    assert row["needs_support"]
    exported = list(csv.DictReader(StringIO(read(clients["teacher"], aid, "/export.csv").text.lstrip("\ufeff")), delimiter=";"))
    assert exported[0]["missions_reussies"] == "0"


def test_threshold_is_strict_and_csv_preserves_every_historical_column_and_value(env):
    clients, engine = env
    aid = the_class(clients["teacher"])["id"]
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        a = db.scalar(select(User).where(User.username == "demo.etudiant01"))
        vid = db.scalar(select(MissionVersion.id).order_by(MissionVersion.id))
        db.add(MissionAttempt(user_id=a.id, course_release_id=assigned.course_release_id, mission_version_id=vid,
                              idempotency_key="results-half", answer={}, is_correct=False, points=7.5))
        db.commit()
    at_boundary = read(clients["teacher"], aid, threshold=25).json()["students"][0]
    assert at_boundary["percentage"] == 25 and at_boundary["needs_support"] is False
    assert read(clients["teacher"], aid, threshold=25.01).json()["students"][0]["needs_support"] is True
    assert not any(row["needs_support"] for row in read(clients["teacher"], aid, threshold=0).json()["students"])
    old = clients["teacher"].get(f"/api/v1/teacher/classes/{aid}/export.csv")
    new = read(clients["teacher"], aid, "/export.csv", threshold=25)
    old_rows = list(csv.reader(StringIO(old.text.lstrip("\ufeff")), delimiter=";"))
    new_rows = list(csv.reader(StringIO(new.text.lstrip("\ufeff")), delimiter=";"))
    assert new.content.startswith(b"\xef\xbb\xbf")
    assert [row[:-1] for row in new_rows] == old_rows
    assert new_rows[0][-1] == "a_accompagner"
    assert [row[-1] for row in new_rows[1:]] == ["non", "oui"]
    assert "7,5" in new.text and new.headers["content-disposition"] == old.headers["content-disposition"]
    with Session(engine) as db:
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "class.export").order_by(AuditEvent.id.desc()))
        assert event.details == {"view": "results", "threshold": 25}


def test_csv_formula_injection_is_neutralized(env):
    clients, engine = env
    aid = the_class(clients["teacher"])["id"]
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        user = User(username="=HYPERLINK(1)", password_hash="unused", role="student")
        db.add(user); db.flush()
        db.add(Enrollment(cohort_id=assigned.cohort_id, user_id=user.id)); db.commit()
    exported = read(clients["teacher"], aid, "/export.csv").text
    assert "'=HYPERLINK(1)" in exported


def test_top_five_are_the_least_solved_in_course_order_and_empty_class_is_supported(env):
    clients, engine = env
    aid = the_class(clients["teacher"])["id"]
    with Session(engine) as db:
        assigned = db.get(Assignment, aid)
        release = db.get(CourseRelease, assigned.course_release_id)
        original = db.scalar(select(MissionVersion).order_by(MissionVersion.id))
        chapter_id = db.get(Mission, original.mission_id).chapter_id
        snapshot = dict(release.student_snapshot)
        import copy
        snapshot = copy.deepcopy(snapshot)
        missions = snapshot["modules"][0]["chapters"][0]["missions"]
        for index in range(5):
            mission = Mission(chapter_id=chapter_id, slug=f"results-extra-{index}", title=f"Extra {index}", sort_order=index + 3)
            db.add(mission); db.flush()
            version = MissionVersion(mission_id=mission.id, version=1, definition_private=original.definition_private, student_projection={})
            db.add(version); db.flush()
            missions.append({"id": mission.id, "title": mission.title, "mission_version_id": version.id})
        release.student_snapshot = snapshot
        a = db.scalar(select(User).where(User.username == "demo.etudiant01"))
        db.add(MissionAttempt(user_id=a.id, course_release_id=release.id, mission_version_id=original.id,
                              idempotency_key="results-top-five", answer={}, is_correct=True, points=10))
        db.commit()
        expected = [item["title"] for item in missions[1:6]]
        cohort_id = assigned.cohort_id
    body = read(clients["teacher"], aid).json()
    assert [item["title"] for item in body["weakest_missions"]] == expected
    assert all(item["success_percentage"] == 0 for item in body["weakest_missions"])
    with Session(engine) as db:
        for enrollment in db.scalars(select(Enrollment).where(Enrollment.cohort_id == cohort_id)):
            db.delete(enrollment)
        db.commit()
    empty = read(clients["teacher"], aid).json()
    assert empty["students"] == empty["weakest_missions"] == []


def test_no_graded_points_means_no_percentage_or_support_label(env):
    clients, engine = env
    aid = the_class(clients["teacher"])["id"]
    with Session(engine) as db:
        for version in db.scalars(select(MissionVersion)):
            version.definition_private = {"kind": "lesson", "body": "Rappel fictif.", "objective_ids": [1], "estimated_duration_minutes": 1}
        db.commit()
    body = read(clients["teacher"], aid).json()
    assert all(row["percentage"] is None and not row["needs_support"] and row["total"] == 0 for row in body["students"])
    assert body["weakest_missions"] == []
