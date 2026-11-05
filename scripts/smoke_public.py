#!/usr/bin/env python3
"""Smoke test of a running ShopFlow Academy (local gateway or public URL).

Production (the public URL or the local production gateway on port 3080) signs in
with the owner teacher account (.local/teacher-credentials.json) and checks that the
disabled demo accounts are refused. The test stack (any other address, for example
http://127.0.0.1:3180) signs in with a fictitious demo student. Never prints a
credential, cookie value or token.

    python3 scripts/smoke_public.py                       # https://shopflow.rapidfox.io
    python3 scripts/smoke_public.py http://127.0.0.1:3080 # local production gateway
    python3 scripts/smoke_public.py http://127.0.0.1:3180 # test stack (scripts/test_stack.py)
"""

from __future__ import annotations

import json
import re
import socket
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
DEMO_CREDENTIALS = ROOT / ".local" / "demo-credentials.json"
TEST_STACK_CREDENTIALS = ROOT / ".local" / "test-stack-credentials.json"
TEACHER_CREDENTIALS = ROOT / ".local" / "teacher-credentials.json"
PRODUCTION_HOSTS = {"shopflow.rapidfox.io", "127.0.0.1:3080", "localhost:3080"}
N8N_URL = "https://n8n.rapidfox.io"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D401 - keep 3xx visible
        return None


OPENER = build_opener(NoRedirect)
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))


def call(method: str, url: str, body: dict | None = None, headers: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=data, method=method, headers={"User-Agent": "shopflow-smoke/1", **(headers or {})})
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        response = OPENER.open(request, timeout=15)
        return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()


