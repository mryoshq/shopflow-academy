"""Figures of the observer space (ADR-0042): indicators, charts, grades and a student's file.

Everything is computed from the same data as the teacher's views (published release of the class, append-only
attempts, project grades). Never: the text of help requests, live presence, notifications or login data.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, display_name, utcnow
from app.models import BlockState, Cohort, HelpRequest, HintReveal, ProjectGrade, ProjectMember, User
from app.progress import attempts_for, course_score, mission_scores
from app.student import blocks_of, flatten
from app.teacher_dashboard import class_students, owned_class

ACTIVE_GAP_MINUTES = 15  # two actions closer than this belong to the same working stretch
GRADE_BUCKETS = [(0, 10), (10, 20), (20, 30), (30, 40), (40, 50), (50, 60), (60, 70), (70, 80), (80, 90), (90, 101)]


class ClassData:
    """One class: release, students (enrolled and enabled, class order) and each student's mission scores."""

    def __init__(self, db: Session, owner: AuthContext, assignment_id: int):
        self.assignment, self.release, self.cohort = owned_class(db, owner, assignment_id)
        self.students: list[User] = [s for s in class_students(db, self.cohort.id) if s.enabled]
        self.missions = flatten(self.release.student_snapshot)
        self.ids = [m["mission_version_id"] for m in self.missions]
        self.scores = {s.id: mission_scores(db, s.id, self.ids) for s in self.students}
        self.blocks = blocks_of(self.release.student_snapshot)

    def core_ids(self) -> list[int]:
        first = next(iter(self.scores.values()), {})
        return [vid for vid in self.ids if vid in first and not first[vid].bonus and not first[vid].lesson]

    def summary(self, student_id: int) -> dict:
        return course_score(self.scores[student_id])


def percent(part: float, whole: float) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def active_minutes(stamps: list[datetime]) -> int:
    """Working time estimated from the actions' times: gaps under 15 minutes count, longer ones are breaks."""
    stamps = sorted(stamps)
    total = 0.0
    for before, after in zip(stamps, stamps[1:]):
        gap = (after - before).total_seconds() / 60
        if gap <= ACTIVE_GAP_MINUTES:
            total += gap
    return round(total)


def attempt_times(db: Session, data: ClassData) -> dict[int, list]:
    times: dict[int, list] = defaultdict(list)
    for attempt, _ in attempts_for(db, [s.id for s in data.students], data.ids):
        times[attempt.user_id].append(attempt)
    return times


def dashboard(db: Session, data: ClassData) -> dict:
    core = data.core_ids()
    summaries = [data.summary(s.id) for s in data.students]
    attempts = attempt_times(db, data)
    opened = set(db.scalars(select(BlockState.chapter_id).where(BlockState.cohort_id == data.cohort.id, BlockState.opened_at.is_not(None))))
    tried = sum(len(items) for items in attempts.values())
    correct = sum(1 for items in attempts.values() for a in items if a.is_correct)
    minutes = [active_minutes([aware(a.created_at) for a in attempts.get(s.id, [])]) for s in data.students]
    progress = [percent(item["completed"], item["total"]) for item in summaries if item["total"]]
    return {
        "students": len(data.students),
        "mean_progress": round(sum(progress) / len(progress), 1) if progress else None,
        "success_rate": percent(correct, tried),
        "bonus_points": round(sum(item["bonus_points"] for item in summaries), 2),
        "bonus_students": sum(1 for item in summaries if item["bonus_points"] > 0),
        "work_minutes_total": sum(minutes),
        "work_minutes_mean": round(sum(minutes) / len(minutes)) if minutes else 0,
        "blocks_open": len([b for b in data.blocks if b["chapter_id"] in opened]), "blocks_total": len(data.blocks),
        "missions": len(core),
        "course_title": data.release.student_snapshot.get("title", ""), "version": data.release.version,
        "cohort": data.cohort.label, "generated_at": utcnow().isoformat(),
    }


def per_student_progress(data: ClassData) -> list[tuple[User, dict]]:
    return [(s, data.summary(s.id)) for s in data.students]


