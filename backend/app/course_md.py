"""Compiler and importer of the Markdown course format ``shopflow-course-md`` v1.

The course source is a local folder of ``.md`` files (``docs/COURSE-AUTHORING.md``):
``00-cours.md`` holds the course header (YAML front matter), every other file holds
``# Module :``, ``## Bloc :`` (or ``## Chapitre :``) and ``### Mission :`` /
``### Leçon :`` headings, each item followed by exactly one ``yaml`` block. Any other
text is a note for the teacher and is never shown to students.

* ``compile``: validates everything, reports errors in French with **file and line**,
  and summarises modules, blocks, points, durations and objective coverage.
* ``import``: creates or updates the **draft** of the course (never publishes, never
  opens a block). ``--publish`` publishes a new version: unchanged missions keep their
  version, hence the students' attempts and grades; new blocks arrive closed.

Command line (inside the backend container; ``scripts/course_md.py`` wraps it from the Mac):

    python -m app.course_md compile <dossier>
    python -m app.course_md compile-bundle  < bundle.json      # {"files": {nom: texte}}
    python -m app.course_md import-bundle [--publish] < bundle.json   # {"owner": ..., "files": ...}
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys

from pydantic import ValidationError
import yaml

from app.curriculum_schema import CHOICE_KINDS, MissionDefinition

FORMAT = "shopflow-course-md"
HEADER_FILE = "00-cours.md"
# Files of the course folder that are not course content.
RESERVED = {"RETOURS-PLATEFORME.MD", "COVERAGE.MD", "QUESTIONS.MD", "README.MD"}
REPORT_NAME = "RETOURS-PLATEFORME.md"
MAX_FILE_BYTES = 1_000_000
MAX_FILES = 60

MODULE_RE = re.compile(r"^#\s+Module\s*:\s*(.+?)\s*$")
BLOCK_RE = re.compile(r"^##\s+(Bloc|Chapitre)\s*:\s*(.+?)\s*$")
ITEM_RE = re.compile(r"^###\s+(Mission|Leçon|Lecon)\s*:\s*(.+?)\s*$")
YAML_FENCE = re.compile(r"^```\s*ya?ml\s*$")
ANY_FENCE = re.compile(r"^(```|~~~)")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CODE_RE = re.compile(r"^[A-Z0-9_-]{1,40}$")
HTTP_RE = re.compile(r"http://", re.IGNORECASE)

# Kinds and data kinds the platform can play today. Others are refused with a clear message.
KINDS = {"single_choice", "multiple_choice", "true_false", "reorder", "matching", "data_interpretation",
         "scenario_choice", "lesson", "sql_challenge"}
DATA_KINDS = {"table", "bar_chart", "line_chart", "code", "comparison"}
MISSION_KEYS = {"slug", "kind", "objectives", "prerequisites", "points", "scoring", "duration", "bonus", "scenario",
                "instructions", "data", "run", "choices", "order", "targets", "pairs", "hints", "explanation",
                "resources", "body", "starter_sql", "expected_sql", "compare"}
HEADER_KEYS = {"format", "version", "slug", "title", "description", "objectives"}
# Definition field → Markdown key, to point pydantic errors at the right line.
FIELD_TO_KEY = {"max_points": "points", "estimated_duration_minutes": "duration", "display_data": "data",
                "correct_ids": "choices", "match_targets": "targets", "correct_pairs": "pairs", "feedback": "choices",
                "objective_ids": "objectives", "prerequisite_mission_ids": "prerequisites"}

FRENCH = {
    "Nonempty plain text is required": "texte brut requis : ni HTML, ni caractère de contrôle, ni texte vide",
    "Nonempty code without control characters is required": "code requis, sans caractère de contrôle",
    "Invalid answer key": "clé de réponse incohérente (bonne réponse inconnue ou en double)",
    "This activity needs exactly one answer": "ce type demande exactement une bonne réponse (`correct: true`)",
    "Multiple choice needs at least one answer": "un choix multiple demande au moins une bonne réponse",
    "Reorder answer must contain every choice": "`order` doit citer chaque choix une fois",
    "Matching pairs must cover each choice and target exactly once": "`pairs` doit associer chaque choix à une cible, chaque cible une fois",
    "True/false must use true and false choice IDs": "un vrai/faux utilise les choix `true` et `false`",
    "Duplicate choice, objective or prerequisite": "choix, objectif ou prérequis en double",
    "Feedback must use choice IDs": "un `feedback` vise un choix inconnu",
    "Partial scoring is only for multiple choice, ordering and matching": "`scoring: partial` seulement pour multiple_choice, reorder et matching",
    "Resources must be bounded HTTPS links": "les ressources sont des liens HTTPS (500 caractères au plus)",
    "Every table row must match the column count": "chaque ligne du tableau doit avoir autant de cellules que de colonnes",
    "Table cell too long": "cellule de tableau trop longue (500 caractères au plus)",
    "Chart labels and finite values must align": "un graphique demande une valeur par libellé",
    "Each series needs one value per label (null for a missing point)": "chaque série demande une valeur par libellé (`null` pour un point absent)",
    "A series needs at least one value": "une série doit avoir au moins une valeur",
    "Each side of a comparison needs a title": "chaque côté d'une comparaison demande un `title`",
    "Display data is too large": "données affichées trop volumineuses",
    "A lesson needs a body": "une leçon demande un `body`",
    "A lesson has no choices, answer key or points": "une leçon n'a ni choix, ni corrigé, ni points",
    "Scenario and instructions are required": "`scenario` et `instructions` sont obligatoires",
    "Points must be between 1 and 100": "`points` doit être entre 1 et 100",
    "body is only for lessons": "`body` est réservé aux leçons",
    "An SQL challenge needs starter_sql and expected_sql": "un sql_challenge demande `starter_sql` et `expected_sql`",
    "An SQL challenge has no choices": "un sql_challenge n'a pas de choix",
    "An SQL challenge is all or nothing": "un sql_challenge se note en tout ou rien",
    "starter_sql and expected_sql are only for SQL challenges": "`starter_sql` et `expected_sql` sont réservés aux sql_challenge",
    "Duplicate run id": "deux exécutions `run` ont le même `id`",
    "Code is limited to 60 lines": "code limité à 60 lignes",
    "At least two choices are required": "au moins deux choix sont nécessaires",
}


@dataclass
class Issue:
    file: str
    line: int
    message: str
    level: str = "erreur"

    def text(self) -> str:
        return f"{self.file}:{self.line} — {self.message}"


@dataclass
class Item:
    file: str
    line: int
    title: str
    heading: str
    raw: dict
    lines: dict
    yaml_line: int
    definition: dict | None = None
    slug: str = ""
    objective_codes: list[str] = field(default_factory=list)
    prerequisite_slugs: list[str] = field(default_factory=list)


@dataclass
class Block:
    file: str
    line: int
    title: str
    items: list[Item] = field(default_factory=list)


@dataclass
class Module:
    file: str
    line: int
    title: str
    description: str = ""
    blocks: list[Block] = field(default_factory=list)


@dataclass
class Compiled:
    course: dict = field(default_factory=dict)
    objectives: list[dict] = field(default_factory=list)
    modules: list[Module] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    files: list[str] = field(default_factory=list)

    @property
    def errors(self) -> list[Issue]:
        return [item for item in self.issues if item.level == "erreur"]

    @property
    def warnings(self) -> list[Issue]:
        return [item for item in self.issues if item.level != "erreur"]

    def error(self, file: str, line: int, message: str) -> None:
        self.issues.append(Issue(file, line, message))

    def warn(self, file: str, line: int, message: str) -> None:
        self.issues.append(Issue(file, line, message, "avertissement"))

    def items(self) -> list[Item]:
        return [item for module in self.modules for block in module.blocks for item in block.items]


# YAML with line numbers ---------------------------------------------------------------------

def load_yaml(text: str, first_line: int) -> tuple[object, dict]:
    """Parse YAML safely and map each key path to its line in the Markdown file."""
    node = yaml.compose(text, Loader=yaml.SafeLoader)
    data = yaml.safe_load(text)
    lines: dict[tuple, int] = {(): first_line}

    def walk(current: yaml.Node | None, path: tuple) -> None:
        if isinstance(current, yaml.MappingNode):
            for key, value in current.value:
                child = path + (str(key.value),)
                lines[child] = first_line + key.start_mark.line
                walk(value, child)
        elif isinstance(current, yaml.SequenceNode):
            for index, value in enumerate(current.value):
                lines[path + (index,)] = first_line + value.start_mark.line
                walk(value, path + (index,))

    walk(node, ())
    return data, lines


YAML_FRENCH = {
    "mapping values are not allowed here": "« : » suivi d'un espace dans une valeur : mettez la valeur entre guillemets, ou écrivez-la sous `|` sur les lignes suivantes",
    "found character '\\t' that cannot start any token": "tabulation interdite : indentez avec des espaces",
    "could not find expected ':'": "« : » attendu après le nom du champ",
    "found undefined alias": "alias YAML inconnu (le caractère * en début de valeur doit être entre guillemets)",
    "expected <block end>, but found '-'": "indentation incohérente d'une liste",
    "found duplicate anchor": "ancre YAML en double",
}


def yaml_message(exc: yaml.YAMLError) -> str:
    problem = str(getattr(exc, "problem", "") or exc)
    for key, value in YAML_FRENCH.items():
        if problem.startswith(key):
            return f"YAML invalide : {value}"
    return f"YAML invalide ({problem}) : vérifiez l'indentation et mettez entre guillemets les valeurs qui contiennent « : » ou « # »"


def line_for(item: Item, path: tuple) -> int:
    for size in range(len(path), 0, -1):
        if path[:size] in item.lines:
            return item.lines[path[:size]]
    return item.yaml_line


def as_id(value: object) -> str:
    """YAML reads ``true``/``false`` (and numbers) as non-strings: choice IDs are always text."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value) if value is not None else ""


