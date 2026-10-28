#!/usr/bin/env python3
"""One-screen operational status before a class (P0-10). Read-only.

Checks: containers of the shopflow-academy project, readiness, age of the last
automatic backup, free disk space, Mac sleep settings, the public URL (if its DNS
exists) and that n8n.rapidfox.io still answers as before (302 to Cloudflare Access).
Never prints secrets.

    python3 scripts/ops_status.py
"""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
LOCAL = "http://127.0.0.1:3080"
PUBLIC = "https://shopflow.rapidfox.io"
N8N = "https://n8n.rapidfox.io"
BACKUP_MAX_AGE_HOURS = 7


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def http(url: str) -> tuple[int | None, str]:
    try:
        response = build_opener(NoRedirect).open(Request(url, headers={"User-Agent": "shopflow-ops/1"}), timeout=8)
        return response.status, response.headers.get("Location") or ""
    except HTTPError as error:
        return error.code, error.headers.get("Location") or ""
    except (URLError, OSError) as error:
        return None, type(error).__name__


def line(ok: bool | None, label: str, detail: str) -> bool:
    mark = {True: "OK  ", False: "FAIL", None: "INFO"}[ok]
    print(f"{mark}  {label:34} {detail}")
    return ok is not False


def main() -> int:
    good = True
    try:
        raw = subprocess.run(["docker", "compose", "ps", "--format", "json"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        services = [json.loads(item) for item in raw.splitlines() if item.strip()]
        expected = {"postgres", "backend", "frontend", "gateway", "backup", "labdb"}
        running = {s["Service"]: s for s in services if s.get("State") == "running"}
        missing = sorted(expected - set(running))
        unhealthy = sorted(name for name, s in running.items() if s.get("Health") not in ("", "healthy"))
        good &= line(not missing and not unhealthy, "Conteneurs ShopFlow", "tous en marche" if not missing and not unhealthy
                     else f"manquants: {missing} non sains: {unhealthy}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        good &= line(False, "Conteneurs ShopFlow", "docker compose indisponible (Docker Desktop lancé ?)")
    status, _ = http(LOCAL + "/health/ready")
    good &= line(status == 200, "Santé locale /health/ready", f"HTTP {status}")
    try:
        last = json.loads(subprocess.run(["docker", "compose", "exec", "-T", "backup", "cat", "/backups/last-backup.json"],
                                         cwd=ROOT, capture_output=True, text=True, check=True).stdout)
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last["at"].replace("Z", "+00:00"))).total_seconds() / 3600
        good &= line(age <= BACKUP_MAX_AGE_HOURS, "Dernière sauvegarde automatique", f"il y a {age:.1f} h ({last['bytes']} octets)")
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError, ValueError):
        good &= line(False, "Dernière sauvegarde automatique", "introuvable")
    free_gb = shutil.disk_usage(Path.home()).free / 1e9
    good &= line(free_gb >= 5, "Espace disque libre", f"{free_gb:.0f} Go")
    try:
        pm = subprocess.run(["pmset", "-g"], capture_output=True, text=True).stdout
        sleep = next((l.split()[1] for l in pm.splitlines() if l.split()[:1] == ["sleep"]), "?")
        line(None, "Veille système (pmset)", f"sleep = {sleep} min (0 = jamais ; sinon lancer caffeinate pendant le cours)")
    except FileNotFoundError:
        pass
    host = urlparse(PUBLIC).hostname
    try:
        socket.getaddrinfo(host, 443)
        status, location = http(PUBLIC + "/health/ready")
        good &= line(status == 200, "URL publique", f"{PUBLIC} → HTTP {status}{' → ' + urlparse(location).hostname if location else ''}")
    except OSError:
        line(None, "URL publique", f"{host} n'a pas encore de DNS (route Cloudflare à créer, voir DEPLOY-RAPIDFOX.md)")
    status, location = http(N8N)
    good &= line(status == 302 and (urlparse(location).hostname or "").endswith("cloudflareaccess.com"),
                 "n8n inchangé (référence)", f"HTTP {status} → {urlparse(location).hostname}")
    print("Prêt pour le cours." if good else "À corriger avant le cours (voir docs/RUNBOOK.md).")
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
