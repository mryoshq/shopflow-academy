"""Scores and progress derived from the append-only attempt log (P0-06, ADR-0012).

Nothing is cached: best score, completion and course totals are recomputed from
``mission_attempts`` on every read, so a duplicate or concurrent request can never
count twice and everything survives a restart.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.curriculum_schema import MissionDefinition
from app.grading import score
from app.models import MissionAttempt, MissionVersion


@dataclass
class MissionScore:
    best: float
    possible: int
    bonus: bool
    attempts: int
    completed: bool


def attempt_points(attempt: MissionAttempt, definition: MissionDefinition) -> float:
    if attempt.points is not None:
        return float(attempt.points)
    # Attempts recorded before P0-06 were all-or-nothing.
    return float(definition.max_points) if attempt.is_correct else 0.0


def definitions(db: Session, version_ids: list[int]) -> dict[int, MissionDefinition]:
    if not version_ids:
        return {}
    rows = db.scalars(select(MissionVersion).where(MissionVersion.id.in_(version_ids))).all()
    return {row.id: MissionDefinition.model_validate(row.definition_private) for row in rows}


def mission_scores(db: Session, user_id: int, version_ids: list[int]) -> dict[int, MissionScore]:
    defs = definitions(db, version_ids)
    result = {vid: MissionScore(0.0, d.max_points, d.bonus, 0, False) for vid, d in defs.items()}
    if not defs:
        return result
    attempts = db.scalars(select(MissionAttempt).where(MissionAttempt.user_id == user_id,
                                                       MissionAttempt.mission_version_id.in_(list(defs)))).all()
    for attempt in attempts:
        item = result[attempt.mission_version_id]
        item.attempts += 1
        item.best = max(item.best, attempt_points(attempt, defs[attempt.mission_version_id]))
        item.completed = item.completed or attempt.is_correct
    return result


def course_score(scores: dict[int, MissionScore]) -> dict:
    core = [item for item in scores.values() if not item.bonus]
    bonus = [item for item in scores.values() if item.bonus]
    return {
        "core_points": round(sum(item.best for item in core), 2), "core_possible": sum(item.possible for item in core),
        "bonus_points": round(sum(item.best for item in bonus), 2), "bonus_possible": sum(item.possible for item in bonus),
        "completed": sum(1 for item in scores.values() if item.completed), "total": len(scores),
    }


def replay(db: Session) -> list[int]:
    """Re-score every stored attempt; return IDs whose stored points differ (should be empty)."""
    mismatches = []
    cache: dict[int, MissionDefinition] = {}
    for attempt in db.scalars(select(MissionAttempt).where(MissionAttempt.points.is_not(None))):
        definition = cache.get(attempt.mission_version_id)
        if definition is None:
            definition = MissionDefinition.model_validate(db.get(MissionVersion, attempt.mission_version_id).definition_private)
            cache[attempt.mission_version_id] = definition
        if round(score(definition, attempt.answer), 2) != round(float(attempt.points), 2):
            mismatches.append(attempt.id)
    return mismatches