# Parsing ----------------------------------------------------------------------------------

def parse_header(compiled: Compiled, name: str, text: str) -> None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        compiled.error(name, 1, "l'en-tête du cours doit commencer par une ligne `---` (bloc YAML)")
        return
    try:
        end = next(index for index in range(1, len(lines)) if lines[index].strip() == "---")
    except StopIteration:
        compiled.error(name, 1, "bloc d'en-tête non fermé : ajoutez une ligne `---`")
        return
    try:
        data, where = load_yaml("\n".join(lines[1:end]), 2)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        compiled.error(name, 2 + (mark.line if mark else 0), yaml_message(exc))
        return
    if not isinstance(data, dict):
        compiled.error(name, 2, "l'en-tête doit être un dictionnaire YAML")
        return
    for key in data:
        if key not in HEADER_KEYS:
            compiled.error(name, where.get((str(key),), 2), f"champ inconnu dans l'en-tête : `{key}`")
    if data.get("format") != FORMAT:
        compiled.error(name, where.get(("format",), 2), f"`format: {FORMAT}` est obligatoire")
    if data.get("version") != 1:
        compiled.error(name, where.get(("version",), 2), "`version: 1` est obligatoire")
    slug = str(data.get("slug") or "")
    if not SLUG_RE.fullmatch(slug) or len(slug) > 100:
        compiled.error(name, where.get(("slug",), 2), "`slug` obligatoire : lettres minuscules, chiffres et tirets")
    title = str(data.get("title") or "").strip()
    if not title or len(title) > 200:
        compiled.error(name, where.get(("title",), 2), "`title` obligatoire (200 caractères au plus)")
    description = str(data.get("description") or "").strip()
    if len(description) > 5000:
        compiled.error(name, where.get(("description",), 2), "`description` trop longue (5000 caractères au plus)")
    compiled.course = {"slug": slug, "title": title, "description": description}
    objectives = data.get("objectives")
    if not isinstance(objectives, list) or not objectives:
        compiled.error(name, where.get(("objectives",), 2), "`objectives` : liste obligatoire de `{code, statement}`")
        return
    seen = set()
    for index, objective in enumerate(objectives):
        line = where.get(("objectives", index), 2)
        if not isinstance(objective, dict) or set(objective) - {"code", "statement"}:
            compiled.error(name, line, "un objectif s'écrit `{code, statement}`")
            continue
        code = str(objective.get("code") or "")
        statement = str(objective.get("statement") or "").strip()
        if not CODE_RE.fullmatch(code):
            compiled.error(name, line, f"code d'objectif invalide `{code}` (majuscules, chiffres, - et _)")
        elif code in seen:
            compiled.error(name, line, f"code d'objectif en double : `{code}`")
        if not statement or len(statement) > 1000:
            compiled.error(name, line, "`statement` obligatoire (1000 caractères au plus)")
        seen.add(code)
        compiled.objectives.append({"code": code, "statement": statement, "line": line, "file": name})


