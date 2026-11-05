"""ADR-0034: project space CampusEquip (teams, milestones, versioned submissions, grades, slots, rights)."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.main import app
from app.auth import password_hash
from app.models import AuditEvent, Enrollment, User
from test_observer import create as create_observer, sign_in
from test_student import env, post  # noqa: F401  (fixture reuse)

PDF = b"%PDF-1.4\n% rapport\n" + b"0" * 32


def upload(client, name: str, content: bytes):
    return client.post(f"/api/v1/student/project/files?name={name}", content=content, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def put(client, path, payload):
    return client.put(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def add_students(engine, cohort_id: int, names: list[str]) -> dict[str, TestClient]:
    """More students in the class, signed in (the demo class has two)."""
    with Session(engine) as db:
        for name in names:
            user = User(username=name, password_hash=password_hash.hash(f"{name}-pass"), role="student")
            db.add(user)
            db.flush()
            db.add(Enrollment(cohort_id=cohort_id, user_id=user.id))
        db.commit()
    clients = {}
    for name in names:
        client = TestClient(app)
        assert client.post("/api/v1/auth/login", json={"username": name, "password": f"{name}-pass"}).status_code == 200
        clients[name] = client
    return clients


@pytest.fixture
def project(env, monkeypatch, tmp_path):
    clients, engine = env
    monkeypatch.setattr(get_settings(), "project_dir", str(tmp_path / "project"))
    teacher = clients["teacher"]
    assignment = teacher.get("/api/v1/teacher/classes").json()[0]["id"]
    return clients, engine, assignment


def test_teams_of_one_or_two_by_invitation_one_team_per_person(project):
    clients, _, assignment = project
    a, b, out = clients["a"], clients["b"], clients["out"]
    page = a.get("/api/v1/student/project").json()
    assert page["team"] is None and {c["name"] for c in page["classmates"]} >= {"demo.etudiant02"}
    assert out.get("/api/v1/student/project").json()["cohort_id"] is None  # not in a class: no project
    cohort = page["cohort_id"]
    assert post(a, "/api/v1/student/project/team", {"cohort_id": cohort}).status_code == 201
    assert post(a, "/api/v1/student/project/team", {"cohort_id": cohort}).status_code == 409  # one team only
    b_id = next(c["id"] for c in page["classmates"] if c["name"] == "demo.etudiant02")
    out_id = clients["teacher"].get("/api/v1/auth/me").json()["id"]
    assert post(a, "/api/v1/student/project/invitations", {"user_id": out_id}).status_code == 404  # not a classmate
    invitation = post(a, "/api/v1/student/project/invitations", {"user_id": b_id}).json()["id"]
    assert post(a, "/api/v1/student/project/invitations", {"user_id": b_id}).status_code == 409
    received = b.get("/api/v1/student/project").json()["invitations"]
    assert [item["from"] for item in received] == ["demo.etudiant01"]
    assert post(out, f"/api/v1/student/project/invitations/{invitation}/accept").status_code == 404  # not theirs
    assert post(b, f"/api/v1/student/project/invitations/{invitation}/accept").status_code == 200
    team = a.get("/api/v1/student/project").json()["team"]
    assert [m["name"] for m in team["members"]] == ["demo.etudiant01", "demo.etudiant02"] and team["full"] is False  # a trio is allowed
    view = clients["teacher"].get(f"/api/v1/teacher/classes/{assignment}/project").json()
    assert [[m["name"] for m in t["members"]] for t in view["teams"]] == [["demo.etudiant01", "demo.etudiant02"]]


def test_versioned_submissions_with_files_late_flag_comments_and_privacy(project):
    clients, engine, assignment = project
    a, b, teacher = clients["a"], clients["b"], clients["teacher"]
    cohort = a.get("/api/v1/student/project").json()["cohort_id"]
    post(a, "/api/v1/student/project/team", {"cohort_id": cohort})
    solo_milestone = post(teacher, f"/api/v1/teacher/classes/{assignment}/project/milestones", {"title": "Essai seul", "sort_order": 9}).json()
    # ADR-0041: a team of one cannot submit; the teacher adds a third classmate (B stays outside, for the privacy checks).
    refused = post(a, f"/api/v1/student/project/milestones/{solo_milestone['id']}/submissions", {"text": "Seul"})
    assert refused.status_code == 409 and "travail individuel" in refused.json()["detail"]
    add_students(engine, cohort, ["demo.etudiant03"])
    me = a.get("/api/v1/auth/me").json()["id"]
    c_id = next(c["id"] for c in a.get("/api/v1/student/project").json()["classmates"] if c["name"] == "demo.etudiant03")
    team_id = a.get("/api/v1/student/project").json()["team"]["id"]
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}", {"user_ids": [me, c_id]}).status_code == 200
    teacher.delete(f"/api/v1/teacher/project/milestones/{solo_milestone['id']}", headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    base = f"/api/v1/teacher/classes/{assignment}/project"
    conception = post(teacher, f"{base}/milestones", {"title": "Conception du 29 octobre", "instructions": "Tableau des sources, règles, schéma.",
                                                      "due_at": past, "deliverables": ["Tableau des sources", "Schéma", " "]}).json()
    assert conception["deliverables"] == ["Tableau des sources", "Schéma"]
    final = post(teacher, f"{base}/milestones", {"title": "Rendu final", "sort_order": 1}).json()
    # Files: format and size are checked; a file is only usable by its own team.
    assert upload(a, "virus.exe", b"MZ").status_code == 422
    assert upload(a, "faux.pdf", b"pas un pdf").status_code == 422
    assert upload(a, "gros.zip", b"PK\x03\x04" + b"0" * (20 * 1024 * 1024)).status_code == 413
    report = upload(a, "rapport final.pdf", PDF).json()
    text = "| Source | Format |\n|---|---|\n| ventes | CSV |"
    first = post(a, f"/api/v1/student/project/milestones/{conception['id']}/submissions", {"text": text, "file_ids": [report["id"]]}).json()
    assert first == {"id": first["id"], "version": 1, "late": True}
    assert post(a, f"/api/v1/student/project/milestones/{final['id']}/submissions", {"link": "http://example.com"}).status_code == 422
    assert post(a, f"/api/v1/student/project/milestones/{final['id']}/submissions", {}).status_code == 422
    second = post(a, f"/api/v1/student/project/milestones/{final['id']}/submissions", {"link": "https://github.com/binome/campusequip"}).json()
    again = post(a, f"/api/v1/student/project/milestones/{final['id']}/submissions", {"link": "https://github.com/binome/campusequip", "text": "README à jour"}).json()
    assert (second["version"], second["late"], again["version"]) == (1, False, 2)
    # B is in no team: sees no work and cannot reuse A's file.
    assert "submissions" not in b.get("/api/v1/student/project").json()["milestones"][0]
    assert b.get(f"/api/v1/student/project/files/{report['id']}").status_code == 404
    assert a.get(f"/api/v1/student/project/files/{report['id']}").content == PDF
    assert post(b, f"/api/v1/student/project/milestones/{final['id']}/submissions", {"text": "x", "file_ids": [report["id"]]}).status_code == 404
    # The teacher lists, reads every version and comments; the team sees the comment.
    team_id = a.get("/api/v1/student/project").json()["team"]["id"]
    listing = teacher.get(f"/api/v1/teacher/classes/{assignment}/project").json()
    assert [(s["team_id"], s["versions"], s["late"]) for s in listing["milestones"][1]["submissions"]] == [(team_id, 2, False)]
    detail = teacher.get(f"/api/v1/teacher/project/teams/{team_id}/milestones/{conception['id']}").json()
    assert detail["submissions"][0]["text"] == text and detail["submissions"][0]["files"][0]["name"] == "rapport final.pdf"
    assert teacher.get(f"/api/v1/teacher/project/files/{report['id']}").status_code == 200
    post(teacher, f"/api/v1/teacher/project/teams/{team_id}/comments", {"milestone_id": conception["id"], "text": "Ajoutez les règles de qualité."})
    assert a.get("/api/v1/student/project").json()["milestones"][0]["comments"][0]["text"] == "Ajoutez les règles de qualité."
    assert teacher.delete(f"/api/v1/teacher/project/milestones/{conception['id']}", headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).status_code == 409
    with Session(engine) as db:
        actions = set(db.scalars(select(AuditEvent.action).where(AuditEvent.resource_type == "project")))
    assert {"project.team_create", "project.upload", "project.submit", "project.comment", "project.milestone_create"} <= actions


def test_grid_on_20_csv_slots_teacher_composition_and_observer(project):
    clients, engine, assignment = project
    a, b, teacher = clients["a"], clients["b"], clients["teacher"]
    base = f"/api/v1/teacher/classes/{assignment}/project"
    ids = {c["name"]: c["id"] for c in a.get("/api/v1/student/project").json()["classmates"]}
    me = a.get("/api/v1/auth/me").json()["id"]
    # The teacher sets the composition directly (and can correct it).
    team_id = post(teacher, f"{base}/teams", {"user_ids": [me, ids["demo.etudiant02"]]}).json()["team_id"]
    assert post(teacher, f"{base}/teams", {"user_ids": [me]}).status_code == 409  # already in a team
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}", {"user_ids": [me, ids["demo.etudiant02"]]}).status_code == 200
    full = {"p1_model": 2, "p1_sql": 1.5, "p1_python": 2, "p1_load": 2, "p1_proofs": 1, "b1_plan": 1, "b1_api": 2,
            "p2_airflow": 3, "p2_mongo": 2, "p2_redis": 1, "p2_time": 2, "p2_repro": 1, "b2_metrics": 2}
    graded = put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"criteria": full,
                 "individual": {str(me): 1, str(ids["demo.etudiant02"]): 0.5}, "comment": "Solide."})
    assert [(s["name"], s["part1"], s["part2"], s["base"], s["bonus"], s["complete"]) for s in graded.json()["students"]] == [
        ("demo.etudiant01", 9.5, 9, 18.5, 5, True), ("demo.etudiant02", 9, 9, 18, 5, True)]
    assert graded.json()["legacy"] is None
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"criteria": {"p2_airflow": 4}}).status_code == 422  # above its points
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"criteria": {"sql": 4}}).status_code == 422  # former grid closed
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"individual": {str(me): 2}}).status_code == 422  # 1 at most
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"individual": {"999": 1}}).status_code == 422
    view = teacher.get(base).json()
    assert [p["key"] for p in view["grid"]["parts"]] == ["part1", "part2"] and view["grid"]["base_max"] == 20 and view["grid"]["bonus_max"] == 10
    exported = teacher.get(f"{base}/grades.csv").content.decode("utf-8-sig")
    head = exported.splitlines()[0].split(";")
    assert head[:3] == ["etudiant", "binome", "p1_model_2"] and head[-3:] == ["socle_20", "bonus_10", "ancienne_grille_20"]
    row = next(line for line in exported.splitlines() if line.startswith("demo.etudiant01;"))
    assert row.endswith(";18,5;5;")
    # Defence slots of 23 November: assigned to a team, visible to students.
    slot = post(teacher, f"{base}/slots", {"starts_at": "2026-11-23T09:00:00+01:00", "ends_at": "2026-11-23T09:20:00+01:00", "label": "Salle B3",
                                           "team_id": team_id}).json()["id"]
    other = post(teacher, f"{base}/slots", {"starts_at": "2026-11-23T09:20:00+01:00", "ends_at": "2026-11-23T09:40:00+01:00"}).json()["id"]
    assert teacher.patch(f"/api/v1/teacher/project/slots/{other}", json={"team_id": team_id},
                         headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).status_code == 409  # one slot per team
    slots = b.get("/api/v1/student/project").json()["slots"]
    assert [(s["id"], s["mine"], s["label"]) for s in slots] == [(slot, True, "Salle B3"), (other, False, "")]
    # Observer: nothing of the project without permission; anonymised overview with it.
    # ADR-0042: a guest sees nothing of the project; « Administration » sees it, with the real names.
    created = create_observer(teacher, "inspection.projet", kind="guest")
    observer = sign_in(created["username"], created["password"])
    assert observer.get(f"/api/v1/observer/classes/{assignment}/project").status_code == 403
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"kind": "admin"}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    observer = sign_in(created["username"], created["password"])
    seen = observer.get(f"/api/v1/observer/classes/{assignment}/project").json()
    assert [m["name"] for m in seen["teams"][0]["members"]] == ["demo.etudiant01", "demo.etudiant02"]
    assert TestClient(app).get(f"/api/v1/teacher/classes/{assignment}/project").status_code == 401


def test_trio_by_invitation_then_full_and_two_can_submit(project):
    """Owner decision 05/11/2026: teams of two or three; a fourth is refused, one alone never submits."""
    clients, engine, assignment = project
    a, b = clients["a"], clients["b"]
    page = a.get("/api/v1/student/project").json()
    cohort = page["cohort_id"]
    extra = add_students(engine, cohort, ["demo.trio03", "demo.trio04"])
    ids = {c["name"]: c["id"] for c in a.get("/api/v1/student/project").json()["classmates"]}
    assert post(a, "/api/v1/student/project/team", {"cohort_id": cohort}).status_code == 201
    for name, client in (("demo.etudiant02", b), ("demo.trio03", extra["demo.trio03"])):
        invitation = post(a, "/api/v1/student/project/invitations", {"user_id": ids[name]}).json()["id"]
        assert post(client, f"/api/v1/student/project/invitations/{invitation}/accept").status_code == 200
    team = a.get("/api/v1/student/project").json()["team"]
    assert len(team["members"]) == 3 and team["full"] is True
    refused = post(a, "/api/v1/student/project/invitations", {"user_id": ids["demo.trio04"]})
    assert refused.status_code == 409 and "3 étudiants" in refused.json()["detail"]
