"""ADR-0039: streaks, badges, levels and the class goal. Deterministic, idempotent, never a grade."""

from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import progress, rewards
from app.models import CourseRelease, MissionAttempt, Notification, User
from app.rewards import Course_, Facts, catalogue, earned_keys, facts_for, level, objective_key, recompute
from app.rewards_models import StudentBadge
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)
from test_teacher_dashboard import the_class


# Pure rules on a synthetic course: 12 graded missions (2 bonus), 2 lessons, 2 blocks, 1 objective, 1 module.

def fake_course() -> Course_:
    return Course_(release=SimpleNamespace(course_id=1), graded=set(range(1, 13)), bonus={11, 12}, ungraded={20, 21},
                   blocks=[(100, [1, 2, 3]), (200, [4, 5, 6, 7, 8, 9, 10])], objectives=[("SQL-1", "Lire une jointure.", [1, 2])],
                   modules=[("Module 1", [11, 12])])


def run(monkeypatch, sequence: list[tuple[int, bool]]) -> Facts:
    """Facts of one student after these (mission, correct) attempts, in this order."""
    attempts = [(SimpleNamespace(id=i, user_id=7, is_correct=ok), vid) for i, (vid, ok) in enumerate(sequence, start=1)]
    monkeypatch.setattr(progress, "attempts_for", lambda db, users, versions: attempts)
    return facts_for(None, fake_course(), [7])[7]


def test_streak_counts_first_try_successes_and_a_miss_resets_it_silently(monkeypatch):
    facts = run(monkeypatch, [(1, True), (2, True), (3, False), (3, True), (4, True), (20, True), (5, True)])
    # 1, 2 first try; 3 missed (reset) then solved on retry (no count); 4, 5 first try; the lesson never counts.
    assert (facts.streak, facts.best_streak) == (2, 2)
    assert facts.solved == {1, 2, 3, 4, 5} and facts.lessons == {20}
    assert facts.blocks_done == {100}
    assert facts.xp == 5 * rewards.XP_MISSION + rewards.XP_LESSON
    # Practice on an already solved mission neither counts nor breaks the streak.
    assert run(monkeypatch, [(1, True), (1, False), (2, True)]).streak == 2


def test_badges_are_derived_from_the_attempts_only(monkeypatch):
    course = fake_course()
    ten = [(vid, True) for vid in range(1, 11)]
    facts = run(monkeypatch, ten + [(11, True), (12, True)])
    assert facts.best_streak == 12
    assert earned_keys(course, facts) == {"first-mission", "first-block", "streak-5", "streak-10", objective_key("SQL-1"), "bonus:Module 1"}
    assert [item["label"] for item in catalogue(course)][-2:] == ["Objectif atteint : Lire une jointure", "Tous les bonus : Module 1"]
    assert earned_keys(course, run(monkeypatch, [(1, False)])) == set()
    assert facts.xp == 10 * rewards.XP_MISSION + 2 * rewards.XP_BONUS


def test_levels_go_from_intern_to_lead_with_a_progress_target():
    assert level(0)["name"] == "Stagiaire Data" and level(0)["next_at"] == 30
    assert level(85)["name"] == "Analyste Data" and level(85)["next_name"] == "Data Engineer Junior"
    top = level(10_000)
    assert top["name"] == "Lead Data Engineer" and top["max_level"] is True and top["next_at"] is None
    assert [name for _, name in rewards.LEVELS][0] == "Stagiaire Data" and len(rewards.LEVELS) == 8


# Through the API, on the demonstration course ---------------------------------------------------

def solve_first(client, key="reward-right-01"):
    first = missions_of(client)[0]["mission_version_id"]
    view = client.get(f"/api/v1/student/missions/{first}").json()
    return first, view, attempt(client, first, key, choice_ids=[choice_id(view, "La jointure")])


def test_a_success_awards_badges_once_with_a_notification_and_never_changes_the_score(env):
    clients, engine = env
    before = clients["a"].get("/api/v1/student/dashboard").json()["courses"][0]
    assert before["rewards"]["streak"] == 0 and before["rewards"]["level"]["name"] == "Stagiaire Data"
    assert before["rewards"]["badge_count"] == 0
    first, view, right = solve_first(clients["a"])
    body = right.json()
    assert body["rewards"]["streak"] == 1 and body["rewards"]["xp_gained"] == rewards.XP_MISSION
    assert [b["key"] for b in body["rewards"]["new_badges"]] == ["first-mission", objective_key("DEMO-GRAIN")]
    assert "DEMO-" not in right.text  # objective codes never reach a student (ADR-0022)
    # Replaying the same key: same attempt, nothing awarded twice.
    replay = attempt(clients["a"], first, "reward-right-01", choice_ids=[choice_id(view, "La jointure")])
    assert replay.status_code == 200 and "rewards" not in replay.json()
    with Session(engine) as db:
        assert db.scalar(select(func.count(StudentBadge.id))) == 2
        notes = db.scalars(select(Notification.text).where(Notification.kind == "badge")).all()
        assert sorted(notes) == ["Nouveau badge : Objectif atteint : Identifier le grain d'une table avant d'agréger après une jointure",
                                 "Nouveau badge : Première mission réussie"]
    after = clients["a"].get("/api/v1/student/dashboard").json()["courses"][0]
    assert after["score"] == {**before["score"], "core_points": after["score"]["core_points"], "completed": 1}
    assert after["score"]["core_points"] == body["score"]["best"]
    assert after["rewards"]["badge_count"] == 2 and after["rewards"]["badges"][0]["earned"] is True
    assert [b["earned"] for b in after["rewards"]["badges"]].count(False) >= 1  # still to discover, shown kindly
    # Another student has nothing.
    assert clients["b"].get("/api/v1/student/dashboard").json()["courses"][0]["rewards"]["badge_count"] == 0


