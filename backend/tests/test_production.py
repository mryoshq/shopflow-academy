from fastapi import HTTPException
from starlette.requests import Request
import pytest

from app import auth
from app.config import Settings, allowed_origins
from app.main import openapi_url_for


def request_with_origin(origin: str) -> Request:
    return Request({"type": "http", "headers": [(b"origin", origin.encode())]})


def test_production_allows_only_public_and_explicit_extra_origins():
    settings = Settings(app_env="production", app_base_url="https://shopflow.rapidfox.io/", app_extra_origins="http://127.0.0.1:3080, ")
    assert allowed_origins(settings) == {"https://shopflow.rapidfox.io", "http://127.0.0.1:3080"}
    strict = Settings(app_env="production", app_base_url="https://shopflow.rapidfox.io")
    assert allowed_origins(strict) == {"https://shopflow.rapidfox.io"}


def test_check_origin_rejects_foreign_origin_in_production(monkeypatch):
    settings = Settings(app_env="production", app_base_url="https://shopflow.rapidfox.io", app_extra_origins="http://127.0.0.1:3080")
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    auth.check_origin(request_with_origin("https://shopflow.rapidfox.io"))
    auth.check_origin(request_with_origin("http://127.0.0.1:3080"))
    with pytest.raises(HTTPException) as error:
        auth.check_origin(request_with_origin("https://evil.example"))
    assert error.value.status_code == 403
    with pytest.raises(HTTPException):
        auth.check_origin(request_with_origin("http://localhost:3080"))


def test_production_cookie_names_use_host_prefix(monkeypatch):
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(app_env="production"))
    assert auth.cookie_names() == ("__Host-academy_session", "__Host-academy_csrf")


def test_openapi_schema_is_hidden_in_production():
    assert openapi_url_for("production") is None
    assert openapi_url_for("development") == "/api/v1/openapi.json"
