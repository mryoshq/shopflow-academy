#!/usr/bin/env python3
"""Scores, attempts and hints survive a restart and a container re-creation (P0-09).

Runs on the test stack only (Compose project ``shopflow-academy-test``, port 3180);
the production project is never restarted. Reads the state of demo students through
the API, then
  1. ``restart postgres backend``
  2. ``up -d --force-recreate postgres backend`` (volume kept, never ``-v``)
and checks that every value is identical. Credentials of the test stack are read from
.local and never printed.

    python3 scripts/persistence_check.py [--base http://127.0.0.1:3180]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load_test import Session  # noqa: E402
from test_stack import BASE, COMPOSE, CREDENTIALS, refuse_production  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
STUDENTS = ["demo.etudiant03", "demo.etudiant05", "demo.etudiant06"]


def snapshot(base: str, accounts: dict) -> dict:
    state = {}
    for name in STUDENTS:
        s = Session(base)
        s.request("login", "POST", "/api/v1/auth/login", {"username": name, "password": accounts[name]["password"]})
        _, dashboard = s.request("dashboard", "GET", "/api/v1/student/dashboard")
        missions = {}
        for course in dashboard["courses"]:
            for mission in course["missions"]:
                _, history = s.request("historique", "GET", f"/api/v1/student/missions/{mission['mission_version_id']}/attempts",
                                       expect=(200, 404))
                missions[mission["mission_version_id"]] = (mission["status"], mission["best_points"], len(history or []))
        state[name] = {"scores": [c["score"] for c in dashboard["courses"]], "missions": missions}
    return state


def wait_ready(base: str, timeout: float = 120) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(base + "/health/ready", timeout=3) as response:
                if response.status == 200:
                    return
        except (URLError, OSError):
            pass
        time.sleep(2)
    raise SystemExit("stack not ready after restart")


def compose(*args: str) -> None:
    subprocess.run([*COMPOSE, *args], cwd=ROOT, check=True, capture_output=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=BASE)
    parser.add_argument("--credentials", default=str(CREDENTIALS))
    args = parser.parse_args()
    refuse_production(args.base)
    accounts = {item["username"]: item for item in json.loads(Path(args.credentials).read_text())}
    before = snapshot(args.base, accounts)
    attempts = sum(m[2] for s in before.values() for m in s["missions"].values())
    print(f"État initial : {len(before)} étudiants, {attempts} tentatives visibles")
    ok = True
    for label, command in (("redémarrage", ("restart", "postgres", "backend")),
                           ("recréation des conteneurs", ("up", "-d", "--force-recreate", "--wait", "postgres", "backend"))):
        compose(*command)
        wait_ready(args.base)
        after = snapshot(args.base, accounts)
        same = after == before
        ok = ok and same
        print(f"Après {label} : {'identique PASS' if same else 'DIFFÉRENT FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
