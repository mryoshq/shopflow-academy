from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.main import app
from app.models import Cohort, Enrollment, User
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)


def other_teacher(engine) -> TestClient:
    with Session(engine) as db:
        db.add(User(username="autre.enseignant", password_hash=password_hash.hash("other-pass"), role="teacher"))
        db.commit()
    client = TestClient(app)
    assert client.post("/api/v1/auth/login", json={"username": "autre.enseignant", "password": "other-pass"}).status_code == 200
    return client


def the_class(client: TestClient) -> dict:
    classes = client.get("/api/v1/teacher/classes").json()
    assert len(classes) == 1
    return classes[0]


def test_overview_tracks_progress_activity_and_help(env):
    clients, _ = env
    klass = the_class(clients["teacher"])
    assert klass["course_title"].startswith("Démonstration") and klass["student_count"] == 2 and klass["paused"] is False
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    for key in ("help-0001", "help-0002", "help-0003"):
        attempt(clients["a"], first, key, choice_ids=[choice_id(view, "Supprimer")])
    post(clients["a"], f"/api/v1/student/missions/{first}/hints")
    data = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/overview").json()
    assert [m["title"] for m in data["missions"]][0] == "Frais de livraison après une jointure"
    rows = {row["display_name"]: row for row in data["students"]}
    assert set(rows) == {"demo.etudiant01", "demo.etudiant02"}
    a = rows["demo.etudiant01"]
    assert a["attempts"] == 3 and a["hints"] == 1 and a["active"] is True
    assert a["current_mission"] == "Frais de livraison après une jointure"
    assert a["needs_help"] == ["Frais de livraison après une jointure"]
    attempt(clients["a"], first, "help-0004", choice_ids=[choice_id(view, "La jointure")])
    a = {row["display_name"]: row for row in clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/overview").json()["students"]}["demo.etudiant01"]
    assert a["needs_help"] == [] and a["completed"] == 1 and a["core_points"] == 10 and a["core_possible"] == 30
    b = rows["demo.etudiant02"]
    assert b["attempts"] == 0 and b["active"] is False and b["last_activity"] is None
    detail = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/students/{a['id']}").json()
    assert detail["missions"][0]["best_points"] == 10 and len(detail["attempts"]) == 4
    assert "answer" not in detail["attempts"][0]


def test_pause_blocks_attempts_and_resume_reopens(env):
    clients, _ = env
    klass = the_class(clients["teacher"])
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    assert clients["teacher"].post(f"/api/v1/teacher/classes/{klass['id']}/pause").status_code == 403  # CSRF
    assert post(clients["teacher"], f"/api/v1/teacher/classes/{klass['id']}/pause").json()["paused"] is True
    assert clients["a"].get("/api/v1/student/dashboard").json()["courses"][0]["paused"] is True
    assert clients["a"].get(f"/api/v1/student/missions/{first}").json()["paused"] is True
    blocked = attempt(clients["a"], first, "paused-0001", choice_ids=[choice_id(view, "La jointure")])
    assert blocked.status_code == 409 and blocked.json()["detail"] == "sequence paused"
    assert post(clients["a"], f"/api/v1/student/missions/{first}/hints").status_code == 409
    assert post(clients["teacher"], f"/api/v1/teacher/classes/{klass['id']}/resume").json()["paused"] is False
    assert attempt(clients["a"], first, "paused-0002", choice_ids=[choice_id(view, "La jointure")]).status_code == 201
    log = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/interventions").json()
    assert [item["action"] for item in log] == ["class.resume", "class.pause"]
    assert log[0]["actor"] == "demo.enseignant"


def test_unlock_lifts_prerequisite_for_one_student(env):
    clients, engine = env
    klass = the_class(clients["teacher"])
    pipeline = missions_of(clients["b"])[2]["mission_version_id"]
    assert missions_of(clients["b"])[2]["status"] == "locked"
    with Session(engine) as db:
        b_id = db.scalar(select(User.id).where(User.username == "demo.etudiant02"))
        outsider_id = db.scalar(select(User.id).where(User.username == "prenom.nom@example.com"))
    url = f"/api/v1/teacher/classes/{klass['id']}/unlocks"
    created = post(clients["teacher"], url, {"user_id": b_id, "mission_version_id": pipeline})
    assert created.status_code == 201 and created.json()["created"] is True
    assert post(clients["teacher"], url, {"user_id": b_id, "mission_version_id": pipeline}).status_code == 200
    assert post(clients["teacher"], url, {"user_id": outsider_id, "mission_version_id": pipeline}).status_code == 404
    assert post(clients["teacher"], url, {"user_id": b_id, "mission_version_id": 999_999}).status_code == 404
    row = missions_of(clients["b"])[2]
    assert row["status"] == "not_started" and row["unlocked_by_teacher"] is True
    assert missions_of(clients["a"])[2]["status"] == "locked"  # only the chosen student
    log = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/interventions").json()
    assert log[0]["action"] == "mission.unlock"
    assert log[0]["details"] == {"student": "demo.etudiant02", "mission": "Ordonner un pipeline d'ingestion"}


def test_export_csv_is_complete_and_formula_safe(env):
    clients, engine = env
    klass = the_class(clients["teacher"])
    with Session(engine) as db:
        db.add(User(username="=HYPERLINK(1)", password_hash=password_hash.hash("x" * 12), role="student"))
        db.flush()
        user_id = db.scalar(select(User.id).where(User.username == "=HYPERLINK(1)"))
        db.add(Enrollment(cohort_id=klass["cohort_id"], user_id=user_id))
        db.commit()
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    attempt(clients["a"], first, "export-0001", choice_ids=[choice_id(view, "La jointure")])
    response = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/export.csv")
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    text = response.content.decode("utf-8")
    assert text.startswith("﻿etudiant;Frais de livraison")
    lines = text.lstrip("﻿").strip().splitlines()
    assert len(lines) == 4
    assert any(line.startswith("'=HYPERLINK(1)") for line in lines)
    assert "demo.etudiant01;10;0;0;10;30;0;1" in lines
    assert "correct" not in text and "prenom.nom" not in text
    assert clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/interventions").json()[0]["action"] == "class.export"


def test_only_the_course_owner_can_see_or_act(env):
    clients, engine = env
    klass = the_class(clients["teacher"])
    intruder = other_teacher(engine)
    assert intruder.get("/api/v1/teacher/classes").json() == []
    base = f"/api/v1/teacher/classes/{klass['id']}"
    for path in ("/overview", "/export.csv", "/interventions", f"/students/{1}"):
        assert intruder.get(base + path).status_code == 404
    for path in ("/pause", "/resume"):
        assert post(intruder, base + path).status_code == 404
    assert post(intruder, base + "/unlocks", {"user_id": 1, "mission_version_id": 1}).status_code == 404
    # Students never reach the teacher dashboard, even with a guessed ID.
    for path in ("/overview", "/export.csv", "/interventions"):
        assert clients["a"].get(base + path).status_code == 403
    assert post(clients["a"], base + "/pause").status_code == 403
    assert TestClient(app).get(base + "/overview").status_code == 401
    with Session(engine) as db:
        assert db.scalar(select(Cohort.id).where(Cohort.id == klass["cohort_id"])) is not None