def parse_module_file(compiled: Compiled, name: str, text: str) -> None:
    lines = text.splitlines()
    module: Module | None = None
    block: Block | None = None
    pending: tuple[int, str, str] | None = None  # (line, heading kind, title) waiting for its yaml block
    intro_open = False
    index = 0
    in_other_fence = False
    while index < len(lines):
        raw = lines[index]
        number = index + 1
        stripped = raw.strip()
        if in_other_fence:
            if ANY_FENCE.match(stripped):
                in_other_fence = False
            index += 1
            continue
        if YAML_FENCE.match(stripped):
            end = next((j for j in range(index + 1, len(lines)) if lines[j].strip() == "```"), None)
            if end is None:
                compiled.error(name, number, "bloc ```yaml non fermé (ligne ``` manquante)")
                return
            if pending is None:
                compiled.error(name, number, "bloc YAML sans titre `### Mission :` ou `### Leçon :` juste avant")
            elif block is None:
                compiled.error(name, pending[0], "mission placée avant tout `## Bloc :`")
                pending = None
            else:
                add_item(compiled, block, name, pending, "\n".join(lines[index + 1:end]), number + 1)
                pending = None
            index = end + 1
            intro_open = False
            continue
        if ANY_FENCE.match(stripped):
            in_other_fence = True
            index += 1
            continue
        if raw.startswith("#"):
            if pending is not None:
                compiled.error(name, pending[0], f"« {pending[2]} » : un seul bloc ```yaml est attendu juste après le titre")
                pending = None
            match_module, match_block, match_item = MODULE_RE.match(raw), BLOCK_RE.match(raw), ITEM_RE.match(raw)
            if match_module:
                module = Module(name, number, match_module.group(1))
                compiled.modules.append(module)
                block = None
                intro_open = True
            elif match_block:
                if module is None:
                    compiled.error(name, number, "`## Bloc :` placé avant tout `# Module :`")
                else:
                    block = Block(name, number, match_block.group(2))
                    module.blocks.append(block)
                intro_open = False
            elif match_item:
                pending = (number, "lesson" if match_item.group(1) != "Mission" else "mission", match_item.group(2))
                intro_open = False
            elif re.match(r"^#{1,3}\s+(Module|Bloc|Chapitre|Mission|Le[cç]on)\b", raw, re.IGNORECASE):
                compiled.error(name, number, "titre mal formé : écrivez par exemple `## Bloc : Le grain` (deux-points)")
            else:
                intro_open = False
            index += 1
            continue
        if intro_open and module is not None and stripped and not module.description:
            module.description = stripped
        elif intro_open and module is not None and stripped:
            intro_open = False  # only the first line is the introduction; the rest is a teacher note
        index += 1
    if pending is not None:
        compiled.error(name, pending[0], f"« {pending[2]} » : bloc ```yaml manquant")


