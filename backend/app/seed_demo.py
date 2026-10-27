"""Create fictional local users; never print or log generated passwords."""

import argparse
import json
from pathlib import Path
from secrets import token_urlsafe

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.config import get_settings
from app.database import get_engine
from app.models import User


def seed_demo(db: Session, output: Path, app_env: str) -> int:
    if app_env == "production":
        raise RuntimeError("Demo seed is disabled in production")
    names = [("demo.enseignant", "teacher")] + [(f"demo.etudiant{i:02d}", "student") for i in range(1, 11)]
    credentials: list[dict[str, str]] = []
    try:
        with db.begin():
            for username, role in names:
                if db.scalar(select(User.id).where(User.username == username)) is not None:
                    continue
                password = token_urlsafe(24)
                db.add(User(username=username, role=role, password_hash=password_hash.hash(password)))
                credentials.append({"username": username, "password": password})
            if credentials:
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                output.write_text(json.dumps(credentials, ensure_ascii=False, indent=2))
                output.chmod(0o600)
    except Exception:
        if credentials:
            output.unlink(missing_ok=True)
        raise
    return len(credentials)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/tmp/academy-demo-credentials.json"))
    args = parser.parse_args()
    with Session(get_engine()) as db:
        created = seed_demo(db, args.output, get_settings().app_env)
    print(json.dumps({"created": created, "path": str(args.output) if created else None}))


if __name__ == "__main__":
    main()
