"""Part J (ADR-0025): read-only observer accounts created, set and disabled by the teacher."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.main import app
from app.models import User
from test_student import FORBIDDEN_KEYS, env, missions_of, post, walk_keys  # noqa: F401  (fixture reuse)


def sign_in(username: str, password: str) -> TestClient:
    client = TestClient(app)
    assert client.post("/api/v1/auth/login", json={"username": username, "password": password}).status_code == 200
    return client


def create(teacher: TestClient, username: str = "inspecteur.demo", **options) -> dict:
    created = post(teacher, "/api/v1/teacher/observers", {"username": username, **options})
    assert created.status_code == 201, created.text
    return created.json()


def test_teacher_creates_an_observer_whose_password_is_shown_once(env):
    clients, _ = env
    teacher = clients["teacher"]
    created = create(teacher)
    assert created["password"].count("-") == 2 and created["enabled"] is True and created["named"] is False
    listed = teacher.get("/api/v1/teacher/observers").json()
    assert [item["username"] for item in listed] == ["inspecteur.demo"] and "password" not in listed[0]
    assert post(teacher, "/api/v1/teacher/observers", {"username": "inspecteur.demo"}).status_code == 409
    assert post(teacher, "/api/v1/teacher/observers", {"username": "Avec Espace"}).status_code == 422
    observer = sign_in("inspecteur.demo", created["password"])
    assert observer.get("/api/v1/auth/me").json()["role"] == "observer"


def test_observer_reads_course_progress_results_and_csv_without_answer_keys_and_anonymised(env):
    clients, _ = env
    teacher, a = clients["teacher"], clients["a"]
    # Student A solves the first mission so that progress and results have something to show.
    first = missions_of(a)[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{first}").json()
    right = next(c["id"] for c in view["definition"]["choices"] if c["label"].startswith("La jointure"))
    post(a, f"/api/v1/student/missions/{first}/attempts", {"idempotency_key": "observer-0001", "answer": {"choice_ids": [right]}})
    observer = sign_in("inspecteur.demo", create(teacher)["password"])
    classes = observer.get("/api/v1/observer/classes").json()
    assignment = classes[0]["id"]
    course = observer.get(f"/api/v1/observer/classes/{assignment}/course").json()
    assert course["show_answers"] is False and course["corrections"] == {} and course["modules"]
    progress = observer.get(f"/api/v1/observer/classes/{assignment}/progress").json()
    results = observer.get(f"/api/v1/observer/classes/{assignment}/results").json()
    for payload in (classes, course, progress, results):
        assert walk_keys(payload) == []  # no answer key, no private definition
    names = [student["display_name"] for student in progress["students"]]
    assert names[0] == "Étudiant 1" and not any("demo" in name for name in names)
    assert "id" not in results["students"][0] and all("demo" not in s["display_name"] for s in results["students"])
    assert sum(student["completed"] for student in progress["students"]) >= 1
    exported = observer.get(f"/api/v1/observer/classes/{assignment}/results/export.csv")
    assert exported.status_code == 200 and "Étudiant 1" in exported.text and "demo.etudiant" not in exported.text
    # Every consultation is audited and visible to the teacher.
    views = teacher.get("/api/v1/teacher/observers/views").json()
    assert [item["view"] for item in views][:5] == ["results.csv", "results", "progress", "course", "classes"]
    assert all(item["observer"] == "inspecteur.demo" for item in views)


def test_teacher_options_named_results_and_answer_keys_then_disable(env):
    clients, _ = env
    teacher = clients["teacher"]
    created = create(teacher, show_answers=True, named=True)
    observer = sign_in("inspecteur.demo", created["password"])
    assignment = observer.get("/api/v1/observer/classes").json()[0]["id"]
    course = observer.get(f"/api/v1/observer/classes/{assignment}/course").json()
    assert course["show_answers"] is True and any("correct_ids" in item for item in course["corrections"].values())
    assert walk_keys(course["modules"]) == []  # the student view itself stays clean
    progress = observer.get(f"/api/v1/observer/classes/{assignment}/progress").json()
    assert "demo.etudiant01" in [student["display_name"] for student in progress["students"]]
    changed = teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"show_answers": False, "named": False},
                            headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert changed.status_code == 200 and changed.json()["show_answers"] is False
    assert observer.get(f"/api/v1/observer/classes/{assignment}/course").json()["corrections"] == {}
    # Disabled: the open session and new logins are refused.
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"enabled": False}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert observer.get("/api/v1/observer/classes").status_code == 401
    assert TestClient(app).post("/api/v1/auth/login", json={"username": "inspecteur.demo", "password": created["password"]}).status_code == 401
    # A new password (shown once) works again after re-enabling.
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"enabled": True}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    fresh = post(teacher, f"/api/v1/teacher/observers/{created['id']}/reset-password").json()["password"]
    assert fresh != created["password"] and sign_in("inspecteur.demo", fresh).get("/api/v1/auth/me").status_code == 200


def test_another_teacher_neither_sees_nor_manages_the_observer_and_the_observer_sees_only_its_owner(env):
    clients, engine = env
    created = create(clients["teacher"])
    with Session(engine) as db:
        db.add(User(username="autre.enseignant", password_hash=password_hash.hash("other-teacher-pass"), role="teacher"))
        db.commit()
    other = sign_in("autre.enseignant", "other-teacher-pass")
    assert other.get("/api/v1/teacher/observers").json() == []
    assert other.get("/api/v1/teacher/observers/views").json() == []
    assert other.patch(f"/api/v1/teacher/observers/{created['id']}", json={"enabled": False},
                       headers={"X-CSRF-Token": other.cookies["academy_csrf"]}).status_code == 404
    assert post(other, f"/api/v1/teacher/observers/{created['id']}/reset-password").status_code == 404
    observer = sign_in("inspecteur.demo", created["password"])
    assert observer.get("/api/v1/observer/classes/999999/progress").status_code == 404
    # Self-service routes of students and teachers are not for observers.
    assert observer.get("/api/v1/notifications").status_code == 403
    assert observer.get("/api/v1/radio").status_code == 403
    assert post(observer, "/api/v1/presence", {}).status_code == 403
