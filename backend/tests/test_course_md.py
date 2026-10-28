"""Sprint 2, part D: the Markdown course compiler and importer (shopflow-course-md v1)."""

import json
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.course_md import ImportRefused, compile_dir, compile_files, document, import_compiled, report_markdown, summary
from app.models import Course, MissionVersion, User
from test_student import env, post  # noqa: F401  (fixture reuse)

EXAMPLE = Path(__file__).resolve().parents[2] / "docs" / "examples" / "demo-course"
SECRET_KEYS = {"correct_ids", "correct_pairs", "feedback", "explanation", "expected_sql", "max_points", "scoring", "action_id", "correct"}
HEADER = """---
format: shopflow-course-md
version: 1
slug: cours-test
title: Cours de test
objectives:
  - code: OBJ-A
    statement: Objectif A.
---
"""


def mission(slug: str, extra: str = "", *, objectives: str = "[OBJ-A]", kind: str = "single_choice") -> str:
    return f"""### Mission : Mission {slug}

```yaml
slug: {slug}
kind: {kind}
objectives: {objectives}
points: 5
duration: 15
scenario: Une situation fictive à Tanzar.
instructions: Que faites-vous ?
choices:
  - id: a
    label: Réponse A
    correct: true
  - id: b
    label: Réponse B
{extra}```
"""


def module(*missions: str, block: str = "Bloc 1") -> str:
    return f"# Module : Module test\nIntroduction du module.\n\n## Bloc : {block}\n\n" + "\n".join(missions)


def errors_of(files: dict[str, str]) -> list[tuple[str, int, str]]:
    return [(issue.file, issue.line, issue.message) for issue in compile_files(files).errors]


def walk(value, path=""):
    if isinstance(value, dict):
        for key, child in value.items():
            yield f"{path}.{key}"
            yield from walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}[{index}]")


def test_demonstration_course_compiles_without_error():
    compiled = compile_dir(EXAMPLE)
    assert [issue.text() for issue in compiled.errors] == []
    data = summary(compiled)
    assert data["course"]["slug"] == "demo-cours-markdown"
    [demo] = data["modules"]
    assert [b["title"] for b in demo["blocks"]] == ["Le grain des tables", "Qualité et ingestion"]
    assert (demo["missions"], demo["lessons"], demo["bonus"], demo["points"], demo["bonus_points"]) == (7, 4, 1, 25, 5)
    assert [b["duration"] for b in demo["blocks"]] == [17, 18]
    kinds = {item.definition["kind"] for item in compiled.items()}
    assert kinds == {"lesson", "single_choice", "true_false", "matching", "data_interpretation", "multiple_choice",
                     "reorder", "scenario_choice", "sql_challenge"}
    data_kinds = {item.definition["display_data"]["kind"] for item in compiled.items() if item.definition["display_data"]}
    assert data_kinds == {"code", "table", "line_chart", "comparison", "animation", "mindmap", "flow", "video"}
    assert compiled.modules[0].description.startswith("Une journée courte")
    report = report_markdown(compiled)
    assert "État : OK, 0 erreur" in report and "| Le grain des tables | 3 | 2 | 0 | 10 | 0 | 17 |" in report
    # true/false ids stay text even though YAML reads them as booleans.
    tf = next(item for item in compiled.items() if item.slug == "demo-vrai-faux-grain")
    assert [c["id"] for c in tf.definition["choices"]] == ["true", "false"] and tf.definition["correct_ids"] == ["false"]


