"""Part M (ADR-0028): flashcards in lessons and in ungraded « review » items."""

import pytest
from pydantic import ValidationError

from app.course_md import compile_files
from app.curriculum_schema import MissionDefinition
from test_classroom import course_of, give_to_class
from test_course_md import HEADER, errors_of, module
from test_student import env, post  # noqa: F401  (fixture reuse)

CARDS = [{"front": "Grain", "back": "Ce que **représente** une ligne."}, {"front": "`COUNT(DISTINCT x)`", "back": "Compte les valeurs différentes."}]


def review(**extra) -> dict:
    return {"kind": "review", "objective_ids": [1], "estimated_duration_minutes": 5,
            "display_data": {"kind": "flashcards", "title": "Vocabulaire SQL", "cards": CARDS}, **extra}


def test_flashcards_in_a_lesson_and_in_a_review_are_public_and_ungraded():
    lesson = MissionDefinition.model_validate({"kind": "lesson", "objective_ids": [1], "estimated_duration_minutes": 3, "body": "Texte.",
                                               "display_data": {"kind": "flashcards", "cards": CARDS}})
    assert lesson.student_projection()["display_data"]["cards"][0]["back"] == "Ce que **représente** une ligne."
    item = MissionDefinition.model_validate(review(body="Révisez avant le bloc suivant."))
    assert item.max_points == 0 and item.student_projection()["display_data"]["title"] == "Vocabulaire SQL"


@pytest.mark.parametrize("change", [
    {"display_data": None},                                                                # a review needs cards
    {"display_data": {"kind": "flashcards", "cards": CARDS[:1]}},                          # 2 cards at least
    {"display_data": {"kind": "flashcards", "cards": CARDS * 16}},                         # 30 at most
    {"display_data": {"kind": "flashcards", "cards": [CARDS[0], {"front": "x", "back": "y" * 501}]}},  # back ≤ 500
    {"display_data": {"kind": "flashcards", "cards": [CARDS[0], {"front": "<b>x</b>", "back": "y"}]}},  # plain text
    {"display_data": {"kind": "flashcards", "cards": CARDS, "extra": 1}},
    {"max_points": 5}, {"hints": ["Indice"]}, {"choices": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}]},
])
def test_invalid_reviews_are_refused(change):
    with pytest.raises(ValidationError):
        MissionDefinition.model_validate({**review(), **change})


def test_flashcards_are_refused_in_a_graded_mission():
    with pytest.raises(ValidationError, match="only for lessons and reviews"):
        MissionDefinition.model_validate({"kind": "single_choice", "objective_ids": [1], "estimated_duration_minutes": 5, "max_points": 5,
                                          "scenario": "Situation.", "instructions": "Question ?", "correct_ids": ["a"],
                                          "choices": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
                                          "display_data": {"kind": "flashcards", "cards": CARDS}})


REVIEW_MD = """### Révision : Vocabulaire du bloc

```yaml
slug: revision-vocabulaire
objectives: [OBJ-A]
duration: 5
data:
  kind: flashcards
  title: Vocabulaire
  cards:
    - front: Grain
      back: Ce que représente une ligne.
    - front: Jointure
      back: Assemble deux tables sur une clé.
```
"""


def test_compiler_accepts_review_items_and_points_errors_at_the_card():
    compiled = compile_files({"00-cours.md": HEADER, "01-module.md": module(REVIEW_MD)})
    assert compiled.errors == []
    definition = compiled.modules[0].blocks[0].items[0].definition
    assert definition["kind"] == "review" and len(definition["display_data"]["cards"]) == 2 and definition["max_points"] == 0
    bad = REVIEW_MD.replace("      back: Assemble deux tables sur une clé.\n", "      back: " + "x" * 501 + "\n")
    errors = errors_of({"00-cours.md": HEADER, "01-module.md": module(bad)})
    assert errors and "cards" not in errors[0][2] and errors[0][1] > 5  # pointed at the card line, in French
    no_cards = REVIEW_MD.split("data:")[0] + "```\n"
    assert any("révision demande des cartes" in e[2] for e in errors_of({"00-cours.md": HEADER, "01-module.md": module(no_cards)}))
    wrong_heading = REVIEW_MD.replace("### Révision :", "### Leçon :").replace("slug: revision-vocabulaire", "slug: revision-vocabulaire\nkind: review")
    assert any("une révision s'écrit `### Révision" in e[2] for e in errors_of({"00-cours.md": HEADER, "01-module.md": module(wrong_heading)}))


def test_a_review_counts_like_a_lesson(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    course = post(teacher, "/api/v1/teacher/courses", {"slug": "cours-cartes", "title": "Cours cartes"}).json()["id"]
    objective = post(teacher, f"/api/v1/teacher/courses/{course}/objectives", {"code": "OBJ-C", "statement": "Réviser"}).json()["id"]
    module_id = post(teacher, f"/api/v1/teacher/courses/{course}/modules", {"title": "Module"}).json()["id"]
    chapter = post(teacher, f"/api/v1/teacher/modules/{module_id}/chapters", {"title": "Bloc cartes", "sort_order": 0}).json()["id"]
    created = post(teacher, f"/api/v1/teacher/chapters/{chapter}/missions",
                   {"slug": "revision", "title": "Révision", "sort_order": 0, "definition": {**review(), "objective_ids": [objective]}})
    assert created.status_code == 201, created.text
    klass = give_to_class(teacher, engine, course, "Classe cartes")
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{chapter}/open")
    version = course_of(a, "Cours cartes")["missions"][0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{version}").json()
    assert view["definition"]["display_data"]["cards"][1]["front"] == "`COUNT(DISTINCT x)`"  # visible before any answer
    assert post(a, f"/api/v1/student/missions/{version}/understood").status_code == 201
    course_view = course_of(a, "Cours cartes")
    assert course_view["score"]["lessons_read"] == 1 and course_view["score"]["core_possible"] == 0
    assert course_view["modules"][0]["blocks"][0]["done"] is True
