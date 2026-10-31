"""Observers (ADR-0025, ADR-0042): invited by the teacher, « Administration » or « Invité », read only."""

from datetime import timedelta
import re
import smtplib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.auth import password_hash, utcnow
from app.config import get_settings
from app.main import app
from app.models import AuditEvent, Observer, ObserverInvitation, User
from test_student import env, missions_of, post, walk_keys  # noqa: F401  (fixture reuse)

PASSWORD = "Observation-2026!"


def sign_in(username: str, password: str) -> TestClient:
    client = TestClient(app)
    assert client.post("/api/v1/auth/login", json={"username": username, "password": password}).status_code == 200
    return client


def invite(teacher: TestClient, name: str = "inspecteur.demo", kind: str = "guest", **options) -> dict:
    created = post(teacher, "/api/v1/teacher/observers", {"full_name": f"M. {name}", "email": f"{name}@example.org", "kind": kind, **options})
    assert created.status_code == 201, created.text
    return created.json()


def token_of(link: str) -> str:
    return link.rsplit("/", 1)[-1]


def create(teacher: TestClient, name: str = "inspecteur.demo", kind: str = "guest", **options) -> dict:
    """Invited, then activated with a chosen password: {id, username, password}."""
    body = invite(teacher, name, kind, **options)
    accepted = TestClient(app).post(f"/api/v1/invitations/{token_of(body['invitation']['link'])}/accept", json={"password": PASSWORD})
    assert accepted.status_code == 200, accepted.text
    return {"id": body["observer"]["id"], "username": accepted.json()["username"], "password": PASSWORD}


def solve_first(clients) -> None:
    a = clients["a"]
    first = missions_of(a)[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{first}").json()
    right = next(c["id"] for c in view["definition"]["choices"] if c["label"].startswith("La jointure"))
    post(a, f"/api/v1/student/missions/{first}/attempts", {"idempotency_key": "observer-0001", "answer": {"choice_ids": [right]}})
    post(a, f"/api/v1/student/missions/{first}/help", {"message": "Message privé de l'étudiant"})


def test_invitation_single_use_expiry_revocation_and_password_rules(env):
    clients, engine = env
    teacher = clients["teacher"]
    body = invite(teacher, kind="admin", show_answers=True)
    observer, invitation = body["observer"], body["invitation"]
    assert observer["status"] == "pending" and observer["kind"] == "admin" and observer["show_answers"] is True
    assert invitation["delivery"] == "manual" and invitation["link"].startswith(get_settings().app_base_url.rstrip("/") + "/#/invitation/")
    assert "Rapidfox Academy" in invitation["mail"]["body"] and invitation["mail"]["subject"].startswith("Invitation")
    token = token_of(invitation["link"])
    with Session(engine) as db:
        stored = db.scalar(select(ObserverInvitation.token_hash))
    assert stored != token and len(stored) == 64 and token not in str(stored)  # only the hash is kept
    anonymous = TestClient(app)
    seen = anonymous.get(f"/api/v1/invitations/{token}").json()
    assert seen["full_name"] == "M. inspecteur.demo" and seen["kind_label"] == "Administration"
    assert anonymous.post(f"/api/v1/invitations/{token}/accept", json={"password": "court"}).status_code == 422
    assert "adresse" in anonymous.post(f"/api/v1/invitations/{token}/accept", json={"password": "inspecteur.demo-2026"}).json()["detail"]
    assert anonymous.post(f"/api/v1/invitations/{token}/accept", json={"password": PASSWORD}).json() == {"activated": True, "username": "inspecteur.demo@example.org"}
    # Single use.
    assert anonymous.post(f"/api/v1/invitations/{token}/accept", json={"password": "Autre-mot-2026!"}).status_code == 410
    assert anonymous.get(f"/api/v1/invitations/{token}").status_code == 410
    assert anonymous.get("/api/v1/invitations/" + "x" * 43).status_code == 404
    sign_in("inspecteur.demo@example.org", PASSWORD)
    assert post(teacher, "/api/v1/teacher/observers", {"full_name": "Doublon", "email": "INSPECTEUR.demo@example.org", "kind": "guest"}).status_code == 409
    # Expired after 7 days; a resend revokes the previous link; a revoked link is refused.
    second = invite(teacher, "expire.demo")
    old = token_of(second["invitation"]["link"])
    with Session(engine) as db:
        row = db.scalar(select(ObserverInvitation).where(ObserverInvitation.observer_id == second["observer"]["id"]))
        row.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    assert anonymous.post(f"/api/v1/invitations/{old}/accept", json={"password": PASSWORD}).status_code == 410
    assert [o["status"] for o in teacher.get("/api/v1/teacher/observers").json() if o["id"] == second["observer"]["id"]] == ["expired"]
    resent = post(teacher, f"/api/v1/teacher/observers/{second['observer']['id']}/invitation").json()["invitation"]
    fresh = token_of(resent["link"])
    assert teacher.delete(f"/api/v1/teacher/observers/{second['observer']['id']}/invitation",
                          headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]}).json()["status"] == "expired"
    assert anonymous.post(f"/api/v1/invitations/{fresh}/accept", json={"password": PASSWORD}).status_code == 404
    with Session(engine) as db:
        actions = set(db.scalars(select(AuditEvent.action).where(AuditEvent.resource_type == "observer")))
    assert {"observer.create", "observer.invite", "observer.activate", "observer.invitation_revoke"} <= actions


