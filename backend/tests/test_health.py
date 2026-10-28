from fastapi.testclient import TestClient

from app import main


def test_liveness_and_status_are_available_without_database():
    client = TestClient(main.app)
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/api/v1/status").json() == {"status": "foundation"}


def test_readiness_reports_database_failure(monkeypatch):
    monkeypatch.setattr(main, "database_is_ready", lambda: False)
    response = TestClient(main.app).get("/health/ready")
    assert response.status_code == 503


def test_readiness_reports_database_success(monkeypatch):
    monkeypatch.setattr(main, "database_is_ready", lambda: True)
    assert TestClient(main.app).get("/health/ready").json() == {"status": "ok"}
