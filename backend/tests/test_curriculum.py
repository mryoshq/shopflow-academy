from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.curriculum_schema import MissionDefinition
from app.curriculum import student_safe_snapshot
from app.database import get_db
from app.main import app
from app.models import AuditEvent, CourseRelease, MissionVersion, User
from app.upsert_teacher import upsert_teacher


@pytest.fixture
def curriculum_env(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'curriculum.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(config, "head")
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    with Session(engine) as db:
        db.add_all([
            User(username="student.a", password_hash=password_hash.hash("student-a-test"), role="student"),
            User(username="student.b", password_hash=password_hash.hash("student-b-test"), role="student"),
            User(username="teacher.a", password_hash=password_hash.hash("teacher-a-test"), role="teacher"),
        ])
        db.commit()

    def override_db():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        yield TestClient(app), TestClient(app), TestClient(app), engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def signin(client: TestClient, username: str, password: str) -> None:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200


def post(client: TestClient, path: str, payload: dict | None = None):
    return client.post(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def put(client: TestClient, path: str, payload: dict):
    return client.put(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def definition(objective_id: int, correct: str = "a") -> dict:
    return {
        "schema_version": 1, "kind": "single_choice",
        "scenario": "Une commande fictive arrive à Rabat.",
        "instructions": "Choisissez la règle à appliquer.",
        "objective_ids": [objective_id],
        "choices": [{"id": "a", "label": "Règle A"}, {"id": "b", "label": "Règle B"}],
        "correct_ids": [correct], "hints": ["Lisez les données."],
        "feedback": {"a": "Explication privée A", "b": "Explication privée B"},
        "max_points": 10, "estimated_duration_minutes": 15,
    }


def test_draft_preview_publication_assignment_and_immutable_release(curriculum_env):
    teacher, student_a, student_b, engine = curriculum_env
    signin(teacher, "teacher.a", "teacher-a-test")
    signin(student_a, "student.a", "student-a-test")
    signin(student_b, "student.b", "student-b-test")
    assert post(student_a, "/api/v1/teacher/courses", {"slug": "forbidden", "title": "Non"}).status_code == 403
    assert post(teacher, "/api/v1/teacher/courses", {"slug": "demo", "title": "Démo"},).status_code == 201
    course_id = teacher.get("/api/v1/teacher/courses").json()[0]["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course_id}/objectives", {"code": "OBJ-1", "statement": "Comprendre une règle"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course_id}/modules", {"title": "Module 1"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Chapitre 1"}).json()["id"]
    mission = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "decision", "title": "Décision", "definition": definition(objective)}).json()["id"]
    changed = teacher.patch(f"/api/v1/teacher/modules/{module}", json={"sort_order": 2}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert changed.status_code == 200 and changed.json()["sort_order"] == 2
    duplicate = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "decision", "title": "Doublon"})
    assert duplicate.status_code == 409
    draft = teacher.get(f"/api/v1/teacher/courses/{course_id}").json()
    assert draft["modules"][0]["chapters"][0]["missions"][0]["definition"]["correct_ids"] == ["a"]
    preview = post(teacher, f"/api/v1/teacher/courses/{course_id}/preview").json()
    assert "correct_ids" not in str(preview)
    assert "Explication privée" not in str(preview)
    assert student_a.get("/api/v1/student/courses").json() == []
    release = post(teacher, f"/api/v1/teacher/courses/{course_id}/publish")
    assert release.status_code == 201, release.text
    old_id = release.json()["id"]
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Classe démo"}).json()["id"]
    with Session(engine) as db:
        student_id = db.scalar(select(User.id).where(User.username == "student.a"))
    assert post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student_id}).status_code == 201
    assert post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": old_id}).status_code == 201
    old_public = student_a.get(f"/api/v1/student/courses/{old_id}")
    assert old_public.status_code == 200
    assert "correct_ids" not in old_public.text and "Explication privée" not in old_public.text
    assert student_b.get(f"/api/v1/student/courses/{old_id}").status_code == 404
    assert len(student_a.get("/api/v1/student/courses").json()) == 1
    assert put(teacher, f"/api/v1/teacher/missions/{mission}/draft", definition(objective, "b")).status_code == 200
    newer = post(teacher, f"/api/v1/teacher/courses/{course_id}/publish")
    assert newer.status_code == 201
    assert newer.json()["version"] == 2
    assert teacher.delete(f"/api/v1/teacher/missions/{mission}", headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).status_code == 409
    assert student_a.get(f"/api/v1/student/courses/{old_id}").json() == old_public.json()
    assert student_a.get(f"/api/v1/student/courses/{newer.json()['id']}").status_code == 404
    with Session(engine) as db:
        assert len(db.scalars(select(CourseRelease)).all()) == 2
        assert len(db.scalars(select(MissionVersion)).all()) == 2
        assert len(db.scalars(select(AuditEvent)).all()) >= 10


