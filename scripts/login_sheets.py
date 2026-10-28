#!/usr/bin/env python3
"""Printable login sheets for the class: URL, QR code and identifier for each student.

Reads the identifiers from ``.local/student-emails.txt`` (never in Git) and writes one
HTML page, ready to print (one sheet per student, cut lines), into
``~/Developer/shopflow-notes/`` — outside the repository. Passwords are NOT printed
unless ``--with-passwords`` is given explicitly; they are then read from
``.local/student-credentials.json`` (initial passwords) and the file name says so.
Nothing is printed to the terminal except the path of the file.

    python3 scripts/login_sheets.py
    python3 scripts/login_sheets.py --with-passwords      # only on explicit request
"""

from __future__ import annotations

import argparse
from datetime import datetime
from html import escape
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qrcode_min import encode, to_svg  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "https://shopflow.rapidfox.io"


def read_accounts(local: Path, with_passwords: bool) -> list[dict]:
    source = local / "student-emails.txt"
    if not source.is_file():
        raise SystemExit(f"Fichier introuvable : {source}")
    names = [line.strip() for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
    passwords: dict[str, str] = {}
    if with_passwords:
        credentials = local / "student-credentials.json"
        if credentials.is_file():
            passwords = {item["email"].casefold(): item["password"] for item in json.loads(credentials.read_text(encoding="utf-8"))}
    return [{"username": name, "password": passwords.get(name.casefold())} for name in names]


def sheet(url: str, accounts: list[dict], with_passwords: bool) -> str:
    qr = to_svg(encode(url), size_mm=32, label=f"QR code vers {url}")
    cards = []
    for account in accounts:
        if with_passwords:
            secret = (f'<p class="pw">Mot de passe : <code>{escape(account["password"])}</code></p>' if account["password"]
                      else '<p class="pw">Mot de passe : donné par l’enseignant</p>')
        else:
            secret = '<p class="pw">Mot de passe : donné par l’enseignant</p>'
        cards.append(f"""<section class="card">
  <div class="qr">{qr}</div>
  <div>
    <h2>ShopFlow Academy</h2>
    <p>Ouvrez <strong>{escape(url)}</strong> dans Chrome ou Edge (ou scannez le code).</p>
    <p>Identifiant : <code>{escape(account["username"])}</code></p>
    {secret}
    <p class="small">Python Data Engineering &amp; SQL Avancé · gardez cette fiche pour vous.</p>
  </div>
</section>""")
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Fiches de connexion ShopFlow Academy</title>
<style>
  @page {{ size: A4; margin: 12mm; }}
  body {{ font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #14211F; margin: 0; }}
  .card {{ display: flex; gap: 8mm; align-items: center; border: 1px dashed #4A5A56; border-radius: 3mm; padding: 6mm; margin: 0 0 6mm; break-inside: avoid; }}
  h2 {{ margin: 0 0 2mm; font-size: 15pt; color: #0F5047; }}
  p {{ margin: 1mm 0; font-size: 11pt; }}
  code {{ font-family: Consolas, "SF Mono", monospace; font-size: 12pt; background: #F1EDE4; padding: 0 1.5mm; border-radius: 1mm; }}
  .small {{ font-size: 9pt; color: #4A5A56; }}
  .card:nth-of-type(4n) {{ break-after: page; }}
</style></head>
<body>
{"".join(cards)}
</body></html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--with-passwords", action="store_true", help="imprimer aussi les mots de passe initiaux (demande explicite)")
    parser.add_argument("--local", type=Path, default=ROOT / ".local", help=argparse.SUPPRESS)
    parser.add_argument("--output", type=Path, default=Path.home() / "Developer" / "shopflow-notes")
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output == ROOT or ROOT in output.parents:
        raise SystemExit("Refusé : les fiches ne s'écrivent jamais dans le dépôt (données personnelles).")
    accounts = read_accounts(args.local, args.with_passwords)
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = output / f"fiches-connexion-{stamp}{'-avec-mots-de-passe' if args.with_passwords else ''}.html"
    target.write_text(sheet(args.url, accounts, args.with_passwords), encoding="utf-8")
    target.chmod(0o600)
    print(f"{len(accounts)} fiches : {target} (ouvrir puis imprimer)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