def test_smtp_ssl_and_starttls_and_a_clear_message_when_sending_fails(env, monkeypatch):
    clients, _ = env
    teacher = clients["teacher"]
    assert teacher.get("/api/v1/teacher/observers/mail").json() == {"configured": False}
    assert post(teacher, "/api/v1/teacher/observers/mail-test", {"to": "moi@example.org"}).status_code == 409
    settings = get_settings()
    for key, value in {"smtp_host": "smtp.resend.com", "smtp_port": 465, "smtp_user": "resend", "smtp_password": "re_secret_key",
                       "smtp_from": "academy@example.org", "smtp_security": "ssl"}.items():
        monkeypatch.setattr(settings, key, value)
    sent: list[tuple] = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None, context=None):
            sent.append(("connect", type(self).__name__, host, port))
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def starttls(self, context=None): sent.append(("starttls",))
        def login(self, user, password): sent.append(("login", user))
        def send_message(self, message): sent.append(("send", message["To"], message["Subject"], message.get_content()))

    class FakeSSL(FakeSMTP):
        pass

    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSSL)
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    assert teacher.get("/api/v1/teacher/observers/mail").json() == {"configured": True}
    assert post(teacher, "/api/v1/teacher/observers/mail-test", {"to": "moi@example.org"}).json() == {"sent": True}
    assert sent[0] == ("connect", "FakeSSL", "smtp.resend.com", 465) and ("login", "resend") in sent
    body = invite(teacher, "courriel.demo")["invitation"]
    assert body["delivery"] == "smtp" and body["error"] is None
    letter = [item for item in sent if item[0] == "send"][-1]
    assert letter[1] == "courriel.demo@example.org" and token_of(body["link"]) in letter[3] and "Rapidfox Academy" in letter[3]
    sent.clear()
    monkeypatch.setattr(settings, "smtp_security", "starttls")
    monkeypatch.setattr(settings, "smtp_port", 587)
    assert post(teacher, "/api/v1/teacher/observers/mail-test", {"to": "moi@example.org"}).status_code == 200
    assert sent[0][1] == "FakeSMTP" and ("starttls",) in sent

    class Refused(FakeSMTP):
        def login(self, user, password):
            raise smtplib.SMTPAuthenticationError(535, b"bad key re_secret_key")

    monkeypatch.setattr(smtplib, "SMTP", Refused)
    failed = post(teacher, "/api/v1/teacher/observers/mail-test", {"to": "moi@example.org"})
    assert failed.status_code == 502 and "identification" in failed.json()["detail"]
    for secret in ("re_secret_key", "smtp.resend.com", "resend", "587"):
        assert secret not in failed.json()["detail"]  # never the configuration
    fallback = invite(teacher, "secours.demo")["invitation"]
    assert fallback["delivery"] == "manual" and "Copier le lien" in fallback["error"] and "re_secret_key" not in str(fallback)


