"""ADR-0033: « Le voyage d'une donnée » opened from a lesson, with exact values from the course."""

import json

import pytest
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.course_md import compile_files, import_compiled
from app.curriculum_schema import DisplayData
from app.models import User
from test_course_md import HEADER, module
from test_student import env, post  # noqa: F401  (fixture reuse)

VALUES = {"csv": {"lines": ["order_id;ville;total", "C-1;Tanzar;120"]}, "rejects": [{"line": 4, "reason": "total négatif"}]}


def lesson(extra: str) -> str:
    return f"""### Leçon : Le voyage d'une donnée

```yaml
slug: lecon-voyage
kind: lesson
objectives: [OBJ-A]
duration: 10
body: Suivez une ligne de commande, de la source à la table propre.
data:
  kind: experience
  experience: voyage
{extra}```
"""


def compile_with(extra: str, media: dict | None = None):
    return compile_files({"00-cours.md": HEADER, "10-m.md": module(lesson(extra))}, media or {})


def test_lesson_opens_the_experience_at_a_scene_with_the_course_values():
    compiled = compile_with("  scene: 3\n  data_file: experiences/voyage.json\n", {"experiences/voyage.json": json.dumps(VALUES).encode()})
    assert compiled.errors == []
    data = compiled.modules[0].blocks[0].items[0].definition["display_data"]
    assert data == {"kind": "experience", "experience": "voyage", "scene": 3, "data": VALUES, "title": "", "description": ""}
    assert compile_with("").errors == []  # without a data file: built-in default values


def test_a_real_size_experience_file_passes_the_general_display_cap():
    """voyage.json of the course is about 116 Ko: over the 32 000 characters of other displays, under 200 Ko."""
    big = {"csv": {"lines": [f"C-{i};Tanzar;{i}" for i in range(6_000)]}}
    assert 100_000 < len(json.dumps(big)) < 190_000
    compiled = compile_with("  data_file: experiences/voyage.json\n", {"experiences/voyage.json": json.dumps(big).encode()})
    assert compiled.errors == []


@pytest.mark.parametrize(("extra", "media", "message"), [
    ("  data_file: experiences/absent.json\n", {}, "introuvable"),
    ("  data_file: experiences/voyage.json\n", {"experiences/voyage.json": b"{pas du json"}, "JSON valide"),
    ("  data_file: experiences/voyage.json\n", {"experiences/voyage.json": b"[1, 2]"}, "objet JSON"),
    ("  data_file: ../voyage.json\n", {}, "experiences/<nom>.json"),
    ("  data_file: experiences/voyage.json\n", {"experiences/voyage.json": json.dumps({"x": "a" * 210_000}).encode()}, "trop volumineuses"),
])
def test_bad_experience_files_are_refused_in_french(extra, media, message):
    assert any(message in issue.message for issue in compile_with(extra, media).errors)


def test_schema_accepts_only_known_experiences_and_scenes():
    adapter = TypeAdapter(DisplayData)
    assert adapter.validate_python({"kind": "experience", "experience": "voyage"}).scene is None
    for bad in ({"experience": "autre"}, {"scene": 0}, {"scene": 8}, {"extra": 1}):
        with pytest.raises(ValidationError):
            adapter.validate_python({"kind": "experience", "experience": "voyage", **bad})


def test_the_page_reads_the_course_values_or_falls_back_to_defaults(env):
    clients, engine = env
    a, teacher = clients["a"], clients["teacher"]
    assert a.get("/api/v1/experiences/voyage/data").json() == {"experience": "voyage", "data": None}
    assert a.get("/api/v1/experiences/autre/data").status_code == 404
    compiled = compile_with("  data_file: experiences/voyage.json\n", {"experiences/voyage.json": json.dumps(VALUES).encode()})
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        published = import_compiled(db, owner, compiled, publish=True)
    assert teacher.get("/api/v1/experiences/voyage/data").json()["data"] == VALUES
    assert a.get("/api/v1/experiences/voyage/data").json()["data"] is None  # not enrolled in that course yet
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Classe voyage"}).json()["id"]
    with Session(engine) as db:
        student = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student})
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": published["published"]["release_id"]})
    assert a.get("/api/v1/experiences/voyage/data").json()["data"] == VALUES
