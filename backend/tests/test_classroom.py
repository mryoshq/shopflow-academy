"""Sprint 2, part A: blocks opened per class, help requests, the single class and course,
cleanup of test courses and the mandatory APP_SECRET in production."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app import projection
from app.config import Settings, check_secure_settings, get_settings
from app.models import AuditEvent, BlockState, Cohort, Course, Enrollment, User
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)
from test_teacher_dashboard import other_teacher


def definition(objective_id: int, label: str, *, bonus: bool = False) -> dict:
    return {
        "kind": "single_choice", "scenario": f"Situation fictive {label} à Tanzar.", "instructions": f"Question {label} ?",
        "objective_ids": [objective_id], "choices": [{"id": "ok", "label": f"Bonne réponse {label}"}, {"id": "ko", "label": f"Autre {label}"}],
        "correct_ids": ["ok"], "feedback": {"ok": f"Retour privé {label}"}, "explanation": f"Explication privée {label}",
        "hints": [f"Indice {label}"], "max_points": 5, "estimated_duration_minutes": 15, "bonus": bonus,
    }


def two_block_course(teacher: TestClient, slug: str = "cours-blocs") -> dict:
    """A course with two blocks: Bloc A (one mission + one bonus) and Bloc B (one mission)."""
    course = post(teacher, "/api/v1/teacher/courses", {"slug": slug, "title": "Cours en blocs"}).json()["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "OBJ-B", "statement": "Avancer par blocs"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Module SQL"}).json()["id"]
    chapters = {}
    for order, (name, missions) in enumerate([("Bloc A", [("a1", False), ("a2", True)]), ("Bloc B", [("b1", False)])]):
        chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": name, "sort_order": order}).json()["id"]
        chapters[name] = chapter
        for index, (mission, bonus) in enumerate(missions):
            response = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions",
                            {"slug": mission, "title": f"Mission {mission}", "sort_order": index, "definition": definition(objective, mission, bonus=bonus)})
            assert response.status_code == 201, response.text
    return {"course": course, "chapters": chapters}


def give_to_class(teacher: TestClient, engine, course_id: int, label: str = "Classe blocs") -> dict:
    release = post(teacher, f"/api/v1/teacher/courses/{course_id}/publish").json()["id"]
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": label}).json()["id"]
    with Session(engine) as db:
        for name in ("demo.etudiant01", "demo.etudiant02"):
            user_id = db.scalar(select(User.id).where(User.username == name))
            post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": user_id})
    assignment = post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release}).json()["id"]
    return {"release": release, "cohort": cohort, "assignment": assignment}


def course_of(client: TestClient, title: str = "Cours en blocs") -> dict:
    return next(item for item in client.get("/api/v1/student/dashboard").json()["courses"] if item["title"] == title)


def test_closed_blocks_expose_nothing_and_open_in_order(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    built = two_block_course(teacher)
    klass = give_to_class(teacher, engine, built["course"])
    course = course_of(a)
    # Newly published blocks arrive closed: titles only, no mission, no content anywhere.
    assert [b["title"] for b in course["modules"][0]["blocks"]] == ["Bloc A", "Bloc B"]
    assert all(b["open"] is False and b["mission_ids"] == [] for b in course["modules"][0]["blocks"])
    assert course["modules"][0]["blocks"][0]["mission_count"] == 1 and course["modules"][0]["blocks"][0]["bonus_count"] == 1
    assert course["missions"] == []
    snapshot = a.get(f"/api/v1/student/courses/{klass['release']}").text
    assert "Mission a1" not in snapshot and "Situation fictive" not in snapshot and "Question" not in snapshot
    with Session(engine) as db:
        from app.models import CourseRelease
        release = db.get(CourseRelease, klass["release"])
        hidden = [m["mission_version_id"] for mod in release.student_snapshot["modules"] for ch in mod["chapters"] for m in ch["missions"]]
    for version in hidden:
        assert a.get(f"/api/v1/student/missions/{version}").status_code == 404
        assert a.get(f"/api/v1/student/missions/{version}/attempts").status_code == 404
        assert post(a, f"/api/v1/student/missions/{version}/hints").status_code == 404
        assert post(a, f"/api/v1/student/missions/{version}/help", {}).status_code == 404
        assert attempt(a, version, f"closed-{version:04d}", choice_ids=["x"]).status_code == 404

    # "Ouvrir le bloc suivant" opens Bloc A, then Bloc B; Bloc A stays open.
    opened = post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/open-next").json()
    assert opened["title"] == "Bloc A" and opened["changed"] is True
    course = course_of(a)
    assert [m["title"] for m in course["missions"]] == ["Mission a1", "Mission a2"]
    assert course["missions"][1]["bonus"] is True
    view = a.get(f"/api/v1/student/missions/{course['missions'][0]['mission_version_id']}").json()
    assert view["total"] == 2 and view["next_id"] == course["missions"][1]["mission_version_id"]
    assert post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/open-next").json()["title"] == "Bloc B"
    assert [m["title"] for m in course_of(a)["missions"]] == ["Mission a1", "Mission a2", "Mission b1"]
    assert post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/open-next").status_code == 409
    # Closing a block hides it again; unknown block → 404; audit trail in the journal.
    closed = post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc B']}/close").json()
    assert closed["open"] is False
    assert [m["title"] for m in course_of(a)["missions"]] == ["Mission a1", "Mission a2"]
    assert post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/999999/open").status_code == 404
    log = [item["action"] for item in teacher.get(f"/api/v1/teacher/classes/{klass['assignment']}/interventions").json()]
    assert log[:3] == ["block.close", "block.open", "block.open"]
    # Student B, in the same class, sees the same blocks.
    assert [m["title"] for m in course_of(clients["b"])["missions"]] == ["Mission a1", "Mission a2"]


def test_individual_unlock_reaches_a_closed_block_for_one_student(env):
    clients, engine = env
    teacher = clients["teacher"]
    built = two_block_course(teacher)
    klass = give_to_class(teacher, engine, built["course"])
    with Session(engine) as db:
        from app.models import CourseRelease
        release = db.get(CourseRelease, klass["release"])
        b1 = next(m["mission_version_id"] for mod in release.student_snapshot["modules"] for ch in mod["chapters"]
                  for m in ch["missions"] if m["slug"] == "b1")
        student_a = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
    detail = teacher.get(f"/api/v1/teacher/classes/{klass['assignment']}/students/{student_a}").json()
    assert next(m for m in detail["missions"] if m["mission_version_id"] == b1)["block_open"] is False
    assert post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/unlocks", {"user_id": student_a, "mission_version_id": b1}).status_code == 201
    assert [m["title"] for m in course_of(clients["a"])["missions"]] == ["Mission b1"]
    assert clients["a"].get(f"/api/v1/student/missions/{b1}").json()["definition"] is not None
    assert course_of(clients["b"])["missions"] == []
    assert clients["b"].get(f"/api/v1/student/missions/{b1}").status_code == 404


def test_help_requests_are_private_and_handled_by_the_owner(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    klass = teacher.get("/api/v1/teacher/classes").json()[0]
    first = missions_of(a)[0]["mission_version_id"]
    assert a.get(f"/api/v1/student/missions/{first}").json()["help_request"] is None
    assert a.post(f"/api/v1/student/missions/{first}/help", json={}).status_code == 403  # CSRF
    assert post(a, f"/api/v1/student/missions/{first}/help", {"message": "<b>gras</b>"}).status_code == 422
    assert post(a, f"/api/v1/student/missions/{first}/help", {"message": "x" * 301}).status_code == 422
    created = post(a, f"/api/v1/student/missions/{first}/help", {"message": "Je ne comprends pas le grain."})
    assert created.status_code == 201 and created.json()["status"] == "pending"
    again = post(a, f"/api/v1/student/missions/{first}/help", {"message": "Toujours bloqué"})
    assert again.status_code == 200 and again.json()["id"] == created.json()["id"]
    # A student sees only their own requests.
    assert [item["id"] for item in a.get("/api/v1/student/help").json()] == [created.json()["id"]]
    assert b.get("/api/v1/student/help").json() == []
    assert b.get(f"/api/v1/student/missions/{first}").json()["help_request"] is None
    assert b.post(f"/api/v1/teacher/help/{created.json()['id']}/handle", headers={"X-CSRF-Token": b.cookies["academy_csrf"]}).status_code == 403
    # The teacher sees it in the timeline, with the block, the mission and the message.
    timeline = teacher.get(f"/api/v1/teacher/classes/{klass['id']}/timeline").json()
    assert timeline["help"][0]["student"] == "demo.etudiant01" and timeline["help"][0]["message"] == "Je ne comprends pas le grain."
    assert timeline["help"][0]["block"] == "Données ShopFlow" and timeline["blocks"][0]["help_pending"] == 1
    # Another teacher cannot handle it (404); the owner can, once (idempotent), audited.
    assert post(other_teacher(engine), f"/api/v1/teacher/help/{created.json()['id']}/handle").status_code == 404
    handled = post(teacher, f"/api/v1/teacher/help/{created.json()['id']}/handle").json()
    assert handled["status"] == "handled"
    assert post(teacher, f"/api/v1/teacher/help/{created.json()['id']}/handle").json()["status"] == "handled"
    assert a.get(f"/api/v1/student/missions/{first}").json()["help_request"]["status"] == "handled"
    assert teacher.get(f"/api/v1/teacher/classes/{klass['id']}/timeline").json()["help"] == []
    log = teacher.get(f"/api/v1/teacher/classes/{klass['id']}/interventions").json()
    assert log[0]["action"] == "help.handled" and log[0]["details"]["student"] == "demo.etudiant01"
    # After it is handled, a new request can be made.
    assert post(a, f"/api/v1/student/missions/{first}/help", {}).status_code == 201


def test_timeline_counts_completion_attempts_hints_and_stuck_students(env):
    clients, _ = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    klass = teacher.get("/api/v1/teacher/classes").json()[0]
    missions = missions_of(a)
    first = missions[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{first}").json()
    for key in ("stuck-0001", "stuck-0002", "stuck-0003"):
        attempt(b, first, key, choice_ids=[choice_id(view, "Supprimer")])
    post(b, f"/api/v1/student/missions/{first}/hints")
    attempt(a, first, "solve-0001", choice_ids=[choice_id(view, "La jointure")])
    data = teacher.get(f"/api/v1/teacher/classes/{klass['id']}/timeline").json()
    assert data["block_minutes"] == 15 and data["student_count"] == 2 and data["next_block_id"] is None
    block = data["blocks"][0]
    assert block["open"] is True and block["opened_at"] and block["mission_count"] == 3 and block["completed_students"] == 0
    stats = {item["title"]: item for item in data["missions"]}
    first_stats = stats["Frais de livraison après une jointure"]
    assert first_stats["completed"] == 1 and first_stats["attempts"] == 4 and first_stats["hints"] == 1
    assert first_stats["stuck"] == ["demo.etudiant02"]


def test_main_class_and_course_are_set_up_idempotently_and_publication_keeps_blocks(env, monkeypatch):
    clients, engine = env
    teacher = clients["teacher"]
    monkeypatch.setattr(get_settings(), "main_course_slug", "cours-principal")
    monkeypatch.setattr(get_settings(), "class_label", "Classe principale")
    assert teacher.get("/api/v1/teacher/main").json() == {"course": None, "cohort": None, "assignment_id": None,
                                                          "assigned_version": None, "latest_version": None}
    first = post(teacher, "/api/v1/teacher/main/setup").json()
    assert first["course"]["slug"] == "cours-principal" and first["course"]["status"] == "draft"
    # Every active student is in the class (here the fixture's three active students).
    assert first["cohort"]["student_count"] == 3 and first["enrolled_now"] == 3
    second = post(teacher, "/api/v1/teacher/main/setup").json()
    assert second["enrolled_now"] == 0 and second["course"]["id"] == first["course"]["id"] and second["cohort"]["id"] == first["cohort"]["id"]
    with Session(engine) as db:
        assert db.scalar(select(Cohort.id).where(Cohort.label == "Classe principale")) == first["cohort"]["id"]
        assert len(db.scalars(select(Course).where(Course.slug == "cours-principal")).all()) == 1
        assert len(db.scalars(select(Enrollment).where(Enrollment.cohort_id == first["cohort"]["id"])).all()) == 3
    # Another teacher cannot take over the main course.
    assert post(other_teacher(engine), "/api/v1/teacher/main/setup").status_code == 409

    # Fill and publish the main course: it goes to the class, blocks closed.
    course_id = first["course"]["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course_id}/objectives", {"code": "OBJ-M", "statement": "Objectif"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course_id}/modules", {"title": "Module"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Bloc 1"}).json()["id"]
    post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions", {"slug": "m1", "title": "Mission 1", "definition": definition(objective, "m1")})
    published = post(teacher, "/api/v1/teacher/main/publish")
    assert published.status_code == 201, published.text
    assignment = published.json()["assignment_id"]
    state = teacher.get("/api/v1/teacher/main").json()
    assert state["assignment_id"] == assignment and state["assigned_version"] == 1
    main = course_of(clients["a"], "Python Data Engineering & SQL Avancé")
    assert main["missions"] == [] and main["modules"][0]["blocks"][0]["open"] is False
    post(teacher, f"/api/v1/teacher/classes/{assignment}/blocks/open-next")
    # A new version (one more block) moves the same class assignment: opened blocks stay open, the new one is closed.
    chapter2 = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Bloc 2", "sort_order": 1}).json()["id"]
    post(teacher, f"/api/v1/teacher/chapters/{chapter2}/missions", {"slug": "m2", "title": "Mission 2", "definition": definition(objective, "m2")})
    again = post(teacher, "/api/v1/teacher/main/publish").json()
    assert again["assignment_id"] == assignment and again["version"] == 2
    main = course_of(clients["a"], "Python Data Engineering & SQL Avancé")
    assert main["version"] == 2 and [b["open"] for b in main["modules"][0]["blocks"]] == [True, False]
    assert [m["title"] for m in main["missions"]] == ["Mission 1"]
    assert len([c for c in clients["a"].get("/api/v1/student/dashboard").json()["courses"] if c["title"].startswith("Python")]) == 1


def test_cleanup_archives_only_test_courses_and_simulates_by_default(env, monkeypatch):
    clients, engine = env
    teacher = clients["teacher"]
    monkeypatch.setattr(get_settings(), "class_label", "Classe principale")
    monkeypatch.setattr(get_settings(), "main_course_slug", "cours-principal")
    post(teacher, "/api/v1/teacher/main/setup")
    for slug in ("e2e-ancien", "test-import-x", "cours-reel"):
        post(teacher, "/api/v1/teacher/courses", {"slug": slug, "title": slug})
    # A test-like course given to the real class is never a candidate.
    protected = two_block_course(teacher, "demo-donnee-a-la-classe")
    release = post(teacher, f"/api/v1/teacher/courses/{protected['course']}/publish").json()["id"]
    cohort = teacher.get("/api/v1/teacher/main").json()["cohort"]["id"]
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release})
    dry = post(teacher, "/api/v1/teacher/courses/cleanup", {}).json()
    slugs = {item["slug"] for item in dry["courses"]}
    # The demo fixture course (slug demo-…, given to the demo cohort only) is a candidate too.
    assert dry["mode"] == "dry-run" and slugs == {"e2e-ancien", "test-import-x", "demo-shopflow-donnees"}
    with Session(engine) as db:
        assert db.scalar(select(Course).where(Course.slug == "e2e-ancien")).status == "draft"
    applied = post(teacher, "/api/v1/teacher/courses/cleanup", {"apply": True}).json()
    assert applied["count"] == 3
    with Session(engine) as db:
        statuses = {c.slug: c.status for c in db.scalars(select(Course))}
        assert statuses["e2e-ancien"] == statuses["test-import-x"] == "archived"
        assert statuses["cours-reel"] == "draft" and statuses["demo-donnee-a-la-classe"] == "published"
        assert len(db.scalars(select(AuditEvent).where(AuditEvent.action == "course.archive")).all()) == 3
    assert post(teacher, "/api/v1/teacher/courses/cleanup", {}).json()["count"] == 0


def test_app_secret_is_required_in_production():
    with pytest.raises(RuntimeError):
        check_secure_settings(Settings(app_env="production", app_secret=""))
    with pytest.raises(RuntimeError):
        check_secure_settings(Settings(app_env="production", app_secret="trop-court"))
    check_secure_settings(Settings(app_env="production", app_secret="s" * 48))
    check_secure_settings(Settings(app_env="development", app_secret=""))


def test_existing_attempts_stay_valid_when_app_secret_is_set(env, monkeypatch):
    clients, engine = env
    a = clients["a"]
    first = missions_of(a)[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{first}").json()
    assert attempt(a, first, "before-secret-1", choice_ids=[choice_id(view, "La jointure")]).status_code == 201
    old_ids = {c["id"] for c in view["definition"]["choices"]}
    # The owner sets APP_SECRET: opaque IDs change, stored attempts (authored IDs) do not.
    monkeypatch.setattr(get_settings(), "app_secret", "n" * 48)
    projection._key.cache_clear()
    try:
        after = a.get(f"/api/v1/student/missions/{first}").json()
        assert {c["id"] for c in after["definition"]["choices"]}.isdisjoint(old_ids)
        assert after["status"] == "completed" and after["score"]["best"] == 10 and after["attempts_count"] == 1
        from app.progress import replay
        with Session(engine) as db:
            assert replay(db) == []
        assert attempt(a, first, "after-secret-1", choice_ids=[choice_id(after, "La jointure")]).status_code == 201
    finally:
        projection._key.cache_clear()


def test_migration_opens_the_blocks_of_existing_assignments(tmp_path):
    url = f"sqlite:///{tmp_path / 'blocks.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "0006_class_control")
    engine = create_engine(url)
    snapshot = '{"modules": [{"title": "M", "chapters": [{"id": 1, "title": "C1", "missions": []}, {"id": 2, "title": "C2", "missions": []}]}]}'
    with engine.begin() as db:
        db.execute(text("INSERT INTO users (id, username, password_hash, role) VALUES (1, 't', 'x', 'teacher')"))
        db.execute(text("INSERT INTO courses (id, slug, title, created_by) VALUES (1, 'c', 'C', 1)"))
        db.execute(text("INSERT INTO course_modules (id, course_id, title) VALUES (1, 1, 'M')"))
        db.execute(text("INSERT INTO chapters (id, module_id, title) VALUES (1, 1, 'C1'), (2, 1, 'C2'), (3, 1, 'C3')"))
        db.execute(text("INSERT INTO course_releases (id, course_id, version, snapshot_hash, student_snapshot, published_by) "
                        "VALUES (1, 1, 1, 'h', :s, 1)"), {"s": snapshot})
        db.execute(text("INSERT INTO cohorts (id, label) VALUES (1, 'K')"))
        db.execute(text("INSERT INTO assignments (id, cohort_id, course_release_id) VALUES (1, 1, 1)"))
    engine.dispose()
    command.upgrade(config, "head")
    engine = create_engine(url)
    with Session(engine) as db:
        rows = db.scalars(select(BlockState)).all()
        assert sorted((r.cohort_id, r.chapter_id) for r in rows) == [(1, 1), (1, 2)]
        assert all(r.opened_at is not None for r in rows)
    engine.dispose()
