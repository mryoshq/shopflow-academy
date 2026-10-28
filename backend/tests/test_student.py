from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.curriculum_schema import MissionDefinition
from app.database import get_db
from app.demo_course import run as seed_demo_course
from app.grading import AnswerInput, InvalidAnswer, evaluate
from app.main import app
from app.models import Course, CourseRelease, MissionAttempt, User
from app.projection import student_definition

FORBIDDEN_KEYS = {"correct_ids", "correct_pairs", "action_id", "max_points", "grading_ref", "definition_private"}


@pytest.fixture
def env(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'student.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(config, "head")
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    with Session(engine, expire_on_commit=False) as db:
        db.add_all([
            User(username="demo.enseignant", password_hash=password_hash.hash("teacher-pass"), role="teacher"),
            User(username="demo.etudiant01", password_hash=password_hash.hash("student-a-pass"), role="student"),
            User(username="demo.etudiant02", password_hash=password_hash.hash("student-b-pass"), role="student"),
            User(username="prenom.nom@example.com", password_hash=password_hash.hash("outsider-pass"), role="student"),
        ])
        db.commit()
        seeded = seed_demo_course(db)
        assert seed_demo_course(db) == seeded  # idempotent

    def override_db():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    clients = {}
    try:
        for name, (user, password) in {"a": ("demo.etudiant01", "student-a-pass"), "b": ("demo.etudiant02", "student-b-pass"),
                                       "out": ("prenom.nom@example.com", "outsider-pass"), "teacher": ("demo.enseignant", "teacher-pass")}.items():
            client = TestClient(app)
            assert client.post("/api/v1/auth/login", json={"username": user, "password": password}).status_code == 200
            clients[name] = client
        yield clients, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def post(client: TestClient, path: str, payload: dict | None = None):
    return client.post(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def walk_keys(value, path="") -> list[str]:
    found = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in FORBIDDEN_KEYS:
                found.append(f"{path}.{key}")
            found += walk_keys(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found += walk_keys(item, f"{path}[{index}]")
    return found


def missions_of(client: TestClient) -> list[dict]:
    dashboard = client.get("/api/v1/student/dashboard").json()
    return dashboard["courses"][0]["missions"]


def attempt(client: TestClient, version_id: int, key: str, **answer):
    return post(client, f"/api/v1/student/missions/{version_id}/attempts", {"idempotency_key": key, "answer": answer})


def choice_id(view: dict, label_start: str) -> str:
    return next(item["id"] for item in view["definition"]["choices"] if item["label"].startswith(label_start))


def test_dashboard_lists_demo_course_with_states_and_no_answer_keys(env):
    clients, _ = env
    dashboard = clients["a"].get("/api/v1/student/dashboard")
    assert dashboard.status_code == 200 and dashboard.headers["cache-control"] == "no-store"
    body = dashboard.json()
    assert body["display_name"] == "demo.etudiant01" and body["ai_enabled"] is False
    course = body["courses"][0]
    assert course["is_demo"] is True and course["title"].startswith("Démonstration")
    assert [m["status"] for m in course["missions"]] == ["not_started", "not_started", "locked"]
    assert course["missions"][2]["locked_by"] == ["Valider un import CSV de clients"]
    assert walk_keys(body) == []
    outsider = clients["out"].get("/api/v1/student/dashboard").json()
    assert outsider == {"display_name": "prenom.nom", "ai_enabled": False, "courses": []}


def test_mission_payload_is_redacted_recursively(env):
    clients, _ = env
    for mission in missions_of(clients["a"])[:2]:
        view = clients["a"].get(f"/api/v1/student/missions/{mission['mission_version_id']}").json()
        assert walk_keys(view) == []
        text = str(view)
        assert "Exact :" not in text and "SUM(DISTINCT" not in str(view.get("explanation"))
        assert view["hints"] == [] and view["hint_count"] >= 1 and "hints" not in view["definition"]
        assert view["explanation"] is None and view["definition"]["choices"][0]["id"].startswith("c")
    locked = clients["a"].get(f"/api/v1/student/missions/{missions_of(clients['a'])[2]['mission_version_id']}").json()
    assert locked["status"] == "locked" and locked["definition"] is None


def test_join_mission_feedback_explanation_and_retry(env):
    clients, _ = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    wrong = attempt(clients["a"], first, "attempt-wrong-001", choice_ids=[choice_id(view, "Remplacer par SUM(DISTINCT")])
    assert wrong.status_code == 201
    body = wrong.json()
    assert body["correct"] is False and body["explanation"] is None
    assert "par hasard" in body["feedback"][0]["text"] and walk_keys(body) == []
    assert attempt(clients["a"], first, "attempt-wrong-002", choice_ids=[choice_id(view, "Supprimer")]).json()["explanation"] is None
    third = attempt(clients["a"], first, "attempt-wrong-003", choice_ids=[choice_id(view, "Corriger")]).json()
    assert third["explanation"] and third["attempts_count"] == 3
    right = attempt(clients["a"], first, "attempt-right-004", choice_ids=[choice_id(view, "La jointure")]).json()
    assert right["correct"] is True and "70 DH" in right["explanation"]
    again = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    assert again["status"] == "completed" and again["last_attempt"]["correct"] is True and again["attempts_count"] == 4


def test_authored_ids_are_rejected_and_answers_are_validated(env):
    clients, _ = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    assert attempt(clients["a"], first, "raw-ids-0001", choice_ids=["grain"]).status_code == 422
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    ids = [item["id"] for item in view["definition"]["choices"]]
    assert attempt(clients["a"], first, "two-choice-01", choice_ids=ids[:2]).status_code == 422
    assert attempt(clients["a"], first, "pairs-wrong-1", pairs={ids[0]: ids[1]}).status_code == 422
    bad = post(clients["a"], f"/api/v1/student/missions/{first}/attempts", {"idempotency_key": "x", "answer": {}})
    assert bad.status_code == 422


def test_idempotent_replay_and_key_reuse(env):
    clients, engine = env
    first, second = [m["mission_version_id"] for m in missions_of(clients["a"])[:2]]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    answer = [choice_id(view, "La jointure")]
    one = attempt(clients["a"], first, "double-click-1", choice_ids=answer)
    two = attempt(clients["a"], first, "double-click-1", choice_ids=answer)
    assert one.status_code == 201 and two.status_code == 200
    assert one.json()["attempt_id"] == two.json()["attempt_id"] and two.json()["replayed"] is True
    assert attempt(clients["a"], second, "double-click-1", choice_ids=answer).status_code == 409
    # Another student may use the same key without interference.
    assert attempt(clients["b"], first, "double-click-1", choice_ids=answer).status_code == 201
    with Session(engine) as db:
        assert db.scalar(select(func.count(MissionAttempt.id))) == 2


def test_students_are_isolated_and_roles_enforced(env):
    clients, _ = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    attempt(clients["a"], first, "isolation-0001", choice_ids=[choice_id(view, "La jointure")])
    post(clients["a"], f"/api/v1/student/missions/{first}/hints")
    other = clients["b"].get(f"/api/v1/student/missions/{first}").json()
    assert other["attempts_count"] == 0 and other["hints"] == [] and other["status"] == "not_started"
    for path in (f"/api/v1/student/missions/{first}",):
        assert clients["out"].get(path).status_code == 404
    assert post(clients["out"], f"/api/v1/student/missions/{first}/hints").status_code == 404
    assert attempt(clients["out"], first, "outsider-0001", choice_ids=[choice_id(view, "La jointure")]).status_code == 404
    assert clients["teacher"].get("/api/v1/student/dashboard").status_code == 403
    assert clients["a"].get("/api/v1/teacher/courses").status_code == 403
    no_csrf = clients["a"].post(f"/api/v1/student/missions/{first}/attempts",
                                json={"idempotency_key": "no-csrf-0001", "answer": {"choice_ids": []}})
    assert no_csrf.status_code == 403
    assert TestClient(app).get("/api/v1/student/dashboard").status_code == 401


def test_prerequisite_unlocks_and_reorder_grading(env):
    clients, _ = env
    _, csv, pipeline = [m["mission_version_id"] for m in missions_of(clients["a"])]
    assert attempt(clients["a"], pipeline, "locked-00001", choice_ids=["cx"]).status_code == 409
    assert post(clients["a"], f"/api/v1/student/missions/{pipeline}/hints").status_code == 409
    view = clients["a"].get(f"/api/v1/student/missions/{csv}").json()
    picks = [choice_id(view, start) for start in ("Contrôler", "Normaliser", "Dédupliquer", "Traiter")]
    partial = attempt(clients["a"], csv, "csv-partial-1", choice_ids=picks[:3]).json()
    assert partial["correct"] is False
    assert attempt(clients["a"], csv, "csv-full-0001", choice_ids=picks).json()["correct"] is True
    statuses = [m["status"] for m in missions_of(clients["a"])]
    assert statuses == ["not_started", "completed", "not_started"]
    view = clients["a"].get(f"/api/v1/student/missions/{pipeline}").json()
    labels = ["Lire", "Valider", "Nettoyer", "Dédupliquer", "Charger"]
    shown = [item["label"].split(" ")[0] for item in view["definition"]["choices"]]
    assert shown != labels
    ordered = [choice_id(view, label) for label in labels]
    assert attempt(clients["a"], pipeline, "order-wrong-1", choice_ids=list(reversed(ordered))).json()["correct"] is False
    assert attempt(clients["a"], pipeline, "order-right-1", choice_ids=ordered).json()["correct"] is True
    assert attempt(clients["a"], pipeline, "order-short-1", choice_ids=ordered[:4]).status_code == 422
    # Student B is still locked: progress is per student.
    assert missions_of(clients["b"])[2]["status"] == "locked"


def test_hints_are_progressive_and_remembered(env):
    clients, _ = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    one = post(clients["a"], f"/api/v1/student/missions/{first}/hints").json()
    assert len(one["hints"]) == 1 and one["hint_count"] == 2
    two = post(clients["a"], f"/api/v1/student/missions/{first}/hints").json()
    assert len(two["hints"]) == 2
    assert len(post(clients["a"], f"/api/v1/student/missions/{first}/hints").json()["hints"]) == 2
    assert clients["a"].get(f"/api/v1/student/missions/{first}").json()["hints"] == two["hints"]


def test_archived_course_disappears_and_rate_limit(env):
    clients, engine = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    wrong = choice_id(view, "Supprimer")
    codes = [attempt(clients["a"], first, f"rate-limit-{i:03d}", choice_ids=[wrong]).status_code for i in range(21)]
    assert codes[:20] == [201] * 20 and codes[20] == 429
    with Session(engine) as db:
        course = db.scalar(select(Course).where(Course.slug == "demo-shopflow-donnees"))
        course.status = "archived"
        for release in db.scalars(select(CourseRelease).where(CourseRelease.course_id == course.id)):
            release.status = "archived"
        db.commit()
    assert clients["a"].get(f"/api/v1/student/missions/{first}").status_code == 404
    assert clients["a"].get("/api/v1/student/dashboard").json()["courses"] == []


def base(kind: str, **extra) -> MissionDefinition:
    data = {"kind": kind, "scenario": "Situation fictive.", "instructions": "Répondez.", "objective_ids": [1],
            "choices": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}, {"id": "c", "label": "C"}],
            "correct_ids": ["a"], "max_points": 5, "estimated_duration_minutes": 5}
    data.update(extra)
    return MissionDefinition.model_validate(data)


def opaque(definition: MissionDefinition, version: int = 7) -> dict:
    return student_definition(definition.student_projection(), version, definition.model_dump())


@pytest.mark.parametrize("kind", ["single_choice", "data_interpretation", "scenario_choice"])
def test_single_answer_kinds(kind):
    definition = base(kind)
    view = opaque(definition)
    ids = {item["label"]: item["id"] for item in view["choices"]}
    assert evaluate(definition, 7, AnswerInput(choice_ids=[ids["A"]])).correct
    assert not evaluate(definition, 7, AnswerInput(choice_ids=[ids["B"]])).correct


def test_guided_simulation_true_false_multiple_reorder_matching():
    guided = base("guided_simulation", action_id="choose_quality_rule")
    ids = {item["label"]: item["id"] for item in opaque(guided)["choices"]}
    assert evaluate(guided, 7, AnswerInput(choice_ids=[ids["A"]])).correct

    true_false = base("true_false", choices=[{"id": "true", "label": "Vrai"}, {"id": "false", "label": "Faux"}], correct_ids=["false"])
    view = opaque(true_false)
    assert [item["label"] for item in view["choices"]] == ["Vrai", "Faux"]
    ids = {item["label"]: item["id"] for item in view["choices"]}
    assert evaluate(true_false, 7, AnswerInput(choice_ids=[ids["Faux"]])).correct

    multiple = base("multiple_choice", correct_ids=["a", "c"])
    ids = {item["label"]: item["id"] for item in opaque(multiple)["choices"]}
    assert evaluate(multiple, 7, AnswerInput(choice_ids=[ids["C"], ids["A"]])).correct
    assert not evaluate(multiple, 7, AnswerInput(choice_ids=[ids["A"]])).correct
    with pytest.raises(InvalidAnswer):
        evaluate(multiple, 7, AnswerInput(choice_ids=[]))

    reorder = base("reorder", correct_ids=["c", "a", "b"])
    ids = {item["label"]: item["id"] for item in opaque(reorder)["choices"]}
    assert evaluate(reorder, 7, AnswerInput(choice_ids=[ids["C"], ids["A"], ids["B"]])).correct
    assert not evaluate(reorder, 7, AnswerInput(choice_ids=[ids["A"], ids["B"], ids["C"]])).correct

    matching = base("matching", correct_ids=[], match_targets=[{"id": "x", "label": "X"}, {"id": "y", "label": "Y"}, {"id": "z", "label": "Z"}],
                    correct_pairs={"a": "y", "b": "z", "c": "x"})
    view = opaque(matching)
    choices = {item["label"]: item["id"] for item in view["choices"]}
    targets = {item["label"]: item["id"] for item in view["match_targets"]}
    good = {choices["A"]: targets["Y"], choices["B"]: targets["Z"], choices["C"]: targets["X"]}
    assert evaluate(matching, 7, AnswerInput(pairs=good)).correct
    assert not evaluate(matching, 7, AnswerInput(pairs={**good, choices["A"]: targets["X"]})).correct
    with pytest.raises(InvalidAnswer):
        evaluate(matching, 7, AnswerInput(pairs={choices["A"]: targets["Y"]}))
    # The same answer is meaningless for another mission version.
    with pytest.raises(InvalidAnswer):
        evaluate(matching, 8, AnswerInput(pairs=good))
