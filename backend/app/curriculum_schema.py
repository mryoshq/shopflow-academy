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
    "data_interpretation", "scenario_choice", "guided_simulation", "lesson", "sql_challenge", "review",
]
# Not graded, counted in progress like a lesson (« J'ai compris »): lessons and flashcard reviews (ADR-0028).
UNGRADED_KINDS = {"lesson", "review"}
# Kinds answered by choosing among propositions (choices, answer key, feedback).
CHOICE_KINDS = {"single_choice", "multiple_choice", "true_false", "reorder", "matching",
                "data_interpretation", "scenario_choice", "guided_simulation"}
MAX_CODE_LINES = 60
RUN_ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
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


class Described(BaseModel):
    """Every media accepts a text description: read by screen readers, shown only on request."""
    description: str = Field(default="", max_length=3000)

    @field_validator("description")
    @classmethod
    def safe_description(cls, value: str) -> str:
        return plain(value) if value.strip() else ""


class TableDisplay(Described):
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


class BarChartDisplay(Described):
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


class LineChartDisplay(Described):
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


class CodeDisplay(Described):
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


class ComparisonDisplay(Described):
    """Two code or table blocks side by side, each with a title."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["comparison"]
    items: list[ComparisonItem] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def titled(self) -> ComparisonDisplay:
        if any(not item.title for item in self.items):
            raise ValueError("Each side of a comparison needs a title")
        return self


# Coded media (ADR-0018): drawn by the platform from data, no video file required -------------

def short(value: str, limit: int) -> str:
    value = plain(value)
    if len(value) > limit:
        raise ValueError(f"Text is limited to {limit} characters")
    return value


class Highlight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rows: list[int] = Field(default_factory=list, max_length=12)
    cells: list[tuple[int, int]] = Field(default_factory=list, max_length=24)


class SceneTable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="", max_length=80)
    columns: list[str] = Field(min_length=1, max_length=8)
    rows: list[list[Cell]] = Field(default_factory=list, max_length=12)
    highlight: Highlight = Field(default_factory=Highlight)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @field_validator("columns")
    @classmethod
    def safe_columns(cls, value: list[str]) -> list[str]:
        return [short(column, 60) for column in value]

    @model_validator(mode="after")
    def consistent(self) -> SceneTable:
        for row in self.rows:
            if len(row) != len(self.columns):
                raise ValueError("Every table row must match the column count")
            for cell in row:
                if isinstance(cell, str):
                    short(cell, 120) if cell.strip() else None
                if isinstance(cell, float) and not isfinite(cell):
                    raise ValueError("Table values must be finite")
        if any(not 0 <= index < len(self.rows) for index in self.highlight.rows) or any(
                not (0 <= row < len(self.rows) and 0 <= column < len(self.columns)) for row, column in self.highlight.cells):
            raise ValueError("Highlight outside the table")
        return self


class Arrow(BaseModel):
    """From a row of one table to a row of another: ``from: [table, row]`` and ``to: [table, row]`` (0-based)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    source: tuple[int, int] = Field(alias="from")
    target: tuple[int, int] = Field(alias="to")
    label: str = Field(default="", max_length=40)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value) if value.strip() else ""


class Counter(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=60)
    value: str | int | float

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)

    @field_validator("value")
    @classmethod
    def safe_value(cls, value: str | int | float) -> str | int | float:
        if isinstance(value, str):
            return short(value, 40)
        if isinstance(value, float) and not isfinite(value):
            raise ValueError("Counter values must be finite")
        return value


