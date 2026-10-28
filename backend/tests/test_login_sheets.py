"""Sprint 2, part B: printable login sheets and the small QR encoder used by them."""

from pathlib import Path
import json
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import qrcode_min  # noqa: E402

segno = pytest.importorskip("segno")


@pytest.mark.parametrize("text", ["https://shopflow.rapidfox.io", "https://shopflow.rapidfox.io/#/", "Bonjour Tanzar " * 5, "x" * 200])
@pytest.mark.parametrize("mask", range(8))
def test_qr_matrix_matches_segno_for_every_mask(text, mask):
    ours = qrcode_min.encode(text, mask=mask, extra_zero_byte=True)
    version = (len(ours) - 17) // 4
    reference = segno.make(text, error="m", version=version, mask=mask, mode="byte", boost_error=False, micro=False)
    assert [[bool(v) for v in row] for row in reference.matrix] == ours


def test_qr_chooses_the_smallest_version_and_a_valid_mask():
    matrix = qrcode_min.encode("https://shopflow.rapidfox.io")
    assert len(matrix) == 29  # version 3 for 28 bytes at level M
    assert "<svg" in qrcode_min.to_svg(matrix) and 'aria-label="QR code"' in qrcode_min.to_svg(matrix)


def test_login_sheets_never_print_passwords_unless_asked(tmp_path):
    local = tmp_path / ".local"
    local.mkdir()
    (local / "student-emails.txt").write_text("salma.test@ynov.com\nyoussef.test@ynov.com\n")
    (local / "student-credentials.json").write_text(json.dumps([{"email": "salma.test@ynov.com", "password": "secret-de-salma-123456789"}]))
    out = tmp_path / "notes"
    script = ROOT / "scripts" / "login_sheets.py"
    run = subprocess.run([sys.executable, str(script), "--local", str(local), "--output", str(out)], capture_output=True, text=True, check=True)
    assert "secret-de-salma" not in run.stdout + run.stderr
    sheet = next(out.glob("fiches-connexion-*.html")).read_text()
    assert "salma.test@ynov.com" in sheet and "youssef.test@ynov.com" in sheet and "secret-de-salma" not in sheet
    assert sheet.count("<svg") == 2 and "https://shopflow.rapidfox.io" in sheet
    subprocess.run([sys.executable, str(script), "--local", str(local), "--output", str(out), "--with-passwords"], capture_output=True, text=True, check=True)
    newest = sorted(out.glob("fiches-connexion-*avec-mots-de-passe.html"))[-1].read_text()
    assert "secret-de-salma-123456789" in newest and "Mot de passe : donné par l’enseignant" in newest
    refused = subprocess.run([sys.executable, str(script), "--local", str(local), "--output", str(ROOT / "docs")], capture_output=True, text=True)
    assert refused.returncode != 0 and "dépôt" in refused.stderr + refused.stdout
