#!/usr/bin/env python3
"""Tested restore of the latest backup into a throwaway PostgreSQL container (P0-10).

1. ``docker compose exec backup sh /ops/backup.sh once`` (fresh, verified dump);
2. start ``postgres:16-alpine`` with no network and a random password;
3. stream the dump into ``pg_restore`` (no copy of real data on the Mac's disk);
4. compare the row count of every table with the live database;
5. always remove the throwaway container.

The live database and the n8n stack are only read, never modified. Prints table
names and counts only, never data.

    python3 scripts/restore_check.py [--latest]   # --latest: skip step 1
"""

from __future__ import annotations

import argparse
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = f"shopflow-restore-check-{secrets.token_hex(3)}"
COUNT_SQL = ("SELECT string_agg(format('%s=%s', table_name, "
             "(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text), ',' ORDER BY table_name) "
             "FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")


def run(*args: str, **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(list(args), cwd=ROOT, check=True, capture_output=True, text=kwargs.pop("text", True), **kwargs)


def counts(output: str) -> dict[str, int]:
    return {name: int(value) for name, value in (item.split("=") for item in output.strip().split(",") if item)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--latest", action="store_true", help="use the latest existing automatic backup")
    args = parser.parse_args()
    if not args.latest:
        print(run("docker", "compose", "exec", "-T", "backup", "sh", "/ops/backup.sh", "once").stdout.strip())
    latest = run("docker", "compose", "exec", "-T", "backup", "sh", "-c", "ls -1t /backups/academy-*-auto.dump | head -1").stdout.strip()
    if not latest:
        print("Aucune sauvegarde automatique trouvée")
        return 1
    print(f"Sauvegarde testée : {Path(latest).name}")
    password = secrets.token_urlsafe(24)
    run("docker", "run", "-d", "--rm", "--name", CONTAINER, "--network", "none", "-e", f"POSTGRES_PASSWORD={password}",
        "-e", "POSTGRES_DB=restore_check", "postgres:16-alpine")
    try:
        for _ in range(60):
            if subprocess.run(["docker", "exec", CONTAINER, "pg_isready", "-U", "postgres", "-d", "restore_check"],
                              capture_output=True).returncode == 0:
                break
            time.sleep(1)
        time.sleep(2)
        dump = subprocess.Popen(["docker", "compose", "exec", "-T", "backup", "cat", latest], cwd=ROOT, stdout=subprocess.PIPE)
        restore = subprocess.run(["docker", "exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", "restore_check",
                                  "--no-owner", "--no-privileges", "--exit-on-error"], stdin=dump.stdout, capture_output=True, text=True)
        dump.wait()
        if restore.returncode != 0:
            print("pg_restore FAIL :", restore.stderr.strip()[:500])
            return 1
        restored = counts(run("docker", "exec", CONTAINER, "psql", "-U", "postgres", "-d", "restore_check", "-tAc", COUNT_SQL).stdout)
        live = counts(run("docker", "compose", "exec", "-T", "postgres", "sh", "-c",
                          f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "{COUNT_SQL}"').stdout)
    finally:
        subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)
    print(f"{'table':24} {'en service':>10} {'restaurée':>10}")
    differences = []
    for name in sorted(set(live) | set(restored)):
        mark = "" if live.get(name) == restored.get(name) else "  ≠"
        if mark:
            differences.append(name)
        print(f"{name:24} {live.get(name, '-'):>10} {restored.get(name, '-'):>10}{mark}")
    if differences:
        print(f"Écarts (activité entre la sauvegarde et la vérification ?) : {', '.join(differences)}")
    print("Restauration : " + ("PASS" if not differences and restored.get("alembic_version") == 1 else "FAIL"))
    return 0 if not differences else 1


if __name__ == "__main__":
    sys.exit(main())