class Badge(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["ok", "erreur", "attention"]
    text: str = Field(min_length=1, max_length=80)

    @field_validator("text")
    @classmethod
    def safe_text(cls, value: str) -> str:
        return plain(value)


class Scene(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tables: list[SceneTable] = Field(min_length=1, max_length=3)
    arrows: list[Arrow] = Field(default_factory=list, max_length=12)
    counter: Counter | None = None
    badge: Badge | None = None

    @model_validator(mode="after")
    def arrows_inside(self) -> Scene:
        for arrow in self.arrows:
            for table, row in (arrow.source, arrow.target):
                if not (0 <= table < len(self.tables) and 0 <= row < len(self.tables[table].rows)):
                    raise ValueError("Arrow outside the tables")
            if arrow.source[0] == arrow.target[0]:
                raise ValueError("An arrow links two different tables")
        return self


class AnimationStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: str = Field(min_length=1, max_length=300)
    scene: Scene

    @field_validator("caption")
    @classmethod
    def safe_caption(cls, value: str) -> str:
        return plain(value)


class AnimationDisplay(Described):
    """Step-by-step animation drawn by the platform (no video file)."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["animation"]
    title: str = Field(min_length=1, max_length=200)
    steps: list[AnimationStep] = Field(min_length=2, max_length=20)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)


class MindNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=80)
    children: list[MindNode] = Field(default_factory=list, max_length=12)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)


MINDMAP_DEPTH = 3
MINDMAP_NODES = 40


class MindmapDisplay(Described):
    """Mind map: a root and up to three levels of children, 40 nodes at most."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["mindmap"]
    title: str = Field(min_length=1, max_length=200)
    root: MindNode

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)

    @model_validator(mode="after")
    def bounded(self) -> MindmapDisplay:
        count = 0

        def visit(node: MindNode, depth: int) -> None:
            nonlocal count
            count += 1
            if depth > MINDMAP_DEPTH:
                raise ValueError("A mind map has at most 3 levels below its root")
            for child in node.children:
                visit(child, depth + 1)

        visit(self.root, 0)
        if count > MINDMAP_NODES:
            raise ValueError("A mind map has at most 40 nodes")
        return self


class FlowStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=RUN_ID_PATTERN, max_length=40)
    label: str = Field(min_length=1, max_length=60)
    rejects: int = Field(default=0, ge=0, le=1_000_000)
    note: str = Field(default="", max_length=120)

    @field_validator("label")
    @classmethod
    def safe_label(cls, value: str) -> str:
        return plain(value)

    @field_validator("note")
    @classmethod
    def safe_note(cls, value: str) -> str:
        return plain(value) if value.strip() else ""


class FlowDisplay(Described):
    """Animated pipeline: a token goes through the steps; some steps reject rows."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["flow"]
    title: str = Field(min_length=1, max_length=200)
    input: int = Field(ge=1, le=1_000_000)
    unit: str = Field(default="lignes", max_length=20)
    steps: list[FlowStep] = Field(min_length=2, max_length=8)

    @field_validator("title", "unit")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)

    @model_validator(mode="after")
    def consistent(self) -> FlowDisplay:
        ids = [step.id for step in self.steps]
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate step id")
        if sum(step.rejects for step in self.steps) > self.input:
            raise ValueError("A pipeline cannot reject more rows than it receives")
        return self


VIDEO_HOSTS = {"www.youtube-nocookie.com": r"^/embed/[A-Za-z0-9_-]{6,20}$", "youtube-nocookie.com": r"^/embed/[A-Za-z0-9_-]{6,20}$",
               "player.vimeo.com": r"^/video/[0-9]{4,12}$"}
MEDIA_SRC = re.compile(r"^/media/[0-9a-f]{16}\.(mp4|vtt)$")


class VideoDisplay(Described):
    """Optional video: an embed from youtube-nocookie.com / player.vimeo.com, or a course file
    copied at import (``src``, served by the gateway). Never required for the grade."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["video"]
    title: str = Field(min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=300)
    src: str | None = Field(default=None, max_length=40)
    captions_src: str | None = Field(default=None, max_length=40)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value)

    @model_validator(mode="after")
    def one_source(self) -> VideoDisplay:
        if (self.url is None) == (self.src is None):
            raise ValueError("A video needs either url or file")
        if self.url is not None:
            parsed = urlparse(self.url)
            pattern = VIDEO_HOSTS.get(parsed.netloc)
            if parsed.scheme != "https" or pattern is None or not re.fullmatch(pattern, parsed.path) or parsed.params or parsed.fragment:
                raise ValueError("Video url must be an https embed from youtube-nocookie.com or player.vimeo.com")
            if self.captions_src:
                raise ValueError("Captions files are for course videos only")
        if self.src is not None and (not MEDIA_SRC.fullmatch(self.src) or not self.src.endswith(".mp4")):
            raise ValueError("Invalid video file")
        if self.captions_src is not None and (not MEDIA_SRC.fullmatch(self.captions_src) or not self.captions_src.endswith(".vtt")):
            raise ValueError("Invalid captions file")
        return self


IMAGE_SRC = re.compile(r"^/media/[0-9a-f]{16}\.(png|jpg|webp|svg)$")


