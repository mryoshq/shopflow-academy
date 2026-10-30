from datetime import timedelta
from hashlib import sha256
from pathlib import Path
import json

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.auth import LoginRequest, password_hash, utcnow
from app.database import get_db
from app.main import app
from app.models import AuthEvent, User, UserSession
from app.seed_demo import seed_demo


@pytest.fixture
def auth_env(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'auth.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(config, "head")
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    with Session(engine) as db:
        db.add_all([
            User(username="student.a", password_hash=password_hash.hash("student-a-test"), role="student"),
            User(username="student.b", password_hash=password_hash.hash("student-b-test"), role="student"),
            User(username="teacher.a", password_hash=password_hash.hash("teacher-a-test"), role="teacher"),
        ])
        db.commit()

    def override_db():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def login(client: TestClient, username: str, password: str):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_logout_cookie_csrf_revocation_and_audit(auth_env):
    client, engine = auth_env
    response = login(client, "student.a", "student-a-test")
    assert response.status_code == 200
    assert response.json()["role"] == "student"
    assert "password_hash" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert "httponly" in response.headers["set-cookie"].lower()
    raw_session = client.cookies["academy_session"]
    with Session(engine) as db:
        record = db.get(UserSession, sha256(raw_session.encode()).hexdigest())
        assert record is not None
        assert record.token_hash != raw_session
    assert client.get("/api/v1/auth/me").json()["username"] == "student.a"
    assert client.post("/api/v1/auth/logout").status_code == 403
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "invalid"}).status_code == 403
    csrf = client.cookies["academy_csrf"]
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    with Session(engine) as db:
        assert [event.action for event in db.scalars(select(AuthEvent).order_by(AuthEvent.id))] == ["login", "logout"]


def test_roles_and_record_ownership_are_enforced(auth_env):
    client, engine = auth_env
    with Session(engine) as db:
        ids = {user.username: user.id for user in db.scalars(select(User))}
    assert client.get(f"/api/v1/student/profiles/{ids['student.a']}").status_code == 401
    assert login(client, "student.a", "student-a-test").status_code == 200
    own = client.get(f"/api/v1/student/profiles/{ids['student.a']}")
    assert own.status_code == 200
    assert own.json() == {"id": ids["student.a"], "username": "student.a", "role": "student"}
    assert client.get(f"/api/v1/student/profiles/{ids['student.b']}").status_code == 403
    assert client.get(f"/api/v1/teacher/students/{ids['student.b']}").status_code == 403
    teacher = TestClient(app)
    assert login(teacher, "teacher.a", "teacher-a-test").status_code == 200
    assert teacher.get(f"/api/v1/teacher/students/{ids['student.b']}").status_code == 200
    assert teacher.get(f"/api/v1/student/profiles/{ids['student.b']}").status_code == 403


def test_generic_login_errors_and_throttling(auth_env):
    client, _ = auth_env
    bad_known = login(client, "student.a", "wrong")
    bad_unknown = login(client, "unknown", "wrong")
    assert bad_known.status_code == bad_unknown.status_code == 401
    assert bad_known.json() == bad_unknown.json() == {"detail": "invalid credentials"}
    for _ in range(4):
        assert login(client, "student.a", "wrong").status_code == 401
    assert login(client, "student.a", "student-a-test").status_code == 429


def test_expired_session_and_disabled_account_are_rejected(auth_env):
    client, engine = auth_env
    assert login(client, "student.a", "student-a-test").status_code == 200
    raw = client.cookies["academy_session"]
    with Session(engine) as db:
        record = db.get(UserSession, sha256(raw.encode()).hexdigest())
        record.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/v1/auth/me").status_code == 401
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.username == "student.b"))
        user.enabled = False
        db.commit()
    assert login(client, "student.b", "student-b-test").status_code == 401


def test_origin_and_production_cookie_attributes(auth_env, monkeypatch):
    client, _ = auth_env
    from app.config import get_settings
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_BASE_URL", "https://shopflow.rapidfox.io")
    get_settings.cache_clear()
    try:
        assert client.post("/api/v1/auth/login", json={"username": "student.a", "password": "student-a-test"}, headers={"Origin": "https://attacker.example"}).status_code == 403
        response = client.post("/api/v1/auth/login", json={"username": "student.a", "password": "student-a-test"}, headers={"Origin": "https://shopflow.rapidfox.io"})
        assert response.status_code == 200
        cookies = response.headers.get_list("set-cookie")
        assert any("__Host-academy_session=" in c and "Secure" in c and "HttpOnly" in c and "SameSite=lax" in c for c in cookies)
        assert any("__Host-academy_csrf=" in c and "Secure" in c for c in cookies)
    finally:
        get_settings.cache_clear()


