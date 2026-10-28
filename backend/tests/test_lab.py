"""Sprint 2, part C: lab database, preconfigured runs and SQL challenges (ADR-0017).

The validator tests need nothing. The execution tests need a disposable PostgreSQL 16
whose superuser URL is in ``LAB_TEST_ADMIN_URL`` (CI service container; locally:
``docker run -d -p 127.0.0.1:55433:5432 -e POSTGRES_USER=lab_admin -e POSTGRES_PASSWORD=x
-e POSTGRES_DB=shopflow_lab postgres:16-alpine``). They are skipped otherwise.
"""

import os
from urllib.parse import urlparse

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import lab
from app.config import get_settings
from app.course_md import compile_dir, executions, import_compiled
from app.lab import LabError, LabRefused, Result, check_challenge_sql, run_query, same_result
from app.models import CourseRelease, MissionAttempt, User
from test_course_md import EXAMPLE
from test_student import env, post  # noqa: F401  (fixture reuse)

TABLES = {"orders", "order_items", "customers"}
ADMIN = os.environ.get("LAB_TEST_ADMIN_URL", "")
needs_db = pytest.mark.skipif(not ADMIN, reason="LAB_TEST_ADMIN_URL not set (no disposable PostgreSQL)")


@pytest.mark.parametrize("sql", [
    "SELECT * FROM orders",
    "select city, sum(total) from orders o join customers c on c.customer_id = o.customer_id group by city order by city",
    "WITH t AS (SELECT order_id, total FROM orders) SELECT * FROM t WHERE total > 100",
    "SELECT order_id, NTILE(4) OVER (ORDER BY total) FROM orders",
    "SELECT order_id, PERCENT_RANK() OVER (ORDER BY total), LAG(total) OVER (ORDER BY order_date) FROM lab.orders",
    "EXPLAIN ANALYZE SELECT * FROM orders WHERE total > 100",
    "EXPLAIN SELECT 1",
    "SELECT COUNT(*) FROM orders -- un commentaire ; DROP TABLE orders",
    "SELECT 1 /* ; DELETE FROM orders */",
    "SELECT * FROM orders UNION ALL SELECT * FROM orders",
    "SELECT ROUND(AVG(total), 2), COALESCE(NULL, 0), DATE_TRUNC('day', order_date) FROM orders GROUP BY 3",
])
def test_challenge_accepts_read_only_queries_on_lab_tables(sql):
    assert check_challenge_sql(sql, TABLES) == sql


@pytest.mark.parametrize(("sql", "reason"), [
    ("DELETE FROM orders", "SELECT"),
    ("UPDATE orders SET total = 0", "SELECT"),
    ("INSERT INTO orders VALUES ('x')", "SELECT"),
    ("DROP TABLE orders", "SELECT"),
    ("CREATE TABLE t (a int)", "SELECT"),
    ("TRUNCATE orders", "SELECT"),
    ("COPY orders TO '/tmp/x'", "SELECT"),
    ("SELECT 1; DELETE FROM orders", "une seule"),
    ("SELECT 1; SELECT 2", "une seule"),
    ("WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x", "lire"),
    ("WITH x AS (UPDATE orders SET total = 0 RETURNING *) SELECT * FROM x", "lire"),
    ("SELECT * INTO copie FROM orders", "lire"),
    ("SELECT * FROM orders FOR UPDATE", "lire"),
    ("SELECT pg_sleep(10)", "fonction"),
    ("SELECT pg_read_file('/etc/passwd')", "fonction"),
    ("SELECT lo_import('/etc/passwd')", "fonction"),
    ("SELECT * FROM dblink('host=x', 'select 1') AS t(a int)", "fonction"),
    ("SELECT set_config('default_transaction_read_only', 'off', false)", "fonction"),
    ("SELECT current_setting('data_directory')", "fonction"),
    ("SELECT query_to_xml('select * from pg_authid', true, true, '')", "fonction"),
    ("SELECT version()", "fonction"),
    ("SELECT * FROM pg_catalog.pg_authid", "table"),
    ("SELECT * FROM pg_user", "table"),
    ("SELECT * FROM information_schema.tables", "table"),
    ("SELECT * FROM public.users", "table"),
    ("SELECT * FROM autre_db.lab.orders", "table"),
    ("SELECT * FROM users", "table"),
    ("SELECT (SELECT usename FROM pg_user LIMIT 1)", "table"),
    ("EXPLAIN ANALYZE DELETE FROM orders", "SELECT"),
    ("EXPLAIN (ANALYZE) WITH x AS (DELETE FROM orders RETURNING 1) SELECT 1", "lire"),
    ("SET statement_timeout = 0", "SELECT"),
    ("BEGIN; DELETE FROM orders; COMMIT", "une seule"),
    ("SHOW ALL", "SELECT"),
    ("VALUES (1)", "SELECT"),
    ("", "écrivez"),
    ("SELECT '" + "x" * 4100 + "'", "trop longue"),
    ("SELECT 1\x00", "interdit"),
    ("SELEC * FROM orders", "SELECT|illisible"),
])
def test_challenge_bypass_battery_is_refused(sql, reason):
    with pytest.raises(LabRefused, match=reason):
        check_challenge_sql(sql, TABLES)