def add_item(compiled: Compiled, block: Block, name: str, pending: tuple[int, str, str], text: str, yaml_line: int) -> None:
    line, heading, title = pending
    try:
        data, where = load_yaml(text, yaml_line)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        compiled.error(name, yaml_line + (mark.line if mark else 0), yaml_message(exc))
        return
    if not isinstance(data, dict):
        compiled.error(name, yaml_line, "le bloc YAML doit être un dictionnaire de champs")
        return
    title = title.strip()
    if len(title) > 200:
        compiled.error(name, line, "titre trop long (200 caractères au plus)")
    block.items.append(Item(name, line, title, heading, data, where, yaml_line))


# Checks -----------------------------------------------------------------------------------

def build_definition(compiled: Compiled, item: Item, codes: set[str], earlier: list[str]) -> None:
    raw = item.raw
    error = lambda path, message: compiled.error(item.file, line_for(item, path), message)  # noqa: E731
    for key in raw:
        if key not in MISSION_KEYS:
            error((str(key),), f"champ inconnu : `{key}`")
    kind = str(raw.get("kind") or ("lesson" if item.heading == "lesson" else ""))
    slug = str(raw.get("slug") or "")
    item.slug = slug
    if not SLUG_RE.fullmatch(slug) or len(slug) > 100:
        error(("slug",), "`slug` obligatoire : lettres minuscules, chiffres et tirets")
    if kind == "guided_simulation":
        error(("kind",), "`guided_simulation` est réservé aux actions serveur approuvées : ne pas l'utiliser pour le contenu")
        return
    if kind not in KINDS:
        error(("kind",), f"`kind` inconnu ou pas encore livré : `{kind}` (disponibles : {', '.join(sorted(KINDS))})")
        return
    if item.heading == "lesson" and kind != "lesson":
        error(("kind",), "un titre `### Leçon :` demande `kind: lesson`")
    if item.heading == "mission" and kind == "lesson":
        error(("kind",), "une leçon s'écrit `### Leçon : <titre>`")
    objectives = raw.get("objectives")
    if not isinstance(objectives, list) or not objectives:
        error(("objectives",), "`objectives` : liste obligatoire de codes déclarés dans 00-cours.md")
        objectives = []
    item.objective_codes = [str(code) for code in objectives]
    for index, code in enumerate(item.objective_codes):
        if code not in codes:
            error(("objectives", index), f"objectif non déclaré dans 00-cours.md : `{code}`")
    prerequisites = raw.get("prerequisites") or []
    if not isinstance(prerequisites, list):
        error(("prerequisites",), "`prerequisites` est une liste de slugs")
        prerequisites = []
    item.prerequisite_slugs = [str(value) for value in prerequisites]
    for index, value in enumerate(item.prerequisite_slugs):
        if value not in earlier:
            error(("prerequisites", index), f"prérequis `{value}` : il doit désigner une mission **précédente** du cours")
    for key in ("duration",) + (() if kind == "lesson" else ("points", "scenario", "instructions")):
        if raw.get(key) in (None, ""):
            error((key,), f"champ obligatoire manquant : `{key}`")
    if kind == "lesson" and not raw.get("body"):
        error(("body",), "champ obligatoire manquant : `body`")
    if kind in CHOICE_KINDS and not raw.get("choices"):
        error(("choices",), "champ obligatoire manquant : `choices`")
    if kind == "reorder" and not raw.get("order"):
        error(("order",), "un `reorder` demande `order` (ids dans l'ordre attendu)")
    if kind == "matching" and (not raw.get("targets") or not raw.get("pairs")):
        error(("targets",), "un `matching` demande `targets` et `pairs`")
    data = raw.get("data")
    if data is not None and (not isinstance(data, dict) or data.get("kind") not in DATA_KINDS):
        kind_name = data.get("kind") if isinstance(data, dict) else data
        error(("data",), f"`data.kind` inconnu ou pas encore livré : `{kind_name}` (disponibles : {', '.join(sorted(DATA_KINDS))})")
        return
    for path, value in walk_strings(raw):
        if HTTP_RE.search(value):
            error(path, "lien non HTTPS : utilisez https://")

    choices, correct, feedback = [], [], {}
    for index, choice in enumerate(raw.get("choices") or []):
        if not isinstance(choice, dict):
            error(("choices", index), "un choix s'écrit `{id, label, correct?, feedback?}`")
            continue
        unknown = set(choice) - {"id", "label", "correct", "feedback"}
        if unknown:
            error(("choices", index), f"champ inconnu dans un choix : `{sorted(unknown)[0]}`")
        cid = as_id(choice.get("id"))
        choices.append({"id": cid, "label": str(choice.get("label") or "")})
        if choice.get("correct") is True:
            correct.append(cid)
        if choice.get("feedback"):
            feedback[cid] = str(choice["feedback"])
    if kind == "reorder":
        if correct:
            error(("choices",), "un `reorder` ne marque pas `correct` : l'ordre attendu est dans `order`")
        correct = [as_id(value) for value in raw.get("order") or []]
    targets = [{"id": as_id(t.get("id")), "label": str(t.get("label") or "")} for t in raw.get("targets") or [] if isinstance(t, dict)]
    pairs = {as_id(key): as_id(value) for key, value in (raw.get("pairs") or {}).items()} if isinstance(raw.get("pairs"), dict) else {}
    if kind == "matching" and correct:
        error(("choices",), "un `matching` ne marque pas `correct` : les bonnes paires sont dans `pairs`")
        correct = []
    definition = {
        "kind": kind, "scenario": str(raw.get("scenario") or ""), "instructions": str(raw.get("instructions") or ""),
        "choices": choices, "correct_ids": correct, "match_targets": targets, "correct_pairs": pairs, "feedback": feedback,
        "hints": [str(value) for value in raw.get("hints") or []], "explanation": str(raw.get("explanation") or ""),
        "resources": [str(value) for value in raw.get("resources") or []],
        "max_points": raw.get("points", 0 if kind == "lesson" else None), "scoring": raw.get("scoring", "all_or_nothing"),
        "estimated_duration_minutes": raw.get("duration"), "bonus": bool(raw.get("bonus", False)),
        "display_data": data, "body": str(raw.get("body") or ""), "run": raw.get("run") or [],
        "starter_sql": str(raw.get("starter_sql") or ""), "expected_sql": str(raw.get("expected_sql") or ""),
        "compare": raw.get("compare", "rows"),
    }
    candidate = {**definition, "objective_ids": list(range(1, max(1, len(item.objective_codes)) + 1)),
                 "prerequisite_mission_ids": []}
    try:
        parsed = MissionDefinition.model_validate(candidate)
    except ValidationError as exc:
        reported = set()
        for err in exc.errors()[:8]:
            loc = tuple(err["loc"])
            key = FIELD_TO_KEY.get(str(loc[0]), str(loc[0])) if loc else message_key(str(err.get("msg", "")), kind)
            path = ((key,) + loc[1:]) if loc else ((key,) if key else ())
            message = french(err)
            if (path[:1], message) in reported:
                continue
            reported.add((path[:1], message))
            if key in {"objectives", "prerequisites"} and err["type"] in {"too_short", "missing"}:
                continue  # already reported above in French
            error(path, message)
        return
    body = parsed.model_dump()
    body.pop("objective_ids")
    body.pop("prerequisite_mission_ids")
    item.definition = body
    if kind != "lesson":
        words = len(parsed.scenario.split())
        if words < 40 or words > 90:
            compiled.warn(item.file, line_for(item, ("scenario",)), f"scénario de {words} mots (40 à 90 conseillés)")
        if not parsed.explanation:
            compiled.warn(item.file, line_for(item, ("explanation",)), "pas d'`explanation` (conseillée)")


