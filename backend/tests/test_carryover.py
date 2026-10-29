"""ADR-0030: a success is carried over when only the text of a graded mission changes."""

import copy

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.carryover import carries_over, grading_signature, main as carryover_main
from app.models import Assignment, CourseRelease, Mission
from app.progress import replay
from test_classroom import course_of
from test_republication import graded, lesson, put, setup_course
from test_student import attempt, choice_id, env, post  # noqa: F401  (fixture reuse)

BASE = {"kind": "single_choice", "scenario": "S", "instructions": "Q ?", "objective_ids": [1],
        "choices": [{"id": "ok", "label": "Bonne"}, {"id": "ko", "label": "Autre"}], "correct_ids": ["ok"],
        "feedback": {"ok": "Bien"}, "explanation": "Parce que.", "hints": ["Indice"], "max_points": 5, "estimated_duration_minutes": 5}


def changed(**patch) -> dict:
    value = copy.deepcopy(BASE)
    value.update(patch)
    return value


def test_text_changes_keep_the_signature_and_grading_changes_break_it():
    for text_only in (changed(explanation="Parce que.\n\nDeuxième paragraphe."), changed(scenario="Autre situation"),
                      changed(instructions="Autre question ?"), changed(feedback={"ok": "Très bien"}), changed(hints=["A", "B"]),
                      changed(resources=["https://example.org/doc"]), changed(objective_ids=[9]),
                      changed(choices=[{"id": "ko", "label": "Autre libellé"}, {"id": "ok", "label": "Bonne, reformulée"}]),
                      changed(display_data={"kind": "code", "language": "sql", "code": "SELECT 1"})):
        assert carries_over(BASE, text_only)
    for grading in (changed(correct_ids=["ko"]), changed(max_points=7), changed(bonus=True), changed(scoring="partial"),
                    changed(kind="multiple_choice"), changed(choices=[{"id": "ok", "label": "Bonne"}, {"id": "k2", "label": "Autre"}]),
                    changed(expected_sql="SELECT 2"), changed(compare="scalar"), changed(correct_pairs={"a": "b"}), changed(action_id="x")):
        assert not carries_over(BASE, grading)
    # The expected order counts for a reorder; defaults equal missing keys.
    assert not carries_over(changed(kind="reorder", correct_ids=["ok", "ko"]), changed(kind="reorder", correct_ids=["ko", "ok"]))
    assert grading_signature({k: v for k, v in BASE.items() if k != "feedback"}) == grading_signature({**BASE, "scoring": "all_or_nothing"})
    # Lessons: same kind only, never from or to a graded mission.
    assert carries_over({"kind": "lesson", "body": "a"}, {"kind": "lesson", "body": "b"})
    assert not carries_over(BASE, {"kind": "lesson"}) and not carries_over({"kind": "lesson"}, BASE)


def republish(teacher, engine, klass, slug, definition_for):
    with Session(engine) as db:
        mission = db.scalar(select(Mission.id).where(Mission.slug == slug))
        release_id = db.scalar(select(Assignment.course_release_id).where(Assignment.id == klass["assignment"]))
        course = db.get(CourseRelease, release_id).course_id
    assert put(teacher, f"/api/v1/teacher/missions/{mission}/draft", definition_for).status_code == 200
    check = teacher.get(f"/api/v1/teacher/courses/{course}/carryover-check").json()
    release = post(teacher, f"/api/v1/teacher/courses/{course}/publish").json()["id"]
    with Session(engine) as db:
        db.execute(update(Assignment).where(Assignment.id == klass["assignment"]).values(course_release_id=release))
        db.commit()
    return check


def solve(a, title):
    version = course_of(a, title)["missions"][0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{version}").json()
    assert attempt(a, version, f"{title}-0001", choice_ids=[choice_id(view, "Bonne réponse")]).json()["points"] == 7
    return version


def test_explanation_split_keeps_success_and_points_and_replay_is_identical(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    klass, objective = setup_course(teacher, engine, "texte-seul", {"Bloc": [("grain", graded(7))]})
    before = solve(a, "texte-seul")
    new = graded(7)(objective)
    new["explanation"] = "Explication privée m\n\nDeuxième paragraphe, découpé."
    new["choices"][0]["label"] = "Bonne réponse m, reformulée"
    check = republish(teacher, engine, klass, "grain", new)
    assert check["lost"] == [] and "Aucune réussite" in check["message"]
    course = course_of(a, "texte-seul")
    assert course["missions"][0]["mission_version_id"] != before  # a new version...
    assert course["score"]["core_points"] == 7 and course["score"]["completed"] == 1  # ...that keeps the success
    assert course["modules"][0]["blocks"][0]["done"] is True
    with Session(engine) as db:
        assert replay(db) == []  # stored points re-score identically


def test_changed_answer_is_not_carried_and_the_check_says_so_before_publication(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    klass, objective = setup_course(teacher, engine, "reponse-changee", {"Bloc": [("grain", graded(7))]})
    solve(a, "reponse-changee")
    new = graded(7)(objective)
    new["correct_ids"] = ["ko"]
    check = republish(teacher, engine, klass, "grain", new)
    assert check["lost_successes"] == 1 and check["lost_points"] == 7 and check["lost"][0]["reason"] == "notation modifiée"
    assert "ATTENTION" in check["message"]
    assert course_of(a, "reponse-changee")["score"]["core_points"] == 0


def test_mission_turned_into_lesson_gives_zero_point(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    klass, objective = setup_course(teacher, engine, "vers-lecon", {"Bloc": [("grain", graded(7))]})
    solve(a, "vers-lecon")
    check = republish(teacher, engine, klass, "grain", lesson(objective, "Le grain d'une table."))
    assert check["lost"][0]["reason"] == "devenue leçon ou révision"
    score = course_of(a, "vers-lecon")["score"]
    assert score["core_points"] == 0 and score["lessons_read"] == 0


def test_command_is_read_only_and_exits_1_when_successes_would_be_lost(env, monkeypatch, capsys):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    klass, objective = setup_course(teacher, engine, "commande", {"Bloc": [("grain", graded(7))]})
    solve(a, "commande")
    with Session(engine) as db:
        mission = db.scalar(select(Mission.id).where(Mission.slug == "grain"))
    new = graded(7)(objective)
    new["max_points"] = 9
    put(teacher, f"/api/v1/teacher/missions/{mission}/draft", new)
    monkeypatch.setattr("app.database.get_engine", lambda: engine)
    with Session(engine) as db:
        releases = db.scalar(select(CourseRelease.id).order_by(CourseRelease.id.desc()))
    assert carryover_main(["--course", "commande"]) == 1
    out = capsys.readouterr().out
    assert "ATTENTION : 1 réussite(s)" in out and "notation modifiée" in out
    with Session(engine) as db:
        assert db.scalar(select(CourseRelease.id).order_by(CourseRelease.id.desc())) == releases  # nothing published
    assert carryover_main(["--course", "inconnu"]) == 2
