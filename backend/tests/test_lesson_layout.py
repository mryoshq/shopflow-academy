"""Sprint 2, part G (ADR-0022): structured lessons, media descriptions, light formatting."""

import pytest
from pydantic import ValidationError

from app.course_md import compile_files
from app.curriculum import PUBLIC_DEFINITION_FIELDS
from app.curriculum_schema import MissionDefinition
from test_course_md import HEADER, mission, module

LESSON = dict(kind="lesson", objective_ids=[1], estimated_duration_minutes=3)
STRUCTURED = dict(
    LESSON, objective="Expliquer pourquoi une jointure peut doubler un total.",
    hook="70 DH attendus, **100 DH** affichés.", key_terms=[{"term": "Grain", "definition": "Ce que représente une ligne."}],
    example="1. Lire `orders`\n2. Joindre", practice="Ouvrez la mission suivante.",
    display_data={"kind": "animation", "title": "Jointure", "description": "Trois étapes : deux commandes, la jointure, la correction.",
                  "steps": [{"caption": "Deux commandes.", "scene": {"tables": [{"title": "orders", "columns": ["id"], "rows": [["C-101"]]}]}},
                            {"caption": "Après la jointure.", "scene": {"tables": [{"title": "jointure", "columns": ["id"], "rows": [["C-101"], ["C-101"]]}]}}]},
)


def test_structured_lesson_is_valid_and_public():
    parsed = MissionDefinition.model_validate(STRUCTURED)
    projection = parsed.student_projection()
    for key in ("objective", "hook", "key_terms", "example", "practice"):
        assert projection[key] and key in PUBLIC_DEFINITION_FIELDS
    assert projection["display_data"]["description"].startswith("Trois étapes")
    assert projection["body"] == ""


def test_old_lesson_with_only_body_stays_valid():
    parsed = MissionDefinition.model_validate({**LESSON, "body": "Le grain d'une table.\n\n- orders\n- order_items"})
    assert parsed.objective == parsed.hook == parsed.example == parsed.practice == "" and parsed.key_terms == []


@pytest.mark.parametrize(("change", "message"), [
    ({"hook": "", "key_terms": [], "example": "", "practice": ""}, "needs a body or structured content"),
    ({"objective": "Une phrase.\nUne autre ligne."}, "one sentence"),
    ({"hook": "<b>Accroche</b>"}, "plain text"),
    ({"example": "<script>alert(1)</script>"}, "plain text"),
    ({"key_terms": [{"term": "Grain", "definition": "a"}, {"term": "grain", "definition": "b"}]}, "Duplicate key term"),
    ({"key_terms": [{"term": "Grain", "definition": "a", "couleur": "rouge"}]}, "Extra inputs"),
    ({"key_terms": [{"term": "x", "definition": "y"}] * 9}, "at most 8"),
    ({"objective": "x" * 201}, "at most 200"),
])
def test_invalid_structured_lessons_are_refused(change, message):
    with pytest.raises(ValidationError, match=message):
        MissionDefinition.model_validate({**STRUCTURED, **change})


def test_layout_fields_are_only_for_lessons_and_descriptions_are_plain_and_bounded():
    choice = dict(kind="single_choice", objective_ids=[1], estimated_duration_minutes=5, max_points=5, scenario="Une situation.",
                  instructions="Que faites-vous ?", choices=[{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], correct_ids=["a"])
    MissionDefinition.model_validate({**choice, "scenario": "**Gras**, `code`, et une liste :\n- un\n- deux"})
    with pytest.raises(ValidationError, match="only for lessons"):
        MissionDefinition.model_validate({**choice, "practice": "À vous."})
    table = {"kind": "table", "columns": ["a"], "rows": [[1]]}
    for bad, message in (("<img src=x>", "plain text"), ("x" * 3001, "at most 3000")):
        with pytest.raises(ValidationError, match=message):
            MissionDefinition.model_validate({**choice, "display_data": {**table, "description": bad}})


STRUCTURED_MD = """### Leçon : La jointure pas à pas

```yaml
slug: lecon-structuree
kind: lesson
objectives: [OBJ-A]
duration: 3
objective: Expliquer pourquoi une jointure peut doubler un total.
hook: 70 DH attendus, **100 DH** affichés.
key_terms:
  - term: Grain
    definition: Ce que représente une ligne.
example: |
  1. Lire `orders`.
  2. Joindre.
practice: Ouvrez la mission suivante.
data:
  kind: code
  language: sql
  code: SELECT 1
  description: Une requête minimale.
```
"""


def test_compiler_accepts_structured_and_old_lessons():
    old = STRUCTURED_MD.replace("lecon-structuree", "lecon-ancienne").split("objective: Expliquer")[0] + "body: Le grain d'une table.\n```\n"
    compiled = compile_files({"00-cours.md": HEADER, "10-m.md": module(STRUCTURED_MD, old, mission("m1"))})
    assert [issue.text() for issue in compiled.errors] == []
    new, previous = compiled.items()[:2]
    assert new.definition["key_terms"] == [{"term": "Grain", "definition": "Ce que représente une ligne."}]
    assert new.definition["display_data"]["description"] == "Une requête minimale."
    assert previous.definition["body"] == "Le grain d'une table." and previous.definition["hook"] == ""


@pytest.mark.parametrize(("source", "line", "text"), [
    (STRUCTURED_MD.replace("hook: 70 DH attendus, **100 DH** affichés.\n", "").replace("practice: Ouvrez la mission suivante.\n", "")
     .split("key_terms:")[0] + "```\n", 9, "une leçon demande un `body` ou au moins un champ"),
    (STRUCTURED_MD.replace("Expliquer pourquoi une jointure peut doubler un total.", '"Une.\\nDeux."'), 13, "une seule phrase, sur une ligne"),
    (STRUCTURED_MD.replace("    definition: Ce que représente une ligne.\n", "    definition: Ce que représente une ligne.\n  - term: grain\n    definition: Doublon.\n"), 15, "même `term`"),
])
def test_compiler_errors_point_at_the_lesson_field(source, line, text):
    compiled = compile_files({"00-cours.md": HEADER, "10-m.md": module(source)})
    found = [(issue.line, issue.message) for issue in compiled.errors]
    assert len(found) == 1 and any(found_line == line and text in message for found_line, message in found), found


def test_compiler_refuses_layout_fields_on_a_mission_and_warns_on_walls_of_text():
    compiled = compile_files({"00-cours.md": HEADER, "10-m.md": module(mission("m1", "practice: À vous.\n"))})
    assert [(issue.line, issue.message) for issue in compiled.errors] == [(22, "`practice` est réservé aux leçons (`### Leçon :`)")]
    wall = " ".join(["mot"] * 90)
    source = STRUCTURED_MD.replace("objective: Expliquer pourquoi une jointure peut doubler un total.",
                                   "objective: Lire une jointure. Corriger le total.") + ""
    source = source.replace("practice: Ouvrez la mission suivante.", f"practice: {wall}")
    compiled = compile_files({"00-cours.md": HEADER, "10-m.md": module(source)})
    assert compiled.errors == []
    warnings = [issue.message for issue in compiled.warnings]
    assert any("une seule phrase conseillée" in text for text in warnings)
    assert any("`practice` : paragraphe de 90 mots" in text for text in warnings)
