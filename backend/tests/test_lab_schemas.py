"""ADR-0032: several course schemas (shopflow, support, perf) in the lab database, files in name order."""

import pytest

from app import lab
from app.course_md import compile_files, executions
from app.lab import LabError, LabRefused, check_challenge_sql, run_query
from test_course_md import HEADER, module
from test_lab import ADMIN, labdb, needs_db  # noqa: F401  (fixture reuse)

KIT = [
    ("datasets/01-shopflow.sql", """
CREATE SCHEMA IF NOT EXISTS shopflow;
CREATE TABLE shopflow.orders (order_id text PRIMARY KEY, city text, total numeric);
INSERT INTO shopflow.orders VALUES ('C-1', 'Tanzar', 120), ('C-2', 'Fès', 80);
"""),
    ("datasets/02-support.sql", """
CREATE SCHEMA support;
CREATE TABLE support.tickets (ticket_id int PRIMARY KEY, order_id text, status text);
INSERT INTO support.tickets VALUES (1, 'C-1', 'ouvert'), (2, 'C-2', 'clos');
"""),
    ("datasets/03-perf.sql", """
CREATE SCHEMA perf;
CREATE TABLE perf.events (id int, day date, amount numeric) PARTITION BY RANGE (day);
CREATE TABLE perf.events_2026_10 PARTITION OF perf.events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
INSERT INTO perf.events SELECT g, DATE '2026-10-01' + (g % 28), g FROM generate_series(1, 2000) g;
CREATE INDEX events_day ON perf.events (day);
ANALYZE perf.events;
"""),
]
SCHEMAS = ["shopflow", "support", "perf"]


def test_validator_accepts_declared_schemas_and_refuses_the_others():
    tables = {"shopflow.orders", "support.tickets", "perf.events", "lab.orders"}
    path = ["shopflow", "support", "perf", "lab"]
    for sql in ("SELECT * FROM orders o JOIN support.tickets t USING (order_id)",
                "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM perf.events WHERE day = DATE '2026-10-03'",
                "EXPLAIN (ANALYZE true, BUFFERS on, COSTS off) SELECT count(*) FROM events"):
        assert check_challenge_sql(sql, tables, path) == sql
    for sql in ("SELECT * FROM public.secret", "SELECT * FROM pg_catalog.pg_authid", "SELECT * FROM tickets_archive",
                "CREATE INDEX x ON perf.events (amount)", "ALTER TABLE perf.events DETACH PARTITION perf.events_2026_10",
                "EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1", "SELECT * FROM support.tickets; DROP SCHEMA support CASCADE"):
        with pytest.raises(LabRefused):
            check_challenge_sql(sql, tables, path)
    # A bare table only resolves through the search path.
    with pytest.raises(LabRefused):
        check_challenge_sql("SELECT * FROM tickets", tables, ["shopflow", "lab"])


def test_compiler_reads_lab_schemas_and_sql_files_in_name_order():
    header = HEADER.replace("---\n", "---\nlab_schemas: [shopflow, support, perf]\n", 1)
    compiled = compile_files({"00-cours.md": header, "10-m.md": module("")},
                             dataset={"datasets/02-support.sql": "b", "datasets/01-shopflow.sql": "a", "datasets/notes.txt": "x"})
    assert compiled.lab_schemas == SCHEMAS
    assert [name for name, _ in compiled.datasets] == ["datasets/01-shopflow.sql", "datasets/02-support.sql"]
    assert executions(compiled)["lab_schemas"] == SCHEMAS
    for bad in ("[public]", "[lab]", "[pg_temp]", "[Shopflow]", "shopflow"):
        broken = compile_files({"00-cours.md": HEADER.replace("---\n", f"---\nlab_schemas: {bad}\n", 1), "10-m.md": module("")})
        assert any("lab_schemas" in issue.message for issue in broken.errors), bad


@needs_db
def test_kit_schemas_are_readable_partitioned_and_explained(labdb):
    assert lab.load_dataset(KIT, schemas=SCHEMAS) == 4  # orders, tickets, events and its partition (lab stays empty)
    path, tables = lab.lab_catalog()
    assert path == ["lab", "shopflow", "support", "perf"]
    assert {"shopflow.orders", "support.tickets", "perf.events"} <= tables
    assert run_query("SELECT o.city, t.status FROM orders o JOIN support.tickets t USING (order_id) ORDER BY 1").rows == [["Fès", "clos"], ["Tanzar", "ouvert"]]
    plan = run_query("EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM perf.events WHERE day = DATE '2026-10-03'")
    text = "\n".join(str(row[0]) for row in plan.rows)
    assert "Buffers" in text and "events_2026_10" in text
    # The reader still cannot create an index, change a partition or write.
    for sql in ("CREATE INDEX x ON perf.events (amount)", "ALTER TABLE perf.events DETACH PARTITION perf.events_2026_10",
                "DELETE FROM support.tickets", "CREATE SCHEMA evil"):
        with pytest.raises(LabError):
            run_query(sql)


@needs_db
def test_course_tables_in_lab_keep_their_meaning_when_a_kit_reuses_their_names(labdb):
    """A kit table of the same name (shopflow.orders) never hides the course table (lab.orders): lab comes first."""
    course = ("CREATE TABLE orders (order_id text PRIMARY KEY, amount numeric);\n"
              "INSERT INTO orders VALUES ('A-1', 70), ('A-2', 30);\n")
    lab.load_dataset([("datasets/00-course.sql", course), *KIT], schemas=SCHEMAS)
    assert run_query("SELECT sum(amount) FROM orders").rows[0][0] == 100
    assert run_query("SELECT count(*) FROM shopflow.orders").rows[0][0] == 2
    assert run_query("SELECT count(*) FROM tickets").rows[0][0] == 2  # absent from lab: found in a declared schema


@needs_db
def test_undeclared_schema_refuses_the_dataset_and_reload_replaces_everything(labdb):
    with pytest.raises(LabError, match="schéma non déclaré.*support"):
        lab.load_dataset(KIT, schemas=["shopflow", "perf"])
    lab.load_dataset(KIT, schemas=SCHEMAS)
    lab.load_dataset(lab.DEMO_DATASET.read_text(encoding="utf-8"))  # back to the demonstration: kit schemas dropped
    path, tables = lab.lab_catalog()
    assert path == ["lab"] and not any(name.startswith(("shopflow.", "support.", "perf.")) for name in tables)
    with pytest.raises(LabError):
        run_query("SELECT * FROM shopflow.orders")
