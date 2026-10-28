"""Archive the leftover courses of old E2E tests (slugs with e2e, test or demo).

Only courses of the owner, not archived, never given to the real class and other than
the main course are concerned. Nothing is deleted: courses are archived (reversible in
the database, audited). Dry run by default; the owner address is read on stdin so it
never appears in a command line or a log:

    docker compose exec -T backend python -m app.course_cleanup < .local/teacher-email.txt
    docker compose exec -T backend python -m app.course_cleanup --apply < .local/teacher-email.txt
"""

from __future__ import annotations

import argparse
import json
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classroom import run_cleanup
from app.database import get_engine
from app.models import User


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="archive the courses (default: dry run)")
    args = parser.parse_args()
    owner_name = sys.stdin.readline().strip().casefold()
    with Session(get_engine()) as db:
        owner = db.scalar(select(User).where(User.username == owner_name, User.role == "teacher")) if owner_name else None
        if owner is None:
            raise SystemExit("owner teacher account not found (check .local/teacher-email.txt); nothing changed")
        report = run_cleanup(db, owner, args.apply)
    # Slugs and titles of test courses only; no personal data.
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
