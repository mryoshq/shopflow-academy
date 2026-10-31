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
    assert [m["name"] for m in team["members"]] == ["demo.etudiant01", "demo.etudiant02"] and team["full"] is True
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
    graded = put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"sql": 4, "python": 3.5, "nosql": 3, "airflow": 2, "reproducibility": 2,
                                                                           "individual": {str(me): 4, str(ids["demo.etudiant02"]): 3}, "comment": "Solide."})
    assert [(s["name"], s["common"], s["individual"], s["total"]) for s in graded.json()["students"]] == [
        ("demo.etudiant01", 14.5, 4, 18.5), ("demo.etudiant02", 14.5, 3, 17.5)]
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"sql": 5}).status_code == 422
    assert put(teacher, f"/api/v1/teacher/project/teams/{team_id}/grade", {"individual": {"999": 2}}).status_code == 422
    exported = teacher.get(f"{base}/grades.csv").content.decode("utf-8-sig")
    assert exported.splitlines()[0].startswith("etudiant;binome;sql_4") and "demo.etudiant01;demo.etudiant01 + demo.etudiant02;4;3,5;3;2;2;14,5;4;18,5" in exported
    # Defence slots of 23 November: assigned to a team, visible to students.
    slot = post(teacher, f"{base}/slots", {"starts_at": "2026-11-23T09:00:00+01:00", "ends_at": "2026-11-23T09:20:00+01:00", "label": "Salle B3",
                                           "team_id": team_id}).json()["id"]
    other = post(teacher, f"{base}/slots", {"starts_at": "2026-11-23T09:20:00+01:00", "ends_at": "2026-11-23T09:40:00+01:00"}).json()["id"]
    assert teacher.patch(f"/api/v1/teacher/project/slots/{other}", json={"team_id": team_id},
                         headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).status_code == 409  # one slot per team
    slots = b.get("/api/v1/student/project").json()["slots"]
    assert [(s["id"], s["mine"], s["label"]) for s in slots] == [(slot, True, "Salle B3"), (other, False, "")]
    # Observer: nothing of the project without permission; anonymised overview with it.
    created = create_observer(teacher, "inspection.projet")
    observer = sign_in("inspection.projet", created["password"])
    assert observer.get(f"/api/v1/observer/classes/{assignment}/project").status_code == 403
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"project_access": True}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    seen = observer.get(f"/api/v1/observer/classes/{assignment}/project").json()
    assert [m["name"] for m in seen["teams"][0]["members"]] == ["Étudiant 1", "Étudiant 2"] and "demo" not in str(seen)
    assert TestClient(app).get(f"/api/v1/teacher/classes/{assignment}/project").status_code == 401
