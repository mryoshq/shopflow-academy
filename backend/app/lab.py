"""Laboratory database for preconfigured SQL and SQL challenges (sprint 2, part C, ADR-0017).

The lab is a separate PostgreSQL 16 (Compose service ``labdb``) on its own internal
network, with its own volume and credentials. No platform database is reachable from
it, and nothing written by a student ever runs with more than the ``lab_reader`` role:

* ``lab_reader``: SELECT on schema ``lab`` only, ``default_transaction_read_only``,
  ``statement_timeout`` 3 s, bounded ``work_mem`` and ``temp_file_limit``, few connections;
* ``lab_owner``: owns schema ``lab``, loads the course dataset at import (not superuser);
* the superuser of ``labdb`` is used only by ``python -m app.lab init`` (roles, idempotent).

Every query is also run in a READ ONLY transaction that is always rolled back, with at
most 200 rows returned. Student SQL is first checked by :func:`check_challenge_sql`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
import argparse
import json
import re
import time as clock

import sqlglot
from sqlglot import exp

from app.config import get_settings

SCHEMA = "lab"
MAX_ROWS = 200
MAX_COLUMNS = 30
MAX_CELL = 200
TIMEOUT_MS = 3000
MAX_SQL = 4000
DEMO_DATASET = __import__("pathlib").Path(__file__).with_name("lab_demo.sql")

# Functions a student may call in a challenge (sqlglot leaves them "anonymous").
ALLOWED_FUNCTIONS = {
    "ntile", "percent_rank", "cume_dist", "row_number", "rank", "dense_rank", "lag", "lead", "first_value",
    "last_value", "nth_value", "date_trunc", "date_part", "to_char", "string_agg", "array_agg", "round", "trunc",
    "coalesce", "nullif", "greatest", "least", "length", "lower", "upper", "trim", "btrim", "ltrim", "rtrim", "concat",
    "substring", "substr", "replace", "split_part", "abs", "ceil", "ceiling", "floor", "age", "make_date", "to_date",
    "position", "initcap", "left", "right", "lpad", "rpad", "bool_and", "bool_or", "every", "stddev", "variance",
    "median", "percentile_cont", "percentile_disc", "mode", "date", "extract", "sign", "mod", "power", "sqrt",
}
# Never allowed, even if a future sqlglot version types them.
DENIED_FUNCTIONS = re.compile(r"^(pg_|lo_|dblink|set_config|current_setting|query_to_xml|xpath|copy|nextval|setval|currval|"
                              r"txid|version|inet_|has_|current_user|session_user)", re.IGNORECASE)
FORBIDDEN_NODES = (exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Create, exp.Drop, exp.Alter, exp.Command,
                   exp.Into, exp.Lock, exp.Copy, exp.Set, exp.Transaction, exp.Commit, exp.Rollback, exp.Use, exp.Grant)
EXPLAIN = re.compile(r"^\s*explain(\s+\(\s*analyze\s*(true)?\s*\)|\s+analyze)?\s+", re.IGNORECASE)


class LabError(Exception):
    """Execution failed (message safe to show: no credentials, no server path)."""


class LabRefused(Exception):
    """Student SQL refused before execution."""


@dataclass
class Result:
    columns: list[str]
    rows: list[list]
    truncated: bool
    elapsed_ms: int

    def payload(self) -> dict:
        return {"columns": self.columns, "rows": self.rows, "truncated": self.truncated, "elapsed_ms": self.elapsed_ms}


def cell(value: object) -> object:
    """JSON-safe, bounded cell value."""
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if value == value and value not in (float("inf"), float("-inf")) else str(value)
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() and abs(value) < 10**15 else float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    text = str(value)
    return text if len(text) <= MAX_CELL else text[:MAX_CELL - 1] + "…"


def connect(url: str):
    import psycopg

    return psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://"), connect_timeout=3, autocommit=False)


def run_query(sql: str, *, url: str | None = None, timeout_ms: int = TIMEOUT_MS, max_rows: int = MAX_ROWS) -> Result:
    """Run one query with the read-only role, in a READ ONLY transaction always rolled back."""
    import psycopg

    url = url or get_settings().lab_reader_url
    if not url:
        raise LabError("la base de laboratoire n'est pas configurée")
    started = clock.monotonic()
    try:
        with connect(url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION READ ONLY")
                cursor.execute(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
                cursor.execute(f"SET LOCAL search_path = {SCHEMA}")
                cursor.execute(sql.encode("utf-8"))  # type: ignore[arg-type]
                if cursor.description is None:
                    connection.rollback()
                    return Result([], [], False, int((clock.monotonic() - started) * 1000))
                columns = [str(item.name)[:MAX_CELL] for item in cursor.description][:MAX_COLUMNS]
                fetched = cursor.fetchmany(max_rows + 1)
            connection.rollback()
    except psycopg.errors.QueryCanceled as exc:
        raise LabError("délai dépassé (3 secondes au plus)") from exc
    except psycopg.Error as exc:
        message = (exc.diag.message_primary if getattr(exc, "diag", None) and exc.diag.message_primary else str(exc)).splitlines()[0]
        raise LabError(message[:300]) from exc
    rows = [[cell(value) for value in row[:MAX_COLUMNS]] for row in fetched[:max_rows]]
    return Result(columns, rows, len(fetched) > max_rows, int((clock.monotonic() - started) * 1000))


def lab_tables(url: str | None = None) -> set[str]:
    result = run_query(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{SCHEMA}'", url=url)
    return {str(row[0]).lower() for row in result.rows}


def check_challenge_sql(sql: str, tables: set[str]) -> str:
    """Accept one SELECT / WITH … SELECT / EXPLAIN [ANALYZE] SELECT on lab tables only; raise LabRefused otherwise."""
    if not sql.strip():
        raise LabRefused("écrivez une requête")
    if len(sql) > MAX_SQL:
        raise LabRefused("requête trop longue (4000 caractères au plus)")
    if "\x00" in sql:
        raise LabRefused("caractère interdit")
    body = EXPLAIN.sub("", sql, count=1)
    try:
        statements = [item for item in sqlglot.parse(body, read="postgres") if item is not None]
    except sqlglot.errors.SqlglotError as exc:
        raise LabRefused("requête illisible : vérifiez la syntaxe") from exc
    if len(statements) != 1:
        raise LabRefused("une seule requête à la fois")
    tree = statements[0]
    if not isinstance(tree, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
        raise LabRefused("seules les requêtes SELECT (avec WITH ou EXPLAIN) sont permises")
    for node in tree.walk():
        if isinstance(node, FORBIDDEN_NODES):
            raise LabRefused("la requête doit seulement lire des données (SELECT)")
        if isinstance(node, exp.Func):
            name = (node.name if isinstance(node, exp.Anonymous) else node.sql_name()).lower()
            if DENIED_FUNCTIONS.match(name) or (isinstance(node, exp.Anonymous) and name not in ALLOWED_FUNCTIONS):
                raise LabRefused(f"fonction non permise : {name}")
    ctes = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
    for table in tree.find_all(exp.Table):
        name = table.name.lower()
        schema = (table.db or "").lower()
        if table.catalog or schema not in ("", SCHEMA) or (name not in tables and not (schema == "" and name in ctes)):
            raise LabRefused(f"table non permise : {table.sql(dialect='postgres')}")
    return sql


def normalized(result: Result, mode: str) -> object:
    def norm(value: object) -> object:
        if isinstance(value, float):
            return round(value, 6)
        return value

    rows = [tuple(norm(value) for value in row) for row in result.rows]
    if mode == "scalar":
        return rows[0][0] if rows and rows[0] else None
    if mode == "rows_unordered":
        return sorted(rows, key=lambda row: json.dumps(row, sort_keys=True, default=str))
    return rows


def same_result(student: Result, expected: Result, mode: str) -> bool:
    if student.truncated or expected.truncated:
        return False
    if mode != "scalar" and len(student.columns) != len(expected.columns):
        return False
    return normalized(student, mode) == normalized(expected, mode)


# Administration ----------------------------------------------------------------------------

def bootstrap(admin_url: str, owner_password: str, reader_password: str) -> None:
    """Create or update the lab roles and schema (idempotent). Run with the labdb superuser."""
    from psycopg import sql

    with connect(admin_url) as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            database = cursor.execute("SELECT current_database()").fetchone()[0]
            for role, password in (("lab_owner", owner_password), ("lab_reader", reader_password)):
                exists = cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone()
                verb = "ALTER" if exists else "CREATE"
                cursor.execute(sql.SQL(verb + " ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}")
                               .format(sql.Identifier(role), sql.Literal(password)))
            statements = [
                "REVOKE ALL ON DATABASE {db} FROM PUBLIC",
                "GRANT CONNECT ON DATABASE {db} TO lab_owner, lab_reader",
                "GRANT CREATE ON DATABASE {db} TO lab_owner",
                "REVOKE ALL ON SCHEMA public FROM PUBLIC",
                "CREATE SCHEMA IF NOT EXISTS lab AUTHORIZATION lab_owner",
                "ALTER SCHEMA lab OWNER TO lab_owner",
                "GRANT USAGE ON SCHEMA lab TO lab_reader",
                "ALTER DEFAULT PRIVILEGES FOR ROLE lab_owner IN SCHEMA lab GRANT SELECT ON TABLES TO lab_reader",
                "GRANT SELECT ON ALL TABLES IN SCHEMA lab TO lab_reader",
                "ALTER ROLE lab_reader SET default_transaction_read_only = on",
                "ALTER ROLE lab_reader SET statement_timeout = '3s'",
                "ALTER ROLE lab_reader SET idle_in_transaction_session_timeout = '10s'",
                "ALTER ROLE lab_reader SET work_mem = '4MB'",
                "ALTER ROLE lab_reader SET temp_file_limit = '16MB'",
                "ALTER ROLE lab_reader SET search_path = lab",
                "ALTER ROLE lab_reader CONNECTION LIMIT 20",
                "ALTER ROLE lab_owner SET statement_timeout = '60s'",
                "ALTER ROLE lab_owner SET search_path = lab",
                "REVOKE EXECUTE ON FUNCTION pg_sleep(double precision) FROM PUBLIC",
            ]
            for statement in statements:
                cursor.execute(sql.SQL(statement).format(db=sql.Identifier(database)))


def load_dataset(dataset_sql: str, url: str | None = None) -> int:
    """Replace the lab schema content with a dataset (run as lab_owner, one transaction). Returns the table count."""
    import psycopg

    url = url or get_settings().lab_owner_url
    if not url:
        raise LabError("la base de laboratoire n'est pas configurée")
    try:
        with connect(url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL statement_timeout = '60s'")
                cursor.execute("DROP SCHEMA IF EXISTS lab CASCADE")
                cursor.execute("CREATE SCHEMA lab")
                cursor.execute("SET LOCAL search_path = lab")
                cursor.execute(dataset_sql.encode("utf-8"))  # type: ignore[arg-type]
                cursor.execute("GRANT USAGE ON SCHEMA lab TO lab_reader")
                cursor.execute("GRANT SELECT ON ALL TABLES IN SCHEMA lab TO lab_reader")
                count = cursor.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'lab'").fetchone()[0]
            connection.commit()
    except psycopg.Error as exc:
        message = (exc.diag.message_primary if getattr(exc, "diag", None) and exc.diag.message_primary else str(exc)).splitlines()[0]
        raise LabError(f"jeu de données refusé : {message[:300]}") from exc
    return int(count)


def main() -> None:
    import os

    parser = argparse.ArgumentParser(description="Base de laboratoire ShopFlow")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="rôles et schéma (idempotent), puis jeu de démonstration si le schéma est vide")
    args = parser.parse_args()
    if args.command == "init":
        settings = get_settings()
        bootstrap(os.environ["LAB_ADMIN_URL"], os.environ["LAB_OWNER_PASSWORD"], os.environ["LAB_READER_PASSWORD"])
        if not lab_tables(settings.lab_reader_url):
            load_dataset(DEMO_DATASET.read_text(encoding="utf-8"), settings.lab_owner_url)
        print(json.dumps({"lab": "ready", "tables": sorted(lab_tables(settings.lab_reader_url))}))


if __name__ == "__main__":
    main()
