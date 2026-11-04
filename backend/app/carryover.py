"""Carry-over of successes between versions of the same mission (ADR-0030).

A success (and its points) moves from one published version of a mission to the next when
everything used for grading is identical: kind, choice and target identifiers, expected answer
(correct_ids, its order, correct_pairs, action_id), expected_sql and compare, max_points,
scoring and bonus. Text changes alone (scenario, instructions, explanation, feedback, hints,
resources, media, choice labels) keep it. Lessons and reviews keep « read » only with the same
kind and never earn points.

``simulate`` answers « which successes would a republication of the current draft lose? »
without writing anything; ``python -m app.carryover --course <slug>`` prints it.
"""

from __future__ import annotations

import argparse
import json
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.curriculum_schema import UNGRADED_KINDS

GRADING_DEFAULTS = {"correct_ids": [], "correct_pairs": {}, "action_id": None, "expected_sql": "", "compare": "rows",
                    "max_points": 0, "scoring": "all_or_nothing", "bonus": False}


def grading_signature(definition: dict | None) -> str:
    """Everything that decides a grade, in a canonical form; text and media are left out."""
    data = definition or {}
    signature = {key: data.get(key, default) for key, default in GRADING_DEFAULTS.items()}
    signature["kind"] = data.get("kind")
    signature["choice_ids"] = sorted(str(item.get("id")) for item in data.get("choices") or [] if isinstance(item, dict))
    signature["target_ids"] = sorted(str(item.get("id")) for item in data.get("match_targets") or [] if isinstance(item, dict))
    return json.dumps(signature, sort_keys=True, ensure_ascii=False)


def carries_over(old: dict | None, new: dict | None) -> bool:
    """True when a success on ``old`` still counts for ``new`` (same mission, two versions)."""
    old_kind, new_kind = (old or {}).get("kind"), (new or {}).get("kind")
    if old_kind in UNGRADED_KINDS or new_kind in UNGRADED_KINDS:
        return old_kind == new_kind
    return grading_signature(old) == grading_signature(new)


# Read-only simulation of a republication ------------------------------------------------------

def _places(tree: dict) -> list[tuple[tuple[int, int, str], dict]]:
    """(module rank, block rank, slug) of every mission of a course tree or release snapshot."""
    result = []
    for module_rank, module in enumerate(tree.get("modules", [])):
        for block_rank, chapter in enumerate(module.get("chapters", [])):
            for mission in chapter.get("missions", []):
                result.append(((module_rank, block_rank, str(mission.get("slug", ""))), mission))
    return result


def opening_check(db: Session, course_id: int, proposed: dict) -> dict:
    """Compare cohort access against the published snapshot, using stable chapter and mission IDs."""
    from app.models import Assignment, BlockState, BlockUnlock, Cohort, CourseRelease

    def chapters(tree):
        return {chapter["id"]: (module.get("title", ""), chapter)
                for module in tree.get("modules", []) for chapter in module.get("chapters", [])
                if chapter.get("id") is not None}

    def missions(chapter):
        return {mission["id"] for mission in chapter.get("missions", []) if mission.get("id") is not None}

    after = chapters(proposed)
    assignments = db.execute(select(Assignment, CourseRelease, Cohort)
                             .join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                             .join(Cohort, Cohort.id == Assignment.cohort_id)
                             .where(CourseRelease.course_id == course_id, CourseRelease.status == "published")
                             .order_by(Assignment.id)).all()
    cohorts = {cohort.id for _, _, cohort in assignments}
    class_open = set(db.execute(select(BlockState.cohort_id, BlockState.chapter_id)
                                .where(BlockState.cohort_id.in_(cohorts), BlockState.opened_at.is_not(None))).all())
    personal_open = set(db.execute(select(BlockUnlock.cohort_id, BlockUnlock.chapter_id)
                                   .where(BlockUnlock.cohort_id.in_(cohorts)).distinct()).all())
    conflicts, preserved = [], 0
    for assignment, release, cohort in assignments:
        before = chapters(release.student_snapshot)
        previously_published = {mid for _, chapter in before.values() for mid in missions(chapter)}
        for chapter_id, (module_title, chapter) in before.items():
            key = (cohort.id, chapter_id)
            if key not in class_open and key not in personal_open:
                continue
            if chapter_id not in after:
                reason = "le bloc perd son identifiant dans le parcours"
            else:
                previous = missions(chapter)
                current = missions(after[chapter_id][1])
                if previous - current:
                    reason = "des missions quittent le bloc ouvert"
                elif (current - previous) & previously_published:
                    reason = "des missions publiées d’un autre bloc rejoignent le bloc ouvert"
                else:
                    preserved += 1
                    continue
            conflicts.append({"assignment_id": assignment.id, "cohort": cohort.label, "chapter_id": chapter_id,
                              "module": module_title, "title": chapter.get("title", ""), "reason": reason,
                              "class_open": key in class_open, "personal_open": key in personal_open})
    return {"opening_conflicts": conflicts, "preserved_openings": preserved}