class ImageDisplay(Described):
    """A course picture (ADR-0029): a file of the course folder copied at import, with a required alt text."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["image"]
    src: str = Field(max_length=40)
    alt: str = Field(min_length=1, max_length=300)
    caption: str = Field(default="", max_length=300)

    @field_validator("alt", "caption")
    @classmethod
    def safe_text(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @model_validator(mode="after")
    def course_file(self) -> ImageDisplay:
        if not IMAGE_SRC.fullmatch(self.src):
            raise ValueError("Invalid image file")
        if not self.alt:
            raise ValueError("An image needs an alt text")
        return self


class Flashcard(BaseModel):
    """One card: a short front (question, term) and its back, light formatting allowed (ADR-0028)."""
    model_config = ConfigDict(extra="forbid")
    front: str = Field(min_length=1, max_length=200)
    back: str = Field(min_length=1, max_length=500)

    @field_validator("front", "back")
    @classmethod
    def safe(cls, value: str) -> str:
        return plain(value)


class FlashcardsDisplay(Described):
    """Cards to flip, one at a time (ADR-0028). Shown before any answer: never a mission's answer key."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["flashcards"]
    title: str = Field(default="", max_length=200)
    cards: list[Flashcard] = Field(min_length=2, max_length=30)

    @field_validator("title")
    @classmethod
    def safe_title(cls, value: str) -> str:
        return plain(value) if value.strip() else ""


DisplayData = Annotated[TableDisplay | BarChartDisplay | LineChartDisplay | CodeDisplay | ComparisonDisplay
                        | AnimationDisplay | MindmapDisplay | FlowDisplay | VideoDisplay | FlashcardsDisplay | ImageDisplay, Field(discriminator="kind")]

RUN_ID = RUN_ID_PATTERN


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


class KeyTerm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    term: str = Field(min_length=1, max_length=60)
    definition: str = Field(min_length=1, max_length=300)

    @field_validator("term", "definition")
    @classmethod
    def safe(cls, value: str) -> str:
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
    # Lesson text: paragraphs separated by a blank line, "- " and "1. " lists, "### " subtitles,
    # **bold** and `code`. Shown to students (rendered as text, never as HTML).
    body: str = Field(default="", max_length=4000)
    # Structured lesson (all optional, lessons only): one-sentence objective, hook, vocabulary,
    # worked example and a closing "À vous" call to action (ADR-0022).
    objective: str = Field(default="", max_length=200)
    hook: str = Field(default="", max_length=600)
    key_terms: list[KeyTerm] = Field(default_factory=list, max_length=8)
    example: str = Field(default="", max_length=3000)
    practice: str = Field(default="", max_length=1000)
    # Preconfigured executions (SQL on the lab database, Python run at import).
    run: list[RunItem] = Field(default_factory=list, max_length=4)
    # sql_challenge: the student edits ``starter_sql``; ``expected_sql`` stays private.
    starter_sql: str = Field(default="", max_length=4000)
    expected_sql: str = Field(default="", max_length=4000)
    compare: Literal["rows", "rows_unordered", "scalar"] = "rows"

    @field_validator("scenario", "instructions", "body", "hook", "example", "practice")
    @classmethod
    def safe_text(cls, value: str) -> str:
        return plain(value) if value.strip() else ""

    @field_validator("objective")
    @classmethod
    def safe_objective(cls, value: str) -> str:
        if not value.strip():
            return ""
        value = plain(value)
        if "\n" in value:
            raise ValueError("The objective is one sentence on one line")
        return value

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
        layout = bool(self.objective or self.hook or self.key_terms or self.example or self.practice)
        if len({term.term.casefold() for term in self.key_terms}) != len(self.key_terms):
            raise ValueError("Duplicate key term")
        if self.kind == "review":
            if self.display_data is None or self.display_data.kind != "flashcards":
                raise ValueError("A review needs flashcards (data.kind: flashcards)")
            if (self.choices or self.correct_ids or self.match_targets or self.correct_pairs or self.feedback or self.max_points
                    or self.hints or self.explanation or self.run):
                raise ValueError("A review has no choices, answer key, hints or points")
        elif self.kind == "lesson":
            if not (self.body or self.hook or self.key_terms or self.example or self.practice):
                raise ValueError("A lesson needs a body or structured content")
            if self.choices or self.correct_ids or self.match_targets or self.correct_pairs or self.feedback or self.max_points:
                raise ValueError("A lesson has no choices, answer key or points")
        else:
            if not self.scenario or not self.instructions:
                raise ValueError("Scenario and instructions are required")
            if self.max_points < 1:
                raise ValueError("Points must be between 1 and 100")
            if self.body and self.kind not in UNGRADED_KINDS:
                raise ValueError("body is only for lessons")
            if layout:
                raise ValueError("objective, hook, key_terms, example and practice are only for lessons")
        if self.display_data is not None and self.display_data.kind == "flashcards" and self.kind not in UNGRADED_KINDS:
            raise ValueError("Flashcards are only for lessons and reviews")
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
