"""ADR-0046: final grade on 20 (calculation over the stored points), project grid of the two subjects, roles."""

from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.final_grade import DEFAULTS, Structure, compute, quarter
from app.models import Assignment, BlockState, Chapter, MissionAttempt, MissionVersion, ProjectGrade, User
from app.progress import MissionScore
from test_observer import create as create_observer, sign_in
from test_project import project, put  # noqa: F401  (fixture reuse)
from test_student import env, post  # noqa: F401  (fixture reuse)


def structure(modules: dict[str, dict]) -> Structure:
    """A course without a database: {title: {"workshop": bool, "open": bool, "ids": [...]}}."""
    item = object.__new__(Structure)
    item.modules = modules
    item.ids = [vid for entry in modules.values() for vid in entry["ids"]]
    return item


def s(best, possible, bonus=False, lesson=False) -> MissionScore:
    return MissionScore(best, possible, bonus, 1, best == possible, lesson)


COURSE = structure({
    "Axe 1": {"workshop": False, "open": True, "ids": [1, 2, 3]},
    "Ateliers SQL": {"workshop": True, "open": True, "ids": [4, 5]},
})
SCORES = {1: s(7.5, 10), 2: s(3, 6, bonus=True), 3: s(0, 0, lesson=True),
          4: s(6, 6), 5: s(4, 4, bonus=True)}  # workshops: 10 / 10, the bonus-marked one included
PROJECT = {"base": 16, "bonus": 5, "complete": True}


def test_exact_calculation_with_workshops_marked_bonus():
    result = compute(COURSE, deepcopy(DEFAULTS), SCORES, PROJECT)
    parts = result["parts"]
    assert (parts["course"]["on20"], parts["workshops"]["on20"], parts["project"]["on20"]) == (15, 20, 16)
    assert parts["workshops"]["points"] == 10 and parts["workshops"]["possible"] == 10  # bonus-marked workshop counted
    assert result["base"] == 16.5  # 0.3 × 15 + 0.2 × 20 + 0.5 × 16
    assert result["project_bonus"] == 0.5  # 5 / 10 → +0.5 of the +1
    assert result["course_bonus"] == 0.5  # 3 / 6 outside the workshops → +0.5 of the +1
    assert result["final"] == 17.5 and result["provisional"] is False and result["pending"] == []


def test_cap_at_20_and_custom_settings():
    perfect = {1: s(10, 10), 2: s(6, 6, bonus=True), 3: s(0, 0, lesson=True), 4: s(6, 6), 5: s(4, 4, bonus=True)}
    result = compute(COURSE, deepcopy(DEFAULTS), perfect, {"base": 20, "bonus": 10, "complete": True})
    assert result["raw"] == 22 and result["final"] == 20 and result["capped"] is True
    config = deepcopy(DEFAULTS) | {"cap": 18, "project_bonus_max": 2, "course_bonus_max": 0}
    config["weights"] = {"course": 50, "workshops": 0, "project": 50}
    custom = compute(COURSE, config, SCORES, PROJECT)
    assert custom["base"] == 15.5 and custom["project_bonus"] == 1 and custom["course_bonus"] == 0  # 0.5 × 15 + 0.5 × 16
    assert custom["final"] == 16.5 and custom["parts"]["workshops"]["weight"] == 0


def test_empty_parts_are_pending_not_zero_and_the_preview_is_provisional():
    no_project = compute(COURSE, deepcopy(DEFAULTS), SCORES, None)
    assert no_project["pending"] == ["project"] and no_project["parts"]["project"]["pending"] is True
    assert no_project["base"] == 17  # (30 × 15 + 20 × 20) / 50: the other weights are scaled up
    assert no_project["project_bonus"] == 0 and no_project["provisional"] is True
    closed = structure({"Axe 1": {"workshop": False, "open": True, "ids": [1, 2, 3]},
                        "Ateliers SQL": {"workshop": True, "open": False, "ids": [4, 5]}})
    waiting = compute(closed, deepcopy(DEFAULTS), SCORES, PROJECT)
    assert waiting["pending"] == ["workshops"] and waiting["base"] == 15.63  # (30 × 15 + 50 × 16) / 80 = 15.625
    assert waiting["final"] == 16.75 and waiting["provisional"] is True  # 15.625 + 0.5 + 0.5 = 16.625 → 16.75
    nothing = compute(structure({"Axe 1": {"workshop": False, "open": False, "ids": [1]}}), deepcopy(DEFAULTS), {1: s(0, 10)}, None)
    assert nothing["base"] is None and nothing["final"] is None and nothing["provisional"] is True
    incomplete = compute(COURSE, deepcopy(DEFAULTS), SCORES, {"base": 9, "bonus": None, "complete": False})
    assert incomplete["pending"] == [] and incomplete["provisional"] is True  # project partly graded


