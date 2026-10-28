"""Strict teacher definitions and intentionally smaller student projections."""

from __future__ import annotations

import json
from math import isfinite
import re
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MissionKind = Literal[
    "single_choice", "multiple_choice", "true_false", "reorder", "matching",
    "data_interpretation", "scenario_choice", "guided_simulation", "lesson", "sql_challenge",
]
# Kinds answered by choosing among propositions (choices, answer key, feedback).
CHOICE_KINDS = {"single_choice", "multiple_choice", "true_false", "reorder", "matching",
                "data_interpretation", "scenario_choice", "guided_simulation"}
MAX_CODE_LINES = 60
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
APPROVED_ACTIONS = {"choose_shipping_rule", "choose_quality_rule", "choose_incident_response"}
HTML_TAG = re.compile(r"</?[A-Za-z][^>]{0,500}>|<!--|<!DOCTYPE|<\?", re.IGNORECASE)
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def plain(value: str) -> str:
    value = value.strip()
    if not value or HTML_TAG.search(value) or CONTROL.search(value):
        raise ValueError("Nonempty plain text is required")
    return value


def code_text(value: str, limit: int = 6000) -> str:
    """Source code shown as text (never as HTML): ``<`` and ``>`` are fine, control characters are not."""
    value = value.replace("\r\n", "\n").rstrip()
    if not value.strip() or CONTROL.search(value.replace("\t", " ")):
        raise ValueError("Nonempty code without control characters is required")
    if len(value) > limit or len(value.splitlines()) > MAX_CODE_LINES:
        raise ValueError(f"Code is limited to {MAX_CODE_LINES} lines")
    return value


Cell = str | int | float | bool | None