def test_results_are_compared_by_mode():
    a = Result(["ville", "ca"], [["Tanzar", 570.0], ["Bir Nour", 245.5]], False, 1)
    b = Result(["city", "total"], [["Bir Nour", 245.5], ["Tanzar", 570.0]], False, 1)
    assert not same_result(a, b, "rows") and same_result(a, b, "rows_unordered")
    assert same_result(Result(["n"], [[3]], False, 1), Result(["x"], [[3.0]], False, 1), "scalar")
    assert not same_result(Result(["a"], [["x"]], True, 1), Result(["a"], [["x"]], True, 1), "rows")  # truncated never matches
    assert not same_result(Result(["a", "b"], [[1, 2]], False, 1), Result(["a"], [[1]], False, 1), "rows")


# With a real PostgreSQL --------------------------------------------------------------------

def role_url(role: str, password: str) -> str:
    parsed = urlparse(ADMIN.replace("postgresql+psycopg://", "postgresql://"))
    return f"postgresql://{role}:{password}@{parsed.hostname}:{parsed.port or 5432}{parsed.path}"


@pytest.fixture
def labdb(monkeypatch):
    lab.bootstrap(ADMIN, "owner-test-secret", "reader-test-secret")
    reader, owner = role_url("lab_reader", "reader-test-secret"), role_url("lab_owner", "owner-test-secret")
    monkeypatch.setattr(get_settings(), "lab_reader_url", reader)
    monkeypatch.setattr(get_settings(), "lab_owner_url", owner)
    assert lab.load_dataset(lab.DEMO_DATASET.read_text(encoding="utf-8")) == 3
    from app import lab_api
    lab_api._window.clear()
    return {"reader": reader, "owner": owner}


@needs_db
def test_reader_role_is_read_only_bounded_and_isolated(labdb):
    result = run_query("SELECT SUM(o.shipping_fee) FROM orders o JOIN order_items i ON i.order_id = o.order_id WHERE o.order_id IN ('C-101', 'C-102')")
    assert result.rows == [[100]]
    # Even without the validator, the role cannot write, escape, or run long.
    for sql in ("DELETE FROM orders", "CREATE TABLE t (a int)", "SET default_transaction_read_only = off; DELETE FROM orders",
                "COMMIT; SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE; DELETE FROM orders",
                "SELECT * FROM pg_authid", "SELECT pg_read_file('/etc/passwd')", "SELECT pg_sleep(1)",
                "CREATE TEMP TABLE t AS SELECT 1", "COPY orders TO STDOUT"):
        with pytest.raises(LabError):
            run_query(sql)
    assert run_query("SELECT count(*) FROM orders").rows == [[8]]
    with pytest.raises(LabError, match="délai dépassé"):
        run_query("SELECT count(*) FROM orders a, orders b, orders c, orders d, orders e, orders f, orders g, orders h, orders i", timeout_ms=200)
    with pytest.raises(LabError, match="temp_file_limit"):  # big sorts/materialisations are bounded too
        run_query("SELECT count(*) FROM generate_series(1, 200000000)")
    capped = run_query("SELECT g FROM generate_series(1, 500) AS g")
    assert len(capped.rows) == 200 and capped.truncated is True
    plan = run_query("EXPLAIN ANALYZE SELECT * FROM orders WHERE total > 100")
    assert plan.columns == ["QUERY PLAN"] and any("Execution Time" in str(row[0]) for row in plan.rows)
    assert lab.lab_tables() == TABLES | {"order_items"}


