"""Hotfix: a block is « terminé » on graded missions only, and work done before a republication
still counts (lesson read in any version with the same slug, unchanged mission solved)."""

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Assignment, Mission
from test_classroom import course_of, definition, give_to_class
from test_student import attempt, choice_id, env, post  # noqa: F401  (fixture reuse)


def put(client, path, payload):
    return client.put(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def lesson(objective: int, body: str) -> dict:
    return {"kind": "lesson", "objective_ids": [objective], "estimated_duration_minutes": 3, "body": body}


def test_lesson_read_in_v1_and_unchanged_mission_still_count_after_republication(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    course = post(teacher, "/api/v1/teacher/courses", {"slug": "cours-republie", "title": "Cours republié"}).json()["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "OBJ-R", "statement": "Lire puis décider"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "SQL 01"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": "Bloc SQL 01", "sort_order": 0}).json()["id"]
    lesson_id = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions",
                     {"slug": "lecon-grain", "title": "Leçon : le grain", "sort_order": 0, "definition": lesson(objective, "Une ligne = une commande.")}).json()["id"]
    post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions",
         {"slug": "mission-grain", "title": "Mission notée", "sort_order": 1, "definition": definition(objective, "m1")})
    post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions",
         {"slug": "bonus-grain", "title": "Bonus", "sort_order": 2, "definition": definition(objective, "b1", bonus=True)})
    klass = give_to_class(teacher, engine, course, "Classe republiée")
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{chapter}/open")

    # Version 1: the lesson is read and the graded mission solved; the bonus is left aside.
    missions = {m["title"]: m["mission_version_id"] for m in course_of(a, "Cours republié")["missions"]}
    assert post(a, f"/api/v1/student/missions/{missions['Leçon : le grain']}/understood").status_code == 201
    view = a.get(f"/api/v1/student/missions/{missions['Mission notée']}").json()
    assert attempt(a, missions["Mission notée"], "v1-mission-0001", choice_ids=[choice_id(view, "Bonne réponse")]).json()["correct"]
    block = course_of(a, "Cours republié")["modules"][0]["blocks"][0]
    assert block["done"] is True and block["lessons_read"] == 1 and block["lesson_count"] == 1 and block["mission_count"] == 1

    # Version 2: the lesson text changes (new version), the graded mission does not; the class moves to v2.
    assert put(teacher, f"/api/v1/teacher/missions/{lesson_id}/draft", lesson(objective, "Une ligne = une commande. Vérifiez le grain.")).status_code == 200
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    with Session(engine) as db:
        db.execute(update(Assignment).where(Assignment.id == klass["assignment"]).values(course_release_id=release))
        db.commit()
    v2 = {m["title"]: m["mission_version_id"] for m in course_of(a, "Cours republié")["missions"]}
    assert v2["Leçon : le grain"] != missions["Leçon : le grain"] and v2["Mission notée"] == missions["Mission notée"]
    course_view = course_of(a, "Cours republié")
    block = course_view["modules"][0]["blocks"][0]
    assert block["done"] is True and block["lessons_read"] == 1
    assert next(m for m in course_view["missions"] if m["title"] == "Leçon : le grain")["status"] == "completed"
    assert course_view["score"]["completed"] == 1 and course_view["score"]["total"] == 2  # graded missions only (with the bonus)
    assert course_view["score"]["lessons_read"] == 1 and course_view["score"]["lessons_total"] == 1

    # « Ma classe »: the block counts as done for this student; lessons read apart.
    timeline = teacher.get(f"/api/v1/teacher/classes/{klass['assignment']}/timeline").json()
    row = timeline["blocks"][0]
    assert row["completed_students"] == 1 and row["lessons_read_students"] == 1 and row["mission_count"] == 1 and row["lesson_count"] == 1
    overview = teacher.get(f"/api/v1/teacher/classes/{klass['assignment']}/overview").json()
    student = next(s for s in overview["students"] if s["display_name"] == "demo.etudiant01")
    assert (student["lessons_read"], student["lessons_total"]) == (1, 1)

    # A graded mission whose answer key changed does not inherit the earlier success.
    with Session(engine) as db:
        graded = db.scalar(select(Mission.id).where(Mission.slug == "mission-grain"))
    changed = definition(objective, "m1")
    changed["max_points"] = 7
    put(teacher, f"/api/v1/teacher/missions/{graded}/draft", changed)
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    with Session(engine) as db:
        db.execute(update(Assignment).where(Assignment.id == klass["assignment"]).values(course_release_id=release))
        db.commit()
    block = course_of(a, "Cours republié")["modules"][0]["blocks"][0]
    assert block["done"] is False and block["lessons_read"] == 1