def test_definition_validation_and_course_membership(curriculum_env):
    teacher, student_a, _, _ = curriculum_env
    signin(teacher, "teacher.a", "teacher-a-test")
    signin(student_a, "student.a", "student-a-test")
    course = post(teacher, "/api/v1/teacher/courses", {"slug": "second", "title": "Démo 2"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Module"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Chapitre"}).json()["id"]
    assert post(teacher, f"/api/v1/teacher/courses/{course}/publish").status_code == 422
    invalid = definition(999)
    assert post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "invalid", "title": "Invalid", "definition": invalid}).status_code == 422
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "OBJ-2", "statement": "Tester"}).json()["id"]
    invalid = definition(objective)
    invalid["correct_ids"] = ["unknown"]
    assert post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "invalid", "title": "Invalid", "definition": invalid}).status_code == 422
    invalid = definition(objective)
    invalid["scenario"] = "<script>alert(1)</script>"
    assert post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "invalid", "title": "Invalid", "definition": invalid}).status_code == 422
    assert student_a.get(f"/api/v1/teacher/courses/{course}").status_code == 403


def test_typed_activity_variants_keep_answer_keys_private():
    reorder = definition(1)
    reorder["kind"] = "reorder"
    reorder["correct_ids"] = ["b", "a"]
    parsed = MissionDefinition.model_validate(reorder)
    assert parsed.correct_ids == ["b", "a"]
    assert "correct_ids" not in parsed.student_projection()
    matching = definition(1)
    matching.update({"kind": "matching", "correct_ids": [],
                     "match_targets": [{"id": "x", "label": "Cible X"}, {"id": "y", "label": "Cible Y"}],
                     "correct_pairs": {"a": "x", "b": "y"}})
    parsed = MissionDefinition.model_validate(matching)
    assert "correct_pairs" not in parsed.student_projection()
    matching["correct_pairs"] = {"a": "x"}
    with pytest.raises(ValueError):
        MissionDefinition.model_validate(matching)
    guided = definition(1)
    guided.update({"kind": "guided_simulation", "action_id": "execute_arbitrary_code"})
    with pytest.raises(ValueError):
        MissionDefinition.model_validate(guided)