@pytest.mark.parametrize(("files", "expected"), [
    ({"10-m.md": module(mission("m1", "data:\n  kind: radar\n"))}, ("10-m.md", 22, "`data.kind` inconnu")),
    ({"10-m.md": module(mission("m1", objectives="[OBJ-Z]"))}, ("10-m.md", 11, "objectif non déclaré")),
    ({"10-m.md": module(mission("m1", "prerequisites: [m2]\n"), mission("m2"))}, ("10-m.md", 22, "mission **précédente**")),
    ({"10-m.md": module(mission("m1"), mission("m1"))}, ("10-m.md", 27, "slug déjà utilisé")),
    ({"10-m.md": module(mission("m1").replace("Réponse B", "<b>Réponse</b> B"))}, ("10-m.md", 21, "texte brut")),
    ({"10-m.md": module(mission("m1", "resources: [http://exemple.ma]\n"))}, ("10-m.md", 22, "lien non HTTPS")),
    ({"10-m.md": module(mission("m1").replace("points: 5\n", ""))}, ("10-m.md", 9, "champ obligatoire manquant : `points`")),
    ({"10-m.md": module(mission("m1", kind="guided_simulation"))}, ("10-m.md", 10, "réservé")),
    ({"10-m.md": module(mission("m1", kind="dessin"))}, ("10-m.md", 10, "`kind` inconnu")),
    ({"10-m.md": module(mission("m1", "couleur: rouge\n"))}, ("10-m.md", 22, "champ inconnu : `couleur`")),
    ({"10-m.md": module(mission("m1").replace("instructions: Que faites-vous ?", "instructions: Note : piège"))}, ("10-m.md", 15, "YAML invalide")),
    ({"10-m.md": module(mission("m1").replace("    correct: true\n", ""))}, ("10-m.md", 16, "exactement une bonne réponse")),
    ({"10-m.md": module(mission("m1", "hints:\n  - " + "x" * 10 + "\n").replace("Une situation fictive à Tanzar.", "x" * 5001))}, ("10-m.md", 14, "trop long")),
    ({"10-m.md": "# Module : M\n\n### Mission : Sans bloc\n\n```yaml\nslug: a\n```\n"}, ("10-m.md", 3, "avant tout `## Bloc :`")),
    ({"10-m.md": module("### Mission : Sans yaml\n\nTexte.\n")}, ("10-m.md", 6, "bloc ```yaml manquant")),
])
def test_invalid_sources_are_refused_at_the_right_line(files, expected):
    found = errors_of({"00-cours.md": HEADER, **files})
    assert any(f == expected[0] and line == expected[1] and expected[2] in message for f, line, message in found), found


def test_header_errors_and_uncovered_objective():
    header = HEADER.replace("format: shopflow-course-md", "format: autre").replace(
        "    statement: Objectif A.\n", "    statement: Objectif A.\n  - code: OBJ-B\n    statement: Jamais couvert.\n")
    found = errors_of({"00-cours.md": header, "10-m.md": module(mission("m1"))})
    assert ("00-cours.md", 2, "`format: shopflow-course-md` est obligatoire") in found
    assert any(f == "00-cours.md" and line == 9 and "couvert par aucune mission" in m for f, line, m in found)
    assert errors_of({"10-m.md": module(mission("m1"))})[0][:2] == ("00-cours.md", 1)


def test_reserved_files_are_ignored_and_order_follows_names():
    files = {"00-cours.md": HEADER, "20-b.md": module(mission("m2"), block="B"), "10-a.md": module(mission("m1"), block="A"),
             "RETOURS-PLATEFORME.md": "# Module : jamais lu\n", "QUESTIONS.md": "## Bloc : non"}
    compiled = compile_files(files)
    assert compiled.errors == [] and compiled.files == ["00-cours.md", "10-a.md", "20-b.md"]
    assert [item.slug for item in compiled.items()] == ["m1", "m2"]


