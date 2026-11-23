"""Issue #107: no milestone dates; deposits stay open until the team's defence starts."""

from datetime import datetime, timedelta, timezone

from test_project import add_students, project, put, upload, PDF  # noqa: F401  (fixture reuse)
from test_student import env, post  # noqa: F401  (fixture reuse)


def at(**delta) -> str:
    return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


def pair(clients, engine):
    """A and B form a team of two (they can submit)."""
    a, b = clients["a"], clients["b"]
    cohort = a.get("/api/v1/student/project").json()["cohort_id"]
    assert post(a, "/api/v1/student/project/team", {"cohort_id": cohort}).status_code == 201
    b_id = next(c["id"] for c in a.get("/api/v1/student/project").json()["classmates"] if c["name"] == "demo.etudiant02")
    invitation = post(a, "/api/v1/student/project/invitations", {"user_id": b_id}).json()["id"]
    assert post(b, f"/api/v1/student/project/invitations/{invitation}/accept").status_code == 200
    return a, a.get("/api/v1/student/project").json()["team"]["id"]


def test_dates_removed_deposits_open_until_the_defence_slot(project):
    clients, engine, assignment = project
    teacher = clients["teacher"]
    a, team = pair(clients, engine)
    base = f"/api/v1/teacher/classes/{assignment}/project"
    milestone = post(teacher, f"{base}/milestones", {"title": "Rendu final", "due_at": at(hours=-2)}).json()
    # The teacher removes the date: no more date, and a deposit is no longer « late ».
    cleared = teacher.patch(f"/api/v1/teacher/project/milestones/{milestone['id']}", json={"clear_due": True},
                            headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).json()
    assert cleared["due_at"] is None
    window = a.get("/api/v1/student/project").json()["team"]["deposits"]
    assert window == {"open": True, "closes_at": None, "reason": None}
    first = post(a, f"/api/v1/student/project/milestones/{milestone['id']}/submissions", {"text": "Version 1"})
    assert first.status_code == 201 and first.json()["late"] is False

    # A defence slot later today: still open, until its start.
    slot = post(teacher, f"{base}/slots", {"starts_at": at(hours=3), "ends_at": at(hours=3, minutes=20), "team_id": team}).json()["id"]
    window = a.get("/api/v1/student/project").json()["team"]["deposits"]
    assert window["open"] is True and window["reason"] == "slot"
    assert post(a, f"/api/v1/student/project/milestones/{milestone['id']}/submissions", {"text": "Version 2"}).status_code == 201

    # The defence has started: deposits and uploads are refused.
    teacher.delete(f"/api/v1/teacher/project/slots/{slot}", headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    post(teacher, f"{base}/slots", {"starts_at": at(minutes=-5), "ends_at": at(minutes=15), "team_id": team})
    closed = post(a, f"/api/v1/student/project/milestones/{milestone['id']}/submissions", {"text": "Trop tard"})
    assert closed.status_code == 409 and "soutenance" in closed.json()["detail"]
    assert upload(a, "rapport.pdf", PDF).status_code == 409
    assert a.get("/api/v1/student/project").json()["team"]["deposits"]["open"] is False

    # The teacher reopens this team for an hour, then goes back to the usual rule.
    reopened = put(teacher, f"/api/v1/teacher/project/teams/{team}/deposits", {"until": at(hours=1)})
    assert reopened.status_code == 200 and reopened.json()["open"] is True and reopened.json()["reason"] == "teacher"
    assert post(a, f"/api/v1/student/project/milestones/{milestone['id']}/submissions", {"text": "Version 3"}).status_code == 201
    assert put(teacher, f"/api/v1/teacher/project/teams/{team}/deposits", {"until": None}).json()["open"] is False
    view = teacher.get(base).json()
    entry = next(item for item in view["teams"] if item["id"] == team)
    assert entry["deposits"]["open"] is False and entry["deposits"]["until"] is None


def test_class_closing_time_for_teams_without_a_slot(project):
    clients, engine, assignment = project
    teacher = clients["teacher"]
    a, team = pair(clients, engine)
    base = f"/api/v1/teacher/classes/{assignment}/project"
    milestone = post(teacher, f"{base}/milestones", {"title": "Rendu final"}).json()
    assert put(teacher, f"{base}/deposits", {"close_at": at(hours=2)}).json()["deposits_close_at"]
    window = a.get("/api/v1/student/project").json()["team"]["deposits"]
    assert window["open"] is True and window["reason"] == "class"
    put(teacher, f"{base}/deposits", {"close_at": at(minutes=-1)})
    assert post(a, f"/api/v1/student/project/milestones/{milestone['id']}/submissions", {"text": "Après"}).status_code == 409
    # A slot takes precedence over the class time.
    post(teacher, f"{base}/slots", {"starts_at": at(hours=1), "ends_at": at(hours=1, minutes=20), "team_id": team})
    assert post(a, f"/api/v1/student/project/milestones/{milestone['id']}/submissions", {"text": "Avant ma soutenance"}).status_code == 201
    # Nothing set: open again.
    assert put(teacher, f"{base}/deposits", {"close_at": None}).json()["deposits_close_at"] is None


def test_students_and_observers_cannot_change_the_deposits(project):
    clients, engine, assignment = project
    a, team = pair(clients, engine)
    assert put(a, f"/api/v1/teacher/classes/{assignment}/project/deposits", {"close_at": None}).status_code == 403
    assert put(a, f"/api/v1/teacher/project/teams/{team}/deposits", {"until": None}).status_code == 403