def test_sql_comparison_text_and_typed_display_data():
    item = definition(1)
    item["scenario"] = "Filtrer les lignes où montant < 100 et quantité > 0."
    item["display_data"] = {"kind": "table", "columns": ["Montant", "SQL"],
                            "rows": [[70, "SELECT * FROM ventes WHERE montant < 100"]]}
    parsed = MissionDefinition.model_validate(item)
    assert "montant < 100" in parsed.scenario
    projection = parsed.student_projection()
    for secret in ("correct_ids", "correct_pairs", "feedback", "max_points", "action_id"):
        assert secret not in projection
    unsafe = dict(item)
    unsafe["display_data"] = {"kind": "table", "columns": ["Montant"], "rows": [[70]],
                              "correct_ids": ["a"]}
    with pytest.raises(ValueError):
        MissionDefinition.model_validate(unsafe)

    legacy = {"modules": [{"chapters": [{"missions": [{"definition": {
        "kind": "single_choice", "scenario": "Comparer x < 10", "correct_ids": ["a"],
        "feedback": {"a": "secret"}, "max_points": 10, "action_id": "secret",
        "display_data": {"kind": "table", "columns": ["Valeur"], "rows": [[10]], "answer": "secret"},
    }}]}]}]}
    scrubbed = student_safe_snapshot(legacy)
    for secret in ("correct_ids", "feedback", "max_points", "action_id", "answer"):
        assert secret not in str(scrubbed)
    unsafe["display_data"] = {"kind": "table", "columns": ["Montant"], "rows": [[70, 100]]}
    with pytest.raises(ValueError):
        MissionDefinition.model_validate(unsafe)


def test_archived_course_is_read_only_and_hidden_from_students(curriculum_env):
    teacher, student, _, engine = curriculum_env
    signin(teacher, "teacher.a", "teacher-a-test")
    signin(student, "student.a", "student-a-test")
    course = post(teacher, "/api/v1/teacher/courses", {"slug": "archive-demo", "title": "À archiver"}).json()["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "ARCHIVE", "statement": "Tester l'archive"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Module"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Chapitre"}).json()["id"]
    mission = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "test", "title": "Test", "definition": definition(objective)}).json()["id"]
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Archive test"}).json()["id"]
    with Session(engine) as db:
        student_id = db.scalar(select(User.id).where(User.username == "student.a"))
    assert post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student_id}).status_code == 201
    assert post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release}).status_code == 201
    assert student.get(f"/api/v1/student/courses/{release}").status_code == 200
    assert post(student, f"/api/v1/teacher/courses/{course}/archive").status_code == 403
    assert post(teacher, f"/api/v1/teacher/courses/{course}/archive").status_code == 200
    assert student.get(f"/api/v1/student/courses/{release}").status_code == 404
    assert student.get("/api/v1/student/courses").json() == []
    assert teacher.get(f"/api/v1/teacher/courses/{course}").status_code == 200
    csrf = {"X-CSRF-Token": teacher.cookies["academy_csrf"]}
    assert teacher.patch(f"/api/v1/teacher/courses/{course}", json={"title": "Refus"}, headers=csrf).status_code == 409
    assert post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "NO", "statement": "Refus"}).status_code == 409
    assert post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Refus"}).status_code == 409
    assert teacher.patch(f"/api/v1/teacher/objectives/{objective}", json={"statement": "Refus"}, headers=csrf).status_code == 409
    assert teacher.patch(f"/api/v1/teacher/modules/{module}", json={"title": "Refus"}, headers=csrf).status_code == 409
    assert post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Refus"}).status_code == 409
    assert teacher.patch(f"/api/v1/teacher/chapters/{chapter}", json={"title": "Refus"}, headers=csrf).status_code == 409
    assert post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "no", "title": "Refus"}).status_code == 409
    assert teacher.patch(f"/api/v1/teacher/missions/{mission}", json={"title": "Refus"}, headers=csrf).status_code == 409
    assert put(teacher, f"/api/v1/teacher/missions/{mission}/draft", definition(objective)).status_code == 409
    assert post(teacher, f"/api/v1/teacher/courses/{course}/publish").status_code == 409
    assert post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release}).status_code == 422


def test_teacher_upsert_rotates_password_without_duplicate(curriculum_env):
    _, _, _, engine = curriculum_env
    with Session(engine) as db:
        assert upsert_teacher(db, "prof@example.com", "first-password-long-enough-123", "development") is True
    with Session(engine) as db:
        assert upsert_teacher(db, "PROF@example.com", "second-password-long-enough-456", "development") is False
    with Session(engine) as db:
        accounts = db.scalars(select(User).where(User.username == "prof@example.com")).all()
        assert len(accounts) == 1 and accounts[0].role == "teacher"
        assert password_hash.verify("second-password-long-enough-456", accounts[0].password_hash)