def test_student_projection_of_every_kind_has_no_answer_key(env):
    clients, engine = env
    compiled = compile_dir(EXAMPLE)
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        result = import_compiled(db, owner, compiled, publish=True)
    release = result["published"]["release_id"]
    teacher = clients["teacher"]
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Classe markdown"}).json()["id"]
    with Session(engine) as db:
        student = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student})
    assignment = post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release}).json()["id"]
    for _ in range(2):
        post(teacher, f"/api/v1/teacher/classes/{assignment}/blocks/open-next")
    a = clients["a"]
    snapshot = a.get(f"/api/v1/student/courses/{release}").json()
    missions = [m for mod in snapshot["modules"] for ch in mod["chapters"] for m in ch["missions"]]
    assert len(missions) == 12
    payloads = [snapshot] + [a.get(f"/api/v1/student/missions/{m['mission_version_id']}").json() for m in missions]
    dashboard = a.get("/api/v1/student/dashboard").json()
    for payload in payloads + [dashboard]:
        leaked = [path for path in walk(payload) if path.rsplit(".", 1)[-1] in SECRET_KEYS - {"explanation"}]
        assert leaked == [], leaked
    text = json.dumps(payloads, ensure_ascii=False)
    assert "ORDER BY ca DESC" not in text  # expected_sql of the SQL challenge
    assert "Exactement, le grain" not in text and "Le total semble juste" not in text  # feedback
    for view in payloads[1:]:
        assert view["explanation"] is None  # nothing revealed before an answer
    by_slug = {m["slug"]: a.get(f"/api/v1/student/missions/{m['mission_version_id']}").json() for m in missions}
    lesson = by_slug["demo-lecon-grain"]["definition"]
    assert lesson["kind"] == "lesson" and lesson["body"].startswith("Le grain d'une table") and lesson["choices"] == []
    assert by_slug["demo-frais-livraison"]["definition"]["run"][0] == {
        "id": "requete-actuelle", "label": "Exécuter la requête actuelle", "language": "sql",
        "code": "SELECT SUM(o.shipping_fee) AS total\nFROM orders o JOIN order_items i ON i.order_id = o.order_id\nWHERE o.order_id IN ('C-101', 'C-102');"}
    challenge = by_slug["demo-defi-sql"]["definition"]
    assert challenge["starter_sql"].startswith("SELECT c.city") and "expected_sql" not in challenge
    assert by_slug["demo-courbe-rejets"]["definition"]["display_data"]["series"][0]["values"][3] is None

    # "J'ai compris": completed, 0 point, idempotent, counted in progress but not in the grade.
    lesson_id = by_slug["demo-lecon-grain"]["mission_version_id"]
    first = post(a, f"/api/v1/student/missions/{lesson_id}/understood")
    again = post(a, f"/api/v1/student/missions/{lesson_id}/understood")
    assert first.status_code == 201 and first.json()["correct"] is True and first.json()["points"] == 0
    assert again.status_code == 200 and again.json()["attempt_id"] == first.json()["attempt_id"]
    course = next(c for c in a.get("/api/v1/student/dashboard").json()["courses"] if c["release_id"] == release)
    assert course["score"]["completed"] == 1 and course["score"]["core_points"] == 0 and course["score"]["core_possible"] == 25
    assert post(a, f"/api/v1/student/missions/{by_slug['demo-frais-livraison']['mission_version_id']}/understood").status_code == 422


def test_markdown_import_export_roundtrip(env):
    clients, engine = env
    compiled = compile_dir(EXAMPLE)
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        result = import_compiled(db, owner, compiled)
        assert result["created"] is True and result["published"] is None and result["missions"] == 12
        assert db.get(Course, result["course_id"]).status == "draft"
    exported = clients["teacher"].get(f"/api/v1/teacher/courses/{result['course_id']}/export").json()
    source = document(compiled)
    assert exported["course"] == source["course"] and exported["objectives"] == source["objectives"]
    for got, want in zip(exported["modules"], source["modules"], strict=True):
        assert (got["title"], got["description"]) == (want["title"], want["description"])
        for got_ch, want_ch in zip(got["chapters"], want["chapters"], strict=True):
            assert got_ch["title"] == want_ch["title"]
            for got_m, want_m in zip(got_ch["missions"], want_ch["missions"], strict=True):
                assert (got_m["slug"], got_m["title"], got_m["objective_codes"], got_m["prerequisite_slugs"]) == \
                    (want_m["slug"], want_m["title"], want_m["objective_codes"], want_m["prerequisite_slugs"])
                assert got_m["definition"] == want_m["definition"]
    # Re-importing the same source changes nothing (idempotent update of the same draft).
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        again = import_compiled(db, owner, compiled)
    assert again["created"] is False and again["course_id"] == result["course_id"]
    assert clients["teacher"].get(f"/api/v1/teacher/courses/{result['course_id']}/export").json()["modules"] == exported["modules"]


