"""Create a local development .env without printing secrets or overwriting it."""

from pathlib import Path
from secrets import token_urlsafe


ROOT = Path(__file__).resolve().parents[1]
target = ROOT / ".env"
if target.exists():
    raise SystemExit(".env already exists; it was left unchanged")

template = (ROOT / ".env.example").read_text()
template = template.replace("POSTGRES_PASSWORD=\n", f"POSTGRES_PASSWORD={token_urlsafe(32)}\n")
template = template.replace("AUTH_SECRET=\n", f"AUTH_SECRET={token_urlsafe(48)}\n")
target.write_text(template)
target.chmod(0o600)
print("Created local .env with generated development secrets")