def opening_message(result: dict) -> str:
    if not result["opening_conflicts"]:
        return f"Blocs ouverts préservés : {result['preserved_openings']}."
    lines = ["Import ou republication refusé : des accès à des blocs ouverts seraient modifiés."]
    lines.extend(f"- {item['cohort']} · {item['module']} · {item['title']} — {item['reason']}"
                 for item in result["opening_conflicts"])
    lines.append("Conservez ces blocs et leurs missions dans le brouillon, ou fermez-les explicitement avant de réessayer.")
    return "\n".join(lines)


def simulate(db: Session, course_id: int, new_tree: dict | None = None) -> dict:
    """Successes that the classes of this course would stop seeing if ``new_tree`` (default: the current
    draft) were published now. Nothing is written."""
    from app.curriculum import course_tree
    from app.models import Assignment, Cohort, Course, CourseRelease, MissionVersion
    from app.progress import mission_scores
    from app.teacher_dashboard import class_students

    course = db.get(Course, course_id)
    if course is None:
        raise LookupError("course not found")
    tree = new_tree if new_tree is not None else course_tree(db, course, private=True)
    new_places = _places(tree)
    by_id = {mission.get("id"): mission for _, mission in new_places if mission.get("id") is not None}
    by_place = {place: mission for place, mission in new_places}
    rows = db.execute(select(Assignment, CourseRelease, Cohort).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                      .join(Cohort, Cohort.id == Assignment.cohort_id)
                      .where(CourseRelease.course_id == course_id, CourseRelease.status == "published")
                      .order_by(Assignment.id)).all()
    classes, lost = [], []
    for assignment, release, cohort in rows:
        current = _places(release.student_snapshot)
        version_ids = [m["mission_version_id"] for _, m in current if isinstance(m.get("mission_version_id"), int)]
        private = {v.id: v.definition_private for v in db.scalars(select(MissionVersion).where(MissionVersion.id.in_(version_ids)))} if version_ids else {}
        students = class_students(db, cohort.id)
        scores = {student.id: mission_scores(db, student.id, version_ids) for student in students}
        classes.append({"assignment_id": assignment.id, "cohort": cohort.label, "version": release.version, "students": len(students)})
        for place, mission in current:
            vid = mission.get("mission_version_id")
            if vid not in private:
                continue
            old = private[vid]
            new = by_id.get(mission.get("id")) or by_place.get(place)
            if new is not None and carries_over(old, new.get("definition")):
                continue
            reason = ("supprimée du brouillon" if new is None
                      else "devenue leçon ou révision" if (new.get("definition") or {}).get("kind") in UNGRADED_KINDS
                      and old.get("kind") not in UNGRADED_KINDS
                      else "notation modifiée")
            done = [scores[s.id][vid] for s in students if scores[s.id][vid].completed]
            if done:
                lost.append({"assignment_id": assignment.id, "cohort": cohort.label, "slug": place[2],
                             "title": mission.get("title", ""), "reason": reason, "students": len(done),
                             "points": round(sum(item.best for item in done), 2)})
    return {"course_id": course_id, "classes": classes, "lost": lost,
            "lost_successes": sum(item["students"] for item in lost), "lost_points": round(sum(item["points"] for item in lost), 2), **opening_check(db, course_id, tree)}


def report(result: dict) -> str:
    openings = opening_message(result)
    if not result["classes"]:
        return "Aucune classe n'a encore ce cours : rien ne peut être perdu."
    if not result["lost"]:
        return "Aucune réussite ne serait perdue.\n" + openings
    lines = [f"ATTENTION : {result['lost_successes']} réussite(s), {result['lost_points']} point(s) ne seraient plus affichés :"]
    for item in result["lost"]:
        lines.append(f"- {item['cohort']} · {item['title']} ({item['slug']}) : {item['reason']}, "
                     f"{item['students']} étudiant(s), {item['points']} point(s)")
    lines.append("Les tentatives restent en base ; seule la note affichée change. Vérifiez la notation avant de publier.")
    return "\n".join([*lines, openings])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Simule la republication du brouillon d'un cours (lecture seule).")
    parser.add_argument("--course", required=True, help="slug du cours")
    args = parser.parse_args(argv)
    from app.database import get_engine
    from app.models import Course

    with Session(get_engine()) as db:
        course = db.scalar(select(Course).where(Course.slug == args.course))
        if course is None:
            print(f"cours introuvable : {args.course}", file=sys.stderr)
            return 2
        result = simulate(db, course.id)
        db.rollback()  # read-only, whatever happened
    print(report(result))
    return 1 if result["lost"] or result["opening_conflicts"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
