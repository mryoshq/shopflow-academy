"""Serialize real opening entry points with Markdown republication on disposable PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
import os
from queue import Queue
from time import monotonic, sleep
from uuid import uuid4

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.auth import AuthContext
from app.classroom import lock_class_release, open_block
from app.config import get_settings
from app.course_md import ImportRefused, compile_files, import_compiled
from app.live import unlock_block_for
from app.models import Assignment, Base, BlockState, BlockUnlock, Chapter, CourseRelease, User
from test_course_md import HEADER, mission, module


@pytest.fixture
def postgres():
    admin_url = os.environ.get("LAB_TEST_ADMIN_URL")
    if not admin_url:
        pytest.skip("requires the disposable CI PostgreSQL service")
    url = make_url(admin_url).set(drivername="postgresql+psycopg")
    schema = f"import_guard_{uuid4().hex}"
    admin = create_engine(url)
    engine = create_engine(url, connect_args={"options": f"-c search_path={schema} -c statement_timeout=10000"})
    try:
        with admin.begin() as connection:
            connection.exec_driver_sql(f"CREATE SCHEMA {schema}")
        Base.metadata.create_all(engine)
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.exec_driver_sql(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
        admin.dispose()


def wait_for_blocked_connection(engine, queue):
    pid = queue.get(timeout=5)
    end = monotonic() + 5
    with engine.connect() as connection:
        while monotonic() < end:
            if connection.scalar(text("SELECT cardinality(pg_blocking_pids(:pid))"), {"pid": pid}):
                return
            sleep(0.025)
    pytest.fail("concurrent request did not wait for the course lock")


@pytest.mark.parametrize("access", ["class", "individual"])
@pytest.mark.parametrize("first", ["opening", "publication"])
def test_opening_and_markdown_republication_share_course_lock(postgres, monkeypatch, access, first):
    monkeypatch.setattr(get_settings(), "main_course_slug", "cours-test")
    monkeypatch.setattr(get_settings(), "class_label", "Classe fictive PostgreSQL")
    source = compile_files({"00-cours.md": HEADER, "10-m.md":
                            module(mission("m1")) + "\n## Bloc : Destination\n\n" + mission("m2")})
    merged = compile_files({"00-cours.md": HEADER, "10-m.md":
                            module(mission("m1"), mission("m2"), block="Destination")})
    with Session(postgres, expire_on_commit=False) as db:
        teacher = User(username="teacher", password_hash="unused", role="teacher")
        student = User(username="student", password_hash="unused", role="student")
        db.add_all([teacher, student])
        db.commit()
        import_compiled(db, teacher, source, publish=True)
        assignment_id = db.scalar(select(Assignment.id))
        block_id = db.scalar(select(Chapter.id).where(Chapter.title == "Bloc 1"))
        teacher_id, student_id = teacher.id, student.id

    queue = Queue()

    def opening(db):
        auth = AuthContext(user=db.get(User, teacher_id), session=None)
        if access == "class":
            return open_block(assignment_id, block_id, auth, db)
        return unlock_block_for(assignment_id, block_id, student_id, auth, db)

    def publication(db):
        return import_compiled(db, db.get(User, teacher_id), merged, publish=True)

    def concurrent(action):
        with Session(postgres, expire_on_commit=False) as db:
            queue.put(db.scalar(text("SELECT pg_backend_pid()")))
            return action(db)

    with ThreadPoolExecutor(max_workers=1) as executor:
        with Session(postgres, expire_on_commit=False) as db:
            assignment = db.get(Assignment, assignment_id)
            original = db.get(CourseRelease, assignment.course_release_id)
            lock_class_release(db, assignment, original)
            future = executor.submit(concurrent, publication if first == "opening" else opening)
            wait_for_blocked_connection(postgres, queue)
            if first == "opening":
                opening(db)
                with pytest.raises(ImportRefused, match="Bloc 1"):
                    future.result(timeout=10)
            else:
                assert publication(db)["published"]["version"] == 2
                with pytest.raises(HTTPException) as error:
                    future.result(timeout=10)
                assert error.value.status_code == 404
                assert error.value.detail == "block not found"

    with Session(postgres) as db:
        assignment = db.get(Assignment, assignment_id)
        assert db.get(CourseRelease, assignment.course_release_id).version == (1 if first == "opening" else 2)
        state = db.scalar(select(BlockState).where(BlockState.chapter_id == block_id))
        unlock = db.scalar(select(BlockUnlock).where(BlockUnlock.chapter_id == block_id))
        assert (state is not None and state.opened_at is not None) == (first == "opening" and access == "class")
        assert (unlock is not None) == (first == "opening" and access == "individual")
