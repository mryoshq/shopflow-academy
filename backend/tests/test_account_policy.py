"""Owner decisions: one teacher owns every course; only @ynov.com students stay active."""

from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.account_policy import apply_policy
from app.auth import utcnow
from app.models import Course, User, UserSession


@pytest.fixture
def db(tmp_path):
    url = f"sqlite:///{tmp_path / 'policy.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    engine = create_engine(url)
    with Session(engine) as session:
        users = [User(username=name, password_hash="x", role=role) for name, role in [
            ("proprietaire@example.org", "teacher"), ("demo.enseignant", "teacher"),
            ("demo.etudiant01", "student"), ("a.b@ynov.com", "student"), ("C.D@YNOV.COM", "student"),
            ("x@gmail.com", "student"), ("e@ynov.com.evil.io", "student"), ("t@ynov.com", "teacher")]]
        session.add_all(users)
        session.flush()
        session.add_all([Course(slug="un", title="Un", created_by=users[1].id), Course(slug="deux", title="Deux", created_by=users[0].id)])
        session.add(UserSession(token_hash="h" * 64, user_id=users[2].id, csrf_hash="c" * 64, expires_at=utcnow()))
        session.commit()
        yield session
    engine.dispose()


def enabled(db) -> set[str]:
    return {u.username for u in db.scalars(select(User).where(User.enabled.is_(True)))}


def test_dry_run_changes_nothing_and_counts(db):
    before = enabled(db)
    report = apply_policy(db, "Proprietaire@example.org\n", apply=False)
    assert enabled(db) == before
    assert report["courses_to_reattach"] == 1 and report["accounts_to_disable"] == 5
    assert report["demo_accounts_to_disable"] == 2 and report["teachers_to_disable"] == 2
    assert "proprietaire" not in str(report)  # counts only, never an address


def test_apply_is_idempotent_and_only_keeps_owner_and_ynov_students(db):
    report = apply_policy(db, "proprietaire@example.org", apply=True)
    assert enabled(db) == {"proprietaire@example.org", "a.b@ynov.com", "C.D@YNOV.COM"}
    assert report["courses_owned_by_owner"] == 2 and report["active_teachers"] == 1 and report["active_students"] == 2
    assert db.scalar(select(UserSession)).revoked_at is not None
    assert db.scalar(select(User).where(User.username == "demo.etudiant01")) is not None  # disabled, not deleted
    again = apply_policy(db, "proprietaire@example.org", apply=True)
    assert again["accounts_to_disable"] == 0 and again["courses_to_reattach"] == 0


def test_unknown_or_student_owner_aborts_without_changes(db):
    before = enabled(db)
    for owner in ("", "absent@example.org", "a.b@ynov.com"):
        with pytest.raises(SystemExit):
            apply_policy(db, owner, apply=True)
    assert enabled(db) == before