def test_administration_sees_names_grades_file_csv_pdf_and_answers_only_if_allowed(env):
    clients, _ = env
    teacher = clients["teacher"]
    solve_first(clients)
    created = create(teacher, "direction.demo", kind="admin", show_answers=True)
    admin = sign_in(created["username"], created["password"])
    me = admin.get("/api/v1/observer/me").json()
    assert me["kind"] == "admin" and me["rights"] == {"named": True, "grades": True, "export": True, "project": True, "student_file": True, "answers": True}
    assignment = admin.get("/api/v1/observer/classes").json()[0]["id"]
    base = f"/api/v1/observer/classes/{assignment}"
    board = admin.get(f"{base}/dashboard").json()
    assert board["students"] == 2 and board["mean_progress"] > 0 and board["blocks_total"] >= 1 and "generated_at" in board and board["version"] == 1
    assert {"demo.etudiant01", "demo.etudiant02"} == {item["name"] for item in board["progress"]}
    figures = admin.get(f"{base}/charts").json()
    assert figures["modules"] and sum(item["count"] for item in figures["grades"]) == 2 and figures["activity"][0]["help"] == 1
    assert "Message privé" not in str(board) + str(figures)  # numbers only, never the text of a help request
    grades = admin.get(f"{base}/grades").json()["students"]
    first = next(item for item in grades if item["name"] == "demo.etudiant01")
    assert first["completed"] == 1 and first["percent"] > 0
    file = admin.get(f"{base}/students/{first['id']}").json()
    assert file["name"] == "demo.etudiant01" and file["modules"] and file["level"]["xp"] >= 10 and file["badge_count"] >= 1
    assert admin.get(f"{base}/students/999999").status_code == 404  # not a student of the class
    exported = admin.get(f"{base}/grades.csv")
    assert exported.status_code == 200 and "demo.etudiant01" in exported.text and exported.text.splitlines()[0].startswith("﻿etudiant;points_cours")
    report = admin.get(f"{base}/report.pdf")
    assert report.status_code == 200 and report.content.startswith(b"%PDF-1.4") and report.headers["content-type"] == "application/pdf"
    assert re.search(r'filename="rapidfox-rapport-classe-\d+-\d{4}-\d{2}-\d{2}\.pdf"', report.headers["content-disposition"])
    course = admin.get(f"{base}/course").json()
    assert course["show_answers"] is True and any("correct_ids" in item for item in course["corrections"].values())
    assert walk_keys(course["modules"]) == []
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"show_answers": False}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert admin.get(f"{base}/course").json()["corrections"] == {}
    assert admin.get(f"{base}/project").status_code == 200
    # Never live presence or login data.
    assert "online" not in str(board) and "seen_at" not in str(board) and "last_login" not in str(board)


def test_guest_is_anonymised_stably_with_aggregates_and_course_only(env):
    clients, engine = env
    teacher = clients["teacher"]
    solve_first(clients)
    created = create(teacher, "invite.demo", kind="guest", show_answers=True)  # ignored for a guest
    guest = sign_in(created["username"], created["password"])
    assert guest.get("/api/v1/observer/me").json()["rights"] == {"named": False, "grades": False, "export": False, "project": False, "student_file": False, "answers": False}
    assignment = guest.get("/api/v1/observer/classes").json()[0]["id"]
    base = f"/api/v1/observer/classes/{assignment}"
    board = guest.get(f"{base}/dashboard").json()
    names = [item["name"] for item in board["progress"]]
    assert names == ["Étudiant 1", "Étudiant 2"] and "demo" not in str(board)
    assert guest.get(f"{base}/charts").status_code == 200
    course = guest.get(f"{base}/course").json()
    assert course["show_answers"] is False and course["corrections"] == {} and walk_keys(course) == []
    for path in ("grades", "grades.csv", "report.pdf", "students/1", "project", "progress", "results", "results/export.csv"):
        assert guest.get(f"{base}/{path}").status_code in (403, 404), path
    # Stable per account: a new student gets the next number, the others keep theirs (even if listed first).
    with Session(engine) as db:
        cohort = db.scalar(text("select cohort_id from assignments where id = :a"), {"a": assignment})
    from test_project import add_students  # here: test_project imports this module

    add_students(engine, cohort, ["aaa.premier"])
    again = [item["name"] for item in guest.get(f"{base}/dashboard").json()["progress"]]
    assert again == ["Étudiant 1", "Étudiant 2", "Étudiant 3"]
    # Another guest has its own numbering.
    other = create(teacher, "autre.invite", kind="guest")
    other_names = [item["name"] for item in sign_in(other["username"], other["password"]).get(f"{base}/dashboard").json()["progress"]]
    assert other_names == ["Étudiant 1", "Étudiant 2", "Étudiant 3"]
    # Changing the type applies at the next sign-in.
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"kind": "admin"}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert guest.get("/api/v1/observer/me").status_code == 401
    promoted = sign_in(created["username"], created["password"])
    assert promoted.get(f"{base}/grades").status_code == 200
    with Session(engine) as db:
        assert db.get(Observer, created["id"]).show_answers is False


