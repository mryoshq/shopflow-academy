"""Sprint 2, part L (ADR-0027): rules against random clicking."""

from datetime import timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.attempt_rules import Rules, decays, next_attempt, percent_for, reading_seconds
from app.auth import utcnow
from app.config import get_settings
from app.course_md import compile_files, import_compiled
from app.curriculum_schema import MissionDefinition
from app.models import AuditEvent, MissionAttempt, MissionOpening, User
from app.progress import replay
from test_course_md import HEADER, module
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)
from test_teacher_dashboard import the_class


def put(client, path, payload):
    return client.put(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def demo_course_id(teacher) -> int:
    return teacher.get("/api/v1/teacher/courses").json()[0]["id"]


def set_rules(teacher, course_id: int, **changes) -> dict:
    current = teacher.get(f"/api/v1/teacher/courses/{course_id}/attempt-rules").json()
    body = {key: value for key, value in current.items() if key not in {"defaults", "decay_since", "pause_since", "announced_since"}}
    response = put(teacher, f"/api/v1/teacher/courses/{course_id}/attempt-rules", {**body, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def first_mission(client) -> tuple[int, dict]:
    version = missions_of(client)[0]["mission_version_id"]
    return version, client.get(f"/api/v1/student/missions/{version}").json()


def age_attempts(engine, seconds: int) -> None:
    """Move every attempt and opening back in time (instead of sleeping in tests)."""
    with Session(engine) as db:
        db.execute(update(MissionAttempt).values(created_at=utcnow() - timedelta(seconds=seconds)))
        db.execute(update(MissionOpening).values(opened_at=utcnow() - timedelta(seconds=seconds)))
        db.commit()


def backdate_rules(engine, seconds: int = 3600) -> None:
    """Pretend the rules were turned on earlier, so older test attempts still count."""
    from datetime import datetime

    from app.models import Course
    with Session(engine) as db:
        for course in db.scalars(select(Course)):
            rules = dict(course.attempt_rules or {})
            for key in ("decay_since", "pause_since", "announced_since"):
                if rules.get(key):
                    rules[key] = (datetime.fromisoformat(rules[key]) - timedelta(seconds=seconds)).isoformat()
            course.attempt_rules = rules
        db.commit()


def test_percentages_and_bonus_and_lessons():
    rules = Rules(decay_enabled=True, decay_since=utcnow().isoformat())
    assert [percent_for(rules, n) for n in range(1, 7)] == [100, 70, 50, 30, 30, 30]
    base = dict(objective_ids=[1], estimated_duration_minutes=5, scenario="s", instructions="i", max_points=10,
                choices=[{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], correct_ids=["a"])
    assert decays(rules, MissionDefinition.model_validate({**base, "kind": "single_choice"}))
    assert not decays(rules, MissionDefinition.model_validate({**base, "kind": "single_choice", "bonus": True}))
    lesson = MissionDefinition.model_validate({"kind": "lesson", "objective_ids": [1], "estimated_duration_minutes": 2, "body": " ".join(["mot"] * 100)})
    assert not decays(rules, lesson)
    reading = Rules(reading_enabled=True)
    assert reading_seconds(reading, lesson) == 30  # 100 words at 200 words per minute
    short = lesson.model_copy(update={"body": "Trois mots seulement"})
    long = lesson.model_copy(update={"body": " ".join(["mot"] * 1000)})
    assert reading_seconds(reading, short) == 10 and reading_seconds(reading, long) == 60
    assert reading_seconds(Rules(), lesson) is None


@pytest.mark.parametrize("bad", [
    {"decay_steps": [50, 70]}, {"decay_steps": [100, 70], "decay_floor": 80}, {"pause_seconds": [10, 31]},
    {"reading_min": 70, "reading_max": 60}, {"announcement": "<b>Attention</b>"}, {"decay_since": "2026-10-28T10:00:00+00:00"},
])
def test_invalid_settings_are_refused(env, bad):
    clients, _ = env
    teacher = clients["teacher"]
    course = demo_course_id(teacher)
    current = teacher.get(f"/api/v1/teacher/courses/{course}/attempt-rules").json()
    body = {key: value for key, value in current.items() if key not in {"defaults", "decay_since", "pause_since", "announced_since"}}
    assert put(teacher, f"/api/v1/teacher/courses/{course}/attempt-rules", {**body, **bad}).status_code == 422


def test_decreasing_points_are_exact_not_retroactive_and_replayable(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    course = demo_course_id(teacher)
    # Before the rule: b solves the mission at full value.
    version, view = first_mission(b)
    assert attempt(b, version, "before-rule-01", choice_ids=[choice_id(view, "La jointure")]).json()["points"] == 10
    rules = set_rules(teacher, course, decay_enabled=True)
    assert rules["decay_since"] and rules["announced_since"]
    with Session(engine) as db:
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "course.attempt_rules"))
        assert event.details["decay_enabled"] is True and "decay_since" in event.details
    # The student sees the rule before answering.
    version, view = first_mission(a)
    assert view["rules"]["next_attempt"] == 1 and view["rules"]["next_percent"] == 100
    wrong = choice_id(view, "Supprimer")
    percents = [attempt(a, version, f"decay-wrong-{n:02d}", choice_ids=[wrong]).json()["percent"] for n in range(4)]
    assert percents == [100, 70, 50, 30]
    right = attempt(a, version, "decay-right-001", choice_ids=[choice_id(view, "La jointure")]).json()
    assert (right["attempt_number"], right["percent"], right["points"]) == (5, 30, 3.0)
    assert right["score"]["best"] == 3.0 and right["rules"]["next_percent"] == 30
    # Not retroactive: b keeps 10 points, and b's ranks start again from the activation.
    assert first_mission(b)[1]["score"]["best"] == 10
    again = attempt(b, version, "after-rule-01", choice_ids=[choice_id(view, "La jointure")]).json()
    assert (again["attempt_number"], again["percent"], again["points"]) == (1, 100, 10.0)
    with Session(engine) as db:
        before = db.scalar(select(MissionAttempt).where(MissionAttempt.idempotency_key == "before-rule-01"))
        assert before.percent is None and before.points == 10
        assert replay(db) == []


def test_pause_after_error_is_enforced_by_the_server_and_double_click_stays_idempotent(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    set_rules(teacher, demo_course_id(teacher), pause_enabled=True)
    backdate_rules(engine)
    version, view = first_mission(a)
    wrong = choice_id(view, "Supprimer")
    first = attempt(a, version, "pause-attempt-01", choice_ids=[wrong])
    assert first.status_code == 201 and 9 <= first.json()["rules"]["pause_remaining"] <= 10
    refused = attempt(a, version, "pause-attempt-02", choice_ids=[wrong])
    assert refused.status_code == 429 and refused.json()["detail"]["code"] == "pause"
    assert 1 <= refused.json()["detail"]["retry_after"] <= 10 and refused.headers["Retry-After"]
    # A double click on the first answer replays it, even during the pause.
    replayed = attempt(a, version, "pause-attempt-01", choice_ids=[wrong])
    assert replayed.status_code == 200 and replayed.json()["attempt_id"] == first.json()["attempt_id"]
    assert first_mission(a)[1]["rules"]["pause_remaining"] > 0
    pauses = []
    for n in range(2, 5):
        age_attempts(engine, 31)
        response = attempt(a, version, f"pause-attempt-1{n}", choice_ids=[wrong])
        assert response.status_code == 201
        pauses.append(response.json()["rules"]["pause_remaining"])
    assert [p > 15 for p in pauses] == [True, True, True] and max(pauses) <= 30
    age_attempts(engine, 31)
    ok = attempt(a, version, "pause-attempt-ok", choice_ids=[choice_id(view, "La jointure")])
    assert ok.status_code == 201 and ok.json()["rules"]["pause_remaining"] == 0  # no pause after a right answer


def test_fast_clicks_are_marked_for_the_teacher_only(env):
    clients, _ = env
    teacher, a = clients["teacher"], clients["a"]
    version, view = first_mission(a)  # opening recorded now
    response = attempt(a, version, "fast-click-0001", choice_ids=[choice_id(view, "Supprimer")]).json()
    assert "fast" not in response
    klass = the_class(teacher)["id"]
    stats = next(m for m in teacher.get(f"/api/v1/teacher/classes/{klass}/timeline").json()["missions"] if m["mission_version_id"] == version)
    assert stats["fast_attempts"] == 1 and stats["fast"] == [{"student": "demo.etudiant01", "count": 1}]
    row = next(r for r in teacher.get(f"/api/v1/teacher/classes/{klass}/overview").json()["students"] if r["display_name"] == "demo.etudiant01")
    assert row["fast_attempts"] == 1
    detail = teacher.get(f"/api/v1/teacher/classes/{klass}/students/{row['id']}").json()
    assert detail["attempts"][0]["fast"] is True and detail["missions"][0]["fast_attempts"] == 1


def test_notice_appears_once_a_rule_is_on_with_the_teacher_text(env):
    clients, _ = env
    teacher, a = clients["teacher"], clients["a"]
    course = demo_course_id(teacher)
    assert a.get("/api/v1/student/dashboard").json()["courses"][0]["rules_notice"] is None
    set_rules(teacher, course, pause_enabled=True, announcement="Chaque essai compte : lisez avant de cliquer.")
    notice = a.get("/api/v1/student/dashboard").json()["courses"][0]["rules_notice"]
    assert notice["text"] == "Chaque essai compte : lisez avant de cliquer." and notice["since"]
    set_rules(teacher, course, announcement_enabled=False)
    assert a.get("/api/v1/student/dashboard").json()["courses"][0]["rules_notice"] is None


LESSON = """### Leçon : Lire avant de cliquer

```yaml
slug: lecon-lecture
kind: lesson
objectives: [OBJ-A]
duration: 2
body: |
  {words}
```
"""


def test_minimum_reading_time_is_checked_by_the_server(env, monkeypatch):
    clients, engine = env
    monkeypatch.setattr(get_settings(), "main_course_slug", "cours-test")
    monkeypatch.setattr(get_settings(), "class_label", "Classe principale")
    teacher, a = clients["teacher"], clients["a"]
    compiled = compile_files({"00-cours.md": HEADER, "10-m.md": module(LESSON.replace("{words}", " ".join(["mot"] * 100)))})
    assert compiled.errors == []
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        result = import_compiled(db, owner, compiled, publish=True)
    main = teacher.get("/api/v1/teacher/main").json()
    post(teacher, f"/api/v1/teacher/classes/{main['assignment_id']}/blocks/open-next")
    set_rules(teacher, result["course_id"], reading_enabled=True)
    course = next(c for c in a.get("/api/v1/student/dashboard").json()["courses"] if c["title"] == "Cours de test")
    lesson = course["missions"][0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{lesson}").json()
    assert view["rules"]["reading_seconds"] == 30 and view["rules"]["reading_remaining"] >= 29
    refused = post(a, f"/api/v1/student/missions/{lesson}/understood")
    assert refused.status_code == 429 and refused.json()["detail"]["code"] == "reading"
    age_attempts(engine, 31)
    assert post(a, f"/api/v1/student/missions/{lesson}/understood").status_code == 201
    # Already understood: idempotent, even if the lesson is reopened right away.
    a.get(f"/api/v1/student/missions/{lesson}")
    assert post(a, f"/api/v1/student/missions/{lesson}/understood").status_code == 200
    with Session(engine) as db:
        definition = MissionDefinition.model_validate({"kind": "lesson", "objective_ids": [1], "estimated_duration_minutes": 2, "body": "x"})
        assert next_attempt(db, Rules(decay_enabled=True, decay_since=utcnow().isoformat()), definition, 1, lesson) == (None, None)