def parse_cookies(headers) -> dict[str, dict]:
    cookies: dict[str, dict] = {}
    for raw in headers.get_all("Set-Cookie") or []:
        parts = [part.strip() for part in raw.split(";")]
        name, _, value = parts[0].partition("=")
        flags = {part.split("=", 1)[0].lower() for part in parts[1:]}
        cookies[name] = {"value": value, "flags": flags}
    return cookies


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else "https://shopflow.rapidfox.io").rstrip("/")
    host = urlparse(base).hostname or ""
    public = urlparse(base).scheme == "https"

    if public:
        try:
            addresses = sorted({info[4][0] for info in socket.getaddrinfo(host, 443)})
            check("DNS", bool(addresses), f"{len(addresses)} adresse(s)")
        except OSError as error:
            check("DNS", False, type(error).__name__)
            return report()

    status, headers, page = call("GET", f"{base}/")
    check("Page d'accueil", status == 200, f"HTTP {status}")
    # The PDF.js module worker must be served as JavaScript, or the browser refuses it (PDF preview empty).
    entry = re.search(rb'src="(/assets/index-[^"]+\.js)"', page or b"")
    chunk = re.search(rb"PdfPreview-[\w-]+\.js", call("GET", f"{base}{entry.group(1).decode()}")[2]) if entry else None
    worker = re.search(rb"pdf\.worker\.min-[\w-]+\.mjs", call("GET", f"{base}/assets/{chunk.group(0).decode()}")[2]) if chunk else None
    if worker:
        _, worker_headers, _ = call("GET", f"{base}/assets/{worker.group(0).decode()}")
        kind = worker_headers.get("Content-Type") or ""
        check("Worker PDF servi en JavaScript", "javascript" in kind, kind or "absent")
    else:
        check("Worker PDF trouvé dans le build", False, "PdfPreview ou pdf.worker introuvable")
    check("Pas de redirection Cloudflare Access", "cloudflareaccess" not in (headers.get("Location") or ""), headers.get("Location") or "aucune")
    check("En-tête CSP", bool(headers.get("Content-Security-Policy")))
    media = next((part.split()[1:] for part in (headers.get("Content-Security-Policy") or "").split(";") if part.split()[:1] == ["media-src"]), [])
    check("CSP media-src : radios seulement", media == ["'self'", "https://stream.nightride.fm", "https://radio.plaza.one"], " ".join(media) or "absent")
    status, _, body = call("GET", f"{base}/health/ready")
    check("/health/ready", status == 200 and b'"ok"' in body, f"HTTP {status}")
    production = urlparse(base).netloc in PRODUCTION_HOSTS
    if production:
        status, _, _ = call("GET", f"{base}/api/v1/openapi.json")
        check("Schéma OpenAPI masqué", status == 404, f"HTTP {status}")

    origin = {"Origin": base}
    demo_file = DEMO_CREDENTIALS if production else TEST_STACK_CREDENTIALS
    demo = {item["username"]: item for item in json.loads(demo_file.read_text())} if demo_file.exists() else {}
    if production:
        if not TEACHER_CREDENTIALS.exists():
            check("Compte enseignant", False, "fichier .local absent")
            return report()
        teacher = json.loads(TEACHER_CREDENTIALS.read_text())
        username, password, role, other_api = teacher["email"], teacher["password"], "teacher", "/api/v1/student/dashboard"
        label = "Connexion enseignant propriétaire"
        if "demo.etudiant01" in demo:
            status, _, _ = call("POST", f"{base}/api/v1/auth/login", {"username": "demo.etudiant01", "password": demo["demo.etudiant01"]["password"]}, origin)
            check("Compte de démo désactivé (refusé)", status == 401, f"HTTP {status}")
    else:
        if "demo.etudiant01" not in demo:
            check("Comptes de démo", False, "demo.etudiant01 absent")
            return report()
        username, password, role, other_api = "demo.etudiant01", demo["demo.etudiant01"]["password"], "student", "/api/v1/teacher/courses"
        label = "Connexion étudiant de démo"

    status, headers, _ = call("POST", f"{base}/api/v1/auth/login", {"username": username, "password": password}, origin)
    check(label, status == 200, f"HTTP {status}")
    cookies = parse_cookies(headers)
    session = next((c for n, c in cookies.items() if n.endswith("academy_session")), None)
    csrf_name = next((n for n in cookies if n.endswith("academy_csrf")), None)
    if production:  # production mode: Secure cookies with the __Host- prefix
        check("Cookie de session Secure + HttpOnly", bool(session and {"secure", "httponly"} <= session["flags"]))
        check("Cookies préfixés __Host-", all(name.startswith("__Host-") for name in cookies) and bool(cookies))
    else:  # test stack, development mode over plain HTTP
        check("Cookie de session HttpOnly", bool(session and "httponly" in session["flags"]))
    if not session or not csrf_name:
        return report()
    jar = "; ".join(f"{name}={cookie['value']}" for name, cookie in cookies.items())
    auth_headers = {"Cookie": jar, **origin}

    status, _, body = call("GET", f"{base}/api/v1/auth/me", headers=auth_headers)
    check("/auth/me", status == 200 and json.loads(body).get("role") == role, f"HTTP {status}")
    status, _, _ = call("GET", f"{base}{other_api}", headers=auth_headers)
    check("Rôle refusé sur l'API de l'autre rôle", status == 403, f"HTTP {status}")
    status, _, _ = call("POST", f"{base}/api/v1/auth/logout", headers={**auth_headers, "Origin": "https://evil.example", "X-CSRF-Token": cookies[csrf_name]["value"]})
    check("Origine étrangère refusée", status == 403, f"HTTP {status}")
    status, _, _ = call("POST", f"{base}/api/v1/auth/logout", headers={**auth_headers, "X-CSRF-Token": cookies[csrf_name]["value"]})
    check("Déconnexion", status == 204, f"HTTP {status}")
    status, _, _ = call("GET", f"{base}/api/v1/auth/me", headers=auth_headers)
    check("Session révoquée après déconnexion", status == 401, f"HTTP {status}")

    if public:
        status, headers, _ = call("GET", N8N_URL)
        location = urlparse(headers.get("Location") or "").hostname or ""
        check("n8n inchangé (302 vers Cloudflare Access)", status == 302 and location.endswith("cloudflareaccess.com"), f"HTTP {status} -> {location}")
    return report()


def report() -> int:
    failed = 0
    for name, ok, detail in results:
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + detail + ')' if detail else ''}")
    print(f"{len(results) - failed}/{len(results)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
