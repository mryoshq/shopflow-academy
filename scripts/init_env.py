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
template = template.replace("APP_SECRET=\n", f"APP_SECRET={token_urlsafe(48)}\n")
for name in ("LAB_POSTGRES_PASSWORD", "LAB_OWNER_PASSWORD", "LAB_READER_PASSWORD"):
    template = template.replace(f"{name}=\n", f"{name}={token_urlsafe(32)}\n")
target.write_text(template)
target.chmod(0o600)
print("Created local .env with generated development secrets")
