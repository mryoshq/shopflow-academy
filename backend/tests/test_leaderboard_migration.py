"""K upgrades the already-deployed L schema without changing L data."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from app.demo_course import run as seed_demo_course
from app.leaderboard_models import LeaderboardSettings
from app.models import Assignment, Course, MissionAttempt, MissionVersion, User


def test_upgrade_from_production_L_head_preserves_rules_and_retained_points(tmp_path):
    url = f"sqlite:///{tmp_path / 'leaderboard-upgrade.sqlite3'}"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_heads() == ["0016_project_draw"]  # one head: ADR-0041 after ADR-0039 after R (ADR-0034) after J after H after K
    assert scripts.get_revision("0016_project_draw").down_revision == "0015_rewards"
    assert scripts.get_revision("0015_rewards").down_revision == "0014_project"
    assert scripts.get_revision("0014_project").down_revision == "0013_observers"
    assert scripts.get_revision("0013_observers").down_revision == "0012_live_tracking"
    assert scripts.get_revision("0011_leaderboard").down_revision == "0010_attempt_rules"
    assert scripts.get_revision("0012_live_tracking").down_revision == "0011_leaderboard"
    command.upgrade(config, "0010_attempt_rules")
    engine = create_engine(url)
    with Session(engine) as db:
        teacher = User(username="demo.enseignant", password_hash="unused", role="teacher")
        student = User(username="demo.etudiant01", password_hash="unused", role="student")
        db.add_all([teacher, student]); db.commit()
        seed_demo_course(db)
        course = db.scalar(select(Course))
        course.attempt_rules = {"decay_enabled": True, "decay_since": "2026-10-28T10:00:00+00:00"}
        assigned = db.scalar(select(Assignment))
        version = db.scalar(select(MissionVersion.id))
        db.add(MissionAttempt(user_id=student.id, mission_version_id=version, course_release_id=assigned.course_release_id,
                              idempotency_key="retained-under-L", answer={}, is_correct=True, points=7, percent=70))
        db.commit()
        cohort_id, course_id = assigned.cohort_id, course.id

    def unchanged_L_data():
        with Session(engine) as db:
            assert db.get(Course, course_id).attempt_rules == {
                "decay_enabled": True, "decay_since": "2026-10-28T10:00:00+00:00"}
            stored = db.scalar(select(MissionAttempt))
            assert (stored.idempotency_key, stored.points, stored.percent, stored.is_correct) == ("retained-under-L", 7, 70, True)

    command.upgrade(config, "head")
    unchanged_L_data()
    with Session(engine) as db:
        assert db.scalar(text("select version_num from alembic_version")) == "0016_project_draw"
        settings = LeaderboardSettings(cohort_id=cohort_id, course_id=course_id)
        db.add(settings); db.commit()
        assert settings.enabled is False
    command.downgrade(config, "0010_attempt_rules")
    unchanged_L_data()
    assert not {"leaderboard_names", "leaderboard_settings"} & set(inspect(engine).get_table_names())
    command.upgrade(config, "head")
    unchanged_L_data()
    assert {"leaderboard_names", "leaderboard_settings"} <= set(inspect(engine).get_table_names())
    engine.dispose()
