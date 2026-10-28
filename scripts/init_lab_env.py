#!/usr/bin/env python3
"""Add the missing laboratory secrets to .env (never prints a value, never rewrites one).

    python3 scripts/init_lab_env.py

Appends LAB_POSTGRES_PASSWORD, LAB_OWNER_PASSWORD and LAB_READER_PASSWORD when they are
absent or empty; keeps .env in mode 0600. Prints only the names that were added.
"""

from pathlib import Path
from secrets import token_urlsafe

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("LAB_POSTGRES_PASSWORD", "LAB_OWNER_PASSWORD", "LAB_READER_PASSWORD")


def main() -> int:
    target = ROOT / ".env"
    if not target.exists():
        raise SystemExit(".env introuvable : lancer d'abord python3 scripts/init_env.py")
    text = target.read_text()
    present = {line.split("=", 1)[0] for line in text.splitlines() if "=" in line and line.split("=", 1)[1].strip()}
    lines = [line for line in text.splitlines() if not (line.split("=", 1)[0] in NAMES and line.split("=", 1)[0] not in present)]
    added = [name for name in NAMES if name not in present]
    if not added:
        print("Secrets de la base de laboratoire déjà présents : rien à faire.")
        return 0
    lines += [f"{name}={token_urlsafe(32)}" for name in added]
    target.write_text("\n".join(lines) + "\n")
    target.chmod(0o600)
    print("Ajoutés dans .env : " + ", ".join(added))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
