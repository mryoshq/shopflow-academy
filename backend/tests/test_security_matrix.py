"""Authorization matrix generated from every registered API route.

A new route is covered automatically: anonymous callers must get 401, students must
get 403 on teacher routes, teachers 403 on student routes, and every write must
require CSRF. Path parameters use IDs that exist in the fixture (cross-account
attempts) as well as IDs that do not.
"""

import re

from fastapi.testclient import TestClient

from app.main import app
from test_student import env, missions_of, post  # noqa: F401  (fixture reuse)

PUBLIC = {("/api/v1/auth/login", "POST"), ("/api/v1/status", "GET")}
# Any signed-in user, own data only (ADR-0023: presence, own notifications, own push subscriptions).
SELF_SERVICE = {"/api/v1/auth/me", "/api/v1/auth/logout", "/api/v1/presence", "/api/v1/notifications", "/api/v1/notifications/read-all",
                "/api/v1/notifications/{notification_id}/read", "/api/v1/push/key", "/api/v1/push/subscribe", "/api/v1/push/unsubscribe",
                "/api/v1/radio"}


def api_routes() -> list[tuple[str, str]]:
    # The generated OpenAPI schema lists every route, including those of included routers.
    paths = app.openapi()["paths"]
    return sorted((path, method.upper()) for path, item in paths.items() if path.startswith("/api/v1") for method in item)


def concrete(path: str, value: int) -> str:
    return re.sub(r"\{[^}]+\}", str(value), path)


def call(client: TestClient, method: str, path: str, csrf: bool = True):
    headers = {"X-CSRF-Token": client.cookies.get("academy_csrf", "")} if csrf else {}
    return client.request(method, path, json={}, headers=headers)


def test_route_inventory_is_known():
    routes = api_routes()
    assert len(routes) >= 45
    unknown = [r for r in routes if r not in PUBLIC and r[0] not in SELF_SERVICE
               and not r[0].startswith(("/api/v1/teacher/", "/api/v1/student/"))]
    assert unknown == [], f"route outside the authorization model: {unknown}"


def test_anonymous_is_rejected_everywhere(env):
    anonymous = TestClient(app)
    failures = [(method, path, code) for path, method in api_routes() if (path, method) not in PUBLIC
                for code in [call(anonymous, method, concrete(path, 1)).status_code] if code != 401]
    assert failures == []


def test_role_separation_on_every_route(env):
    clients, _ = env
    version = missions_of(clients["a"])[0]["mission_version_id"]
    failures = []
    for path, method in api_routes():
        if (path, method) in PUBLIC or path in SELF_SERVICE:
            continue
        for value in (1, version, 999_999):
            url = concrete(path, value)
            if path.startswith("/api/v1/teacher/"):
                code = call(clients["a"], method, url).status_code
                if code != 403:
                    failures.append((method, url, "student", code))
            elif path.startswith("/api/v1/student/"):
                code = call(clients["teacher"], method, url).status_code
                if code != 403:
                    failures.append((method, url, "teacher", code))
    assert failures == []


def test_every_write_requires_csrf(env):
    clients, _ = env
    version = missions_of(clients["a"])[0]["mission_version_id"]
    failures = []
    for path, method in api_routes():
        if method == "GET" or (path, method) in PUBLIC:
            continue
        client = clients["a"] if path.startswith("/api/v1/student/") else clients["teacher"]
        code = call(client, method, concrete(path, version), csrf=False).status_code
        if code != 403:
            failures.append((method, path, code))
    assert failures == []


def test_cross_account_student_data_is_never_returned(env):
    clients, _ = env
    first = missions_of(clients["a"])[0]["mission_version_id"]
    view = clients["a"].get(f"/api/v1/student/missions/{first}").json()
    right = next(c["id"] for c in view["definition"]["choices"] if c["label"].startswith("La jointure"))
    post(clients["a"], f"/api/v1/student/missions/{first}/attempts", {"idempotency_key": "matrix-0001", "answer": {"choice_ids": [right]}})
    # Student B sees only their own state; the outsider sees nothing of the course.
    b = clients["b"].get(f"/api/v1/student/missions/{first}").json()
    assert b["attempts_count"] == 0 and b["score"]["best"] == 0
    assert clients["b"].get(f"/api/v1/student/missions/{first}/attempts").json() == []
    assert clients["out"].get(f"/api/v1/student/missions/{first}").status_code == 404
    assert clients["out"].get("/api/v1/student/dashboard").json()["courses"] == []
    # Choice IDs are opaque per mission version, so an answer copied between versions is rejected.
    assert right.startswith("c") and len(right) == 17
