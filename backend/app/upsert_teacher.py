"""Create or rotate one teacher account from private local stdin; never send mail."""

import json
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import password_hash
from app.config import get_settings
from app.database import get_engine
from app.models import User


def upsert_teacher(db: Session, email: str, password: str, app_env: str) -> bool:
    if app_env == "production":
        raise RuntimeError("Local teacher account setup is disabled in production")
    try:
        username = validate_email(email, check_deliverability=False).normalized.casefold()
    except EmailNotValidError as exc:
        raise ValueError("Invalid teacher address") from exc
    if len(username) > 128 or len(password) < 24:
        raise ValueError("Invalid teacher account input")
    created = False
    with db.begin():
        user = db.scalar(select(User).where(User.username == username).with_for_update())
        if user is None:
            user = User(username=username, role="teacher", password_hash=password_hash.hash(password))
            db.add(user)
            created = True
        else:
            user.role = "teacher"
            user.password_hash = password_hash.hash(password)
            user.enabled = True
    return created


def main() -> None:
    payload = json.load(sys.stdin)
    with Session(get_engine()) as db:
        created = upsert_teacher(db, payload["email"], payload["password"], get_settings().app_env)
    print(json.dumps({"created": created}))


if __name__ == "__main__":
    main()