def setup_course(teacher, engine, slug: str, blocks: dict[str, list[tuple[str, dict]]]) -> tuple[dict, int]:
    """A course with the given blocks of (mission slug, definition); published, given to a class, blocks open."""
    course = post(teacher, "/api/v1/teacher/courses", {"slug": slug, "title": slug}).json()["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "OBJ-X", "statement": "Objectif"}).json()["id"]
    module = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Module"}).json()["id"]
    ids = {}
    for order, (title, missions) in enumerate(blocks.items()):
        chapter = post(teacher, f"/api/v1/teacher/modules/{module}/chapters", {"title": title, "sort_order": order}).json()["id"]
        ids[title] = chapter
        for index, (mission_slug, make) in enumerate(missions):
            response = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions",
                            {"slug": mission_slug, "title": f"{title} {mission_slug}", "sort_order": index, "definition": make(objective)})
            assert response.status_code == 201, response.text
    klass = give_to_class(teacher, engine, course, f"Classe {slug}")
    for chapter in ids.values():
        post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{chapter}/open")
    return klass, objective


def graded(points: int):
    def make(objective: int) -> dict:
        value = definition(objective, "m")
        value["max_points"] = points
        return value
    return make


def test_graded_mission_turned_into_lesson_never_keeps_its_points(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    klass, objective = setup_course(teacher, engine, "devenue-lecon", {"Bloc": [("grain", graded(7))]})
    version = course_of(a, "devenue-lecon")["missions"][0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{version}").json()
    assert attempt(a, version, "graded-0001", choice_ids=[choice_id(view, "Bonne réponse")]).json()["points"] == 7
    with Session(engine) as db:
        mission = db.scalar(select(Mission.id).where(Mission.slug == "grain"))
        course_id = db.scalar(select(Assignment.course_release_id).where(Assignment.id == klass["assignment"]))
    put(teacher, f"/api/v1/teacher/missions/{mission}/draft", lesson(objective, "Le grain d'une table."))
    from app.models import CourseRelease
    with Session(engine) as db:
        course = db.get(CourseRelease, course_id).course_id
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    with Session(engine) as db:
        db.execute(update(Assignment).where(Assignment.id == klass["assignment"]).values(course_release_id=release))
        db.commit()
    score = course_of(a, "devenue-lecon")["score"]
    # 0 point, and the old graded success does not count as having read the lesson.
    assert score["core_points"] == 0 and score["lessons_total"] == 1 and score["lessons_read"] == 0


def test_same_slug_in_two_blocks_are_two_missions(env):
    clients, engine = env
    a = clients["a"]
    setup_course(clients["teacher"], engine, "meme-slug", {"Bloc A": [("calcul", graded(7))], "Bloc B": [("calcul", graded(7))]})
    course = course_of(a, "meme-slug")
    first = course["missions"][0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{first}").json()
    attempt(a, first, "same-slug-0001", choice_ids=[choice_id(view, "Bonne réponse")])
    course = course_of(a, "meme-slug")
    # One attempt counts for one mission: 7 points, block A done, block B not.
    assert course["score"]["core_points"] == 7 and course["score"]["completed"] == 1
    assert [b["done"] for b in course["modules"][0]["blocks"]] == [True, False]
