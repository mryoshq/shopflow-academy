"""One class, one teacher, one course: the day in 15-minute blocks (sprint 2, part A).

* ``/teacher/main``: the single course and the single class, found or created
  idempotently (``MAIN_COURSE_SLUG``, ``CLASS_LABEL``). Publishing the main course moves
  the class assignment to the new release; new blocks stay closed.
* Blocks (chapters) are opened per class, in order, by the teacher. Opening and closing
  are audited. Nothing closes automatically and students never see a timer.
* Help requests: pending list, "handled" action, per-mission difficulty statistics.
* Cleanup of leftover E2E courses: dry run by default, archive only, never delete.

Every class route is restricted to the course owner (404 otherwise), like ADR-0013.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, aware, display_name, require_teacher, require_teacher_csrf, utcnow
from app.config import get_settings
from app.database import get_db
from app.models import (
    Assignment, AuditEvent, BlockState, Cohort, Course, CourseRelease, Enrollment, HelpRequest, HintReveal, MissionAttempt, User,
)
from app.progress import definitions
from app.student import blocks_of, flatten
from app.teacher_dashboard import HELP_AFTER_FAILURES, audit, class_students, iso, owned_class

router = APIRouter(prefix="/api/v1/teacher", tags=["classroom"])
BLOCK_MINUTES = 15
CLEANUP_PATTERN = re.compile(r"e2e|test|demo", re.IGNORECASE)


# Main course and class -------------------------------------------------------------------

def main_cohort(db: Session) -> Cohort | None:
    return db.scalar(select(Cohort).where(Cohort.label == get_settings().class_label))


def main_course(db: Session) -> Course | None:
    return db.scalar(select(Course).where(Course.slug == get_settings().main_course_slug))


def class_assignment(db: Session, course: Course | None, cohort: Cohort | None) -> tuple[Assignment, CourseRelease] | None:
    if course is None or cohort is None:
        return None
    row = db.execute(select(Assignment, CourseRelease).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                     .where(Assignment.cohort_id == cohort.id, CourseRelease.course_id == course.id)
                     .order_by(CourseRelease.version.desc()).limit(1)).first()
    return (row[0], row[1]) if row else None


def main_state(db: Session, auth: AuthContext) -> dict:
    course = main_course(db)
    cohort = main_cohort(db)
    if course is not None and course.created_by != auth.user.id:
        raise HTTPException(status_code=409, detail="main course belongs to another teacher")
    found = class_assignment(db, course, cohort)
    latest = db.scalar(select(CourseRelease).where(CourseRelease.course_id == course.id).order_by(CourseRelease.version.desc())
                       .limit(1)) if course else None
    return {
        "course": {"id": course.id, "slug": course.slug, "title": course.title, "status": course.status} if course else None,
        "cohort": {"id": cohort.id, "label": cohort.label, "student_count": len(class_students(db, cohort.id))} if cohort else None,
        "assignment_id": found[0].id if found else None,
        "assigned_version": found[1].version if found else None,
        "latest_version": latest.version if latest else None,
    }


@router.get("/main")
def get_main(response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return main_state(db, auth)


def setup_class(db: Session, teacher: User) -> Cohort:
    """Find or create the class and enroll every active student (idempotent, not committed)."""
    cohort = main_cohort(db)
    if cohort is None:
        cohort = Cohort(label=get_settings().class_label)
        db.add(cohort)
        db.flush()
        db.add(AuditEvent(actor_id=teacher.id, action="cohort.create", resource_type="cohort", resource_id=cohort.id))
    enrolled = set(db.scalars(select(Enrollment.user_id).where(Enrollment.cohort_id == cohort.id)).all())
    for student in db.scalars(select(User).where(User.role == "student", User.enabled.is_(True)).order_by(User.id)):
        if student.id not in enrolled:
            db.add(Enrollment(cohort_id=cohort.id, user_id=student.id))
    db.flush()
    return cohort


@router.post("/main/setup")
def setup_main(auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Idempotent: find or create the class (every active student) and the empty main course draft."""
    settings = get_settings()
    before = main_cohort(db)
    count_before = len(db.scalars(select(Enrollment.id).where(Enrollment.cohort_id == before.id)).all()) if before else 0
    cohort = setup_class(db, auth.user)
    added = len(db.scalars(select(Enrollment.id).where(Enrollment.cohort_id == cohort.id)).all()) - count_before
    course = main_course(db)
    if course is None:
        course = Course(slug=settings.main_course_slug, title=settings.main_course_title, created_by=auth.user.id,
                        description="Vous êtes l’équipe Data de ShopFlow. Chaque module est une journée de travail.")
        db.add(course)
        db.flush()
        db.add(AuditEvent(actor_id=auth.user.id, action="course.create", resource_type="course", resource_id=course.id))
    elif course.created_by != auth.user.id:
        db.rollback()
        raise HTTPException(status_code=409, detail="main course belongs to another teacher")
    db.commit()
    return {**main_state(db, auth), "enrolled_now": added}


