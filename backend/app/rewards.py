"""Rewards (ADR-0039): streaks, personal badges, experience levels and the class goal.

Kind and never penalising: nothing here changes a score, a grade, an export or a lock. Everything is
derived deterministically from the append-only attempt log (``app.progress.attempts_for``, which
also counts the work done before a republication), so it can be recomputed at any time:

* the streak, the experience points (XP) and the level are computed on every read, never stored;
* a badge, once earned, is kept in ``student_badges`` (unique per student, course and key, with the
  rules version): awarding is idempotent, and ``python -m app.rewards recompute`` rebuilds them;
* the class goal counts solved missions (or finished blocks) of the whole class, with no names, and
  sends one notification to the class when it crosses 25, 50, 75 and 100 %.

No AI is involved anywhere.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import argparse
import hashlib
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_teacher, require_teacher_csrf, utcnow
from app.curriculum_schema import UNGRADED_KINDS
from app.database import get_db
from app.models import Assignment, Course, CourseRelease, Enrollment, User
from app.rewards_models import ClassGoal, StudentBadge

router = APIRouter(prefix="/api/v1", tags=["rewards"])

RULES_VERSION = 1
XP_MISSION = 10
XP_BONUS = 15
XP_LESSON = 3
LEVELS: tuple[tuple[int, str], ...] = (
    (0, "Stagiaire Data"), (30, "Analyste Junior"), (80, "Analyste Data"), (150, "Data Engineer Junior"),
    (250, "Data Engineer"), (400, "Data Engineer Confirmé"), (600, "Senior Data Engineer"), (850, "Lead Data Engineer"),
)
STREAK_MARKS = (3, 5, 10)
MILESTONES = (25, 50, 75, 100)
METRICS = {"missions": "missions réussies", "blocks": "blocs terminés"}


# Facts of one student in one course -------------------------------------------------------------

@dataclass
class Facts:
    solved: set[int] = field(default_factory=set)          # graded missions solved (any attempt)
    lessons: set[int] = field(default_factory=set)         # lessons and reviews read
    streak: int = 0
    best_streak: int = 0
    blocks_done: set[int] = field(default_factory=set)
    xp: int = 0


@dataclass
class Course_:
    """What the rules need from a release: mission kinds, blocks, objectives and modules."""

    release: CourseRelease
    graded: set[int]
    bonus: set[int]
    ungraded: set[int]
    blocks: list[tuple[int, list[int]]]                    # (chapter id, versions counting for « terminé »)
    objectives: list[tuple[str, str, list[int]]]           # (code, statement, main graded versions)
    modules: list[tuple[str, list[int]]]                   # (title, bonus versions)
    chapter_of: dict[int, int] = field(default_factory=dict)  # version → block (chapter id)

    @property
    def versions(self) -> list[int]:
        return sorted(self.graded | self.ungraded)


def course_of(db: Session, release: CourseRelease) -> Course_:
    from app.progress import definitions
    from app.student import blocks_of, flatten

    missions = flatten(release.student_snapshot)
    defs = definitions(db, [item["mission_version_id"] for item in missions])
    ungraded = {vid for vid, d in defs.items() if d.kind in UNGRADED_KINDS}
    graded = set(defs) - ungraded
    bonus = {vid for vid in graded if defs[vid].bonus}
    blocks = []
    for block in blocks_of(release.student_snapshot):
        vids = [m["mission_version_id"] for m in block["missions"] if m["mission_version_id"] in defs]
        core = [vid for vid in vids if vid in graded and vid not in bonus] or [vid for vid in vids if vid in ungraded]
        if core:
            blocks.append((block["chapter_id"], core))
    covering: dict[int, list[int]] = {}
    for item in missions:
        vid = item["mission_version_id"]
        if vid in graded and vid not in bonus:
            for objective_id in (item.get("definition") or {}).get("objective_ids", []):
                covering.setdefault(objective_id, []).append(vid)
    from app.student import first_sentence

    # Students only ever see the first sentence of an objective, never its code (ADR-0022).
    objectives = [(str(o.get("code", "")), first_sentence(str(o.get("statement", ""))), covering[o.get("id")])
                  for o in release.student_snapshot.get("objectives", []) if isinstance(o, dict) and covering.get(o.get("id"))]
    modules: dict[str, list[int]] = {}
    for item in missions:
        if item["mission_version_id"] in bonus:
            modules.setdefault(item["module"], []).append(item["mission_version_id"])
    chapter_of = {item["mission_version_id"]: item.get("chapter_id") for item in missions}
    return Course_(release, graded, bonus, ungraded, blocks, objectives, list(modules.items()), chapter_of)


def facts_for(db: Session, course: Course_, user_ids: list[int], *, without: int | None = None) -> dict[int, Facts]:
    """Streak, solved missions, read lessons, finished blocks and XP of each student, from the attempts in order.

    ``without``: an attempt id left out (the facts just before that attempt, to tell what it changed).
    """
    from app.progress import attempts_for

    result = {uid: Facts() for uid in user_ids}
    tried: dict[int, set[int]] = {uid: set() for uid in user_ids}
    for attempt, vid in attempts_for(db, user_ids, course.versions):
        if attempt.id == without:
            continue
        facts = result[attempt.user_id]
        if vid in course.ungraded:
            if attempt.is_correct:
                facts.lessons.add(vid)
            continue
        if vid in facts.solved:
            continue  # practice on a mission already solved: never counts, never breaks the streak
        if attempt.is_correct:
            if vid not in tried[attempt.user_id]:
                facts.streak += 1
                facts.best_streak = max(facts.best_streak, facts.streak)
            facts.solved.add(vid)
        else:
            facts.streak = 0  # silently: the page shows no negative message
        tried[attempt.user_id].add(vid)
    for facts in result.values():
        done = facts.solved | facts.lessons
        facts.blocks_done = {chapter for chapter, core in course.blocks if all(vid in done for vid in core)}
        facts.xp = (XP_MISSION * len(facts.solved - course.bonus) + XP_BONUS * len(facts.solved & course.bonus)
                    + XP_LESSON * len(facts.lessons))
    return result


def level(xp: int) -> dict:
    index = max(i for i, (floor, _) in enumerate(LEVELS) if xp >= floor)
    floor, name = LEVELS[index]
    following = LEVELS[index + 1] if index + 1 < len(LEVELS) else None
    return {"number": index + 1, "name": name, "xp": xp, "floor": floor,
            "next_name": following[1] if following else None, "next_at": following[0] if following else None,
            "max_level": following is None}


# Badges -------------------------------------------------------------------------------------------

def short(text: str, size: int = 70) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip(".")
    return text if len(text) <= size else text[: size - 1].rstrip() + "…"


def objective_key(code: str) -> str:
    """Opaque, stable key: students never see an objective code (ADR-0022)."""
    return "objective:" + hashlib.sha256(code.encode()).hexdigest()[:16]


def catalogue(course: Course_) -> list[dict]:
    """Every badge this course offers, in display order (rules version 1)."""
    items: list[dict] = [{"key": "first-mission", "label": "Première mission réussie", "hint": "Réussir une mission."},
             {"key": "first-block", "label": "Premier bloc terminé", "hint": "Terminer toutes les missions d’un bloc."},
             {"key": "streak-5", "label": "Série de 5", "hint": "Réussir 5 missions de suite du premier coup."},
             {"key": "streak-10", "label": "Série de 10", "hint": "Réussir 10 missions de suite du premier coup."}]
    items += [{"key": objective_key(code), "label": short(f"Objectif atteint : {short(statement, 90)}", 150),
               "hint": "Réussir toutes les missions de cet objectif.", "versions": vids} for code, statement, vids in course.objectives]
    items += [{"key": f"bonus:{title}"[:160], "label": short(f"Tous les bonus : {title}", 150),
               "hint": "Réussir tous les bonus de ce module.", "versions": vids} for title, vids in course.modules]
    return items


def earned_keys(course: Course_, facts: Facts) -> set[str]:
    keys = set()
    if facts.solved:
        keys.add("first-mission")
    if facts.blocks_done:
        keys.add("first-block")
    if facts.best_streak >= 5:
        keys.add("streak-5")
    if facts.best_streak >= 10:
        keys.add("streak-10")
    keys |= {objective_key(code) for code, _, vids in course.objectives if all(vid in facts.solved for vid in vids)}
    keys |= {f"bonus:{title}"[:160] for title, vids in course.modules if all(vid in facts.solved for vid in vids)}
    return keys


def sync_badges(db: Session, course: Course_, user_id: int, facts: Facts, *, notify: bool) -> list[dict]:
    """Record the badges earned and not yet stored; return them. Idempotent; commits nothing."""
    from app.live import notify as send

    course_id = course.release.course_id
    stored = set(db.scalars(select(StudentBadge.key).where(StudentBadge.user_id == user_id, StudentBadge.course_id == course_id)).all())
    labels = {item["key"]: item["label"] for item in catalogue(course)}
    new = []
    for key in sorted(earned_keys(course, facts) - stored, key=list(labels).index):
        try:
            with db.begin_nested():
                db.add(StudentBadge(user_id=user_id, course_id=course_id, key=key, label=labels[key], rules_version=RULES_VERSION))
        except IntegrityError:  # awarded concurrently
            continue
        new.append({"key": key, "label": labels[key]})
        if notify:
            send(db, [user_id], "badge", f"Nouveau badge : {labels[key]}", data={"key": key, "course_id": course_id},
                 dedup=f"badge:{course_id}:{key}"[:160])
    return new


def collection(db: Session, course: Course_, user_id: int, facts: Facts, open_blocks: set[int] | None = None) -> list[dict]:
    """The student's collection: earned badges first (stored or earned now), then the ones still to discover.

    ``open_blocks``: for a student, a badge tied to missions (objective, bonus) is announced only once one of
    its blocks is open; a closed block exposes nothing. None = everything (the teacher's view).
    """
    stored = {row.key: row for row in db.scalars(select(StudentBadge).where(StudentBadge.user_id == user_id,
                                                                            StudentBadge.course_id == course.release.course_id))}
    earned = earned_keys(course, facts)
    items = []
    for item in catalogue(course):
        row = stored.get(item["key"])
        versions = item.pop("versions", None)
        got = row is not None or item["key"] in earned
        if not got and versions and open_blocks is not None and not any(course.chapter_of.get(v) in open_blocks for v in versions):
            continue
        items.append({**item, "earned": got, "earned_at": row.earned_at.isoformat() if row is not None and row.earned_at else None})
    # Badges kept from an earlier version of the course (an objective since removed, for instance).
    known = {item["key"] for item in items}
    items += [{"key": key, "label": row.label, "hint": "", "earned": True, "earned_at": row.earned_at.isoformat() if row.earned_at else None}
              for key, row in stored.items() if key not in known]
    return sorted(items, key=lambda item: not item["earned"])


def summary(db: Session, course: Course_, user_id: int, facts: Facts | None = None, open_blocks: set[int] | None = None) -> dict:
    facts = facts or facts_for(db, course, [user_id])[user_id]
    badges = collection(db, course, user_id, facts, open_blocks)
    return {"streak": facts.streak, "best_streak": facts.best_streak, "level": level(facts.xp),
            "badges": badges, "badge_count": sum(1 for item in badges if item["earned"])}


# Class goal ---------------------------------------------------------------------------------------

def class_students(db: Session, cohort_id: int) -> list[User]:
    return list(db.scalars(select(User).join(Enrollment, Enrollment.user_id == User.id)
                           .where(Enrollment.cohort_id == cohort_id, User.role == "student", User.enabled.is_(True))).all())


def goal_state(db: Session, course: Course_, cohort_id: int) -> dict:
    """The class goal: progress of the whole class, never a name."""
    students = class_students(db, cohort_id)
    facts = facts_for(db, course, [s.id for s in students]).values()
    main = course.graded - course.bonus
    row = db.scalar(select(ClassGoal).where(ClassGoal.cohort_id == cohort_id, ClassGoal.course_id == course.release.course_id))
    metric = row.metric if row else "missions"
    value = sum(len(f.solved & main) for f in facts) if metric == "missions" else sum(len(f.blocks_done) for f in facts)
    default = len(students) * (len(main) if metric == "missions" else len(course.blocks))
    target = max(1, row.target if row else default)
    percent = min(100, int(value * 100 // target))
    return {"metric": metric, "metric_label": METRICS[metric], "target": target, "value": value, "percent": percent,
            "custom": row is not None, "default_target": max(1, default),
            "milestone": max((m for m in MILESTONES if percent >= m), default=0),
            "text": f"La classe a réussi {value} {'mission' if value <= 1 else 'missions'} sur {target}" if metric == "missions"
            else f"La classe a terminé {value} {'bloc' if value <= 1 else 'blocs'} sur {target}"}


def celebrate(db: Session, course: Course_, cohort_id: int) -> list[int]:
    """One notification to the class for the highest milestone just crossed (deduplicated). Commits nothing."""
    from app.live import notify as send

    state = goal_state(db, course, cohort_id)
    if not state["milestone"]:
        return []
    m = state["milestone"]
    text = (f"Objectif de classe atteint : {state['text'][0].lower()}{state['text'][1:]}. Bravo à toutes et à tous !"
            if m == 100 else f"Objectif de classe : {m} % ! {state['text']}. Continuez ensemble.")
    key = f"class-goal:{cohort_id}:{course.release.course_id}:{state['metric']}:{state['target']}:{m}"
    return send(db, [s.id for s in class_students(db, cohort_id)], "class_goal", text,
                data={"milestone": m, "course_id": course.release.course_id}, dedup=key)


# Hooks for the student routes ---------------------------------------------------------------------

def after_attempt(db: Session, release: CourseRelease, user_id: int, version_id: int, attempt_id: int, correct: bool) -> dict:
    """Feedback for the attempt just stored: streak mark, new badges, finished block, level reached. Commits."""
    from app.student import student_cohorts

    course = course_of(db, release)
    facts = facts_for(db, course, [user_id])[user_id]
    before = facts_for(db, course, [user_id], without=attempt_id)[user_id]
    new = sync_badges(db, course, user_id, facts, notify=True)
    notified = []
    for cohort_id in student_cohorts(db, user_id, release.id):
        notified += celebrate(db, course, cohort_id)
    db.commit()
    if notified or new:
        from app.live import push_after_commit

        push_after_commit(db, sorted(set(notified) | ({user_id} if new else set())))
    finished = sorted(facts.blocks_done - before.blocks_done)
    old_level, new_level = level(before.xp), level(facts.xp)
    graded = version_id in course.graded
    return {
        "streak": facts.streak, "best_streak": facts.best_streak,
        "streak_mark": facts.streak if graded and correct and facts.streak in STREAK_MARKS and facts.streak > before.streak else None,
        "xp_gained": facts.xp - before.xp, "level": new_level,
        "level_up": new_level["name"] if new_level["number"] > old_level["number"] else None,
        "block_finished": bool(finished), "new_badges": new,
    }


def dashboard_rewards(db: Session, release: CourseRelease, user_id: int) -> dict:
    """Rewards block of the student dashboard; records silently badges earned earlier (recomputation)."""
    from app.student import all_open_blocks, student_cohorts

    course = course_of(db, release)
    facts = facts_for(db, course, [user_id])[user_id]
    if sync_badges(db, course, user_id, facts, notify=False):
        db.commit()
    cohorts = student_cohorts(db, user_id, release.id)
    return {**summary(db, course, user_id, facts, all_open_blocks(db, user_id, release.id)),
            "class_goal": goal_state(db, course, cohorts[0]) if cohorts else None}


# Teacher: class goal settings ---------------------------------------------------------------------

class GoalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str = Field(pattern=r"^(missions|blocks)$")
    target: int | None = Field(default=None, ge=1, le=10000)


@router.get("/teacher/classes/{assignment_id}/goal")
def get_goal(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    from app.teacher_dashboard import owned_class

    response.headers["Cache-Control"] = "no-store"
    _, release, cohort = owned_class(db, auth, assignment_id)
    return goal_state(db, course_of(db, release), cohort.id)


@router.put("/teacher/classes/{assignment_id}/goal")
def put_goal(assignment_id: int, payload: GoalInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Choose the metric and its target; no target = the default (everyone, everything)."""
    from app.teacher_dashboard import audit, owned_class

    assignment, release, cohort = owned_class(db, auth, assignment_id)
    row = db.scalar(select(ClassGoal).where(ClassGoal.cohort_id == cohort.id, ClassGoal.course_id == release.course_id))
    course = course_of(db, release)
    if payload.target is None:
        students = len(class_students(db, cohort.id))
        target = max(1, students * (len(course.graded - course.bonus) if payload.metric == "missions" else len(course.blocks)))
    else:
        target = payload.target
    if row is None:
        row = ClassGoal(cohort_id=cohort.id, course_id=release.course_id, metric=payload.metric, target=target, updated_by=auth.user.id)
        db.add(row)
    else:
        row.metric, row.target, row.updated_by = payload.metric, target, auth.user.id
    audit(db, auth, "class_goal.update", assignment.id, {"metric": payload.metric, "target": target})
    db.commit()
    return goal_state(db, course, cohort.id)


def student_rewards(db: Session, release: CourseRelease, user_id: int) -> dict:
    """For the teacher's student panel: level, streaks and badges (never a grade)."""
    course = course_of(db, release)
    return summary(db, course, user_id)


# Command line: recompute every badge from the attempts --------------------------------------------

def recompute(db: Session) -> dict:
    """Award, silently, every badge already earned (existing attempts). Idempotent: a second run adds nothing."""
    added = checked = 0
    pairs = db.execute(select(Enrollment.user_id, Assignment.course_release_id).join(Assignment, Assignment.cohort_id == Enrollment.cohort_id)
                       .join(CourseRelease, CourseRelease.id == Assignment.course_release_id).join(Course, Course.id == CourseRelease.course_id)
                       .where(CourseRelease.status == "published", Course.status != "archived")).all()
    courses: dict[int, Course_] = {}
    for user_id, release_id in sorted(set(pairs)):
        if release_id not in courses:
            courses[release_id] = course_of(db, db.get(CourseRelease, release_id))
        course = courses[release_id]
        checked += 1
        added += len(sync_badges(db, course, user_id, facts_for(db, course, [user_id])[user_id], notify=False))
    db.commit()
    return {"checked": checked, "added": added, "rules_version": RULES_VERSION, "at": utcnow().isoformat()}


def main() -> None:
    from app.database import SessionLocal

    parser = argparse.ArgumentParser(description="Badges (ADR-0039)")
    parser.add_argument("command", choices=["recompute"])
    parser.parse_args()
    with SessionLocal() as db:
        print(json.dumps(recompute(db), ensure_ascii=False))


if __name__ == "__main__":
    main()
