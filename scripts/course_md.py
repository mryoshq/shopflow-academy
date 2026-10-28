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
Python, from ``backend/``, for development and CI).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REPORT = "RETOURS-PLATEFORME.md"
PRODUCTION = ["docker", "compose"]
TEST_STACK = ["docker", "compose", "-p", "shopflow-academy-test", "-f", "compose.yaml", "--env-file", "config/test-stack.env"]
MAX_BUNDLE = 5_000_000


def bundle(folder: Path) -> dict[str, str]:
    files = {path.name: path.read_text(encoding="utf-8") for path in sorted(folder.glob("*.md"))}
    if not files:
        raise SystemExit(f"Aucun fichier .md dans {folder}")
    if sum(len(text.encode("utf-8")) for text in files.values()) > MAX_BUNDLE:
        raise SystemExit("Dossier trop volumineux (5 Mo de Markdown au plus)")
    return files


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=["compile", "import"])
    parser.add_argument("folder", type=Path)
    parser.add_argument("--publish", action="store_true", help="publier une nouvelle version pour la classe (accord écrit requis)")
    parser.add_argument("--test-stack", action="store_true", help="viser la stack de test (port 3180)")
    parser.add_argument("--local", action="store_true", help="exécuter dans ce Python (développement, CI)")
    args = parser.parse_args()
    folder = args.folder.expanduser().resolve()
    if not folder.is_dir():
        raise SystemExit(f"Dossier introuvable : {folder}")
    if args.publish and args.action != "import":
        raise SystemExit("--publish ne s'utilise qu'avec import")
    payload: dict = {"files": bundle(folder)}
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
