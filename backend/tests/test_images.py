"""Part N (ADR-0029): course pictures (png, jpg, webp, svg), alt required, 2 MB at most, copied at import."""

import pytest
from pydantic import TypeAdapter, ValidationError

from app.course_md import compile_files
from app.curriculum_schema import DisplayData
from test_course_md import HEADER, module

adapter = TypeAdapter(DisplayData)
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f5047"/></svg>'


def lesson(data: str) -> str:
    return f"""### Leçon : Leçon image

```yaml
slug: lecon-image
kind: lesson
objectives: [OBJ-A]
duration: 5
body: Une leçon avec une image.
data:
{data}```
"""


def compile_image(data: str, media: dict):
    return compile_files({"00-cours.md": HEADER, "10-m.md": module(lesson(data))}, media)


def test_a_course_picture_is_content_addressed_with_its_alt_and_caption():
    compiled = compile_image("  kind: image\n  file: media/schema.png\n  alt: Un schéma.\n  caption: Légende *courte*.\n", {"media/schema.png": PNG})
    assert compiled.errors == []
    image = compiled.modules[0].blocks[0].items[0].definition["display_data"]
    assert image["src"].startswith("/media/") and image["src"].endswith(".png") and "file" not in image
    assert image["alt"] == "Un schéma." and image["caption"] == "Légende *courte*."
    assert compiled.media_out[image["src"]] == PNG
    jpeg = compile_image("  kind: image\n  file: media/photo.jpeg\n  alt: Une photo.\n", {"media/photo.jpeg": b"\xff\xd8\xff\xe0" + b"\x00" * 16})
    assert jpeg.errors == [] and jpeg.modules[0].blocks[0].items[0].definition["display_data"]["src"].endswith(".jpg")


@pytest.mark.parametrize(("data", "media", "message"), [
    ("  kind: image\n  file: media/schema.png\n", {"media/schema.png": PNG}, "texte alternatif"),
    ("  kind: image\n  file: media/absente.png\n  alt: A\n", {}, "introuvable"),
    ("  kind: image\n  file: media/gros.png\n  alt: A\n", {"media/gros.png": PNG + b"\x00" * (2 * 1024 * 1024)}, "maximum 2 Mo"),
    ("  kind: image\n  file: media/faux.png\n  alt: A\n", {"media/faux.png": b"GIF89a"}, "n'est pas une image PNG"),
    ("  kind: image\n  file: media/anim.gif\n  alt: A\n", {"media/anim.gif": b"GIF89a"}, "png|jpg|webp|svg"),
    ("  kind: image\n  file: media/x.svg\n  alt: A\n", {"media/x.svg": SVG.replace(b"<rect", b"<script>alert(1)</script><rect")}, "SVG refusé"),
    ("  kind: image\n  file: media/x.svg\n  alt: A\n", {"media/x.svg": SVG.replace(b"<rect", b'<rect onload="x()"')}, "SVG refusé"),
    ("  kind: image\n  file: media/x.svg\n  alt: A\n", {"media/x.svg": SVG.replace(b"<rect", b'<image href="https://evil.example/a.png"/><rect')}, "SVG refusé"),
    ("  kind: image\n  alt: A\n", {}, "file: media/"),
])
def test_bad_pictures_are_refused_in_french(data, media, message):
    errors = [issue.message for issue in compile_image(data, media).errors]
    assert any(message in error for error in errors), errors


def test_schema_refuses_external_or_unnamed_pictures():
    ok = {"kind": "image", "src": "/media/0123456789abcdef.svg", "alt": "Schéma"}
    assert adapter.validate_python(ok).alt == "Schéma"
    for change in ({"src": "https://example.com/a.png"}, {"src": "/media/0123456789abcdef.gif"}, {"alt": ""}, {"alt": "<b>x</b>"}, {"extra": 1}):
        with pytest.raises(ValidationError):
            adapter.validate_python({**ok, **change})
