from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_creates_users_with_unique_username(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db_url = f"sqlite:///{tmp_path / 'academy.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(config, "head")
    engine = create_engine(db_url)
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    assert {"id", "username", "password_hash", "role", "enabled", "created_at"} <= columns
    assert any({"username"} == set(item["column_names"]) for item in inspect(engine).get_unique_constraints("users"))
    assert {"user_sessions", "login_throttles", "auth_events"} <= set(inspect(engine).get_table_names())
    assert {"courses", "learning_objectives", "course_modules", "chapters", "missions", "mission_versions", "course_releases", "cohorts", "enrollments", "assignments", "audit_events"} <= set(inspect(engine).get_table_names())
