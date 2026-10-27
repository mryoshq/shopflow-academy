"""Strict teacher definitions and intentionally smaller student projections."""

from __future__ import annotations

import json
import re
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MissionKind = Literal[
    "single_choice", "multiple_choice", "true_false", "reorder", "matching",
    "data_interpretation", "scenario_choice", "guided_simulation",
]
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
APPROVED_ACTIONS = {"choose_shipping_rule", "choose_quality_rule", "choose_incident_response"}


def plain(value: str) -> str:
    value = value.strip()
    if not value or "<" in value or ">" in value or "\x00" in value:
        raise ValueError("Nonempty plain text is required")
    return value


class Choice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    label: str = Field(min_length=1, max_length=500)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)


class MissionDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    kind: MissionKind
    scenario: str = Field(min_length=1, max_length=5000)
    instructions: str = Field(min_length=1, max_length=2000)
    objective_ids: list[int] = Field(min_length=1, max_length=20)
    prerequisite_mission_ids: list[int] = Field(default_factory=list, max_length=20)
    choices: list[Choice] = Field(min_length=2, max_length=16)
    correct_ids: list[str] = Field(default_factory=list, max_length=16)
    match_targets: list[Choice] = Field(default_factory=list, max_length=16)
    correct_pairs: dict[str, str] = Field(default_factory=dict)
    action_id: str | None = Field(default=None, max_length=80)
    display_data: dict | None = None
    resources: list[str] = Field(default_factory=list, max_length=10)
    hints: list[str] = Field(default_factory=list, max_length=5)
    feedback: dict[str, str] = Field(default_factory=dict)
    max_points: int = Field(ge=1, le=100)
    estimated_duration_minutes: int = Field(ge=1, le=120)
    bonus: bool = False

    @field_validator("scenario", "instructions")
    @classmethod
    def safe_text(cls, value: str) -> str:
        return plain(value)

    @field_validator("hints")
    @classmethod
    def safe_hints(cls, value: list[str]) -> list[str]:
        return [plain(item) for item in value]

    @field_validator("feedback")
    @classmethod
    def safe_feedback(cls, value: dict[str, str]) -> dict[str, str]:
        return {key: plain(item) for key, item in value.items()}

    @field_validator("resources")
    @classmethod
    def safe_resources(cls, value: list[str]) -> list[str]:
        for url in value:
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc or len(url) > 500:
                raise ValueError("Resources must be bounded HTTPS links")
        return value

    @model_validator(mode="after")
    def consistent(self) -> MissionDefinition:
        ids = [choice.id for choice in self.choices]
        if (len(set(ids)) != len(ids) or len(set(self.objective_ids)) != len(self.objective_ids)
                or len(set(self.prerequisite_mission_ids)) != len(self.prerequisite_mission_ids)):
            raise ValueError("Duplicate choice, objective or prerequisite")
        if len(set(self.correct_ids)) != len(self.correct_ids) or not set(self.correct_ids) <= set(ids):
            raise ValueError("Invalid answer key")
        if self.kind == "matching":
            targets = [choice.id for choice in self.match_targets]
            if len(set(targets)) != len(targets) or set(self.correct_pairs) != set(ids) or set(self.correct_pairs.values()) != set(targets):
                raise ValueError("Matching pairs must cover each choice and target exactly once")
            if self.correct_ids:
                raise ValueError("Matching uses correct_pairs, not correct_ids")
        elif self.kind == "reorder":
            if set(self.correct_ids) != set(ids) or len(self.correct_ids) != len(ids):
                raise ValueError("Reorder answer must contain every choice")
        elif self.kind == "multiple_choice":
            if not self.correct_ids:
                raise ValueError("Multiple choice needs at least one answer")
        elif len(self.correct_ids) != 1:
            raise ValueError("This activity needs exactly one answer")
        if self.kind == "true_false" and set(ids) != {"true", "false"}:
            raise ValueError("True/false must use true and false choice IDs")
        if self.kind == "guided_simulation":
            if self.action_id not in APPROVED_ACTIONS:
                raise ValueError("Unapproved action_id")
        elif self.action_id is not None:
            raise ValueError("action_id is only for guided simulations")
        if self.kind != "matching" and (self.match_targets or self.correct_pairs):
            raise ValueError("Matching fields are only for matching activities")
        if self.display_data is not None and len(json.dumps(self.display_data, ensure_ascii=False)) > 32_000:
            raise ValueError("Display data is too large")
        return self

    def student_projection(self) -> dict:
        return self.model_dump(exclude={"correct_ids", "correct_pairs", "feedback"})