def test_no_write_journal_disable_and_another_teacher(env):
    clients, engine = env
    teacher = clients["teacher"]
    created = create(teacher, "journal.demo", kind="admin")
    observer = sign_in(created["username"], created["password"])
    assignment = observer.get("/api/v1/observer/classes").json()[0]["id"]
    observer.get(f"/api/v1/observer/classes/{assignment}/dashboard")
    observer.get(f"/api/v1/observer/classes/{assignment}/grades.csv")
    views = teacher.get("/api/v1/teacher/observers/views").json()
    assert [item["view"] for item in views][:3] == ["grades.csv", "dashboard", "classes"]
    assert views[0]["observer"] == "M. journal.demo" and views[0]["kind"] == "admin" and views[0]["created_at"]
    # No write: teacher and student routes, self-service routes, other observers' data.
    with Session(engine) as db:
        before = {name: db.scalar(select(func.count()).select_from(text(name))) for name in inspect(engine).get_table_names()}
    for method, path in [("POST", "/api/v1/teacher/observers"), ("PATCH", f"/api/v1/teacher/observers/{created['id']}"),
                         ("POST", f"/api/v1/teacher/classes/{assignment}/pause"), ("POST", "/api/v1/presence"), ("GET", "/api/v1/notifications"),
                         ("POST", "/api/v1/student/project/team"), ("GET", "/api/v1/teacher/observers/views")]:
        assert observer.request(method, path, json={}, headers={"X-CSRF-Token": observer.cookies["academy_csrf"]}).status_code in (403, 404), path
    with Session(engine) as db:
        after = {name: db.scalar(select(func.count()).select_from(text(name))) for name in inspect(engine).get_table_names()}
    assert after == before
    # Another teacher neither sees nor manages the observer; the observer sees only its owner's classes.
    with Session(engine) as db:
        db.add(User(username="autre.enseignant", password_hash=password_hash.hash("other-teacher-pass"), role="teacher"))
        db.commit()
    other = sign_in("autre.enseignant", "other-teacher-pass")
    assert other.get("/api/v1/teacher/observers").json() == [] and other.get("/api/v1/teacher/observers/views").json() == []
    for method, path in [("PATCH", f"/api/v1/teacher/observers/{created['id']}"), ("POST", f"/api/v1/teacher/observers/{created['id']}/invitation"),
                         ("DELETE", f"/api/v1/teacher/observers/{created['id']}/invitation")]:
        assert other.request(method, path, json={"enabled": False} if method == "PATCH" else None,
                             headers={"X-CSRF-Token": other.cookies["academy_csrf"]}).status_code == 404
    assert observer.get("/api/v1/observer/classes/999999/dashboard").status_code == 404
    # Disabled: the open session and new sign-ins are refused, pending links too.
    teacher.patch(f"/api/v1/teacher/observers/{created['id']}", json={"enabled": False}, headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert observer.get("/api/v1/observer/classes").status_code == 401
    assert TestClient(app).post("/api/v1/auth/login", json={"username": created["username"], "password": PASSWORD}).status_code == 401
    assert post(teacher, f"/api/v1/teacher/observers/{created['id']}/invitation").status_code == 409


@pytest.mark.parametrize("kind", ["admin", "guest"])
def test_every_observer_route_answers_by_type(env, kind):
    """Rights per type on every observer route, including another class (IDOR)."""
    clients, _ = env
    created = create(clients["teacher"], f"matrice.{kind}", kind=kind)
    observer = sign_in(created["username"], created["password"])
    assignment = observer.get("/api/v1/observer/classes").json()[0]["id"]
    student = clients["a"].get("/api/v1/auth/me").json()["id"]
    admin_only = {"grades", "grades.csv", "report.pdf", f"students/{student}", "project"}
    for path in ("dashboard", "charts", "course", *admin_only):
        code = observer.get(f"/api/v1/observer/classes/{assignment}/{path}").status_code
        assert code == (200 if kind == "admin" or path not in admin_only else 403), (path, code)
        assert observer.get(f"/api/v1/observer/classes/999999/{path}").status_code in (403, 404), path