def test_student_view_hides_order_and_pairs_with_opaque_shuffled_ids():
    from app.projection import reverse_ids, student_definition

    labels = ["Lire", "Valider", "Nettoyer", "Dédupliquer", "Charger"]
    reorder = definition(1)
    reorder.update({"kind": "reorder", "choices": [{"id": f"option-{i}", "label": label} for i, label in enumerate(labels, 1)],
                    "correct_ids": [f"option-{i}" for i in range(1, 6)], "feedback": {}})
    parsed = MissionDefinition.model_validate(reorder)
    for version_id in range(1, 40):
        view = student_definition(parsed.student_projection(), version_id, parsed.model_dump())
        ids = [choice["id"] for choice in view["choices"]]
        assert [choice["label"] for choice in view["choices"]] != labels
        assert not any(raw in str(view) for raw in ["option-1", "option-2"])
        mapping = reverse_ids(version_id, "c", [choice.id for choice in parsed.choices])
        assert sorted(mapping[i] for i in ids) == sorted(parsed.correct_ids)
        assert view == student_definition(parsed.student_projection(), version_id, parsed.model_dump())

    matching = definition(1)
    matching.update({"kind": "matching", "correct_ids": [], "feedback": {},
                     "choices": [{"id": "a", "label": "Doublon"}, {"id": "b", "label": "Date vide"}],
                     "match_targets": [{"id": "x", "label": "Dédupliquer"}, {"id": "y", "label": "Imputer ou rejeter"}],
                     "correct_pairs": {"a": "x", "b": "y"}})
    parsed = MissionDefinition.model_validate(matching)
    for version_id in range(1, 40):
        view = student_definition(parsed.student_projection(), version_id, parsed.model_dump())
        choice_raw = reverse_ids(version_id, "c", ["a", "b"])
        target_raw = reverse_ids(version_id, "t", ["x", "y"])
        aligned = [parsed.correct_pairs[choice_raw[c["id"]]] == target_raw[t["id"]] for c, t in zip(view["choices"], view["match_targets"])]
        assert not all(aligned)


def test_published_student_view_uses_opaque_ids(curriculum_env):
    teacher, student_a, _, engine = curriculum_env
    signin(teacher, "teacher.a", "teacher-a-test")
    signin(student_a, "student.a", "student-a-test")
    course = post(teacher, "/api/v1/teacher/courses", {"slug": "ordre", "title": "Ordre"}).json()["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "OBJ-O", "statement": "Ordonner"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "M"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "C"}).json()["id"]
    body = definition(objective)
    body.update({"kind": "reorder", "choices": [{"id": f"option-{i}", "label": f"Étape {i}"} for i in range(1, 5)],
                 "correct_ids": [f"option-{i}" for i in range(1, 5)], "feedback": {}})
    assert post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "ordre", "title": "Ordre", "definition": body}).status_code == 201
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Classe ordre"}).json()["id"]
    with Session(engine) as db:
        student_id = db.scalar(select(User.id).where(User.username == "student.a"))
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student_id})
    assignment = post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release}).json()["id"]
    # Blocks arrive closed: the closed block exposes its title only.
    closed = student_a.get(f"/api/v1/student/courses/{release}").json()
    assert closed["modules"][0]["chapters"][0]["missions"] == [] and "Étape" not in str(closed)
    assert post(teacher, f"/api/v1/teacher/classes/{assignment}/blocks/{chapter}/open").json()["open"] is True
    text = student_a.get(f"/api/v1/student/courses/{release}").text
    assert "option-1" not in text
    view = student_a.get(f"/api/v1/student/courses/{release}").json()
    labels = [c["label"] for c in view["modules"][0]["chapters"][0]["missions"][0]["definition"]["choices"]]
    assert labels != [f"Étape {i}" for i in range(1, 5)]