def message_key(message: str, kind: str) -> str:
    """Field to point at for a whole-mission error (pydantic gives no location)."""
    if "body" in message or "lesson" in message:
        return "body"
    if "SQL" in message or "starter_sql" in message:
        return "starter_sql"
    if "run id" in message:
        return "run"
    if "Scenario" in message:
        return "scenario"
    if "Points" in message:
        return "points"
    if "Partial" in message:
        return "scoring"
    if any(word in message for word in ("answer", "Reorder", "Matching", "True/false", "choice", "Feedback")):
        return {"reorder": "order", "matching": "pairs"}.get(kind, "choices")
    if "Display" in message:
        return "data"
    return ""


def french(err: dict) -> str:
    message = str(err.get("msg", ""))
    for prefix in ("Value error, ", "Assertion failed, "):
        if message.startswith(prefix):
            message = message[len(prefix):]
    if message in FRENCH:
        return FRENCH[message]
    kind = err.get("type", "")
    ctx = err.get("ctx") or {}
    if kind == "missing":
        return "champ obligatoire manquant"
    if kind == "extra_forbidden":
        return "champ inconnu"
    if kind in {"string_too_long", "too_long"}:
        return f"trop long (maximum {ctx.get('max_length', '?')})"
    if kind in {"string_too_short", "too_short"}:
        return f"trop court (minimum {ctx.get('min_length', '?')})"
    if kind in {"greater_than_equal", "greater_than"}:
        return f"valeur trop petite (minimum {ctx.get('ge', ctx.get('gt', '?'))})"
    if kind in {"less_than_equal", "less_than"}:
        return f"valeur trop grande (maximum {ctx.get('le', ctx.get('lt', '?'))})"
    if kind == "literal_error":
        return f"valeur non permise (attendu : {ctx.get('expected', '?')})"
    if kind in {"int_parsing", "int_type", "int_from_float"}:
        return "nombre entier attendu"
    if kind in {"float_parsing", "float_type"}:
        return "nombre attendu"
    if kind in {"string_type"}:
        return "texte attendu"
    if kind in {"list_type"}:
        return "liste attendue"
    if kind in {"dict_type", "model_type", "model_attributes_type"}:
        return "dictionnaire attendu"
    if kind == "string_pattern_mismatch":
        return "format invalide (lettres minuscules, chiffres et tirets)"
    if kind in {"union_tag_invalid", "union_tag_not_found"}:
        return "type de données inconnu"
    return f"valeur invalide ({message})"


def walk_strings(value: object, path: tuple = ()) -> list[tuple[tuple, str]]:
    if isinstance(value, str):
        return [(path, value)]
    if isinstance(value, dict):
        return [found for key, child in value.items() for found in walk_strings(child, path + (str(key),))]
    if isinstance(value, list):
        return [found for index, child in enumerate(value) for found in walk_strings(child, path + (index,))]
    return []


