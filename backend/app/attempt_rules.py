"""Rules against random clicking, per course (sprint 2, part L, ADR-0027).

Owner's decision: some students click without reading. Four measures, each off by default
and turned on by the teacher at a moment of their choice:

* decreasing points for main missions (never bonuses): each attempt is scored with the
  percentage in force at its rank (100, 70, 50, then 30 %), stored with the attempt; the best
  attempt still counts. Not retroactive: only attempts created after the recorded activation
  date are concerned, and their rank is counted from that date;
* a pause after a wrong answer (10, 20, then 30 s at most), refused by the server (429);
* a minimum reading time for lessons (words / 200 per minute, between 10 and 60 s);
* marking « rapide » attempts (< 5 s after opening the mission, or 3 attempts within 30 s),
  shown to the teacher only. No automatic sanction.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import math
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.curriculum_schema import UNGRADED_KINDS
from app.auth import AuthContext, aware, require_teacher, require_teacher_csrf, utcnow
from app.curriculum_schema import HTML_TAG, MissionDefinition
from app.database import get_db
from app.models import AuditEvent, Course, CourseRelease, MissionAttempt, MissionOpening

router = APIRouter(prefix="/api/v1/teacher", tags=["attempt-rules"])

FAST_AFTER_OPENING = timedelta(seconds=5)
FAST_WINDOW = timedelta(seconds=30)
FAST_COUNT = 3
DEFAULT_ANNOUNCEMENT = "Nouvelle règle : chaque essai compte. Prenez le temps de lire, les points diminuent à chaque nouvel essai."


class Rules(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decay_enabled: bool = False
    decay_steps: list[int] = Field(default_factory=lambda: [100, 70, 50], min_length=1, max_length=6)
    decay_floor: int = Field(default=30, ge=0, le=100)
    pause_enabled: bool = False
    pause_seconds: list[int] = Field(default_factory=lambda: [10, 20, 30], min_length=1, max_length=6)
    reading_enabled: bool = False
    reading_wpm: int = Field(default=200, ge=60, le=600)
    reading_min: int = Field(default=10, ge=0, le=120)
    reading_max: int = Field(default=60, ge=0, le=120)
    fast_enabled: bool = True
    announcement_enabled: bool = True
    announcement: str = Field(default=DEFAULT_ANNOUNCEMENT, max_length=280)
    # Set by the server, never by the client.
    decay_since: str | None = None
    pause_since: str | None = None
    announced_since: str | None = None

    @field_validator("decay_steps")
    @classmethod
    def steps(cls, value: list[int]) -> list[int]:
        if any(step < 0 or step > 100 for step in value) or value != sorted(value, reverse=True):
            raise ValueError("Percentages between 0 and 100, never increasing")
        return value

    @field_validator("pause_seconds")
    @classmethod
    def pauses(cls, value: list[int]) -> list[int]:
        if any(seconds < 0 or seconds > 30 for seconds in value):
            raise ValueError("Pauses between 0 and 30 seconds")
        return value

    @field_validator("announcement")
    @classmethod
    def plain_announcement(cls, value: str) -> str:
        value = value.strip()
        if HTML_TAG.search(value) or re.search(r"[\x00-\x08\x0b-\x1f\x7f]", value):
            raise ValueError("Announcement: plain text only")
        return value or DEFAULT_ANNOUNCEMENT

    @model_validator(mode="after")
    def coherent(self) -> Rules:
        if self.decay_floor > self.decay_steps[-1]:
            raise ValueError("The floor cannot exceed the last percentage")
        if self.reading_min > self.reading_max:
            raise ValueError("Minimum reading time above the maximum")
        return self


class RulesInput(Rules):
    """What the teacher sends: everything but the server-set dates."""

    @model_validator(mode="after")
    def no_dates(self) -> RulesInput:
        if self.decay_since or self.pause_since or self.announced_since:
            raise ValueError("Activation dates are set by the server")
        return self


def rules_of(course: Course | None) -> Rules:
    try:
        return Rules.model_validate(course.attempt_rules or {}) if course is not None else Rules()
    except ValueError:  # pragma: no cover - stored rules are validated on write
        return Rules()


def rules_for_release(db: Session, release: CourseRelease) -> Rules:
    return rules_of(db.get(Course, release.course_id))


def since(value: str | None) -> datetime | None:
    return aware(datetime.fromisoformat(value)) if value else None


def percent_for(rules: Rules, number: int) -> int:
    return rules.decay_steps[number - 1] if number <= len(rules.decay_steps) else rules.decay_floor


def decays(rules: Rules, definition: MissionDefinition) -> bool:
    return rules.decay_enabled and rules.decay_since is not None and not definition.bonus and definition.kind not in UNGRADED_KINDS


def attempts_since(db: Session, user_id: int, version_id: int, start: datetime | None) -> list[MissionAttempt]:
    query = select(MissionAttempt).where(MissionAttempt.user_id == user_id, MissionAttempt.mission_version_id == version_id)
    if start is not None:
        query = query.where(MissionAttempt.created_at >= start)
    return list(db.scalars(query.order_by(MissionAttempt.id)).all())


def pause_remaining(db: Session, rules: Rules, user_id: int, version_id: int, now: datetime) -> int:
    """Seconds left before the next attempt is accepted (0 = free). Never after a right answer."""
    start = since(rules.pause_since)
    if not rules.pause_enabled or start is None:
        return 0
    attempts = attempts_since(db, user_id, version_id, start)
    if not attempts or attempts[-1].is_correct:
        return 0
    errors = 0
    for attempt in reversed(attempts):
        if attempt.is_correct:
            break
        errors += 1
    wait = rules.pause_seconds[min(errors, len(rules.pause_seconds)) - 1]
    left = aware(attempts[-1].created_at) + timedelta(seconds=wait) - aware(now)
    return max(0, math.ceil(left.total_seconds()))


def next_attempt(db: Session, rules: Rules, definition: MissionDefinition, user_id: int, version_id: int) -> tuple[int | None, int | None]:
    """(rank of the next attempt, percentage) when decreasing points apply, else (None, None)."""
    if not decays(rules, definition):
        return None, None
    number = len(attempts_since(db, user_id, version_id, since(rules.decay_since))) + 1
    return number, percent_for(rules, number)


def lesson_words(definition: MissionDefinition) -> int:
    parts = [definition.body, definition.objective, definition.hook, definition.example, definition.practice]
    parts += [f"{term.term} {term.definition}" for term in definition.key_terms]
    if definition.display_data is not None:
        caption_texts = [step.caption for step in getattr(definition.display_data, "steps", []) or [] if hasattr(step, "caption")]
        parts += caption_texts
    return len(" ".join(parts).split())


def reading_seconds(rules: Rules, definition: MissionDefinition) -> int | None:
    if not rules.reading_enabled or definition.kind != "lesson":
        return None
    raw = math.ceil(lesson_words(definition) / rules.reading_wpm * 60)
    return max(rules.reading_min, min(rules.reading_max, raw))


def record_opening(db: Session, user_id: int, version_id: int, now: datetime) -> None:
    row = db.scalar(select(MissionOpening).where(MissionOpening.user_id == user_id, MissionOpening.mission_version_id == version_id))
    if row is None:
        db.add(MissionOpening(user_id=user_id, mission_version_id=version_id, opened_at=now))
    else:
        row.opened_at = now
    try:
        db.commit()
    except IntegrityError:  # two tabs opening at once
        db.rollback()


def opened_at(db: Session, user_id: int, version_id: int) -> datetime | None:
    value = db.scalar(select(MissionOpening.opened_at).where(MissionOpening.user_id == user_id, MissionOpening.mission_version_id == version_id))
    return aware(value) if value else None


def reading_remaining(db: Session, rules: Rules, definition: MissionDefinition, user_id: int, version_id: int, now: datetime) -> int:
    required = reading_seconds(rules, definition)
    if not required:
        return 0
    start = opened_at(db, user_id, version_id)
    if start is None:
        return required
    return max(0, math.ceil((start + timedelta(seconds=required) - aware(now)).total_seconds()))


def is_fast(db: Session, rules: Rules, user_id: int, version_id: int, now: datetime) -> bool:
    if not rules.fast_enabled:
        return False
    start = opened_at(db, user_id, version_id)
    if start is not None and aware(now) - start < FAST_AFTER_OPENING:
        return True
    recent = [a for a in attempts_since(db, user_id, version_id, aware(now) - FAST_WINDOW)]
    return len(recent) + 1 >= FAST_COUNT


def student_state(db: Session, rules: Rules, definition: MissionDefinition, user_id: int, version_id: int, now: datetime) -> dict:
    """What the player shows before answering: « Essai 2 : jusqu'à 70 % des points », countdowns."""
    number, percent = next_attempt(db, rules, definition, user_id, version_id)
    return {"next_attempt": number, "next_percent": percent,
            "pause_remaining": pause_remaining(db, rules, user_id, version_id, now) if definition.kind not in UNGRADED_KINDS else 0,
            "reading_seconds": reading_seconds(rules, definition),
            "reading_remaining": reading_remaining(db, rules, definition, user_id, version_id, now)}