def test_publish_keeps_progress_when_a_block_is_added_after_students_played(env, monkeypatch):
    clients, engine = env
    monkeypatch.setattr(get_settings(), "main_course_slug", "cours-test")
    monkeypatch.setattr(get_settings(), "class_label", "Classe principale")
    teacher, a = clients["teacher"], clients["a"]
    v1 = {"00-cours.md": HEADER, "10-m.md": module(mission("m1"))}
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        first = import_compiled(db, owner, compile_files(v1), publish=True)
    assert first["assigned_to_class"] is True and first["published"]["version"] == 1
    main = teacher.get("/api/v1/teacher/main").json()
    assert main["assignment_id"] and main["cohort"]["student_count"] == 3
    course = next(c for c in a.get("/api/v1/student/dashboard").json()["courses"] if c["title"] == "Cours de test")
    assert course["missions"] == []  # imported blocks arrive closed
    post(teacher, f"/api/v1/teacher/classes/{main['assignment_id']}/blocks/open-next")
    played = a.get("/api/v1/student/dashboard").json()
    m1 = next(c for c in played["courses"] if c["title"] == "Cours de test")["missions"][0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{m1}").json()
    right = next(c["id"] for c in view["definition"]["choices"] if c["label"] == "Réponse A")
    assert post(a, f"/api/v1/student/missions/{m1}/attempts", {"idempotency_key": "md-progress-1", "answer": {"choice_ids": [right]}}).status_code == 201

    # The author adds a second block; republish.
    v2 = {"00-cours.md": HEADER, "10-m.md": module(mission("m1")) + "\n## Bloc : Bloc 2\n\n" + mission("m2")}
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        second = import_compiled(db, owner, compile_files(v2), publish=True)
    assert second["published"]["version"] == 2
    course = next(c for c in a.get("/api/v1/student/dashboard").json()["courses"] if c["title"] == "Cours de test")
    assert course["version"] == 2
    assert [b["open"] for b in course["modules"][0]["blocks"]] == [True, False]
    assert [m["mission_version_id"] for m in course["missions"]] == [m1]  # same version: progress kept
    assert course["missions"][0]["status"] == "completed" and course["score"]["core_points"] == 5
    assert course["score"]["core_possible"] == 10
    with Session(engine) as db:
        assert len(db.scalars(select(MissionVersion).where(MissionVersion.id == m1)).all()) == 1

    # A published mission cannot disappear from the source.
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        with pytest.raises(ImportRefused, match="déjà été publiée"):
            import_compiled(db, owner, compile_files({"00-cours.md": HEADER, "10-m.md": module(mission("m2"))}))
        db.rollback()
    # A changed mission gets a new version (its progress starts again), the unchanged one keeps its.
    v3 = {"00-cours.md": HEADER, "10-m.md": module(mission("m1")) + "\n## Bloc : Bloc 2\n\n" + mission("m2").replace("Réponse B", "Réponse B modifiée")}
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        import_compiled(db, owner, compile_files(v3), publish=True)
    course = next(c for c in a.get("/api/v1/student/dashboard").json()["courses"] if c["title"] == "Cours de test")
    assert course["version"] == 3 and course["missions"][0]["mission_version_id"] == m1


def test_import_refuses_a_course_with_errors_or_of_another_teacher(env):
    _, engine = env
    broken = compile_files({"00-cours.md": HEADER, "10-m.md": module(mission("m1", objectives="[OBJ-Z]"))})
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        with pytest.raises(ImportRefused):
            import_compiled(db, owner, broken)
        other = User(username="autre.prof", password_hash="x", role="teacher")
        db.add(other)
        db.commit()
        import_compiled(db, owner, compile_files({"00-cours.md": HEADER, "10-m.md": module(mission("m1"))}))
        with pytest.raises(ImportRefused, match="autre compte"):
            import_compiled(db, other, compile_files({"00-cours.md": HEADER, "10-m.md": module(mission("m1"))}))


def test_command_line_bundle_reports_errors_with_file_and_line():
    files = {"00-cours.md": HEADER, "10-m.md": module(mission("m1", objectives="[OBJ-Z]"))}
    run = subprocess.run([sys.executable, "-m", "app.course_md", "compile-bundle"], input=json.dumps({"files": files}),
                         capture_output=True, text=True, cwd=Path(__file__).resolve().parents[1], check=False)
    assert run.returncode == 1
    output = json.loads(run.stdout)
    assert any(i["file"] == "10-m.md" and i["line"] == 11 for i in output["issues"])
    assert "`10-m.md` ligne 11 : objectif non déclaré" in output["report"]