def compile_files(files: dict[str, str]) -> Compiled:
    """Compile a course from {file name: content}; names are sorted, reserved files ignored."""
    compiled = Compiled()
    names = sorted(name for name in files if name.lower().endswith(".md") and name.upper() not in RESERVED and "/" not in name)
    compiled.files = names
    if len(names) > MAX_FILES:
        compiled.error("(dossier)", 0, f"trop de fichiers .md ({len(names)}, maximum {MAX_FILES})")
        return compiled
    if HEADER_FILE not in names:
        compiled.error(HEADER_FILE, 1, "fichier d'en-tête `00-cours.md` manquant")
        return compiled
    for name in names:
        text = files[name]
        if len(text.encode("utf-8")) > MAX_FILE_BYTES:
            compiled.error(name, 1, "fichier trop volumineux (1 Mo au plus)")
            continue
        if name == HEADER_FILE:
            parse_header(compiled, name, text)
        else:
            parse_module_file(compiled, name, text)
    codes = {item["code"] for item in compiled.objectives}
    seen: list[str] = []
    for item in compiled.items():
        build_definition(compiled, item, codes, list(seen))
        if item.slug:
            if item.slug in seen:
                compiled.error(item.file, line_for(item, ("slug",)), f"slug déjà utilisé dans le cours : `{item.slug}`")
            seen.append(item.slug)
    if not compiled.items():
        compiled.error(names[-1] if names else HEADER_FILE, 1, "aucune mission ni leçon trouvée")
    from app.curriculum_schema import plain

    def plain_ok(value: str, limit: int) -> bool:
        try:
            plain(value)
        except ValueError:
            return False
        return len(value) <= limit

    for module in compiled.modules:
        if not plain_ok(module.title, 200):
            compiled.error(module.file, module.line, "titre de module : texte brut, 200 caractères au plus")
        if module.description and not plain_ok(module.description, 1000):
            compiled.error(module.file, module.line + 1, "introduction du module : texte brut, 1000 caractères au plus")
        for block in module.blocks:
            if not plain_ok(block.title, 200):
                compiled.error(block.file, block.line, "titre de bloc : texte brut, 200 caractères au plus")
            for item in block.items:
                if not plain_ok(item.title, 200):
                    compiled.error(item.file, item.line, "titre : texte brut, 200 caractères au plus")
        if not module.blocks:
            compiled.error(module.file, module.line, f"module « {module.title} » sans `## Bloc :`")
        for block in module.blocks:
            if not block.items:
                compiled.error(block.file, block.line, f"bloc « {block.title} » sans mission ni leçon")
            duration = sum(int(i.raw.get("duration") or 0) for i in block.items if not i.raw.get("bonus"))
            if block.items and not 10 <= duration <= 20:
                compiled.warn(block.file, block.line, f"bloc « {block.title} » : {duration} min de missions principales (environ 15 attendues)")
    covered = {code for item in compiled.items() for code in item.objective_codes}
    for objective in compiled.objectives:
        if objective["code"] not in covered:
            compiled.error(objective["file"], objective["line"], f"objectif `{objective['code']}` couvert par aucune mission")
    return compiled


def compile_dir(folder: Path) -> Compiled:
    files: dict[str, str] = {}
    for path in sorted(folder.glob("*.md")):
        files[path.name] = path.read_text(encoding="utf-8")
    return compile_files(files)


# Summary, document, report -------------------------------------------------------------

def summary(compiled: Compiled) -> dict:
    modules = []
    for module in compiled.modules:
        blocks = []
        for block in module.blocks:
            defs = [(item, item.definition or {}) for item in block.items]
            main = [d for _, d in defs if d.get("kind") != "lesson" and not d.get("bonus")]
            bonus = [d for _, d in defs if d.get("bonus")]
            blocks.append({
                "title": block.title, "missions": len(main), "lessons": sum(1 for _, d in defs if d.get("kind") == "lesson"),
                "bonus": len(bonus), "points": sum(d.get("max_points", 0) for d in main),
                "bonus_points": sum(d.get("max_points", 0) for d in bonus),
                "duration": sum(d.get("estimated_duration_minutes", 0) for _, d in defs if d and not d.get("bonus")),
            })
        modules.append({"title": module.title, "blocks": blocks,
                        **{key: sum(b[key] for b in blocks) for key in ("missions", "lessons", "bonus", "points", "bonus_points", "duration")}})
    coverage = {o["code"]: [i.slug for i in compiled.items() if o["code"] in i.objective_codes] for o in compiled.objectives}
    return {"course": compiled.course, "files": compiled.files, "modules": modules, "coverage": coverage,
            "errors": len(compiled.errors), "warnings": len(compiled.warnings)}


def document(compiled: Compiled) -> dict:
    """The portable ``shopflow-course`` v1 document (contains the answer keys)."""
    return {
        "format": "shopflow-course", "format_version": 1,
        "source": {"format": FORMAT, "files": compiled.files},
        "course": compiled.course,
        "objectives": [{"code": o["code"], "statement": o["statement"]} for o in compiled.objectives],
        "modules": [{
            "title": module.title, "description": module.description, "sort_order": mi,
            "chapters": [{"title": block.title, "sort_order": bi, "missions": [{
                "slug": item.slug, "title": item.title, "sort_order": xi, "objective_codes": item.objective_codes,
                "prerequisite_slugs": item.prerequisite_slugs, "definition": item.definition,
            } for xi, item in enumerate(block.items)]} for bi, block in enumerate(module.blocks)],
        } for mi, module in enumerate(compiled.modules)],
    }