def assign_to_class(db: Session, auth: AuthContext, release: CourseRelease, cohort: Cohort) -> Assignment:
    """Point the class at ``release``: the previous assignment of the same course moves (pause and unlocks kept)."""
    current = db.scalar(select(Assignment).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                        .where(Assignment.cohort_id == cohort.id, CourseRelease.course_id == release.course_id)
                        .order_by(CourseRelease.version.desc()).limit(1))
    if current is None:
        current = Assignment(cohort_id=cohort.id, course_release_id=release.id)
        db.add(current)
        db.flush()
    elif current.course_release_id != release.id:
        previous = current.course_release_id
        for other in db.scalars(select(Assignment).join(CourseRelease, CourseRelease.id == Assignment.course_release_id)
                                .where(Assignment.cohort_id == cohort.id, CourseRelease.course_id == release.course_id,
                                       Assignment.id != current.id)):
            db.delete(other)
        db.flush()
        current.course_release_id = release.id
        db.flush()
        audit(db, auth, "release.move", current.id, {"from_release": previous, "to_release": release.id})
    audit(db, auth, "release.assign", current.id, {"version": release.version})
    return current


@router.post("/main/publish", status_code=201)
def publish_main(auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Publish the main course and give the new version to the class. New blocks arrive closed."""
    from app.curriculum import publish_course

    course = main_course(db)
    cohort = main_cohort(db)
    if course is None or cohort is None or course.created_by != auth.user.id:
        raise HTTPException(status_code=409, detail="run setup first")
    published = publish_course(course.id, auth, db)
    release = db.get(CourseRelease, published["id"])
    assignment = assign_to_class(db, auth, release, cohort)
    db.commit()
    return {**published, "assignment_id": assignment.id}


# Blocks -----------------------------------------------------------------------------------

def block_states(db: Session, cohort_id: int) -> dict[int, BlockState]:
    return {item.chapter_id: item for item in db.scalars(select(BlockState).where(BlockState.cohort_id == cohort_id))}


def notify_block_open(db: Session, assignment: Assignment, title: str, chapter_id: int, now) -> list[int]:
    """Automatic notification to the class when a block opens (ADR-0023), unless switched off."""
    from app.live import notify, teacher_settings

    course = db.scalar(select(Course).join(CourseRelease, CourseRelease.course_id == Course.id).where(CourseRelease.id == assignment.course_release_id))
    if course is None or not teacher_settings(db, course.created_by).get("student_block_open", True):
        return []
    students = [s.id for s in class_students(db, assignment.cohort_id) if s.enabled]
    return notify(db, students, "block_open", f"Le bloc « {title} » est ouvert.", data={"chapter_id": chapter_id},
                  dedup=f"open:{assignment.cohort_id}:{chapter_id}:{now.isoformat()}")


def set_block(db: Session, auth: AuthContext, assignment: Assignment, release: CourseRelease, chapter_id: int, is_open: bool) -> dict:
    block = next((item for item in blocks_of(release.student_snapshot) if item["chapter_id"] == chapter_id), None)
    if block is None:
        raise HTTPException(status_code=404, detail="block not found")
    state = db.scalar(select(BlockState).where(BlockState.cohort_id == assignment.cohort_id, BlockState.chapter_id == chapter_id))
    now = utcnow()
    changed = False
    if state is None:
        state = BlockState(cohort_id=assignment.cohort_id, chapter_id=chapter_id)
        db.add(state)
    if is_open and state.opened_at is None:
        state.opened_at, state.closed_at, changed = now, None, True
    elif not is_open and state.opened_at is not None:
        state.opened_at, state.closed_at, changed = None, now, True
    state.updated_by = auth.user.id
    notified: list[int] = []
    if changed:
        audit(db, auth, "block.open" if is_open else "block.close", assignment.id, {"block": block["title"], "module": block["module"]})
        if is_open:
            notified = notify_block_open(db, assignment, block["title"], chapter_id, now)
    db.commit()
    if notified:
        from app.live import push_after_commit

        push_after_commit(db, notified)
    return {"chapter_id": chapter_id, "title": block["title"], "open": is_open, "opened_at": iso(state.opened_at), "changed": changed}


@router.post("/classes/{assignment_id}/blocks/{chapter_id}/open")
def open_block(assignment_id: int, chapter_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, release, _ = owned_class(db, auth, assignment_id)
    return set_block(db, auth, assignment, release, chapter_id, True)


@router.post("/classes/{assignment_id}/blocks/{chapter_id}/close")
def close_block(assignment_id: int, chapter_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    assignment, release, _ = owned_class(db, auth, assignment_id)
    return set_block(db, auth, assignment, release, chapter_id, False)


@router.post("/classes/{assignment_id}/blocks/open-next")
def open_next_block(assignment_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Open the first closed block in course order (409 when every block is already open)."""
    assignment, release, _ = owned_class(db, auth, assignment_id)
    states = block_states(db, assignment.cohort_id)
    for block in blocks_of(release.student_snapshot):
        state = states.get(block["chapter_id"])
        if state is None or state.opened_at is None:
            return set_block(db, auth, assignment, release, block["chapter_id"], True)
    raise HTTPException(status_code=409, detail="every block is already open")


@router.get("/classes/{assignment_id}/timeline")
def timeline(assignment_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> dict:
    """The day at a glance: blocks in order, completion, pending help, per-mission difficulties."""
    response.headers["Cache-Control"] = "no-store"
    assignment, release, cohort = owned_class(db, auth, assignment_id)
    students = class_students(db, cohort.id)
    student_ids = [item.id for item in students]
    names = {item.id: display_name(item.username) for item in students}
    missions = flatten(release.student_snapshot)
    ids = [item["mission_version_id"] for item in missions]
    defs = definitions(db, ids)
    attempts = db.scalars(select(MissionAttempt).where(MissionAttempt.mission_version_id.in_(ids),
                                                       MissionAttempt.user_id.in_(student_ids))).all() if ids and student_ids else []
    hints = db.scalars(select(HintReveal).where(HintReveal.mission_version_id.in_(ids),
                                                HintReveal.user_id.in_(student_ids))).all() if ids and student_ids else []
    solved: dict[int, set[int]] = {vid: set() for vid in ids}
    failures: dict[tuple[int, int], int] = {}
    tries: dict[int, int] = {vid: 0 for vid in ids}
    fast: dict[int, dict[int, int]] = {vid: {} for vid in ids}  # ADR-0027: « clics rapides » per mission and student
    for item in attempts:
        tries[item.mission_version_id] += 1
        if item.fast:
            fast[item.mission_version_id][item.user_id] = fast[item.mission_version_id].get(item.user_id, 0) + 1
        if item.is_correct:
            solved[item.mission_version_id].add(item.user_id)
        else:
            failures[(item.mission_version_id, item.user_id)] = failures.get((item.mission_version_id, item.user_id), 0) + 1
    hint_count: dict[int, int] = {vid: 0 for vid in ids}
    for item in hints:
        hint_count[item.mission_version_id] += 1
    pending = db.scalars(select(HelpRequest).where(HelpRequest.mission_version_id.in_(ids), HelpRequest.status == "pending",
                                                   HelpRequest.user_id.in_(student_ids)).order_by(HelpRequest.id)).all() if ids and student_ids else []
    block_of = {item["mission_version_id"]: item for item in missions}
    states = block_states(db, cohort.id)
    blocks = []
    next_block = None
    for position, block in enumerate(blocks_of(release.student_snapshot), start=1):
        state = states.get(block["chapter_id"])
        is_open = bool(state and state.opened_at)
        vids = [m["mission_version_id"] for m in block["missions"]]
        core = [vid for vid in vids if vid in defs and not defs[vid].bonus] or vids
        done = sum(1 for sid in student_ids if core and all(sid in solved[vid] for vid in core))
        if not is_open and next_block is None:
            next_block = block["chapter_id"]
        blocks.append({
            "chapter_id": block["chapter_id"], "position": position, "module": block["module"], "title": block["title"],
            "open": is_open, "opened_at": iso(state.opened_at) if is_open else None,
            "mission_count": len([vid for vid in vids if vid in defs and not defs[vid].bonus]), "bonus_count": len([vid for vid in vids if vid in defs and defs[vid].bonus]),
            "duration_minutes": sum(defs[vid].estimated_duration_minutes for vid in vids if vid in defs and not defs[vid].bonus),
            "completed_students": done, "help_pending": sum(1 for h in pending if h.mission_version_id in vids),
        })
    now = utcnow()
    return {
        "generated_at": now.isoformat(), "assignment_id": assignment.id, "student_count": len(students),
        "block_minutes": BLOCK_MINUTES, "next_block_id": next_block, "blocks": blocks,
        "help": [{
            "id": h.id, "student": names.get(h.user_id, "?"), "mission_version_id": h.mission_version_id,
            "mission": block_of[h.mission_version_id]["title"], "block": block_of[h.mission_version_id]["chapter"],
            "message": h.message, "created_at": iso(h.created_at),
        } for h in pending],
        "missions": [{
            "mission_version_id": vid, "title": block_of[vid]["title"], "block": block_of[vid]["chapter"],
            "bonus": bool(vid in defs and defs[vid].bonus), "completed": len(solved[vid]), "attempts": tries[vid], "hints": hint_count[vid],
            "stuck": sorted(names[sid] for sid in student_ids
                            if sid not in solved[vid] and failures.get((vid, sid), 0) >= HELP_AFTER_FAILURES),
            "fast_attempts": sum(fast[vid].values()),
            "fast": [{"student": names[sid], "count": count} for sid, count in sorted(fast[vid].items(), key=lambda kv: names[kv[0]])],
        } for vid in ids],
    }


@router.post("/help/{help_id}/handle")
def handle_help(help_id: int, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Mark a help request as handled (owner of the course only; 404 otherwise)."""
    item = db.get(HelpRequest, help_id)
    release = db.get(CourseRelease, item.course_release_id) if item else None
    course = db.get(Course, release.course_id) if release else None
    if item is None or course is None or course.created_by != auth.user.id:
        raise HTTPException(status_code=404, detail="help request not found")
    if item.status != "handled":
        item.status, item.handled_at, item.handled_by = "handled", utcnow(), auth.user.id
        student = db.get(User, item.user_id)
        assignment = db.scalar(select(Assignment.id).join(Enrollment, Enrollment.cohort_id == Assignment.cohort_id)
                               .where(Enrollment.user_id == item.user_id, Assignment.course_release_id == release.id).limit(1))
        if assignment is not None:
            title = next((m["title"] for m in flatten(release.student_snapshot) if m["mission_version_id"] == item.mission_version_id), "")
            audit(db, auth, "help.handled", assignment, {"student": display_name(student.username) if student else "?", "mission": title})
        notified: list[int] = []
        from app.live import notify, push_after_commit, teacher_settings
        if teacher_settings(db, auth.user.id).get("student_help_handled", True):
            title = next((m["title"] for m in flatten(release.student_snapshot) if m["mission_version_id"] == item.mission_version_id), "")
            notified = notify(db, [item.user_id], "help_handled", f"Votre demande d’aide sur « {title} » a été prise en compte.",
                              sender_id=auth.user.id, data={"mission_version_id": item.mission_version_id}, dedup=f"help_handled:{item.id}")
        db.commit()
        push_after_commit(db, notified)
    return {"id": item.id, "status": item.status, "handled_at": aware(item.handled_at).isoformat() if item.handled_at else None}


# Cleanup of leftover test courses -----------------------------------------------------------

class CleanupInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    apply: bool = False


def cleanup_candidates(db: Session, owner_id: int) -> list[Course]:
    """Courses of the owner whose slug contains e2e, test or demo, not archived, never given to the real class."""
    settings = get_settings()
    cohort = main_cohort(db)
    real_class = set(db.scalars(select(CourseRelease.course_id).join(Assignment, Assignment.course_release_id == CourseRelease.id)
                                .where(Assignment.cohort_id == cohort.id)).all()) if cohort else set()
    courses = db.scalars(select(Course).where(Course.created_by == owner_id, Course.status != "archived").order_by(Course.id)).all()
    return [c for c in courses if CLEANUP_PATTERN.search(c.slug) and c.slug != settings.main_course_slug and c.id not in real_class]


def run_cleanup(db: Session, owner: User, apply: bool) -> dict:
    candidates = cleanup_candidates(db, owner.id)
    report = {"mode": "apply" if apply else "dry-run", "count": len(candidates),
              "courses": [{"id": c.id, "slug": c.slug, "title": c.title, "status": c.status} for c in candidates]}
    if apply:
        for course in candidates:
            course.status = "archived"
            for release in db.scalars(select(CourseRelease).where(CourseRelease.course_id == course.id)):
                release.status = "archived"
            db.add(AuditEvent(actor_id=owner.id, action="course.archive", resource_type="course", resource_id=course.id,
                              details={"reason": "cleanup of test courses"}))
        db.commit()
    return report


@router.post("/courses/cleanup")
def cleanup(payload: CleanupInput, auth: AuthContext = Depends(require_teacher_csrf), db: Session = Depends(get_db)) -> dict:
    """Archive leftover E2E courses in one go. Dry run unless ``apply`` is true; nothing is deleted."""
    return run_cleanup(db, auth.user, payload.apply)


# Password reset of a student (shown once) -----------------------------------------------

READABLE = "abcdefghjkmnpqrstuvwxyzACDEFGHJKMNPQRTUVWXY34679"


def readable_password() -> str:
    """Three groups of four unambiguous characters (about 67 bits), easy to read aloud."""
    import secrets

    return "-".join("".join(secrets.choice(READABLE) for _ in range(4)) for _ in range(3))


@router.post("/classes/{assignment_id}/students/{user_id}/reset-password")
def reset_password(assignment_id: int, user_id: int, response: Response, auth: AuthContext = Depends(require_teacher_csrf),
                   db: Session = Depends(get_db)) -> dict:
    """New password for one student of the class: returned once, never stored in clear, sessions revoked, audited."""
    from sqlalchemy import update

    from app.auth import digest, password_hash
    from app.models import LoginThrottle, UserSession

    response.headers["Cache-Control"] = "no-store"
    assignment, _, cohort = owned_class(db, auth, assignment_id)
    student = next((item for item in class_students(db, cohort.id) if item.id == user_id), None)
    if student is None or not student.enabled:
        raise HTTPException(status_code=404, detail="student not found")
    password = readable_password()
    student.password_hash = password_hash.hash(password)
    revoked = db.execute(update(UserSession).where(UserSession.user_id == student.id, UserSession.revoked_at.is_(None))
                         .values(revoked_at=utcnow())).rowcount
    throttle = db.get(LoginThrottle, digest(student.username))
    if throttle is not None:
        db.delete(throttle)
    audit(db, auth, "student.password_reset", assignment.id, {"student": display_name(student.username), "sessions_revoked": revoked})
    db.commit()
    return {"student": display_name(student.username), "password": password, "sessions_revoked": revoked}
