"""Preconfigured executions and SQL challenges (sprint 2, part C, ADR-0017).

* ``POST /student/missions/{id}/runs/{run_id}``: runs ONLY the query stored in the
  published mission (looked up by id, never text from the browser) on the lab database
  with the read-only role; a Python run returns the output recorded at import time.
* ``POST /student/missions/{id}/sql``: bonus SQL challenge. The student's query is
  checked (one SELECT on lab tables, allowed functions only), run read-only, then its
  result is compared with the result of the private ``expected_sql``. Deterministic,
  stored as an append-only attempt like every other answer.
* ``POST /teacher/missions/{id}/runs/{run_id}``: the owner tries a draft run (preview).
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import timedelta
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_student_csrf, require_teacher_csrf, utcnow
from app.config import get_settings
from app.curriculum import mission_course
from app.curriculum_schema import MissionDefinition, PythonRun, SqlRun
from app.database import get_db
from app.grading import score
from app.lab import LabError, LabRefused, check_challenge_sql, lab_catalog, run_query, same_result
from app.models import MissionAttempt
from app.student import ATTEMPTS_PER_MINUTE, attempt_response, ensure_open, locate, private_definition, statuses

router = APIRouter(prefix="/api/v1", tags=["lab"])
RUNS_PER_MINUTE = 30
_window: dict[int, deque] = defaultdict(deque)
_lock = threading.Lock()


def throttle(user_id: int, limit: int = RUNS_PER_MINUTE) -> None:
    """Per-student limit on lab executions (in memory: one backend process)."""
    now = time.monotonic()
    with _lock:
        recent = _window[user_id]
        while recent and now - recent[0] > 60:
            recent.popleft()
        if len(recent) >= limit:
            raise HTTPException(status_code=429, detail="trop d'exécutions : patientez une minute")
        recent.append(now)


def execute_run(item: SqlRun | PythonRun) -> dict:
    if isinstance(item, PythonRun):
        if item.output is None:
            raise HTTPException(status_code=409, detail="résultat pas encore enregistré pour cet extrait")
        return {"kind": "python", "output": item.output}
    try:
        return {"kind": "sql", **run_query(item.sql).payload()}
    except LabError as exc:
        status = 504 if str(exc).startswith("délai dépassé") else 503 if "configurée" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc


def find_run(definition: MissionDefinition, run_id: str) -> SqlRun | PythonRun:
    item = next((run for run in definition.run if run.id == run_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="run not found")
    return item


@router.post("/student/missions/{version_id}/runs/{run_id}")
def student_run(version_id: int, run_id: str, response: Response, auth: AuthContext = Depends(require_student_csrf),
                db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    _, _, _, missions = locate(db, auth.user.id, version_id)
    if statuses(db, auth.user.id, missions)[version_id]["status"] == "locked":
        raise HTTPException(status_code=409, detail="mission locked")
    item = find_run(private_definition(db, version_id), run_id)
    throttle(auth.user.id)
    return execute_run(item)


@router.post("/teacher/missions/{mission_id}/runs/{run_id}")
def teacher_run(mission_id: int, run_id: str, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    mission, _ = mission_course(db, mission_id, auth)
    if not mission.draft_definition:
        raise HTTPException(status_code=404, detail="run not found")
    item = find_run(MissionDefinition.model_validate(mission.draft_definition), run_id)
    throttle(auth.user.id)
    return execute_run(item)


class SqlAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    sql: str = Field(min_length=1, max_length=4000)


@router.post("/student/missions/{version_id}/sql", status_code=201)
def sql_challenge(version_id: int, payload: SqlAnswer, response: Response, auth: AuthContext = Depends(require_student_csrf),
                  db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    release, _, _, missions = locate(db, auth.user.id, version_id)
    definition = private_definition(db, version_id)
    if definition.kind != "sql_challenge":
        raise HTTPException(status_code=422, detail="not an SQL challenge")
    if not get_settings().sql_challenge_enabled:
        raise HTTPException(status_code=409, detail="défi SQL désactivé")
    existing = db.scalar(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id,
                                                      MissionAttempt.idempotency_key == payload.idempotency_key))
    if existing is not None:
        if existing.mission_version_id != version_id:
            raise HTTPException(status_code=409, detail="idempotency key already used")
        response.status_code = 200
        return {**attempt_response(db, existing, definition, replayed=True), "result": None}
    ensure_open(db, auth.user.id, release, missions, version_id)
    recent = db.scalar(select(func.count(MissionAttempt.id)).where(
        MissionAttempt.user_id == auth.user.id, MissionAttempt.created_at >= utcnow() - timedelta(minutes=1))) or 0
    if recent >= ATTEMPTS_PER_MINUTE:
        raise HTTPException(status_code=429, detail="too many attempts")
    throttle(auth.user.id)
    try:
        check_challenge_sql(payload.sql, *reversed(lab_catalog()))
        mine = run_query(payload.sql)
        expected = run_query(definition.expected_sql)
    except LabRefused as exc:
        raise HTTPException(status_code=422, detail=f"refusée : {exc}") from exc
    except LabError as exc:
        status = 504 if str(exc).startswith("délai dépassé") else 503 if "configurée" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    matches = same_result(mine, expected, definition.compare)
    raw = {"sql": payload.sql, "result_matches": matches}
    attempt = MissionAttempt(user_id=auth.user.id, mission_version_id=version_id, course_release_id=release.id,
                             idempotency_key=payload.idempotency_key, answer=raw, is_correct=matches, points=score(definition, raw))
    from app.announcements import record_attempt
    from app.live import push_after_commit

    try:
        announcements = record_attempt(db, release, attempt)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(MissionAttempt).where(MissionAttempt.user_id == auth.user.id,
                                                          MissionAttempt.idempotency_key == payload.idempotency_key))
        if existing is None or existing.mission_version_id != version_id:
            raise HTTPException(status_code=409, detail="idempotency key already used") from None
        response.status_code = 200
        return {**attempt_response(db, existing, definition, replayed=True), "result": None}
    if announcements:
        push_after_commit(db, announcements)
    return {**attempt_response(db, attempt, definition, replayed=False), "result": mine.payload()}