def report_markdown(compiled: Compiled, extra: list[str] | None = None) -> str:
    data = summary(compiled)
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    status = "OK, 0 erreur" if not compiled.errors else f"{len(compiled.errors)} erreur(s) à corriger"
    out = [f"# Retours de la plateforme — {now}", "",
           "> Écrit par l'agent plateforme après chaque compilation. À lire, ne pas éditer.", "",
           f"**État : {status}**, {len(compiled.warnings)} avertissement(s). Fichiers lus : {', '.join(compiled.files) or 'aucun'}.", ""]
    if compiled.errors:
        out += ["## Erreurs (bloquantes)", ""] + [f"- `{e.file}` ligne {e.line} : {e.message}" for e in compiled.errors] + [""]
    if compiled.warnings:
        out += ["## Avertissements", ""] + [f"- `{w.file}` ligne {w.line} : {w.message}" for w in compiled.warnings] + [""]
    out += ["## Résumé", "", "| Module / bloc | Missions | Leçons | Bonus | Points | Points bonus | Durée (min) |",
            "|---|---:|---:|---:|---:|---:|---:|"]
    for module in data["modules"]:
        out.append(f"| **{module['title']}** | {module['missions']} | {module['lessons']} | {module['bonus']} | {module['points']} | {module['bonus_points']} | {module['duration']} |")
        for block in module["blocks"]:
            out.append(f"| {block['title']} | {block['missions']} | {block['lessons']} | {block['bonus']} | {block['points']} | {block['bonus_points']} | {block['duration']} |")
    out += ["", "## Objectifs couverts", ""]
    out += [f"- `{code}` : {', '.join(slugs) if slugs else '**aucune mission**'}" for code, slugs in data["coverage"].items()]
    if extra:
        out += ["", "## Import", ""] + [f"- {line}" for line in extra]
    return "\n".join(out) + "\n"


# Import into the database ------------------------------------------------------------------

class ImportRefused(Exception):
    pass


def import_compiled(db, owner, compiled: Compiled, *, publish: bool = False) -> dict:
    """Create or update the course draft from a compiled source (one transaction).

    Matching: modules by title, blocks by (module, title), missions by slug. A mission that
    was already published cannot disappear from the source (its attempts must stay valid).
    Nothing is published unless ``publish``; no block is ever opened here.
    """
    from sqlalchemy import select

    from app.auth import AuthContext
    from app.classroom import assign_to_class, main_cohort, setup_class
    from app.config import get_settings
    from app.course_io import validate_document
    from app.curriculum import publish_course
    from app.models import AuditEvent, Chapter, Course, CourseModule, LearningObjective, Mission, MissionVersion

    if compiled.errors:
        raise ImportRefused("la compilation a des erreurs : rien n'a été importé")
    doc = document(compiled)
    parsed, problems = validate_document(doc)
    if parsed is None:
        raise ImportRefused("document invalide : " + "; ".join(f"{p['path']} : {p['message']}" for p in problems[:5]))
    info = compiled.course
    course = db.scalar(select(Course).where(Course.slug == info["slug"]))
    created_course = course is None
    if course is None:
        course = Course(slug=info["slug"], title=info["title"], description=info["description"], created_by=owner.id)
        db.add(course)
        db.flush()
    elif course.created_by != owner.id:
        raise ImportRefused("ce cours appartient à un autre compte enseignant")
    elif course.status == "archived":
        raise ImportRefused("ce cours est archivé")
    course.title, course.description = info["title"], info["description"]

    objectives = {o.code: o for o in db.scalars(select(LearningObjective).where(LearningObjective.course_id == course.id))}
    for item in compiled.objectives:
        if item["code"] in objectives:
            objectives[item["code"]].statement = item["statement"]
        else:
            objectives[item["code"]] = LearningObjective(course_id=course.id, code=item["code"], statement=item["statement"])
            db.add(objectives[item["code"]])
    db.flush()

    modules = list(db.scalars(select(CourseModule).where(CourseModule.course_id == course.id)))
    chapters = list(db.scalars(select(Chapter).where(Chapter.module_id.in_([m.id for m in modules])))) if modules else []
    missions = {m.slug: m for m in db.scalars(select(Mission).where(Mission.chapter_id.in_([c.id for c in chapters])))} if chapters else {}
    used_modules, used_chapters, placed = set(), set(), {}
    for mi, module_src in enumerate(compiled.modules):
        module = next((m for m in modules if m.title == module_src.title and m.id not in used_modules), None)
        if module is None:
            module = CourseModule(course_id=course.id, title=module_src.title)
            db.add(module)
            db.flush()
            modules.append(module)
        used_modules.add(module.id)
        module.sort_order, module.description = mi, module_src.description
        for bi, block_src in enumerate(module_src.blocks):
            chapter = next((c for c in chapters if c.module_id == module.id and c.title == block_src.title and c.id not in used_chapters), None)
            if chapter is None:
                chapter = Chapter(module_id=module.id, title=block_src.title)
                db.add(chapter)
                db.flush()
                chapters.append(chapter)
            used_chapters.add(chapter.id)
            chapter.sort_order = bi
            for xi, item in enumerate(block_src.items):
                mission = missions.get(item.slug)
                if mission is None:
                    mission = Mission(chapter_id=chapter.id, slug=item.slug, title=item.title)
                    db.add(mission)
                    missions[item.slug] = mission
                mission.chapter_id, mission.title, mission.sort_order = chapter.id, item.title, xi
                placed[item.slug] = (mission, item)
    db.flush()
    removed = [m for slug, m in missions.items() if slug not in placed]
    for mission in removed:
        if db.scalar(select(MissionVersion.id).where(MissionVersion.mission_id == mission.id).limit(1)) is not None:
            raise ImportRefused(f"la mission `{mission.slug}` a déjà été publiée : elle ne peut pas être retirée du cours")
        db.delete(mission)
    db.flush()
    for slug, (mission, item) in placed.items():
        body = {**item.definition, "objective_ids": [objectives[c].id for c in item.objective_codes],
                "prerequisite_mission_ids": [placed[s][0].id for s in item.prerequisite_slugs]}
        mission.draft_definition = MissionDefinition.model_validate(body).model_dump()
    for chapter in chapters:
        if chapter.id not in used_chapters and db.scalar(select(Mission.id).where(Mission.chapter_id == chapter.id).limit(1)) is None:
            db.delete(chapter)
    db.flush()
    for module in modules:
        if module.id not in used_modules and db.scalar(select(Chapter.id).where(Chapter.module_id == module.id).limit(1)) is None:
            db.delete(module)
    stale = [o for code, o in objectives.items() if code not in {x["code"] for x in compiled.objectives}]
    for objective in stale:
        db.delete(objective)
    db.add(AuditEvent(actor_id=owner.id, action="course.import_md", resource_type="course", resource_id=course.id,
                      details={"files": compiled.files, "missions": len(placed), "removed_drafts": len(removed)}))
    db.commit()
    result = {"course_id": course.id, "slug": course.slug, "created": created_course, "missions": len(placed),
              "published": None, "assigned_to_class": False}
    if publish:
        auth = AuthContext(user=owner, session=None)  # type: ignore[arg-type]
        published = publish_course(course.id, auth, db)
        result["published"] = {"release_id": published["id"], "version": published["version"]}
        if course.slug == get_settings().main_course_slug:
            cohort = main_cohort(db) or setup_class(db, owner)
            from app.models import CourseRelease

            assign_to_class(db, auth, db.get(CourseRelease, published["id"]), cohort)
            db.commit()
            result["assigned_to_class"] = True
    return result


