"""A small PDF writer for the printable class report (ADR-0042): A4 pages, Helvetica, text and tables.

No dependency: the PDF is written by hand (standard Type 1 fonts, WinAnsi encoding, so French accents,
« », ’ and — are kept). Enough for a dated, printable report; nothing interactive.
"""

from __future__ import annotations

WIDTH, HEIGHT = 595.28, 841.89  # A4 in points
MARGIN = 48
LINE = 14


def encode(text: str) -> bytes:
    raw = str(text).encode("cp1252", errors="replace")
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def text_width(text: str, size: float) -> float:
    """Approximate width (Helvetica average glyph ≈ 0.52 em), enough to cut long cells."""
    return len(text) * size * 0.52


def fit(text: str, width: float, size: float) -> str:
    text = str(text)
    if text_width(text, size) <= width:
        return text
    while text and text_width(text + "…", size) > width:
        text = text[:-1]
    return text + "…"


class Report:
    def __init__(self, title: str, footer: str):
        self.title, self.footer = title, footer
        self.pages: list[list[bytes]] = []
        self.y = 0.0
        self.new_page()

    def new_page(self) -> None:
        self.pages.append([])
        self.y = HEIGHT - MARGIN

    def ensure(self, height: float) -> None:
        if self.y - height < MARGIN + 20:
            self.new_page()

    def write(self, text: str, size: float = 10, bold: bool = False, x: float = MARGIN, gap: float | None = None) -> None:
        self.ensure(gap or LINE)
        font = "F2" if bold else "F1"
        self.pages[-1].append(b"BT /%s %.1f Tf %.2f %.2f Td (" % (font.encode(), size, x, self.y) + encode(text) + b") Tj ET")
        self.y -= gap or (size + 5)

    def rule(self) -> None:
        self.ensure(8)
        self.pages[-1].append(b"0.75 G %.2f %.2f m %.2f %.2f l S 0 G" % (MARGIN, self.y + 4, WIDTH - MARGIN, self.y + 4))
        self.y -= 8

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float], size: float = 8.5) -> None:
        def line(cells: list[str], bold: bool) -> None:
            self.ensure(LINE)
            x = MARGIN
            for cell, width in zip(cells, widths):
                font = b"F2" if bold else b"F1"
                self.pages[-1].append(b"BT /%s %.1f Tf %.2f %.2f Td (" % (font, size, x, self.y) + encode(fit(cell, width - 4, size)) + b") Tj ET")
                x += width
            self.y -= LINE
        line(headers, True)
        self.rule()
        for row in rows:
            if self.y - LINE < MARGIN + 20:
                self.new_page()
                line(headers, True)
                self.rule()
            line(row, False)

    def bytes(self) -> bytes:
        objects: list[bytes] = []
        count = len(self.pages)
        # 1 catalog, 2 pages, 3-4 fonts, then (page, content) pairs.
        kids = " ".join(f"{5 + 2 * i} 0 R" for i in range(count)).encode()
        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        objects.append(b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % count)
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        for index, ops in enumerate(self.pages, start=1):
            footer = b"BT /F1 8 Tf %.2f %.2f Td (" % (MARGIN, MARGIN - 16) + encode(f"{self.footer} · page {index} sur {count}") + b") Tj ET"
            stream = b"\n".join(ops + [footer])
            objects.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>"
                           % (WIDTH, HEIGHT, 6 + 2 * (index - 1)))
            objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for number, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
        xref = len(out)
        out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
        for offset in offsets:
            out += b"%010d 00000 n \n" % offset
        out += b"trailer\n<< /Size %d /Root 1 0 R /Info << /Title (" % (len(objects) + 1) + encode(self.title) + b") /Producer (Rapidfox Academy) >> >>\n"
        out += b"startxref\n%d\n%%%%EOF\n" % xref
        return bytes(out)
