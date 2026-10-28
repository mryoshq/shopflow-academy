"""Production account policy (owner decisions of 28 October 2026).

* One teacher: the account whose username is the owner address read on stdin. Every
  existing course is attached to it.
* Students stay active only when their username ends with ``@ynov.com``.
* Every other account (``demo.*``, other teachers, other students) is disabled, never
  deleted, and its open sessions are revoked.

The owner address is read from stdin so it never appears in a command line, a log or
the repository. Only counts are printed, never an address. Dry run by default:

    docker compose exec -T backend python -m app.account_policy < .local/teacher-email.txt
    docker compose exec -T backend python -m app.account_policy --apply < .local/teacher-email.txt
"""

from __future__ import annotations

import argparse
import json
import sys

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth import utcnow
from app.database import get_engine
from app.models import AuditEvent, Course, User, UserSession

STUDENT_DOMAIN = "@ynov.com"


def keeps_access(user: User, owner_id: int) -> bool:
    if user.id == owner_id:
        return True
    return user.role == "student" and user.username.casefold().endswith(STUDENT_DOMAIN)


def apply_policy(db: Session, owner_username: str, *, apply: bool) -> dict:
    owner_username = owner_username.strip().casefold()
    owner = db.scalar(select(User).where(User.username == owner_username)) if owner_username else None
    if owner is None or owner.role != "teacher":
        raise SystemExit("owner teacher account not found (check .local/teacher-email.txt); nothing changed")
    users = db.scalars(select(User).order_by(User.id)).all()
    to_disable = [u for u in users if u.enabled and not keeps_access(u, owner.id)]
    courses = db.scalars(select(Course).where(Course.created_by != owner.id)).all()
    report = {
        "mode": "apply" if apply else "dry-run",
        "owner_found": True,
        "owner_enabled": owner.enabled,
        "courses_total": len(db.scalars(select(Course.id)).all()),
        "courses_to_reattach": len(courses),
        "students_ynov_active": sum(1 for u in users if u.role == "student" and u.enabled and keeps_access(u, owner.id)),
        "accounts_to_disable": len(to_disable),
        "demo_accounts_to_disable": sum(1 for u in to_disable if u.username.startswith("demo.")),
        "teachers_to_disable": sum(1 for u in to_disable if u.role == "teacher"),
    }
    if not apply:
        return report
    now = utcnow()
    for course in courses:
        db.add(AuditEvent(actor_id=owner.id, action="course.owner_change", resource_type="course", resource_id=course.id,
                          details={"previous_owner_id": course.created_by, "reason": "owner decision 2026-10-28"}))
        course.created_by = owner.id
    for user in to_disable:
        user.enabled = False
        db.add(AuditEvent(actor_id=owner.id, action="account.disable", resource_type="user", resource_id=user.id,
                          details={"reason": "owner decision 2026-10-28"}))
    if to_disable:
        db.execute(update(UserSession).where(UserSession.user_id.in_([u.id for u in to_disable]), UserSession.revoked_at.is_(None))
                   .values(revoked_at=now))
    owner.enabled = True
    db.commit()
    after = db.scalars(select(User)).all()
    report.update({
        "courses_owned_by_owner": len(db.scalars(select(Course.id).where(Course.created_by == owner.id)).all()),
        "active_accounts": sum(1 for u in after if u.enabled),
        "active_teachers": sum(1 for u in after if u.enabled and u.role == "teacher"),
        "active_students": sum(1 for u in after if u.enabled and u.role == "student"),
        "disabled_accounts": sum(1 for u in after if not u.enabled),
    })
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()
    owner = sys.stdin.readline()
    with Session(get_engine()) as db:
        print(json.dumps(apply_policy(db, owner, apply=args.apply), ensure_ascii=False))


if __name__ == "__main__":
    main()