def test_a_miss_resets_the_streak_without_any_negative_message(env):
    clients, _ = env
    solve_first(clients["a"])
    _, csv, _ = [m["mission_version_id"] for m in missions_of(clients["a"])]
    view = clients["a"].get(f"/api/v1/student/missions/{csv}").json()
    miss = attempt(clients["a"], csv, "reward-miss-001", choice_ids=[choice_id(view, "Contrôler")]).json()
    assert miss["correct"] is False
    assert miss["rewards"]["streak"] == 0 and miss["rewards"]["streak_mark"] is None and miss["rewards"]["new_badges"] == []
    assert "série" not in str(miss["rewards"]).lower()


def test_recompute_is_idempotent_and_matches_live_awarding(env):
    clients, engine = env
    solve_first(clients["a"])
    with Session(engine) as db:
        db.query(StudentBadge).delete()
        db.commit()
        first = recompute(db)
        second = recompute(db)
        assert first["added"] == 2 and second["added"] == 0 and first["rules_version"] == rewards.RULES_VERSION
        assert sorted(db.scalars(select(StudentBadge.key)).all()) == sorted(["first-mission", objective_key("DEMO-GRAIN")])
        # Recomputing never sends a notification again, and never touches attempts.
        assert db.scalar(select(func.count(Notification.id)).where(Notification.kind == "badge")) == 2
        assert db.scalar(select(func.count(MissionAttempt.id))) == 1


def test_class_goal_is_anonymous_set_by_the_teacher_and_celebrated_once(env):
    clients, engine = env
    klass = the_class(clients["teacher"])
    goal = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/goal").json()
    assert goal["metric"] == "missions" and goal["value"] == 0 and goal["custom"] is False
    assert post(clients["a"], f"/api/v1/teacher/classes/{klass['id']}/goal").status_code in (403, 405)
    put = clients["teacher"].put(f"/api/v1/teacher/classes/{klass['id']}/goal", json={"metric": "missions", "target": 2},
                                 headers={"X-CSRF-Token": clients["teacher"].cookies["academy_csrf"]})
    assert put.status_code == 200 and put.json()["target"] == 2 and put.json()["custom"] is True
    assert clients["teacher"].put(f"/api/v1/teacher/classes/{klass['id']}/goal", json={"metric": "points", "target": 2},
                                  headers={"X-CSRF-Token": clients["teacher"].cookies["academy_csrf"]}).status_code == 422
    solve_first(clients["a"])
    state = clients["b"].get("/api/v1/student/dashboard").json()["courses"][0]["rewards"]["class_goal"]
    assert state["text"] == "La classe a réussi 1 mission sur 2" and state["percent"] == 50
    assert "demo.etudiant01" not in str(state)
    solve_first(clients["b"], key="reward-right-b1")
    with Session(engine) as db:
        texts = db.scalars(select(Notification.text).where(Notification.kind == "class_goal")).all()
        students = db.scalar(select(func.count(User.id)).where(User.role == "student", User.username.like("demo.%")))
        # 50 % then 100 %, once per enrolled student each, never with a name.
        assert len(texts) == 2 * students and all("etudiant" not in text for text in texts)
        assert any(text.startswith("Objectif de classe atteint : la classe a réussi 2 missions sur 2") for text in texts)
    solve_first(clients["b"], key="reward-right-b2")  # practice: nothing new
    with Session(engine) as db:
        assert db.scalar(select(func.count(Notification.id)).where(Notification.kind == "class_goal")) == 2 * students


def test_teacher_sees_badges_in_the_student_panel_and_never_in_the_grade_export(env):
    clients, _ = env
    solve_first(clients["a"])
    klass = the_class(clients["teacher"])
    student = next(s for s in clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/overview").json()["students"]
                   if s["display_name"] == "demo.etudiant01")
    detail = clients["teacher"].get(f"/api/v1/teacher/classes/{klass['id']}/students/{student['id']}").json()
    assert detail["rewards"]["badge_count"] == 2 and detail["rewards"]["level"]["xp"] == rewards.XP_MISSION
    for path in (f"/api/v1/teacher/classes/{klass['id']}/export.csv", f"/api/v1/teacher/classes/{klass['id']}/results/export.csv"):
        text = clients["teacher"].get(path).text.lower()
        assert all(word not in text for word in ("badge", "niveau", "xp", "série", "stagiaire"))


def test_a_closed_block_announces_no_objective_or_bonus_badge_and_codes_never_show(monkeypatch):
    course = fake_course()
    course.chapter_of = {vid: 100 if vid <= 3 else 200 for vid in range(1, 13)}
    facts = run(monkeypatch, [(1, True)])

    class AnyQuery:
        def where(self, *_):
            return self

    monkeypatch.setattr(rewards, "select", lambda *a, **k: AnyQuery())

    class NoRows:
        def scalars(self, _query):
            return []

    hidden = rewards.collection(NoRows(), course, 7, facts, open_blocks=set())
    assert [item["key"] for item in hidden] == ["first-mission", "first-block", "streak-5", "streak-10"]
    shown = rewards.collection(NoRows(), course, 7, facts, open_blocks={100})
    assert objective_key("SQL-1") in [item["key"] for item in shown] and "SQL-1" not in str(shown)
    assert "bonus:Module 1" not in [item["key"] for item in shown]  # bonuses live in block 200, still closed
    assert len(rewards.collection(NoRows(), course, 7, facts)) == 6  # the teacher sees everything
