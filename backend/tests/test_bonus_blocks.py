"""Optional bonus progress must not change required completion or stored scores."""
from copy import deepcopy

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Assignment, MissionAttempt, MissionVersion
from test_classroom import definition, give_to_class, course_of
from test_student import env, post, attempt, choice_id, walk_keys  # noqa: F401
from test_teacher_dashboard import other_teacher


def test_bonus_progress_permissions_projection_and_carryover(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    course = post(teacher, "/api/v1/teacher/courses", {"slug": "bonus-fictifs", "title": "Bonus fictifs"}).json()["id"]
    obj = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "B", "statement": "Explorer"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Module fictif"}).json()["id"]
    chapters = []
    for index, (title, items) in enumerate([
        ("Bonus A", [("bonus-a", True, False), ("bonus-b", True, False)]),
        ("Mixte fictif", [("principal", False, False), ("option", True, False)]),
        ("Lecture fictive", [("lecture", False, True)]), ("Vide fictif", []),
    ]):
        ch = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": title, "sort_order": index}).json()["id"]
        chapters.append(ch)
        for order, (slug, bonus, lesson) in enumerate(items):
            d = definition(obj, slug, bonus=bonus)
            if lesson:
                d = {"kind": "lesson", "body": "Lecture fictive.", "scenario": "Texte fictif.", "instructions": "Lire.", "objective_ids": [obj], "max_points": 0, "estimated_duration_minutes": 5}
            r = post(teacher, f"/api/v1/teacher/chapters/{ch}/missions", {"slug": slug, "title": slug, "sort_order": order, "definition": d})
            assert r.status_code == 201, r.text
    klass = give_to_class(teacher, engine, course)
    prefix = f"/api/v1/teacher/classes/{klass['assignment']}"
    for chapter in chapters:
        assert post(teacher, f"{prefix}/blocks/{chapter}/open").status_code == 200
    def timeline(): return teacher.get(prefix + "/timeline").json()["blocks"]
    def live(): return teacher.get(prefix + "/live").json()
    def dashboard(): return course_of(a, "Bonus fictifs")
    assert [x["bonus_only"] for x in timeline()] == [True, False, False, False]
    assert [x["bonus_completed_students"] for x in timeline()] == [0, 0, 0, 0]
    missions = dashboard()["missions"]
    bonus_ids = [m["mission_version_id"] for m in missions if m["title"] in ("bonus-a", "bonus-b")]
    def solve(client, vid, key):
        view = client.get(f"/api/v1/student/missions/{vid}").json()
        assert not walk_keys(view)
        label = "Bonne réponse " + next(m["title"] for m in missions if m["mission_version_id"] == vid)
        assert attempt(client, vid, key, choice_ids=[choice_id(view, label)]).status_code == 201
    solve(a, bonus_ids[0], "bonus-partial-a")
    assert timeline()[0]["bonus_completed_students"] == 0
    assert live()["students"][0]["cells"][0]["bonus_done"] == 1
    solve(a, bonus_ids[1], "bonus-complete-a")
    solve(b, bonus_ids[0], "bonus-partial-b")
    assert timeline()[0]["bonus_completed_students"] == 1
    assert timeline()[0]["completed_students"] == 0
    cells = [s["cells"][0] for s in live()["students"]]
    assert [(c["bonus_done"], c["bonus_total"]) for c in cells] == [(2, 2), (1, 2)]
    assert all(c["state"] != "done" and c["total"] == 0 for c in cells)
    student_block = dashboard()["modules"][0]["blocks"][0]
    assert student_block["bonus_only"] is True and student_block["done"] is False
    principal = next(m["mission_version_id"] for m in missions if m["title"] == "principal")
    solve(a, principal, "main-only-fictif")
    assert timeline()[1]["completed_students"] == 1 and timeline()[1]["bonus_completed_students"] == 0
    assert live()["students"][0]["cells"][1]["state"] == "done"
    assert timeline()[2]["lesson_count"] == 1 and timeline()[3]["completed_students"] == 0
    lesson = next(m["mission_version_id"] for m in missions if m["title"] == "lecture")
    assert post(a, f"/api/v1/student/missions/{lesson}/understood").status_code == 201
    assert timeline()[2]["completed_students"] == 1 and timeline()[2]["lessons_read_students"] == 1
    assert live()["students"][0]["cells"][2]["state"] == "done"
    assert dashboard()["modules"][0]["blocks"][2]["done"] is True
    with Session(engine) as db:
        before = [(r.id, r.points, r.is_correct) for r in db.scalars(select(MissionAttempt))]
        version = db.get(MissionVersion, bonus_ids[0])
        changed = deepcopy(version.definition_private)
        changed["scenario"] = "Texte fictif révisé."
        mission_id = version.mission_id
    r = teacher.put(f"/api/v1/teacher/missions/{mission_id}/draft", json=changed, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert r.status_code == 200, r.text
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    with Session(engine) as db:
        db.get(Assignment, klass["assignment"]).course_release_id = release
        db.commit()
    assert timeline()[0]["bonus_completed_students"] == 1
    assert live()["students"][0]["cells"][0]["bonus_done"] == 2
    assert dashboard()["modules"][0]["blocks"][0]["done"] is False
    with Session(engine) as db:
        assert [(r.id, r.points, r.is_correct) for r in db.scalars(select(MissionAttempt))] == before
    intruder = other_teacher(engine)
    for route in ("/timeline", "/live"):
        assert a.get(prefix + route).status_code == 403
        assert intruder.get(prefix + route).status_code == 404