def test_rounding_to_a_quarter():
    assert [quarter(v) for v in (12.12, 12.125, 12.374, 12.375, 12.6, 19.875, 0)] == [12, 12.25, 12.25, 12.5, 12.5, 20, 0]


def stored(engine) -> tuple:
    with Session(engine) as db:
        attempts = sorted((a.id, a.points, a.is_correct) for a in db.scalars(select(MissionAttempt)))
        grades = sorted((g.team_id, g.sql, g.python, g.nosql, g.airflow, g.reproducibility, str(g.individual), str(g.scores))
                        for g in db.scalars(select(ProjectGrade)))
    return attempts, grades


def test_settings_results_student_toggle_roles_and_nothing_stored_changes(project):
    clients, engine, assignment = project
    a, b, teacher = clients["a"], clients["b"], clients["teacher"]
    me = a.get("/api/v1/auth/me").json()["id"]
    b_id = b.get("/api/v1/auth/me").json()["id"]
    with Session(engine) as db:
        klass = db.get(Assignment, assignment)
        for chapter in db.scalars(select(Chapter.id)).all():
            state = db.scalar(select(BlockState).where(BlockState.cohort_id == klass.cohort_id, BlockState.chapter_id == chapter))
            state = state or BlockState(cohort_id=klass.cohort_id, chapter_id=chapter)
            state.opened_at = datetime.now(timezone.utc)
            db.add(state)
        vid = db.scalar(select(MissionVersion.id).order_by(MissionVersion.id))
        db.add(MissionAttempt(user_id=me, course_release_id=klass.course_release_id, mission_version_id=vid,
                              idempotency_key="final-1", answer={}, is_correct=True, points=10))
        db.commit()
    # A former-grid entry is kept as it is, shown apart.
    team = post(teacher, f"/api/v1/teacher/classes/{assignment}/project/teams", {"user_ids": [me, b_id]}).json()["team_id"]
    with Session(engine) as db:
        db.add(ProjectGrade(team_id=team, sql=4, python=3, nosql=None, airflow=None, reproducibility=None, individual={str(me): 4}))
        db.commit()
    legacy = teacher.get(f"/api/v1/teacher/classes/{assignment}/project").json()["teams"][0]["grade"]
    assert legacy["legacy"]["sql"] == 4 and legacy["legacy"]["students"][0]["total"] == 11
    assert all(st["base"] is None for st in legacy["students"])  # the former grid counts for nothing

    settings = teacher.get(f"/api/v1/teacher/classes/{assignment}/grading").json()
    assert settings["config"]["weights"] == {"course": 30, "workshops": 20, "project": 50} and settings["config"]["visible_to_students"] is False
    assert [m["workshop"] for m in settings["modules"]] == [False]  # « Module de démonstration » is not « Ateliers … »
    before = stored(engine)
    row = next(r for r in teacher.get(f"/api/v1/teacher/classes/{assignment}/results").json()["students"] if r["id"] == me)
    final = row["final_grade"]
    assert final["parts"]["course"]["pending"] is False and final["parts"]["workshops"]["pending"] is True
    assert final["parts"]["project"]["pending"] is True and final["provisional"] is True
    assert stored(engine) == before  # reading never writes

    # Project graded on the new grid: the former columns stay untouched.
    full = {"p1_model": 2, "p1_sql": 2, "p1_python": 2, "p1_load": 2, "p1_proofs": 1,
            "p2_airflow": 3, "p2_mongo": 2, "p2_redis": 2, "p2_time": 2, "p2_repro": 1, "b1_api": 2, "b2_metrics": 2, "b2_resume": 1}
    assert put(teacher, f"/api/v1/teacher/project/teams/{team}/grade", {"criteria": full, "individual": {str(me): 1, str(b_id): 1}}).status_code == 200
    with Session(engine) as db:
        kept = db.get(ProjectGrade, team)
        assert (kept.sql, kept.python, kept.individual) == (4, 3, {str(me): 4})

    # Weights must make 100 %, modules must be the course's, only the owner, CSRF.
    body = {"weights": {"course": 50, "workshops": 0, "project": 50}, "cap": 20, "project_bonus_max": 1, "course_bonus_max": 1,
            "workshop_modules": [], "visible_to_students": False}
    url = f"/api/v1/teacher/classes/{assignment}/grading"
    assert put(teacher, url, {**body, "weights": {"course": 50, "workshops": 20, "project": 50}}).status_code == 422
    assert put(teacher, url, {**body, "workshop_modules": ["Inconnu"]}).status_code == 422
    assert put(a, url, body).status_code == 403
    assert teacher.put(url, json=body).status_code == 403  # no CSRF token
    assert put(teacher, url, body).status_code == 200
    final = next(r for r in teacher.get(f"/api/v1/teacher/classes/{assignment}/results").json()["students"] if r["id"] == me)["final_grade"]
    # Course 10 / 30 → 6.67; project base 20; 0.5 × 6.667 + 0.5 × 20 = 13.333; +0.5 project bonus → 13.833 → 13.75.
    assert (final["parts"]["course"]["on20"], final["base"], final["project_bonus"], final["final"]) == (6.67, 13.33, 0.5, 13.75)
    exported = teacher.get(f"/api/v1/teacher/classes/{assignment}/results/final.csv").content.decode("utf-8-sig").splitlines()
    assert exported[0].startswith("etudiant;cours_sur_20_50pct;ateliers_sur_20_0pct;campusequip_sur_20_50pct")
    assert any(line.startswith("demo.etudiant01;6,67;;20;13,33;0,5;0;13,75;") for line in exported)

    # Students: nothing until the teacher turns it on.
    assert a.get("/api/v1/student/dashboard").json()["courses"][0]["final_grade"] is None
    assert put(teacher, url, {**body, "visible_to_students": True}).status_code == 200
    dashboard = a.get("/api/v1/student/dashboard").json()
    mine = dashboard["courses"][0]["final_grade"]
    assert mine["final"] == 13.75
    # Notes and Rafi share this response after merging their independent changes.
    assert "next_deadline" in dashboard and dashboard["rafi"] == {"sounds": True}
    assert put(teacher, f"/api/v1/teacher/classes/{assignment}/rafi", {"sounds": False}).status_code == 200
    muted = a.get("/api/v1/student/dashboard").json()
    assert muted["rafi"] == {"sounds": False} and "next_deadline" in muted
    assert muted["courses"][0]["final_grade"] == mine
    assert a.get(f"/api/v1/teacher/classes/{assignment}/results").status_code == 403

    # Observers: « Administration » sees the final grade, a guest sees no grades at all.
    admin = create_observer(teacher, "direction.notes", kind="admin")
    guest = create_observer(teacher, "invite.notes", kind="guest")
    seen = sign_in(admin["username"], admin["password"]).get(f"/api/v1/observer/classes/{assignment}/grades").json()
    assert next(r for r in seen["students"] if r["name"] == "demo.etudiant01")["final_grade"]["final"] == 13.75
    assert sign_in(guest["username"], guest["password"]).get(f"/api/v1/observer/classes/{assignment}/grades").status_code == 403
    csv_text = sign_in(admin["username"], admin["password"]).get(f"/api/v1/observer/classes/{assignment}/grades.csv").content.decode("utf-8-sig")
    assert csv_text.splitlines()[0].endswith("projet_sur_20;note_finale_20;provisoire")

    # Every stored point is still the same after all of this (attempts, former grid).
    after_attempts, _ = stored(engine)
    assert after_attempts == before[0]
    with Session(engine) as db:
        assert db.scalar(select(User.id).where(User.id == me)) == me
