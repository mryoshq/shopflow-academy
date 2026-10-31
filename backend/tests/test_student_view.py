"""ADR-0043: the teacher's « Vue étudiant » shows the student application and never writes anything."""

from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.models import AuditEvent
from test_student import choice_id, env, missions_of, post, walk_keys  # noqa: F401  (fixture reuse)


def row_counts(engine) -> dict[str, int]:
    with Session(engine) as db:
        return {name: db.scalar(select(func.count()).select_from(text(name)))
                for name in inspect(engine).get_table_names() if name != "alembic_version"}


def test_student_view_is_the_student_dashboard_and_mission_without_any_write(env):
    clients, engine = env
    teacher = clients["teacher"]
    assignment = teacher.get("/api/v1/teacher/classes").json()[0]["id"]
    base = f"/api/v1/teacher/classes/{assignment}/student-view"
    student_dashboard = clients["a"].get("/api/v1/student/dashboard").json()
    before = row_counts(engine)

    view = teacher.get(f"{base}/dashboard")
    assert view.status_code == 200 and view.headers["cache-control"] == "no-store"
    body = view.json()
    assert body["student_view"] is True and walk_keys(body) == []
    # Same course, same blocks and missions as a student of the class (who has done nothing yet).
    mine, theirs = body["courses"][0], student_dashboard["courses"][0]
    assert mine["title"] == theirs["title"] and mine["version"] == theirs["version"]
    assert [(m["mission_version_id"], m["status"]) for m in mine["missions"]] == [(m["mission_version_id"], m["status"]) for m in theirs["missions"]]
    assert [b["open"] for module in mine["modules"] for b in module["blocks"]] == [b["open"] for module in theirs["modules"] for b in module["blocks"]]
    assert mine["rewards"]["level"]["xp"] == 0 and mine["rewards"]["badge_count"] == 0

    first = mine["missions"][0]["mission_version_id"]
    mission = teacher.get(f"{base}/missions/{first}").json()
    assert walk_keys(mission) == [] and mission["hints"] == [] and mission["explanation"] is None
    assert "Exact :" not in str(mission) and mission["attempts_count"] == 0
    # An answer is graded like a first attempt, with 0 point; the correction is never sent.
    wrong = post(teacher, f"{base}/missions/{first}/check", {"answer": {"choice_ids": [choice_id(mission, "Remplacer par SUM(DISTINCT")]}}).json()
    assert wrong["correct"] is False and wrong["points"] == 0 and wrong["explanation"] is None and walk_keys(wrong) == []
    right = post(teacher, f"{base}/missions/{first}/check", {"answer": {"choice_ids": [choice_id(mission, "La jointure")]}}).json()
    assert right["correct"] is True and right["points"] == 0 and right["score"]["best"] == 0 and "70 DH" in right["explanation"]
    assert post(teacher, f"{base}/missions/{first}/check", {"answer": {"choice_ids": ["c-inventé"]}}).status_code == 422
    hints = post(teacher, f"{base}/missions/{first}/hints", {"shown": 0}).json()
    assert len(hints["hints"]) == 1 and hints["hint_count"] >= 1
    assert teacher.get(f"{base}/project").json()["team"] is None

    # Nothing was written: no attempt, opening, hint, reward, presence, notification or audit event.
    assert row_counts(engine) == before
    # The class did not change for the students either.
    assert clients["a"].get("/api/v1/student/dashboard").json() == student_dashboard


def test_every_block_on_request_and_missions_of_closed_blocks_hidden_otherwise(env):
    clients, engine = env
    teacher = clients["teacher"]
    assignment = teacher.get("/api/v1/teacher/classes").json()[0]["id"]
    base = f"/api/v1/teacher/classes/{assignment}/student-view"
    shown = teacher.get(f"{base}/dashboard").json()["courses"][0]
    every = teacher.get(f"{base}/dashboard?all=true").json()["courses"][0]
    assert len(every["missions"]) >= len(shown["missions"])
    assert all(b["open"] for module in every["modules"] for b in module["blocks"])
    hidden = {m["mission_version_id"] for m in every["missions"]} - {m["mission_version_id"] for m in shown["missions"]}
    for version in hidden:
        assert teacher.get(f"{base}/missions/{version}").status_code == 404
        assert teacher.get(f"{base}/missions/{version}?all=true").status_code == 200
    with Session(engine) as db:
        assert db.scalar(select(func.count(AuditEvent.id)).where(AuditEvent.action.like("%student_view%"))) == 0


def test_only_the_class_teacher_and_never_a_student(env):
    clients, _ = env
    assignment = clients["teacher"].get("/api/v1/teacher/classes").json()[0]["id"]
    base = f"/api/v1/teacher/classes/{assignment}/student-view"
    assert clients["a"].get(f"{base}/dashboard").status_code == 403
    assert post(clients["a"], f"{base}/missions/1/check", {"answer": {}}).status_code == 403
    assert clients["teacher"].get("/api/v1/teacher/classes/999999/student-view/dashboard").status_code == 404
    first = missions_of(clients["a"])[0]["mission_version_id"]
    # Without CSRF, a check is refused like every write route.
    assert clients["teacher"].post(f"{base}/missions/{first}/check", json={"answer": {}}).status_code == 403