@needs_db
def test_dataset_loader_is_not_superuser(labdb):
    with pytest.raises(LabError, match="jeu de données refusé"):
        lab.load_dataset("CREATE TABLE x (a text); COPY x FROM PROGRAM 'id';")
    with pytest.raises(LabError):
        lab.load_dataset("ALTER ROLE lab_reader SET default_transaction_read_only = off;")
    # The previous dataset is intact (one transaction).
    assert run_query("SELECT count(*) FROM orders").rows == [[8]]


def published_demo(env_clients, engine, monkeypatch, tmp_path) -> dict:
    """Import the Markdown demo (with simulated Mac-side run results), publish, give to a class, open the blocks."""
    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path / "media"))
    compiled = compile_dir(EXAMPLE)
    plan = executions(compiled)
    results: dict = {}
    for entry in plan["sql"]:
        results.setdefault(entry["slug"], {})[entry["id"]] = {"ok": True}
    for entry in plan["python"]:
        results.setdefault(entry["slug"], {})[entry["id"]] = {"ok": True, "output": "Doublons sur id : 1\n"}
    from app.course_md import compile_files
    import base64  # noqa: F401
    files = {path.name: path.read_text(encoding="utf-8") for path in EXAMPLE.glob("*.md")}
    media = {f"media/{p.name}": p.read_bytes() for p in (EXAMPLE / "media").glob("*")}
    compiled = compile_files(files, media, results, (EXAMPLE / "datasets" / "shopflow-lab.sql").read_text(encoding="utf-8"))
    assert compiled.errors == []
    with Session(engine, expire_on_commit=False) as db:
        owner = db.scalar(select(User).where(User.username == "demo.enseignant"))
        result = import_compiled(db, owner, compiled, publish=True)
    assert result["lab"].startswith("jeu de données chargé")
    teacher = env_clients["teacher"]
    release = result["published"]["release_id"]
    cohort = post(teacher, "/api/v1/teacher/cohorts", {"label": "Classe labo"}).json()["id"]
    with Session(engine) as db:
        student = db.scalar(select(User.id).where(User.username == "demo.etudiant01"))
        snapshot = db.get(CourseRelease, release).student_snapshot
    post(teacher, f"/api/v1/teacher/cohorts/{cohort}/enrollments", {"user_id": student})
    assignment = post(teacher, f"/api/v1/teacher/cohorts/{cohort}/assignments", {"course_release_id": release}).json()["id"]
    for _ in range(2):
        post(teacher, f"/api/v1/teacher/classes/{assignment}/blocks/open-next")
    return {m["slug"]: m for mod in snapshot["modules"] for ch in mod["chapters"] for m in ch["missions"]}


@needs_db
def test_students_run_only_stored_queries_and_see_python_outputs(env, labdb, monkeypatch, tmp_path):
    clients, engine = env
    missions = published_demo(clients, engine, monkeypatch, tmp_path)
    a, b = clients["a"], clients["b"]
    frais = missions["demo-frais-livraison"]["mission_version_id"]
    assert a.post(f"/api/v1/student/missions/{frais}/runs/requete-actuelle").status_code == 403  # CSRF
    current = post(a, f"/api/v1/student/missions/{frais}/runs/requete-actuelle").json()
    corrected = post(a, f"/api/v1/student/missions/{frais}/runs/requete-corrigee").json()
    assert current["kind"] == "sql" and current["rows"] == [[100]] and corrected["rows"] == [[70]]
    assert post(a, f"/api/v1/student/missions/{frais}/runs/autre").status_code == 404
    # Nothing from the browser is executed: extra fields are not read, unknown run ids are 404.
    assert a.post(f"/api/v1/student/missions/{frais}/runs/requete-actuelle", json={"sql": "DELETE FROM orders"},
                  headers={"X-CSRF-Token": a.cookies["academy_csrf"]}).json()["rows"] == [[100]]
    # Another student outside the class cannot run it.
    assert post(b, f"/api/v1/student/missions/{frais}/runs/requete-actuelle").status_code == 404
    regles = missions["demo-regles-qualite"]["mission_version_id"]
    assert post(a, f"/api/v1/student/missions/{regles}/runs/apercu-pandas").json() == {"kind": "python", "output": "Doublons sur id : 1\n"}
    view = a.get(f"/api/v1/student/missions/{regles}").json()
    assert "output" not in str(view["definition"]["run"])  # the output is revealed on demand only
    # Per-student limit.
    from app import lab_api
    lab_api._window.clear()
    statuses = [post(a, f"/api/v1/student/missions/{frais}/runs/requete-actuelle").status_code for _ in range(lab_api_limit() + 1)]
    assert statuses[-1] == 429