def charts(db: Session, data: ClassData) -> dict:
    core = data.core_ids()
    attempts = attempt_times(db, data)
    students = len(data.students)
    # Progression in time: share of (student, mission) pairs solved, day by day.
    first_success: dict[tuple[int, int], datetime] = {}
    for attempt, vid in attempts_for(db, [s.id for s in data.students], data.ids):
        if attempt.is_correct and vid in core:
            key = (attempt.user_id, vid)
            when = aware(attempt.created_at)
            if key not in first_success or when < first_success[key]:
                first_success[key] = when
    days = sorted({when.date() for when in first_success.values()})
    possible = students * len(core)
    progression = []
    for day in days:
        done = sum(1 for when in first_success.values() if when.date() <= day)
        progression.append({"day": day.isoformat(), "percent": percent(done, possible) or 0})
    # Success by module and by objective (share of students who solved each mission, averaged).
    def rate(versions: list[int]) -> float | None:
        versions = [v for v in versions if v in core]
        if not versions or not students:
            return None
        return percent(sum(1 for s in data.students for v in versions if data.scores[s.id][v].completed), students * len(versions))
    modules: dict[str, list[int]] = {}
    for block in data.blocks:
        modules.setdefault(block["module"] or "—", []).extend(m["mission_version_id"] for m in block["missions"])
    objectives = []
    snapshot = data.release.student_snapshot
    for objective in snapshot.get("objectives", []):
        if not isinstance(objective, dict):
            continue
        covering = [m["mission_version_id"] for m in data.missions if objective.get("id") in ((m.get("definition") or {}).get("objective_ids") or [])]
        value = rate(covering)
        if value is not None:
            statement = str(objective.get("statement", "")).strip()
            objectives.append({"label": f"{objective.get('code', '')} · {statement[:70]}{'…' if len(statement) > 70 else ''}".strip(" ·"), "percent": value})
    # Distribution of the course grades (no names).
    buckets = [0] * len(GRADE_BUCKETS)
    for s in data.students:
        summary = data.summary(s.id)
        value = percent(summary["core_points"], summary["core_possible"]) or 0
        for index, (low, high) in enumerate(GRADE_BUCKETS):
            if low <= value < high:
                buckets[index] += 1
    # Activity per session (day): numbers only.
    ids = [s.id for s in data.students]
    activity: dict[str, dict[str, int]] = defaultdict(lambda: {"attempts": 0, "hints": 0, "help": 0})
    for items in attempts.values():
        for a in items:
            activity[aware(a.created_at).date().isoformat()]["attempts"] += 1
    if ids and data.ids:
        for when in db.scalars(select(HintReveal.created_at).where(HintReveal.user_id.in_(ids), HintReveal.mission_version_id.in_(data.ids))):
            activity[aware(when).date().isoformat()]["hints"] += 1
        for when in db.scalars(select(HelpRequest.created_at).where(HelpRequest.user_id.in_(ids), HelpRequest.mission_version_id.in_(data.ids))):
            activity[aware(when).date().isoformat()]["help"] += 1
    return {
        "progression": progression,
        "modules": [{"label": name, "percent": value} for name, versions in modules.items() if (value := rate(versions)) is not None],
        "objectives": objectives,
        "grades": [{"label": f"{low}–{min(high, 100)} %", "count": count} for (low, high), count in zip(GRADE_BUCKETS, buckets)],
        "activity": [{"day": day, **values} for day, values in sorted(activity.items())],
        "generated_at": utcnow().isoformat(),
    }


def project_totals(db: Session, cohort: Cohort) -> dict[int, dict]:
    """Project grade on 20 of each student of the class (ADR-0034), with the team's other members."""
    from app.project import total

    members = db.scalars(select(ProjectMember).where(ProjectMember.cohort_id == cohort.id)).all()
    by_team: dict[int, list[int]] = defaultdict(list)
    for member in members:
        by_team[member.team_id].append(member.user_id)
    grades = {g.team_id: g for g in db.scalars(select(ProjectGrade).where(ProjectGrade.team_id.in_(list(by_team) or [0])))}
    out = {}
    for team_id, users in by_team.items():
        for uid in users:
            out[uid] = {"team_id": team_id, "partners": [u for u in users if u != uid], **total(grades.get(team_id), uid)}
    return out


def grade_rows(db: Session, data: ClassData) -> list[dict]:
    project = project_totals(db, data.cohort)
    rows = []
    for student in data.students:
        summary = data.summary(student.id)
        rows.append({
            "id": student.id, "name": display_name(student.username),
            "core_points": summary["core_points"], "core_possible": summary["core_possible"],
            "percent": percent(summary["core_points"], summary["core_possible"]) or 0,
            "completed": summary["completed"], "total": summary["total"], "bonus_points": summary["bonus_points"],
            "lessons_read": summary["lessons_read"], "lessons_total": summary["lessons_total"],
            "project_total": project.get(student.id, {}).get("total"),
        })
    return rows


def student_file(db: Session, data: ClassData, student: User) -> dict:
    from app.rewards import course_of, facts_for, summary as rewards_summary

    scores = data.scores[student.id]
    modules: dict[str, dict] = {}
    for block in data.blocks:
        entry = modules.setdefault(block["module"] or "—", {"title": block["module"] or "—", "completed": 0, "total": 0, "points": 0.0, "possible": 0})
        for mission in block["missions"]:
            score = scores.get(mission["mission_version_id"])
            if score is None or score.bonus or score.lesson:
                continue
            entry["total"] += 1
            entry["completed"] += int(score.completed)
            entry["points"] = round(entry["points"] + score.best, 2)
            entry["possible"] += score.possible
    course = course_of(db, data.release)
    facts = facts_for(db, course, [student.id])[student.id]
    rewards = rewards_summary(db, course, student.id, facts)
    project = project_totals(db, data.cohort).get(student.id)
    partners = []
    if project:
        partners = [display_name(u.username) for u in db.scalars(select(User).where(User.id.in_(project["partners"] or [0])))]
    summary = data.summary(student.id)
    return {
        "id": student.id, "name": display_name(student.username), "summary": summary,
        "percent": percent(summary["core_points"], summary["core_possible"]) or 0,
        "modules": list(modules.values()),
        "level": rewards["level"], "badges": [b for b in rewards["badges"] if b["earned"]], "badge_count": rewards["badge_count"],
        "project": {"partners": partners, "common": project["common"], "individual": project["individual"], "total": project["total"]} if project else None,
    }