def notice(rules: Rules) -> dict | None:
    """Announcement shown to students once the rules are on."""
    if rules.announcement_enabled and rules.announced_since and (rules.decay_enabled or rules.pause_enabled or rules.reading_enabled):
        return {"text": rules.announcement, "since": rules.announced_since}
    return None


# Teacher settings ----------------------------------------------------------------------

def owned_course(db: Session, course_id: int, auth: AuthContext) -> Course:
    course = db.get(Course, course_id)
    if course is None or course.created_by != auth.user.id:
        raise HTTPException(status_code=404, detail="course not found")
    return course


@router.get("/courses/{course_id}/attempt-rules")
def get_rules(course_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {**rules_of(owned_course(db, course_id, auth)).model_dump(), "defaults": Rules().model_dump()}


@router.put("/courses/{course_id}/attempt-rules")
def put_rules(course_id: int, payload: RulesInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    course = owned_course(db, course_id, auth)
    if course.status == "archived":
        raise HTTPException(status_code=409, detail="course archived")
    before = rules_of(course)
    now = utcnow().isoformat()
    after = Rules.model_validate({**payload.model_dump(exclude={"decay_since", "pause_since", "announced_since"}),
                                  "decay_since": before.decay_since, "pause_since": before.pause_since,
                                  "announced_since": before.announced_since})
    # Each activation is dated: decreasing points never apply to earlier attempts.
    if after.decay_enabled and not before.decay_enabled:
        after.decay_since = now
    if after.pause_enabled and not before.pause_enabled:
        after.pause_since = now
    turned_on = any(getattr(after, key) and not getattr(before, key) for key in ("decay_enabled", "pause_enabled", "reading_enabled"))
    if turned_on or (after.announcement != before.announcement and after.announcement_enabled):
        after.announced_since = now
    changes = {key: value for key, value in after.model_dump().items() if before.model_dump().get(key) != value}
    course.attempt_rules = after.model_dump()
    db.add(AuditEvent(actor_id=auth.user.id, action="course.attempt_rules", resource_type="course", resource_id=course.id,
                      details=changes))
    db.commit()
    return {**after.model_dump(), "defaults": Rules().model_dump()}
