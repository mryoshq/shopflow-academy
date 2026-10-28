"""Sprint 2, part F: coded media (animation, mind map, flow) and videos (ADR-0018)."""

from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.course_md import compile_dir, compile_files, import_compiled
from app.curriculum_schema import DisplayData
from app.models import User
from test_course_md import EXAMPLE, HEADER, module
from test_student import env, post  # noqa: F401  (fixture reuse)

adapter = TypeAdapter(DisplayData)
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
VTT = "WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n".encode()


def lesson(data: str) -> str:
    return f"""### Leçon : Leçon média

```yaml
slug: lecon-media
kind: lesson
objectives: [OBJ-A]
duration: 15
body: Une leçon avec un média.
data:
{data}```
"""


def scene(tables: str, extra: str = "") -> str:
    return f"""  kind: animation
  title: Animation
  steps:
    - caption: Première étape
      scene:
        tables:
{tables}{extra}    - caption: Deuxième étape
      scene:
        tables:
          - columns: [a]
"""


ONE_TABLE = "          - columns: [order_id, frais]\n            rows: [[C-1, 30], [C-2, 40]]\n"


def errors(data: str, media: dict | None = None) -> list[tuple[int, str]]:
    compiled = compile_files({"00-cours.md": HEADER, "10-m.md": module(lesson(data))}, media)
    return [(issue.line, issue.message) for issue in compiled.errors]


def test_example_media_compile_and_are_content_addressed():
    compiled = compile_dir(EXAMPLE)
    assert compiled.errors == []
    video = next(item.definition["display_data"] for item in compiled.items() if item.slug == "demo-lecon-video")
    assert video["src"].startswith("/media/") and video["src"].endswith(".mp4") and video["captions_src"].endswith(".vtt")
    assert set(compiled.media_out) == {video["src"], video["captions_src"]}
    animation = next(item.definition["display_data"] for item in compiled.items() if item.slug == "demo-lecon-jointure-animee")
    assert [step["scene"]["counter"]["value"] for step in animation["steps"] if step["scene"]["counter"]] == ["70 DH", "100 DH", "70 DH"]
    import json
    assert json.loads(json.dumps(animation["steps"][1]["scene"]["arrows"][0])) == {"source": [0, 0], "target": [1, 0], "label": ""}


@pytest.mark.parametrize(("data", "media", "line", "message"), [
    (scene(ONE_TABLE, "        arrows:\n          - {from: [0, 0], to: [1, 0]}\n"), None, 19, "flèche"),
    (scene(ONE_TABLE.replace("rows: [[C-1, 30], [C-2, 40]]", "rows: [[C-1, 30]]\n            highlight: {rows: [3]}")), None, 21, "highlight"),
    ("  kind: mindmap\n  title: Carte\n  root:\n    label: R\n    children:\n      - label: A\n        children:\n          - label: B\n            children:\n              - label: C\n                children:\n                  - label: D\n", None, 14, "3 niveaux"),
    ("  kind: flow\n  title: Flux\n  input: 10\n  steps:\n    - {id: a, label: A, rejects: 8}\n    - {id: b, label: B, rejects: 5}\n", None, 14, "rejets dépassent"),
    ("  kind: video\n  title: V\n  url: https://www.youtube.com/watch?v=abcdefgh\n", None, 14, "youtube-nocookie.com"),
    ("  kind: video\n  title: V\n  url: http://player.vimeo.com/video/12345\n", None, 17, "lien non HTTPS"),
    ("  kind: video\n  title: V\n  file: media/absente.mp4\n", None, 17, "fichier introuvable"),
    ("  kind: video\n  title: V\n  file: media/faux.mp4\n", {"media/faux.mp4": b"pas une video"}, 17, "pas une vidéo MP4"),
    ("  kind: video\n  title: V\n  file: ../secret.mp4\n", None, 17, "chemin `media/"),
    ("  kind: video\n  title: V\n  file: media/a.mp4\n  captions: media/a.vtt\n", {"media/a.mp4": MP4, "media/a.vtt": b"pas du vtt"}, 18, "WebVTT"),
    ("  kind: video\n  title: V\n  url: https://player.vimeo.com/video/12345\n  captions: media/a.vtt\n", None, 18, "`captions` seulement"),
])
def test_media_errors_are_reported_at_the_right_line(data, media, line, message):
    found = errors(data, media)
    assert any(at == line and message in text for at, text in found), found


def test_schema_refuses_unsafe_media_directly():
    for bad in ({"kind": "video", "title": "v", "src": "/media/../../etc/passwd"},
                {"kind": "video", "title": "v", "url": "https://evil.example/embed/abcdefgh"},
                {"kind": "video", "title": "v", "url": "https://www.youtube-nocookie.com/embed/abcdefgh", "src": "/media/0123456789abcdef.mp4"},
                {"kind": "mindmap", "title": "t", "root": {"label": "<script>x</script>"}},
                {"kind": "flow", "title": "t", "input": 5, "steps": [{"id": "a", "label": "A"}, {"id": "a", "label": "B"}]}):
        with pytest.raises(ValidationError):
            adapter.validate_python(bad)
    many = {"kind": "mindmap", "title": "t", "root": {"label": "r", "children": [{"label": f"n{i}", "children": [{"label": f"m{i}-{j}"} for j in range(4)]} for i in range(10)]}}
    with pytest.raises(ValidationError):
        adapter.validate_python(many)  # 51 nodes


def test_import_copies_videos_once_into_the_media_folder(env, tmp_path, monkeypatch):
    clients, engine = env
    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path / "media"))
    compiled = compile_dir(EXAMPLE)
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        import_compiled(db, owner, compiled)
        import_compiled(db, owner, compile_dir(EXAMPLE))  # idempotent
    stored = sorted(path.name for path in (tmp_path / "media").iterdir())
    assert stored == sorted(Path(src).name for src in compiled.media_out)
    for src, content in compiled.media_out.items():
        assert (tmp_path / "media" / Path(src).name).read_bytes() == content
