from pydantic import ValidationError
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.curriculum_schema import MissionDefinition
from app.grading import score
from app.progress import MissionScore, course_score, mission_scores, replay
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)


def definition(kind: str, **extra) -> MissionDefinition:
    data = {"kind": kind, "scenario": "Situation fictive.", "instructions": "Répondez.", "objective_ids": [1],
            "choices": [{"id": c, "label": c.upper()} for c in "abcd"], "correct_ids": ["a"],
            "max_points": 10, "estimated_duration_minutes": 5}
    data.update(extra)
    return MissionDefinition.model_validate(data)


def test_scoring_rules_all_or_nothing_and_partial():
    single = definition("single_choice")
    assert score(single, {"choice_ids": ["a"]}) == 10 and score(single, {"choice_ids": ["b"]}) == 0
    multi = definition("multiple_choice", correct_ids=["a", "b"])
    assert score(multi, {"choice_ids": ["a"]}) == 0
    multi_partial = definition("multiple_choice", correct_ids=["a", "b"], scoring="partial")
    assert score(multi_partial, {"choice_ids": ["a"]}) == 5
    assert score(multi_partial, {"choice_ids": ["a", "c"]}) == 0  # a wrong pick cancels a right one
    assert score(multi_partial, {"choice_ids": ["a", "b"]}) == 10
    order = definition("reorder", correct_ids=["a", "b", "c", "d"], scoring="partial")
    assert score(order, {"choice_ids": ["a", "b", "d", "c"]}) == 5
    matching = definition("matching", correct_ids=[], scoring="partial",
                          match_targets=[{"id": t, "label": t} for t in "wxyz"],
                          correct_pairs={"a": "w", "b": "x", "c": "y", "d": "z"})
    assert score(matching, {"pairs": {"a": "w", "b": "x", "c": "z", "d": "y"}}) == 5
    with pytest.raises(ValidationError):
        definition("single_choice", scoring="partial")


def test_course_score_keeps_bonus_separate():
    scores = {1: MissionScore(10, 10, False, 2, True), 2: MissionScore(4, 10, False, 1, False), 3: MissionScore(5, 5, True, 1, True)}
    assert course_score(scores) == {"core_points": 14, "core_possible": 20, "bonus_points": 5, "bonus_possible": 5, "completed": 2, "total": 3}


def test_best_score_is_kept_and_never_double_counted(env):
    clients, engine = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    assert view["score"] == {"best": 0, "possible": 10, "bonus": False}
    right, wrong = choice_id(view, "La jointure"), choice_id(view, "Supprimer")
    first_try = attempt(clients["a"], first, "best-score-01", choice_ids=[wrong]).json()
    assert first_try["points"] == 0 and first_try["score"]["best"] == 0
    good = attempt(clients["a"], first, "best-score-02", choice_ids=[right]).json()
    assert good["points"] == 10 and good["score"]["best"] == 10
    replayed = attempt(clients["a"], first, "best-score-02", choice_ids=[right]).json()
    assert replayed["replayed"] is True and replayed["attempts_count"] == 2
    later = attempt(clients["a"], first, "best-score-03", choice_ids=[wrong]).json()
    assert later["points"] == 0 and later["score"]["best"] == 10
    course = clients["a"].get("/api/v1/student/dashboard").json()["courses"][0]
    assert course["score"] == {"core_points": 10, "core_possible": 30, "bonus_points": 0, "bonus_possible": 0, "completed": 1, "total": 3}
    assert course["missions"][0]["best_points"] == 10 and course["missions"][0]["possible"] == 10
    history = clients["a"].get(f"/api/v1/student/missions/{first}/attempts").json()
    assert [(item["correct"], item["points"]) for item in history] == [(False, 0), (True, 10), (False, 0)]
    assert set(history[0]) == {"id", "created_at", "correct", "points"}
    # Other students: own empty history; outsiders: not found.
    assert clients["b"].get(f"/api/v1/student/missions/{first}/attempts").json() == []
    assert clients["out"].get(f"/api/v1/student/missions/{first}/attempts").status_code == 404
    assert clients["teacher"].get(f"/api/v1/student/missions/{first}/attempts").status_code == 403
    with Session(engine) as db:
        assert replay(db) == []


def test_scores_survive_a_restart(env, tmp_path):
    clients, engine = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    attempt(clients["a"], first, "restart-0001", choice_ids=[choice_id(view, "La jointure")])
    url = engine.url
    engine.dispose()
    fresh = create_engine(url)  # a new process would open a new engine on the same database
    with Session(fresh) as db:
        from sqlalchemy import select
        from app.models import User
        user_id = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
        assert mission_scores(db, user_id, [first])[first].best == 10
    fresh.dispose()


def test_teacher_cannot_create_attempts(env):
    clients, _ = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    response = post(clients["teacher"], f"/api/v1/student/missions/{first}/attempts",
                    {"idempotency_key": "teacher-try-1", "answer": {"choice_ids": []}})
    assert response.status_code == 403
