"""Clay variant of the owner's green logo (ADR-0035): docs/design/shopflow-logo-vert.png -> shopflow-logo-terre-cuite.png.

The drawing is unchanged. Each pixel is a mix of the green background and the sand drawing; the same mix is
rebuilt with the clay accent (brand.600 #B5532F) instead of the green. Also recolors the dark image embedded in
frontend/public/icons/favicon.svg. Usage: python3 frontend/scripts/recolor-logo.py
"""
import base64
import io
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GREEN, SAND, CLAY = (20, 100, 87), (247, 244, 238), (181, 83, 47)


def recolor(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    axis = [s - g for s, g in zip(SAND, GREEN)]
    norm = sum(a * a for a in axis)
    pixels = []
    for r, g, b, a in image.get_flattened_data():
        t = sum((c - gc) * ax for c, gc, ax in zip((r, g, b), GREEN, axis)) / norm  # 0 = green, 1 = sand
        t = min(1.0, max(0.0, t))
        pixels.append(tuple(round(cl + t * (s - cl)) for cl, s in zip(CLAY, SAND)) + (a,))
    out = Image.new("RGBA", image.size)
    out.putdata(pixels)
    return out


def main() -> None:
    recolor(Image.open(ROOT / "docs/design/shopflow-logo-vert.png")).save(ROOT / "docs/design/shopflow-logo-terre-cuite.png", optimize=True)
    svg_path = ROOT / "frontend/public/icons/favicon.svg"
    svg = svg_path.read_text(encoding="utf-8")
    match = re.search(r'(<image class="d"[^>]*href="data:image/png;base64,)([^"]+)(")', svg)
    if not match:
        raise SystemExit("dark image not found in favicon.svg")
    buffer = io.BytesIO()
    recolor(Image.open(io.BytesIO(base64.b64decode(match.group(2))))).save(buffer, "PNG", optimize=True)
    svg = svg[:match.start(2)] + base64.b64encode(buffer.getvalue()).decode("ascii") + svg[match.end(2):]
    svg_path.write_text(svg.replace("variante verte en thème sombre", "variante terre cuite en thème sombre (ADR-0035)"), encoding="utf-8")
    print("docs/design/shopflow-logo-terre-cuite.png, frontend/public/icons/favicon.svg")


if __name__ == "__main__":
    main()
