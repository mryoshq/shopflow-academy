"""Scores and progress derived from the append-only attempt log (P0-06, ADR-0012).

Nothing is cached: best score, completion and course totals are recomputed from
``mission_attempts`` on every read, so a duplicate or concurrent request can never
count twice and everything survives a restart.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.curriculum_schema import UNGRADED_KINDS
from app.curriculum_schema import MissionDefinition
from app.grading import score
from app.models import Chapter, CourseModule, Mission, MissionAttempt, MissionVersion


@dataclass
class MissionScore:
    best: float
    possible: int
    bonus: bool
    attempts: int
    completed: bool
    lesson: bool = False


def attempt_points(attempt: MissionAttempt, definition: MissionDefinition) -> float:
    if attempt.points is not None:
        return float(attempt.points)
    # Attempts recorded before P0-06 were all-or-nothing.
    return float(definition.max_points) if attempt.is_correct else 0.0


def decayed(points: float, percent: int | None) -> float:
    """Points of one attempt after the decreasing rule (ADR-0027); percent None = 100 %."""
    return points if percent is None else round(points * percent / 100, 2)


def definitions(db: Session, version_ids: list[int]) -> dict[int, MissionDefinition]:
    if not version_ids:
        return {}
    rows = db.scalars(select(MissionVersion).where(MissionVersion.id.in_(version_ids))).all()
    return {row.id: MissionDefinition.model_validate(row.definition_private) for row in rows}


def equivalents(db: Session, version_ids: list[int]) -> dict[int, set[int]]:
    """Earlier published versions that count for each version (republication of the same mission).

    Same mission = same mission row, or, for a mission re-created at import, same slug at the
    same place (module and block positions) in the same course: a slug reused in another block
    is another mission. A lesson stays read when it was validated as a lesson in any version (a
    graded version never makes it read); a graded mission keeps its success only when its private
    definition is identical. Read-time only: the stored attempts are never copied or changed.
    """
    if not version_ids:
        return {}
    query = (select(MissionVersion.id, MissionVersion.mission_id, MissionVersion.definition_private, Mission.slug,
                    CourseModule.course_id, CourseModule.sort_order.label("module_order"), Chapter.sort_order.label("chapter_order"))
             .join(Mission, Mission.id == MissionVersion.mission_id).join(Chapter, Chapter.id == Mission.chapter_id)
             .join(CourseModule, CourseModule.id == Chapter.module_id))
    targets = db.execute(query.where(MissionVersion.id.in_(version_ids))).all()
    slugs = {row.slug for row in targets}
    family: dict[tuple, list] = {}
    for row in db.execute(query.where(Mission.slug.in_(slugs))).all() if slugs else []:
        family.setdefault((row.course_id, row.slug), []).append(row)
    result = {vid: {vid} for vid in version_ids}
    for row in targets:
        kind = (row.definition_private or {}).get("kind")
        for other in family.get((row.course_id, row.slug), []):
            same_mission = other.mission_id == row.mission_id or (other.module_order, other.chapter_order) == (row.module_order, row.chapter_order)
            if not same_mission:
                continue
            if kind in UNGRADED_KINDS and (other.definition_private or {}).get("kind") == kind:
                result[row.id].add(other.id)
            elif kind not in UNGRADED_KINDS and other.definition_private == row.definition_private:
                result[row.id].add(other.id)
    return result


def attempts_for(db: Session, user_ids: list[int], version_ids: list[int]) -> list[tuple[MissionAttempt, int]]:
    """Attempts of these users counted for each version (its own and its equivalents): (attempt, version).

    One attempt counts for one mission only: an old version claimed by several current versions goes
    to the one of the same mission row, or to none when that is ambiguous.
    """
    groups = equivalents(db, version_ids)
    owners: dict[int, list[int]] = {}
    for target, members in groups.items():
        for member in members:
            owners.setdefault(member, []).append(target)
    if not owners or not user_ids:
        return []
    shared = [member for member, targets in owners.items() if len(targets) > 1]
    if shared:
        mission_of = dict(db.execute(select(MissionVersion.id, MissionVersion.mission_id)
                                     .where(MissionVersion.id.in_(set(shared) | {t for m in shared for t in owners[m]}))).all())
        for member in shared:
            own = [t for t in owners[member] if t == member] or [t for t in owners[member] if mission_of.get(t) == mission_of.get(member)]
            owners[member] = own[:1]
    rows = db.scalars(select(MissionAttempt).where(MissionAttempt.user_id.in_(user_ids),
                                                   MissionAttempt.mission_version_id.in_(list(owners))).order_by(MissionAttempt.id)).all()
    return [(attempt, target) for attempt in rows for target in owners[attempt.mission_version_id]]


def mission_scores(db: Session, user_id: int, version_ids: list[int]) -> dict[int, MissionScore]:
    defs = definitions(db, version_ids)
    result = {vid: MissionScore(0.0, d.max_points, d.bonus, 0, False, d.kind in UNGRADED_KINDS) for vid, d in defs.items()}
    if not defs:
        return result
    for attempt, vid in attempts_for(db, [user_id], list(defs)):
        item = result[vid]
        item.attempts += 1
        # A lesson never earns points, whatever its earlier versions were.
        if not item.lesson:
            item.best = max(item.best, attempt_points(attempt, defs[vid]))
        item.completed = item.completed or attempt.is_correct
    return result


def course_score(scores: dict[int, MissionScore]) -> dict:
    core = [item for item in scores.values() if not item.bonus]
    bonus = [item for item in scores.values() if item.bonus]
    graded = [item for item in scores.values() if not item.lesson]
    lessons = [item for item in scores.values() if item.lesson]
    return {
        "core_points": round(sum(item.best for item in core), 2), "core_possible": sum(item.possible for item in core),
        "bonus_points": round(sum(item.best for item in bonus), 2), "bonus_possible": sum(item.possible for item in bonus),
        # Missions only; lessons are counted apart (« leçons lues x/y »).
        "completed": sum(1 for item in graded if item.completed), "total": len(graded),
        "lessons_read": sum(1 for item in lessons if item.completed), "lessons_total": len(lessons),
    }


def block_done(scores: dict[int, MissionScore], version_ids: list[int]) -> bool:
    """A block is done when every graded mission (not bonus, not lesson) is solved; lessons only if it has none."""
    graded = [scores[vid] for vid in version_ids if vid in scores and not scores[vid].bonus and not scores[vid].lesson]
    if graded:
        return all(item.completed for item in graded)
    lessons = [scores[vid] for vid in version_ids if vid in scores and scores[vid].lesson]
    return bool(lessons) and all(item.completed for item in lessons)


def replay(db: Session) -> list[int]:
    """Re-score every stored attempt; return IDs whose stored points differ (should be empty)."""
    mismatches = []
    cache: dict[int, MissionDefinition] = {}
    for attempt in db.scalars(select(MissionAttempt).where(MissionAttempt.points.is_not(None))):
        definition = cache.get(attempt.mission_version_id)
        if definition is None:
            definition = MissionDefinition.model_validate(db.get(MissionVersion, attempt.mission_version_id).definition_private)
            cache[attempt.mission_version_id] = definition
        if round(decayed(score(definition, attempt.answer), attempt.percent), 2) != round(float(attempt.points), 2):
            mismatches.append(attempt.id)
    return mismatches