def lab_api_limit() -> int:
    from app.lab_api import RUNS_PER_MINUTE
    return RUNS_PER_MINUTE


@needs_db
def test_sql_challenge_is_graded_by_result_and_refuses_bypasses(env, labdb, monkeypatch, tmp_path):
    clients, engine = env
    missions = published_demo(clients, engine, monkeypatch, tmp_path)
    a = clients["a"]
    challenge = missions["demo-defi-sql"]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{challenge}").json()
    starter = view["definition"]["starter_sql"]
    wrong = post(a, f"/api/v1/student/missions/{challenge}/sql", {"idempotency_key": "sqlch-0001", "sql": starter})
    assert wrong.status_code == 201 and wrong.json()["correct"] is False and wrong.json()["points"] == 0
    assert wrong.json()["result"]["columns"] == ["city", "ca"]
    refused = post(a, f"/api/v1/student/missions/{challenge}/sql", {"idempotency_key": "sqlch-0002", "sql": "WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x"})
    assert refused.status_code == 422 and refused.json()["detail"].startswith("refusée")
    failing = post(a, f"/api/v1/student/missions/{challenge}/sql", {"idempotency_key": "sqlch-0003", "sql": "SELECT nope FROM orders"})
    assert failing.status_code == 400 and "nope" in failing.json()["detail"]
    right = post(a, f"/api/v1/student/missions/{challenge}/sql", {"idempotency_key": "sqlch-0004",
                 "sql": "SELECT c.city, SUM(o.total) AS ca FROM orders o JOIN customers c USING (customer_id) GROUP BY c.city ORDER BY 2 DESC"})
    assert right.status_code == 201 and right.json()["correct"] is True and right.json()["points"] == 5
    assert right.json()["explanation"]  # revealed after success
    replay = post(a, f"/api/v1/student/missions/{challenge}/sql", {"idempotency_key": "sqlch-0004", "sql": "SELECT 1"})
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    with Session(engine) as db:
        attempts = db.scalars(select(MissionAttempt).where(MissionAttempt.mission_version_id == challenge)).all()
        assert len(attempts) == 2 and {item.is_correct for item in attempts} == {True, False}
    course = next(c for c in a.get("/api/v1/student/dashboard").json()["courses"] if c["title"].startswith("Démonstration — cours"))
    assert course["score"]["bonus_points"] == 5 and course["score"]["core_points"] == 0
    # The generic attempt route cannot grade an SQL challenge, and the feature can be switched off.
    assert post(a, f"/api/v1/student/missions/{challenge}/attempts", {"idempotency_key": "sqlch-0005", "answer": {"choice_ids": []}}).status_code == 422
    monkeypatch.setattr(get_settings(), "sql_challenge_enabled", False)
    assert post(a, f"/api/v1/student/missions/{challenge}/sql", {"idempotency_key": "sqlch-0006", "sql": starter}).status_code == 409
    assert "ORDER BY ca DESC" not in a.get(f"/api/v1/student/missions/{challenge}").text


@needs_db
def test_teacher_runs_a_draft_query_of_their_own_course(env, labdb, monkeypatch, tmp_path):
    clients, engine = env
    published_demo(clients, engine, monkeypatch, tmp_path)
    teacher = clients["teacher"]
    course = next(c for c in teacher.get("/api/v1/teacher/courses").json() if c["slug"] == "demo-cours-markdown")
    tree = teacher.get(f"/api/v1/teacher/courses/{course['id']}").json()
    mission = next(m for mod in tree["modules"] for ch in mod["chapters"] for m in ch["missions"] if m["slug"] == "demo-frais-livraison")
    assert post(teacher, f"/api/v1/teacher/missions/{mission['id']}/runs/requete-corrigee").json()["rows"] == [[70]]
    from test_teacher_dashboard import other_teacher
    assert post(other_teacher(engine), f"/api/v1/teacher/missions/{mission['id']}/runs/requete-corrigee").status_code == 404
