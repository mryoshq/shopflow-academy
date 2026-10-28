"""Deterministic, server-side evaluation of a student answer (no scoring here).

The answer arrives with opaque student IDs (see ``app.projection``); it is mapped
back to the authored IDs of the exact mission version, validated strictly, then
compared with the private answer key. Points, best score and progress are P0-06.
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from app.curriculum_schema import MissionDefinition
from app.projection import opaque_id, reverse_ids

EXPLANATION_AFTER_ATTEMPTS = 3


class AnswerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    choice_ids: list[str] = Field(default_factory=list, max_length=16)
    pairs: dict[str, str] = Field(default_factory=dict)


class InvalidAnswer(ValueError):
    pass


@dataclass(frozen=True)
class Evaluation:
    correct: bool
    raw_answer: dict
    selected_raw: list[str]


def score(definition: MissionDefinition, raw_answer: dict) -> float:
    """Deterministic points for one answer expressed with authored IDs.

    Pure function of (published definition, stored answer): scores can be replayed
    from the attempt log at any time and always give the same result.
    """
    if definition.kind == "lesson":
        return 0.0
    if definition.kind == "sql_challenge":
        # The verdict is computed by the lab runner (part C) and stored with the attempt.
        return float(definition.max_points) if raw_answer.get("result_matches") is True else 0.0
    if definition.kind == "matching":
        pairs = raw_answer.get("pairs") or {}
        good = sum(1 for key, value in definition.correct_pairs.items() if pairs.get(key) == value)
        ratio = good / len(definition.correct_pairs)
    else:
        selected = list(raw_answer.get("choice_ids") or [])
        if definition.kind == "reorder":
            ratio = sum(1 for a, b in zip(selected, definition.correct_ids) if a == b) / len(definition.correct_ids)
        elif definition.kind == "multiple_choice":
            expected = set(definition.correct_ids)
            hits = len(expected & set(selected))
            misses = len(set(selected) - expected)
            ratio = max(0.0, (hits - misses) / len(expected))
        else:
            ratio = 1.0 if selected == definition.correct_ids else 0.0
    if definition.scoring == "all_or_nothing":
        ratio = 1.0 if ratio >= 1.0 else 0.0
    return round(definition.max_points * ratio, 2)


def _unique(values: list[str]) -> bool:
    return len(set(values)) == len(values)


def evaluate(definition: MissionDefinition, version_id: int, answer: AnswerInput) -> Evaluation:
    if definition.kind == "lesson":
        # "J'ai compris": no answer to check, counted in progress, never in the grade.
        if answer.choice_ids or answer.pairs:
            raise InvalidAnswer("a lesson takes no answer")
        return Evaluation(True, {"understood": True}, [])
    if definition.kind == "sql_challenge":
        raise InvalidAnswer("sql challenges are answered through the SQL runner")
    choice_ids = [choice.id for choice in definition.choices]
    choices = reverse_ids(version_id, "c", choice_ids)
    if definition.kind == "matching":
        targets = reverse_ids(version_id, "t", [target.id for target in definition.match_targets])
        if answer.choice_ids or len(answer.pairs) > 16:
            raise InvalidAnswer("matching expects pairs")
        try:
            raw_pairs = {choices[key]: targets[value] for key, value in answer.pairs.items()}
        except KeyError as exc:
            raise InvalidAnswer("unknown choice or target") from exc
        if set(raw_pairs) != set(choice_ids):
            raise InvalidAnswer("every item must be matched")
        correct = raw_pairs == definition.correct_pairs
        return Evaluation(correct, {"pairs": raw_pairs}, sorted(raw_pairs))
    if answer.pairs:
        raise InvalidAnswer("pairs are only for matching")
    try:
        raw = [choices[item] for item in answer.choice_ids]
    except KeyError as exc:
        raise InvalidAnswer("unknown choice") from exc
    if not _unique(raw):
        raise InvalidAnswer("duplicate choice")
    if definition.kind == "reorder":
        if sorted(raw) != sorted(choice_ids):
            raise InvalidAnswer("order must contain every step once")
        correct = raw == definition.correct_ids
    elif definition.kind == "multiple_choice":
        if not raw:
            raise InvalidAnswer("select at least one choice")
        correct = set(raw) == set(definition.correct_ids)
    else:
        if len(raw) != 1:
            raise InvalidAnswer("select exactly one choice")
        correct = raw == definition.correct_ids
    return Evaluation(correct, {"choice_ids": raw}, raw)


def feedback_for(definition: MissionDefinition, version_id: int, evaluation: Evaluation) -> list[dict]:
    """Per-choice feedback for the choices the student selected, keyed by student IDs."""
    if definition.kind == "reorder":
        return []
    items = []
    for raw in evaluation.selected_raw:
        text = definition.feedback.get(raw)
        if text:
            items.append({"choice_id": opaque_id(version_id, "c", raw), "text": text})
    return items


def reveal_explanation(definition: MissionDefinition, correct: bool, attempts_count: int) -> str | None:
    if not definition.explanation:
        return None
    if correct or attempts_count >= EXPLANATION_AFTER_ATTEMPTS:
        return definition.explanation
    return None
