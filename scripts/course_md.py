#!/usr/bin/env python3
"""Compile or import the Markdown course from the Mac (format ``shopflow-course-md``).

The course folder stays on the Mac (it contains the answer keys): this script reads its
``.md`` files, sends them to the backend container on stdin (``docker compose exec -T
backend python -m app.course_md ...``) and writes the feedback report
``RETOURS-PLATEFORME.md`` next to the course (in the parent folder when the compiled
folder is named ``cours``, as in docs/COURSE-AUTHORING.md). Nothing is printed of the
answers; only the summary and the errors with file and line.

    python3 scripts/course_md.py compile "<dossier du cours>/cours"
    python3 scripts/course_md.py import  "<dossier du cours>/cours" < .local/teacher-email.txt
    python3 scripts/course_md.py import  "<dossier du cours>/cours" --publish < .local/teacher-email.txt

``import`` creates or updates the DRAFT of the course (never published, no block opened).
``--publish`` publishes a new version for the class: only on the owner's written approval.
Options: ``--test-stack`` (Compose project of the test stack), ``--local`` (run in this
Python, from ``backend/``, for development and CI), ``--skip-runs`` (do not execute).

Preconfigured executions (ADR-0017) are checked HERE, on the Mac, never in FastAPI:
* every SQL ``run`` and the ``expected_sql``/``starter_sql`` of challenges run in a
  disposable PostgreSQL 16 container without network, on the course ``datasets/*.sql``
  files loaded in name order (or the demonstration dataset), with the course search path
  (``lab_schemas`` then ``lab``, ADR-0032), read only, 3 s maximum;
* every Python ``run`` runs once in a disposable container (image ``runner/python``:
  no network, read-only file system except /tmp, non-root user, no capabilities,
  256 Mo, half a CPU, 64 processes, 20 s), with ``datasets/python/`` mounted read-only
  as the working directory. Its output is stored with the course.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
REPORT = "RETOURS-PLATEFORME.md"
PRODUCTION = ["docker", "compose"]
TEST_STACK = ["docker", "compose", "-p", "shopflow-academy-test", "-f", "compose.yaml", "--env-file", "config/test-stack.env"]
MAX_BUNDLE = 5_000_000
MAX_MEDIA = 50 * 1024 * 1024


def bundle(folder: Path) -> dict[str, str]:
    files = {path.name: path.read_text(encoding="utf-8") for path in sorted(folder.glob("*.md"))}
    if not files:
        raise SystemExit(f"Aucun fichier .md dans {folder}")
    if sum(len(text.encode("utf-8")) for text in files.values()) > MAX_BUNDLE:
        raise SystemExit("Dossier trop volumineux (5 Mo de Markdown au plus)")
    return files


def datasets_bundle(folder: Path) -> dict[str, str]:
    """``datasets/*.sql`` of the course, loaded in name order at import (ADR-0032)."""
    return {f"datasets/{path.name}": path.read_text(encoding="utf-8") for path in sorted((folder / "datasets").glob("*.sql"))}


def media_bundle(folder: Path) -> dict[str, str]:
    """Videos, captions, pictures of ``media/`` and files of ``downloads/`` (checked again by the compiler)."""
    import base64

    media = {}
    for path in sorted((folder / "downloads").glob("*")):
        if path.is_file() and path.suffix.lower() in {".pdf", ".docx", ".zip", ".csv", ".sql", ".py", ".md"}:
            if path.stat().st_size > 20 * 1024 * 1024:
                raise SystemExit(f"{path.name} : plus de 20 Mo")
            media[f"downloads/{path.name}"] = base64.b64encode(path.read_bytes()).decode("ascii")
    for path in sorted((folder / "media").glob("*")):
        if path.is_file() and path.suffix.lower() in {".mp4", ".vtt", ".png", ".jpg", ".jpeg", ".webp", ".svg"}:
            if path.stat().st_size > MAX_MEDIA:
                raise SystemExit(f"{path.name} : plus de 50 Mo")
            media[f"media/{path.name}"] = base64.b64encode(path.read_bytes()).decode("ascii")
    return media


def run_backend(command: list[str], payload: dict, args: argparse.Namespace) -> tuple[int, dict]:
    if args.local:
        call = [sys.executable, "-m", "app.course_md", *command]
        cwd = ROOT / "backend"
    else:
        call = [*(TEST_STACK if args.test_stack else PRODUCTION), "exec", "-T", "backend", "python", "-m", "app.course_md", *command]
        cwd = ROOT
    result = subprocess.run(call, input=json.dumps(payload, ensure_ascii=False), capture_output=True, text=True, cwd=cwd, check=False)
    try:
        return result.returncode, json.loads(result.stdout)
    except json.JSONDecodeError:
        sys.stderr.write(result.stderr[-2000:])
        raise SystemExit("Le backend n'a pas répondu (stack lancée ? `docker compose ps`)")


RUNNER_IMAGE = "shopflow-python-runner:1"
LAB_IMAGE = "postgres:16-alpine"
PYTHON_TIMEOUT = 20
MAX_OUTPUT = 20_000


def docker(*args: str, input_text: str | None = None, timeout: int = 60, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], input=input_text, capture_output=True, text=True, timeout=timeout, check=check)


def last_error(stderr: str) -> str:
    """The useful line of an error: psql "ERROR:" line, else the last line (Python traceback)."""
    lines = [line for line in stderr.strip().splitlines() if line.strip()]
    errors = [line for line in lines if "ERROR:" in line]
    message = errors[0].split("ERROR:", 1)[1] if errors else (lines[-1] if lines else "erreur inconnue")
    return message.strip()[:300]


def check_sql(folder: Path, entries: list[dict], results: dict, schemas: list[str] | None = None) -> None:
    files = datasets_bundle(folder) or {"lab_demo.sql": (ROOT / "backend" / "app" / "lab_demo.sql").read_text(encoding="utf-8")}
    search_path = ", ".join([*(schemas or []), "lab"])
    name = f"shopflow-labcheck-{os.getpid()}"
    docker("run", "-d", "--rm", "--name", name, "--network", "none", "-e", "POSTGRES_PASSWORD=check-only", LAB_IMAGE, check=True)
    try:
        # The image starts a temporary server for initdb, then restarts: wait for the final one.
        for _ in range(90):
            logs = docker("logs", name)
            if "PostgreSQL init process complete" in logs.stdout + logs.stderr and \
                    docker("exec", name, "psql", "-U", "postgres", "-X", "-q", "-c", "SELECT 1").returncode == 0:
                break
            time.sleep(1)
        failed = ""
        docker("exec", name, "psql", "-U", "postgres", "-X", "-q", "-c", "CREATE SCHEMA lab", check=True)
        for file_name, text in files.items():
            loaded = docker("exec", "-i", name, "psql", "-U", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1",
                            input_text="SET search_path = lab;\n" + text, timeout=120)
            if loaded.returncode != 0:
                failed = f"jeu de données {file_name} invalide : {last_error(loaded.stderr)}"
                break
        for entry in entries:
            if failed:
                outcome = {"ok": False, "error": failed}
            else:
                script = (f"BEGIN READ ONLY;\nSET LOCAL statement_timeout = 3000;\nSET LOCAL search_path = {search_path};\n"
                          + entry["sql"].rstrip().rstrip(";") + "\n;\nROLLBACK;\n")
                run = docker("exec", "-i", name, "psql", "-U", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-o", "/dev/null", input_text=script)
                outcome = {"ok": run.returncode == 0} if run.returncode == 0 else {"ok": False, "error": last_error(run.stderr)}
            results.setdefault(entry["slug"], {})[entry["id"]] = outcome
    finally:
        docker("rm", "-f", name)


def run_python(folder: Path, entries: list[dict], results: dict) -> None:
    if docker("image", "inspect", RUNNER_IMAGE).returncode != 0:
        print("Construction de l'image d'exécution Python (une seule fois)…")
        subprocess.run(["docker", "build", "-q", "-t", RUNNER_IMAGE, str(ROOT / "runner" / "python")], check=True)
    data = (folder / "datasets" / "python").resolve()
    if not data.is_dir():
        data = Path(os.environ.get("TMPDIR", "/tmp")) / "shopflow-empty-data"
        data.mkdir(exist_ok=True)
    for index, entry in enumerate(entries):
        name = f"shopflow-pyrun-{os.getpid()}-{index}"
        command = ["run", "--rm", "-i", "--name", name, "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,size=16m",
                   "--user", "10001:10001", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                   "--memory", "256m", "--cpus", "0.5", "--pids-limit", "64", "-v", f"{data}:/data:ro", "-w", "/data",
                   RUNNER_IMAGE, "python", "-I", "-"]
        try:
            run = docker(*command, input_text=entry["python"], timeout=PYTHON_TIMEOUT)
            if run.returncode == 0:
                output = run.stdout if len(run.stdout) <= MAX_OUTPUT else run.stdout[:MAX_OUTPUT] + "\n… (sortie tronquée)"
                outcome = {"ok": True, "output": output}
            else:
                outcome = {"ok": False, "error": last_error(run.stderr) or f"code de sortie {run.returncode}"}
        except subprocess.TimeoutExpired:
            docker("kill", name)
            outcome = {"ok": False, "error": f"délai dépassé ({PYTHON_TIMEOUT} s)"}
        results.setdefault(entry["slug"], {})[entry["id"]] = outcome


def execute_runs(folder: Path, payload: dict, args: argparse.Namespace) -> dict | None:
    if args.skip_runs:
        return None
    _, plan = run_backend(["list-runs"], payload, args)
    results: dict = {}
    if plan.get("sql"):
        print(f"Vérification de {len(plan['sql'])} requête(s) SQL sur une base de laboratoire jetable…")
        check_sql(folder, plan["sql"], results, plan.get("lab_schemas") or [])
    if plan.get("python"):
        print(f"Exécution de {len(plan['python'])} extrait(s) Python dans des conteneurs jetables…")
        run_python(folder, plan["python"], results)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=["compile", "import"])
    parser.add_argument("folder", type=Path)
    parser.add_argument("--publish", action="store_true", help="publier une nouvelle version pour la classe (accord écrit requis)")
    parser.add_argument("--test-stack", action="store_true", help="viser la stack de test (port 3180)")
    parser.add_argument("--local", action="store_true", help="exécuter dans ce Python (développement, CI)")
    parser.add_argument("--skip-runs", action="store_true", help="ne pas exécuter les requêtes SQL et extraits Python")
    args = parser.parse_args()
    folder = args.folder.expanduser().resolve()
    if not folder.is_dir():
        raise SystemExit(f"Dossier introuvable : {folder}")
    if args.publish and args.action != "import":
        raise SystemExit("--publish ne s'utilise qu'avec import")
    payload: dict = {"files": bundle(folder), "media": media_bundle(folder)}
    datasets = datasets_bundle(folder)
    if datasets:
        payload["dataset"] = datasets
    payload["runs"] = execute_runs(folder, payload, args)
    command = ["compile-bundle"]
    if args.action == "import":
        if sys.stdin.isatty():
            raise SystemExit("L'identité de l'enseignant se lit sur l'entrée standard : ... < .local/teacher-email.txt")
        payload["owner"] = sys.stdin.readline().strip()
        command = ["import-bundle", *(["--publish"] if args.publish else [])]
    code, output = run_backend(command, payload, args)
    target = (folder.parent if folder.name == "cours" else folder) / REPORT
    target.write_text(output.get("report", ""), encoding="utf-8")
    summary = output.get("summary", {})
    for module in summary.get("modules", []):
        print(f"{module['title']} : {len(module['blocks'])} blocs, {module['missions']} missions, {module['lessons']} leçons, "
              f"{module['bonus']} bonus, {module['points']} pts (+{module['bonus_points']} bonus), {module['duration']} min")
    for issue in output.get("issues", []):
        print(f"{issue['level'].upper()} {issue['file']}:{issue['line']} — {issue['message']}")
    if "import" in output:
        done = output["import"]
        print(f"Brouillon {'créé' if done['created'] else 'mis à jour'} ({done['missions']} missions et leçons).")
        if done.get("published"):
            print(f"Version {done['published']['version']} publiée{' pour la classe, nouveaux blocs fermés' if done['assigned_to_class'] else ''}.")
    if "import_error" in output:
        print(f"Import refusé : {output['import_error']}")
    print(f"Rapport : {target}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