# Command line --------------------------------------------------------------------------------

def owner_from(db, name: str):
    from sqlalchemy import select

    from app.models import User

    name = name.strip().casefold()
    owner = db.scalar(select(User).where(User.username == name, User.role == "teacher", User.enabled.is_(True))) if name else None
    if owner is None:
        raise SystemExit("compte enseignant introuvable (vérifiez .local/teacher-email.txt) ; rien n'a été modifié")
    return owner


def main() -> None:
    parser = argparse.ArgumentParser(description="Compilateur du format shopflow-course-md")
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("compile", help="compiler un dossier local")
    one.add_argument("folder", type=Path)
    one.add_argument("--report", type=Path, help="chemin du rapport RETOURS-PLATEFORME.md")
    sub.add_parser("compile-bundle", help="compiler un lot JSON lu sur l'entrée standard")
    bundle = sub.add_parser("import-bundle", help="importer un lot JSON lu sur l'entrée standard (brouillon)")
    bundle.add_argument("--publish", action="store_true", help="publier une nouvelle version pour la classe")
    args = parser.parse_args()
    if args.command == "compile":
        compiled = compile_dir(args.folder)
        report = report_markdown(compiled)
        target = args.report or (args.folder.parent if args.folder.name == "cours" else args.folder) / REPORT_NAME
        target.write_text(report, encoding="utf-8")
        print(json.dumps(summary(compiled), ensure_ascii=False, indent=2))
        for issue in compiled.issues:
            print(f"{issue.level.upper()} {issue.text()}", file=sys.stderr)
        raise SystemExit(1 if compiled.errors else 0)
    payload = json.loads(sys.stdin.read() or "{}")
    files = payload.get("files") or {}
    if not isinstance(files, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in files.items()):
        raise SystemExit("lot invalide : {\"files\": {nom: texte}} attendu")
    compiled = compile_files(files)
    output = {"summary": summary(compiled), "issues": [issue.__dict__ for issue in compiled.issues]}
    if args.command == "import-bundle" and not compiled.errors:
        from sqlalchemy.orm import Session

        from app.database import get_engine

        with Session(get_engine(), expire_on_commit=False) as db:
            owner = owner_from(db, str(payload.get("owner") or ""))
            try:
                output["import"] = import_compiled(db, owner, compiled, publish=args.publish)
            except ImportRefused as exc:
                db.rollback()
                output["import_error"] = str(exc)
    extra = []
    if "import" in output:
        done = output["import"]
        extra.append(f"brouillon {'créé' if done['created'] else 'mis à jour'} : {done['missions']} missions et leçons")
        if done["published"]:
            extra.append(f"version {done['published']['version']} publiée{' pour la classe (nouveaux blocs fermés)' if done['assigned_to_class'] else ''}")
    if "import_error" in output:
        extra.append(f"import refusé : {output['import_error']}")
    output["report"] = report_markdown(compiled, extra)
    print(json.dumps(output, ensure_ascii=False))
    raise SystemExit(1 if compiled.errors or "import_error" in output else 0)


if __name__ == "__main__":
    main()