class TableDisplay(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["table"]
    title: str = Field(default="", max_length=200)
    columns: list[str] = Field(min_length=1, max_length=12)
    rows: list[list[Cell]] = Field(min_length=1, max_length=100)

    @field_validator("columns")
    @classmethod
    def safe_columns(cls, value: list[str]) -> list[str]:
        return [plain(column) for column in value]

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @model_validator(mode="after")
    def consistent(self) -> TableDisplay:
        for row in self.rows:
            if len(row) != len(self.columns):
                raise ValueError("Every table row must match the column count")
            for cell in row:
                if isinstance(cell, str):
                    if len(cell) > 500:
                        raise ValueError("Table cell too long")
                    plain(cell)
                if isinstance(cell, float) and not isfinite(cell):
                    raise ValueError("Table values must be finite")
        return self


class BarChartDisplay(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["bar_chart"]
    title: str = Field(min_length=1, max_length=200)
    labels: list[str] = Field(min_length=1, max_length=20)
    values: list[float] = Field(min_length=1, max_length=20)
    unit: str = Field(default="", max_length=30)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)

    @field_validator("labels")
    @classmethod
    def safe_labels(cls, value: list[str]) -> list[str]:
        return [plain(label) for label in value]

    @field_validator("unit")
    @classmethod
    def safe_unit(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @model_validator(mode="after")
    def consistent(self) -> BarChartDisplay:
        if len(self.labels) != len(self.values) or any(not isfinite(value) for value in self.values):
            raise ValueError("Chart labels and finite values must align")
        return self


class LineSeries(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    values: list[float | None] = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def safe_name(cls, value: str) -> str:
        return plain(value)


class LineChartDisplay(BaseModel):
    """One or two series over the same labels; ``null`` is a missing point (a gap, not zero)."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["line_chart"]
    title: str = Field(min_length=1, max_length=200)
    labels: list[str] = Field(min_length=2, max_length=40)
    series: list[LineSeries] = Field(min_length=1, max_length=2)
    unit: str = Field(default="", max_length=30)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)

    @field_validator("labels")
    @classmethod
    def safe_labels(cls, value: list[str]) -> list[str]:
        return [plain(label) for label in value]

    @field_validator("unit")
    @classmethod
    def safe_unit(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @model_validator(mode="after")
    def consistent(self) -> LineChartDisplay:
        for serie in self.series:
            if len(serie.values) != len(self.labels):
                raise ValueError("Each series needs one value per label (null for a missing point)")
            if any(value is not None and not isfinite(value) for value in serie.values):
                raise ValueError("Chart values must be finite")
            if all(value is None for value in serie.values):
                raise ValueError("A series needs at least one value")
        return self


class CodeDisplay(BaseModel):
    """Code to read, never executed in the browser."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["code"]
    language: Literal["sql", "python", "text"]
    code: str = Field(min_length=1, max_length=6000)
    title: str = Field(default="", max_length=200)

    @field_validator("code")
    @classmethod
    def safe_code(cls, value: str) -> str:
        return code_text(value)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value) if value.strip() else ""


ComparisonItem = Annotated[CodeDisplay | TableDisplay, Field(discriminator="kind")]


class ComparisonDisplay(BaseModel):
    """Two code or table blocks side by side, each with a title."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["comparison"]
    items: list[ComparisonItem] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def titled(self) -> ComparisonDisplay:
        if any(not item.title for item in self.items):
            raise ValueError("Each side of a comparison needs a title")
        return self


DisplayData = Annotated[TableDisplay | BarChartDisplay | LineChartDisplay | CodeDisplay | ComparisonDisplay, Field(discriminator="kind")]

RUN_ID = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class SqlRun(BaseModel):
    """A preconfigured query, executed by the server on the lab database (never browser text)."""
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=RUN_ID, max_length=40)
    label: str = Field(min_length=1, max_length=120)
    sql: str = Field(min_length=1, max_length=4000)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)

    @field_validator("sql")
    @classmethod
    def safe_sql(cls, value: str) -> str:
        return code_text(value, 4000)


class PythonRun(BaseModel):
    """A preconfigured Python snippet, executed once at import in a disposable container."""
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=RUN_ID, max_length=40)
    label: str = Field(min_length=1, max_length=120)
    python: str = Field(min_length=1, max_length=6000)
    # Filled by the import (stdout, bounded); never written by authors.
    output: str | None = Field(default=None, max_length=20_000)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)

    @field_validator("python")
    @classmethod
    def safe_python(cls, value: str) -> str:
        return code_text(value)


RunItem = SqlRun | PythonRun


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
    # Required for every kind except ``lesson`` (checked below).
    scenario: str = Field(default="", max_length=5000)
    instructions: str = Field(default="", max_length=2000)
    objective_ids: list[int] = Field(min_length=1, max_length=20)
    prerequisite_mission_ids: list[int] = Field(default_factory=list, max_length=20)
    choices: list[Choice] = Field(default_factory=list, max_length=16)
    correct_ids: list[str] = Field(default_factory=list, max_length=16)
    match_targets: list[Choice] = Field(default_factory=list, max_length=16)
    correct_pairs: dict[str, str] = Field(default_factory=dict)
    action_id: str | None = Field(default=None, max_length=80)
    display_data: DisplayData | None = None
    resources: list[str] = Field(default_factory=list, max_length=10)
    hints: list[str] = Field(default_factory=list, max_length=5)
    feedback: dict[str, str] = Field(default_factory=dict)
    # Private explanation, revealed by the server after a correct answer or enough attempts.
    explanation: str = Field(default="", max_length=3000)
    # 1 to 100; 0 for a lesson (counted in progress, never in the grade).
    max_points: int = Field(default=0, ge=0, le=100)
    # all_or_nothing: max_points only for a fully correct answer. partial: proportional
    # credit, allowed for multiple choice, ordering and matching (see app.grading).
    scoring: Literal["all_or_nothing", "partial"] = "all_or_nothing"
    estimated_duration_minutes: int = Field(ge=1, le=120)
    bonus: bool = False
    # Lesson text: paragraphs separated by a blank line, "- " lists. Shown to students.
    body: str = Field(default="", max_length=4000)
    # Preconfigured executions (SQL on the lab database, Python run at import).
    run: list[RunItem] = Field(default_factory=list, max_length=4)
    # sql_challenge: the student edits ``starter_sql``; ``expected_sql`` stays private.
    starter_sql: str = Field(default="", max_length=4000)
    expected_sql: str = Field(default="", max_length=4000)
    compare: Literal["rows", "rows_unordered", "scalar"] = "rows"

    @field_validator("scenario", "instructions", "body")
    @classmethod
    def safe_text(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @field_validator("starter_sql", "expected_sql")
    @classmethod
    def safe_sql(cls, value: str) -> str:
        return code_text(value, 4000) if value.strip() else ""

    @field_validator("explanation")
    @classmethod
    def safe_explanation(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

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
        run_ids = [item.id for item in self.run]
        if len(set(run_ids)) != len(run_ids):
            raise ValueError("Duplicate run id")
        if self.kind == "lesson":
            if not self.body:
                raise ValueError("A lesson needs a body")
            if self.choices or self.correct_ids or self.match_targets or self.correct_pairs or self.feedback or self.max_points:
                raise ValueError("A lesson has no choices, answer key or points")
        else:
            if not self.scenario or not self.instructions:
                raise ValueError("Scenario and instructions are required")
            if self.max_points < 1:
                raise ValueError("Points must be between 1 and 100")
            if self.body:
                raise ValueError("body is only for lessons")
        if self.kind == "sql_challenge":
            if not self.starter_sql or not self.expected_sql:
                raise ValueError("An SQL challenge needs starter_sql and expected_sql")
            if self.choices or self.correct_ids or self.match_targets or self.correct_pairs or self.feedback:
                raise ValueError("An SQL challenge has no choices")
            if self.scoring != "all_or_nothing":
                raise ValueError("An SQL challenge is all or nothing")
        elif self.starter_sql or self.expected_sql:
            raise ValueError("starter_sql and expected_sql are only for SQL challenges")
        if self.kind not in CHOICE_KINDS:
            if self.display_data is not None and len(json.dumps(self.display_data.model_dump(), ensure_ascii=False)) > 32_000:
                raise ValueError("Display data is too large")
            return self
        if len(self.choices) < 2:
            raise ValueError("At least two choices are required")
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
        if not set(self.feedback) <= set(ids):
            raise ValueError("Feedback must use choice IDs")
        if self.scoring == "partial" and self.kind not in {"multiple_choice", "reorder", "matching"}:
            raise ValueError("Partial scoring is only for multiple choice, ordering and matching")
        if self.display_data is not None and len(json.dumps(self.display_data.model_dump(), ensure_ascii=False)) > 32_000:
            raise ValueError("Display data is too large")
        return self

    def student_projection(self) -> dict:
        """Public part stored with a release. Hints are revealed one by one by the API.

        Never: answer keys, feedback, explanation, expected SQL, Python outputs (revealed on demand).
        """
        data = self.model_dump(exclude={"correct_ids", "correct_pairs", "feedback", "action_id", "max_points", "explanation",
                                        "hints", "scoring", "expected_sql", "compare", "run"})
        data["hint_count"] = len(self.hints)
        data["run"] = public_runs(self.model_dump()["run"])
        return data

    def preview_projection(self) -> dict:
        """Teacher preview: student view plus hints, never answer keys."""
        return {**self.student_projection(), "hints": list(self.hints)}


def public_runs(raw: object) -> list[dict]:
    """Student view of ``run``: id, label, language and code only (outputs are revealed by the API)."""
    result = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        if isinstance(item.get("sql"), str):
            result.append({"id": item["id"], "label": str(item.get("label", "")), "language": "sql", "code": item["sql"]})
        elif isinstance(item.get("python"), str):
            result.append({"id": item["id"], "label": str(item.get("label", "")), "language": "python", "code": item["python"]})
        elif item.get("language") in {"sql", "python"} and isinstance(item.get("code"), str):
            result.append({"id": item["id"], "label": str(item.get("label", "")), "language": item["language"], "code": item["code"]})
    return result
