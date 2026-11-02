"""ADR-0032: files to download, copied at import, served only to signed-in enrolled users."""

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.course_md import compile_files, import_compiled
from app.curriculum_schema import DisplayData
from app.main import app
from app.models import User
from test_course_md import HEADER, module
from test_student import env, post  # noqa: F401  (fixture reuse)

PDF = b"%PDF-1.4\n% fiche\n" + b"0" * 64
CSV = "order_id;ville;total\nC-1;Tanzar;120\n".encode()


def lesson(files: str) -> str:
    return f"""### Leçon : Documents du bloc

```yaml
slug: lecon-documents
kind: lesson
objectives: [OBJ-A]
duration: 5
body: Téléchargez la fiche et le jeu de données.
data:
  kind: download
  title: Documents
  files:
{files}```
"""


GOOD = "    - file: downloads/fiche-sql.pdf\n      title: Fiche SQL\n    - file: downloads/commandes.csv\n      title: Commandes (CSV)\n"


def compiled(files: str = GOOD, media: dict | None = None):
    return compile_files({"00-cours.md": HEADER, "10-m.md": module(lesson(files))},
                         {"downloads/fiche-sql.pdf": PDF, "downloads/commandes.csv": CSV} if media is None else media)


def test_files_are_described_by_id_name_title_and_size():
    result = compiled()
    assert result.errors == []
    data = result.modules[0].blocks[0].items[0].definition["display_data"]
    assert [(f["name"], f["title"], f["size"]) for f in data["files"]] == [("fiche-sql.pdf", "Fiche SQL", len(PDF)), ("commandes.csv", "Commandes (CSV)", len(CSV))]
    assert all(f["id"] in result.downloads_out for f in data["files"]) and data["files"][0]["id"].endswith(".pdf")


@pytest.mark.parametrize(("files", "media", "message"), [
    (GOOD, {"downloads/commandes.csv": CSV}, "introuvable"),
    ("    - file: downloads/virus.exe\n", {"downloads/virus.exe": b"MZ"}, "pdf|docx|zip"),
    ("    - file: downloads/faux.pdf\n", {"downloads/faux.pdf": b"pas un pdf"}, "n'est pas un PDF"),
    ("    - file: downloads/gros.zip\n", {"downloads/gros.zip": b"PK\x03\x04" + b"0" * (20 * 1024 * 1024)}, "maximum 20 Mo"),
    ("    - file: downloads/latin.csv\n", {"downloads/latin.csv": "é".encode("latin-1")}, "UTF-8"),
    ("    - file: ../secret.pdf\n", {}, "downloads/<nom>"),
])
def test_bad_files_are_refused_in_french(files, media, message):
    assert any(message in issue.message for issue in compiled(files, media).errors)


def test_schema_refuses_foreign_or_mismatched_files():
    adapter = TypeAdapter(DisplayData)
    ok = {"kind": "download", "files": [{"id": "0123456789abcdef.pdf", "name": "fiche.pdf", "title": "Fiche", "size": 10}]}
    assert adapter.validate_python(ok).files[0].name == "fiche.pdf"
    for bad in ({"id": "https://example.com/a.pdf"}, {"name": "fiche.csv"}, {"size": 30 * 1024 * 1024}, {"name": "../x.pdf"}):
        with pytest.raises(ValidationError):
            adapter.validate_python({**ok, "files": [{**ok["files"][0], **bad}]})


def test_only_enrolled_students_and_the_owner_get_the_file(env, monkeypatch, tmp_path):
    clients, engine = env
    monkeypatch.setattr(get_settings(), "downloads_dir", str(tmp_path / "downloads"))
    result = compiled()
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        published = import_compiled(db, owner, result, publish=True)
    pdf_id = next(file_id for file_id in result.downloads_out if file_id.endswith(".pdf"))
    assert (tmp_path / "downloads" / pdf_id).read_bytes() == PDF  # copied at import, outside the public media folder
    teacher, a = clients["teacher"], clients["a"]
    url = f"/api/v1/downloads/{pdf_id}"
    # Owner: yes (draft and release). Student not enrolled yet: no.
    got = teacher.get(url)
    assert got.status_code == 200 and got.content == PDF and got.headers["content-type"] == "application/pdf"
    assert 'attachment; filename="fiche-sql.pdf"' in got.headers["content-disposition"] and got.headers["cache-control"] == "private, no-store"
    assert a.get(url).status_code == 404
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Classe documents"}).json()["id"]
    with Session(engine) as db:
        student = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student})
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": published["published"]["release_id"]})
    assert a.get(url).content == PDF
    assert clients["b"].get(url).status_code == 404 and clients["out"].get(url).status_code == 404
    assert TestClient(app).get(url).status_code == 401
    assert a.get("/api/v1/downloads/0123456789abcdef.pdf").status_code == 404
    assert a.get("/api/v1/downloads/..%2F..%2Fetc%2Fpasswd").status_code == 404


@pytest.mark.parametrize(("ext", "content"), [("sql", b"SELECT 1;\n"), ("py", b"print(1)\n"), ("md", b"# Notes\n"), ("csv", CSV), ("pdf", PDF)])
def test_preview_source_keeps_original_rights_for_closed_blocks(env, monkeypatch, tmp_path, ext, content):
    """Preview fetches the original attachment, including its existing closed-block policy."""
    from test_teacher_dashboard import other_teacher
    from test_security_matrix import observer_client
    clients, engine = env
    monkeypatch.setattr(get_settings(), "downloads_dir", str(tmp_path / "preview-downloads"))
    name = f"source.{ext}"
    result = compiled(f"    - file: downloads/{name}\n      title: Source fictive\n", {f"downloads/{name}": content})
    assert result.errors == []
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        published = import_compiled(db, owner, result, publish=True)
        student = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
    teacher, a = clients["teacher"], clients["a"]
    url = f"/api/v1/downloads/{next(iter(result.downloads_out))}"
    assert a.get(url).status_code == 404
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Aperçu fictif"}).json()["id"]
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student})
    assigned = post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": published["published"]["release_id"]}).json()
    assignment = assigned["id"]
    for block in teacher.get(f"/api/v1/teacher/classes/{assignment}/live").json()["blocks"]:
        assert post(teacher, f"/api/v1/teacher/classes/{assignment}/blocks/{block['chapter_id']}/close").status_code == 200
    got = a.get(url)
    assert got.status_code == 200 and got.content == content
    assert "attachment" in got.headers["content-disposition"]
    assert got.headers["cache-control"] == "private, no-store" and "sandbox" in got.headers["content-security-policy"]
    assert teacher.get(url).status_code == 200
    for forbidden in (clients["b"], clients["out"], other_teacher(engine)):
        assert forbidden.get(url).status_code == 404
    assert observer_client(clients).get(url).status_code == 403
    assert TestClient(app).get(url).status_code == 401
    assert a.get("/api/v1/downloads/..%2fsecret.sql").status_code == 404
