"""Sprint 2, part G2 (ADR-0022): objective categories, and students never see objective codes."""

import json

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.course_md import compile_files, import_compiled
from app.curriculum import objective_category
from app.models import User
from test_course_md import HEADER, mission, module
from test_student import env, post  # noqa: F401  (fixture reuse)


CATEGORY_HEADER = HEADER.replace("""  - code: OBJ-A
    statement: Objectif A.
""", """  - code: OBJ-A
    category: Requêtes
    statement: Objectif A. Une seconde phrase, jamais montrée.
  - code: SQL-JOIN
    statement: Joindre deux tables.
  - code: BLOC-UN
    statement: Comprendre le premier bloc de bout en bout. Détail réservé à l'enseignant.
""")


@pytest.mark.parametrize(("code", "category", "expected"), [
    ("SQL-JOIN", "", "SQL"), ("PY-CSV", "", "Python"), ("BLOC-1", "", "Objectifs de bloc"), ("OBJ-A", "", "Autres objectifs"),
    ("SQL-JOIN", " Requêtes ", "Requêtes"), ("sql-x", "", "SQL"),
])
def test_objective_category_is_explicit_or_deduced_from_the_prefix(code, category, expected):
    assert objective_category(code, category) == expected


def test_categories_round_trip_and_students_never_see_objective_codes(env, monkeypatch):
    clients, engine = env
    monkeypatch.setattr(get_settings(), "main_course_slug", "cours-test")
    monkeypatch.setattr(get_settings(), "class_label", "Classe principale")
    source = {"00-cours.md": CATEGORY_HEADER, "10-m.md": module(mission("m1", objectives="[OBJ-A, SQL-JOIN, BLOC-UN]"),
                                                                  block="Bloc 1") + "\n## Bloc : Bloc 2\n\n" + mission("m2", objectives="[OBJ-A]")}
    compiled = compile_files(source)
    assert compiled.errors == []
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        result = import_compiled(db, owner, compiled, publish=True)
    teacher, student = clients["teacher"], clients["a"]
    tree = teacher.get(f"/api/v1/teacher/courses/{result['course_id']}").json()
    assert [(o["code"], o["category"]) for o in tree["objectives"]] == [("OBJ-A", "Requêtes"), ("SQL-JOIN", ""), ("BLOC-UN", "")]
    exported = teacher.get(f"/api/v1/teacher/courses/{result['course_id']}/export").json()
    assert exported["objectives"][0]["category"] == "Requêtes" and "category" not in exported["objectives"][1]
    # Studio API: create and change a category; HTML is refused.
    created = post(teacher, f"/api/v1/teacher/courses/{result['course_id']}/objectives", {"code": "PY-CSV", "statement": "Lire un CSV.", "category": "Python"})
    assert created.status_code == 201 and created.json()["category"] == "Python"
    assert post(teacher, f"/api/v1/teacher/courses/{result['course_id']}/objectives", {"code": "PY-X", "statement": "x", "category": "<b>x</b>"}).status_code == 422

    main = teacher.get("/api/v1/teacher/main").json()
    post(teacher, f"/api/v1/teacher/classes/{main['assignment_id']}/blocks/open-next")
    dashboard = student.get("/api/v1/student/dashboard").json()
    course = next(c for c in dashboard["courses"] if c["title"] == "Cours de test")
    first, second = course["modules"][0]["blocks"]
    # The BLOC- objective comes first, in one sentence; a closed block says nothing.
    assert first["objective"] == "Comprendre le premier bloc de bout en bout." and second["objective"] == ""
    release = student.get(f"/api/v1/student/courses/{course['release_id']}").json()
    text = json.dumps([dashboard, release], ensure_ascii=False)
    for code in ("OBJ-A", "SQL-JOIN", "BLOC-UN"):
        assert code not in text
    assert "Détail réservé" not in json.dumps(dashboard, ensure_ascii=False)
