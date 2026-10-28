"""Local-only import of teacher-provided student emails. No email is sent."""

import json
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.config import get_settings
from app.database import get_engine
from app.models import User


def import_students(db: Session, rows: list[dict[str, str]], app_env: str, allowed_domain: str = "ynov.com") -> list[int]:
    if app_env == "production":
        raise RuntimeError("Student import is disabled in production")
    if not 1 <= len(rows) <= 50:
        raise ValueError("Expected 1 to 50 students")
    normalized = []
    for row in rows:
        try:
            email = validate_email(row["email"], check_deliverability=False).normalized.casefold()
        except (KeyError, EmailNotValidError) as exc:
            raise ValueError("Invalid student email") from exc
        if not email.endswith("@" + allowed_domain) or len(email) > 128 or len(row.get("password", "")) < 24:
            raise ValueError("Invalid student import entry")
        normalized.append(email)
    if len(set(normalized)) != len(normalized):
        raise ValueError("Duplicate student email")

    created: list[int] = []
    with db.begin():
        for index, email in enumerate(normalized):
            if db.scalar(select(User.id).where(User.username == email)) is not None:
                continue
            db.add(User(username=email, role="student", password_hash=password_hash.hash(rows[index]["password"])))
            created.append(index)
    return created


def main() -> None:
    rows = json.load(sys.stdin)
    with Session(get_engine()) as db:
        created = import_students(db, rows, get_settings().app_env)
    print(json.dumps({"created_indices": created}))


if __name__ == "__main__":
    main()
