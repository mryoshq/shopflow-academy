#!/usr/bin/env python3
"""Separate test stack for E2E, load and persistence tests (owner decision 4, 28 Oct 2026).

The production stack (Compose project ``shopflow-academy``, port 3080, real database)
is never touched. The test stack is another Compose project with its own throwaway
database volume, its own backup folder and port 3180, configured only by
``config/test-stack.env`` (the production ``.env`` is not read).

    python3 scripts/test_stack.py up       # build, start, create demo accounts + demo course
    python3 scripts/test_stack.py status
    python3 scripts/test_stack.py down     # stop and DELETE the test database (test project only)
    python3 scripts/test_stack.py reset    # down + up (fresh database)

Demo credentials of the test stack go to .local/test-stack-credentials.json (mode
0600, never printed); they are regenerated with each fresh test database.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "shopflow-academy-test"
PRODUCTION_PROJECT = "shopflow-academy"
BASE = "http://127.0.0.1:3180"
CREDENTIALS = ROOT / ".local" / "test-stack-credentials.json"
COMPOSE = ["docker", "compose", "-p", PROJECT, "-f", "compose.yaml", "--env-file", "config/test-stack.env"]
PRODUCTION_NETLOCS = {"shopflow.rapidfox.io", "127.0.0.1:3080", "localhost:3080"}
CONTAINER_CREDENTIALS = "/tmp/academy-demo-credentials.json"

assert PROJECT != PRODUCTION_PROJECT


def refuse_production(base: str) -> None:
    """Stop a test script before it sends a single request to production."""
    if urlparse(base).netloc in PRODUCTION_NETLOCS:
        raise SystemExit(f"{base} is the production stack: tests run on the test stack ({BASE}, scripts/test_stack.py)")


def compose(*args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run([*COMPOSE, *args], cwd=ROOT, check=check, capture_output=capture, text=True)


def up() -> None:
    compose("up", "-d", "--build", "--wait", capture=False)
    created = json.loads(compose("exec", "-T", "backend", "python", "-m", "app.seed_demo", "--output", CONTAINER_CREDENTIALS).stdout)
    if created["created"]:
        CREDENTIALS.parent.mkdir(mode=0o700, exist_ok=True)
        compose("cp", f"backend:{CONTAINER_CREDENTIALS}", str(CREDENTIALS))
        CREDENTIALS.chmod(0o600)
        compose("exec", "-T", "backend", "rm", "-f", CONTAINER_CREDENTIALS, check=False)
        print(f"{created['created']} comptes fictifs créés (identifiants dans .local/{CREDENTIALS.name})")
    elif not CREDENTIALS.exists():
        raise SystemExit("Comptes de test déjà créés mais identifiants absents : lancer `python3 scripts/test_stack.py reset`")
    course = json.loads(compose("exec", "-T", "backend", "python", "-m", "app.demo_course").stdout)
    print(f"Cours de démonstration prêt ({course['demo_students']} étudiants fictifs). Stack de test : {BASE}")


def down() -> None:
    compose("down", "-v", "--remove-orphans", capture=False)
    CREDENTIALS.unlink(missing_ok=True)
    print("Stack de test arrêtée, base de test supprimée. Production inchangée.")


def status() -> int:
    raw = compose("ps", "--format", "json", check=False).stdout
    services = [json.loads(line) for line in raw.splitlines() if line.strip()]
    for item in services:
        print(f"{item['Service']:10} {item['State']:10} {item.get('Health', '')}")
    if not services:
        print("Stack de test arrêtée (python3 scripts/test_stack.py up)")
    return 0


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    if action == "up":
        up()
    elif action == "down":
        down()
    elif action == "reset":
        down()
        up()
    elif action == "status":
        return status()
    else:
        raise SystemExit(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main())