def test_demo_seed_is_fictional_idempotent_and_disabled_in_production(auth_env, tmp_path):
    _, engine = auth_env
    path = tmp_path / "private" / "credentials.json"
    with Session(engine) as db:
        assert seed_demo(db, path, "development") == 11
    data = json.loads(path.read_text())
    assert len(data) == 11
    assert all(row["username"].startswith("demo.") for row in data)
    assert path.stat().st_mode & 0o777 == 0o600
    with Session(engine) as db:
        assert seed_demo(db, path, "development") == 0
    with Session(engine) as db, pytest.raises(RuntimeError):
        seed_demo(db, path, "production")


def test_every_session_lasts_30_days_is_renewed_at_each_visit_and_logout_revokes_it(auth_env):
    """ADR-0038: every sign-in lasts 30 days, renewed by /auth/me; « remember » is ignored if an old page sends it."""
    client, engine = auth_env

    def stored():
        with Session(engine) as db:
            return db.get(UserSession, sha256(client.cookies["academy_session"].encode()).hexdigest())

    for body in ({"username": "student.a", "password": "student-a-test"},
                 {"username": "student.a", "password": "student-a-test", "remember": False},
                 {"username": "student.a", "password": "student-a-test", "remember": True}):
        response = client.post("/api/v1/auth/login", json=body)
        assert response.status_code == 200
        cookies = response.headers.get_list("set-cookie")
        assert all("Max-Age=2592000" in cookie for cookie in cookies) and any("HttpOnly" in cookie for cookie in cookies)
        assert timedelta(days=29) < stored().expires_at.replace(tzinfo=None) - utcnow().replace(tzinfo=None) <= timedelta(days=30)
    session, csrf = client.cookies["academy_session"], client.cookies["academy_csrf"]
    # A visit within the hour does not rewrite the cookies.
    assert "set-cookie" not in client.get("/api/v1/auth/me").headers
    # Ten days later, a visit pushes the end back to 30 days, with the same tokens (CSRF unchanged).
    with Session(engine) as db:
        record = db.get(UserSession, sha256(session.encode()).hexdigest())
        record.created_at = utcnow() - timedelta(days=10)
        record.expires_at = utcnow() + timedelta(days=20)
        db.commit()
    renewed = client.get("/api/v1/auth/me")
    assert renewed.status_code == 200 and "Max-Age=2592000" in renewed.headers["set-cookie"]
    assert client.cookies["academy_session"] == session and client.cookies["academy_csrf"] == csrf
    assert stored().expires_at.replace(tzinfo=None) - utcnow().replace(tzinfo=None) > timedelta(days=29)
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "invalid"}).status_code == 403  # CSRF still checked
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    with Session(engine) as db:
        assert db.get(UserSession, sha256(session.encode()).hexdigest()).revoked_at is not None
    client.cookies.set("academy_session", session)
    assert client.get("/api/v1/auth/me").status_code == 401  # the revoked session is refused


def test_an_older_page_that_still_sends_remember_signs_in_without_422(auth_env):
    """ADR-0038: the « remember » field is gone from the API; an old client sending it is accepted (field ignored)."""
    client, _ = auth_env
    assert "remember" not in LoginRequest.model_fields
    for value in (True, False, "oui", None):
        response = client.post("/api/v1/auth/login", json={"username": "student.a", "password": "student-a-test", "remember": value})
        assert response.status_code == 200, response.text
        assert all("Max-Age=2592000" in cookie for cookie in response.headers.get_list("set-cookie"))
    # Unknown fields are ignored, but the required ones are still checked.
    assert client.post("/api/v1/auth/login", json={"username": "student.a", "remember": True}).status_code == 422


def test_a_restart_or_redeployment_signs_nobody_out(auth_env, tmp_path):
    """ADR-0038: sessions are rows in the database; a new process (new engine, new client) still accepts them."""
    client, engine = auth_env
    assert login(client, "student.a", "student-a-test").status_code == 200
    session, csrf = client.cookies["academy_session"], client.cookies["academy_csrf"]
    url = str(engine.url)
    engine.dispose()
    app.dependency_overrides.clear()
    restarted = create_engine(url, connect_args={"check_same_thread": False})

    def override_db():
        with Session(restarted, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as fresh:
            fresh.cookies.set("academy_session", session)
            fresh.cookies.set("academy_csrf", csrf)
            me = fresh.get("/api/v1/auth/me")
            assert me.status_code == 200 and me.json()["username"] == "student.a"
            assert fresh.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    finally:
        restarted.dispose()
