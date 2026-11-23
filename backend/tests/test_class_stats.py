"""Issue #110: statistics for the teacher, the direction and the projector; aggregates only, no names."""

from datetime import datetime, timedelta, timezone

from test_observer import create as create_observer, sign_in
from test_project import project, put  # noqa: F401  (fixture reuse)
from test_student import env, post  # noqa: F401  (fixture reuse)


def at(**delta) -> str:
    return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


def test_course_project_and_defence_figures_without_names(project):
    clients, engine, assignment = project
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    base = f"/api/v1/teacher/classes/{assignment}/project"
    empty = teacher.get(f"/api/v1/teacher/classes/{assignment}/stats").json()
    assert empty["course"]["students"] >= 2 and empty["project"]["teams"] == 0 and empty["project"]["students_without_team"] == empty["course"]["students"]

    me = a.get("/api/v1/auth/me").json()["id"]
    other = b.get("/api/v1/auth/me").json()["id"]
    team = post(teacher, f"{base}/teams", {"user_ids": [me, other]}).json()["team_id"]
    milestone = post(teacher, f"{base}/milestones", {"title": "Rendu final"}).json()["id"]
    post(teacher, f"{base}/milestones", {"title": "Conception"})
    for text in ("v1", "v2"):
        assert post(a, f"/api/v1/student/project/milestones/{milestone}/submissions", {"text": text}).status_code == 201
    post(teacher, f"{base}/slots", {"starts_at": at(hours=-1), "ends_at": at(minutes=-40), "team_id": team})
    post(teacher, f"{base}/slots", {"starts_at": at(hours=2), "ends_at": at(hours=2, minutes=20)})
    full = {"p1_model": 2, "p1_sql": 2, "p1_python": 2, "p1_load": 2, "p1_proofs": 1, "p2_airflow": 3, "p2_mongo": 2, "p2_redis": 2, "p2_time": 2, "p2_repro": 1}
    assert put(teacher, f"/api/v1/teacher/project/teams/{team}/grade", {"criteria": full, "individual": {str(me): 1, str(other): 0}}).status_code == 200

    stats = teacher.get(f"/api/v1/teacher/classes/{assignment}/stats").json()
    p = stats["project"]
    assert (p["teams"], p["teams_of_2"], p["teams_of_3"], p["students_in_team"]) == (1, 1, 0, 2)
    assert (p["teams_with_deposit"], p["teams_without_deposit"], p["versions"]) == (1, 0, 2)
    assert [(m["title"], m["teams"], m["versions"]) for m in p["milestones"]] == [("Rendu final", 1, 2), ("Conception", 0, 0)]
    assert p["defences"] == {"slots": 2, "assigned": 1, "done": 1, "current": 0, "upcoming": 0, "graded_teams": 1, "mean_base": 19.5}
    assert "modules" in stats["course"] and stats["course"]["missions"] > 0

    # The direction (« Administration ») sees the average; a guest sees the same figures without it. Never a name.
    admin = create_observer(teacher, "direction.stats", kind="admin")
    guest = create_observer(teacher, "invite.stats", kind="guest")
    for who, average in ((admin, True), (guest, False)):
        client = sign_in(who["username"], who["password"])
        response = client.get(f"/api/v1/observer/classes/{assignment}/stats")
        assert response.status_code == 200
        assert ("mean_base" in response.json()["project"]["defences"]) is average
        assert "demo.etudiant" not in response.text
    # Students and other teachers' observers cannot read it.
    assert a.get(f"/api/v1/teacher/classes/{assignment}/stats").status_code == 403
    assert a.get(f"/api/v1/observer/classes/{assignment}/stats").status_code == 403
