"""Course ownership: the studio and class tracking belong to the course owner only.

Every teacher route that targets a course object (course, objective, module, chapter,
mission, release, class, history event) is called by a second teacher with the real
IDs of the owner's objects and a valid body. Each call must answer 403 or 404, and
the owner's course must be unchanged afterwards. Listings must not show the course.
"""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, Chapter, Course, CourseModule, CourseRelease, LearningObjective, Mission
from test_security_matrix import api_routes
from test_student import env, missions_of, post  # noqa: F401  (fixture reuse)
from test_teacher_dashboard import other_teacher

# Routes that do not target a course object (cohorts, student directory, listings, creation).
NOT_COURSE_SCOPED = re.compile(r"^/api/v1/teacher/(cohorts|students|classes$|courses$|course-search$|courses/import$)")


def owner_ids(engine) -> dict[str, int]:
    with Session(engine) as db:
        course = db.scalar(select(Course))
        module = db.scalar(select(CourseModule).where(CourseModule.course_id == course.id))
        chapter = db.scalar(select(Chapter).where(Chapter.module_id == module.id))
        mission = db.scalar(select(Mission).where(Mission.chapter_id == chapter.id))
        objective = db.scalar(select(LearningObjective).where(LearningObjective.course_id == course.id))
        release = db.scalar(select(CourseRelease).where(CourseRelease.course_id == course.id))
        event = db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "course", AuditEvent.resource_id == course.id))
        return {"course_id": course.id, "module_id": module.id, "chapter_id": chapter.id, "mission_id": mission.id,
                "objective_id": objective.id, "release_id": release.id, "event_id": event.id if event else 0, "draft": mission.draft_definition}


def body_for(path: str, method: str, ids: dict, extra: dict) -> dict | None:
    if method in ("GET", "DELETE"):
        return None
    if path.endswith("/draft"):
        return ids["draft"]
    if "/objectives" in path:
        return {"code": "INTRUS", "statement": "Objectif ajouté par un autre enseignant"}
    if path.endswith("/missions"):
        return {"title": "Intrusion", "slug": "intrusion"}
    if path.endswith("/project/teams"):
        return {"user_ids": [extra["student_id"]]}
    if path.endswith("/project/draw"):
        return {"seed": "00c0ffee", "fingerprint": "0" * 16, "confirm_again": True}  # ADR-0041: another teacher's draw
    if path.endswith("/project/milestones"):
        return {"title": "Intrusion"}
    if path.endswith("/project/slots"):
        return {"starts_at": "2026-11-23T10:00:00+01:00", "ends_at": "2026-11-23T10:20:00+01:00"}
    if path.endswith("/grade"):
        return {"sql": 4}
    if path.endswith("/comments"):
        return {"text": "Commentaire d’un autre enseignant"}
    if "/project/teams/" in path and method == "PUT":
        return {"user_ids": [extra["student_id"]]}
    if "/project/slots/" in path and method == "PATCH":
        return {"clear_team": True}
    if "/project/milestones/" in path and method == "PATCH":
        return {"title": "Intrusion"}
    if "/observers/" in path and method == "PATCH":
        return {"enabled": False}  # ADR-0025: an intruder tries to disable another teacher's observer
    if path.endswith(("/modules", "/chapters")) or method == "PATCH":
        return {"title": "Intrusion"}
    if path.endswith("/restore"):
        return {"release_id": ids["release_id"]}
    if path.endswith("/unlocks"):
        return {"user_id": extra["student_id"], "mission_version_id": extra["version_id"]}
    if path.endswith("/goal"):
        return {"metric": "missions", "target": 5}  # ADR-0039: another teacher's class goal
    if path.endswith("/messages"):
        return {"text": "Message d’un autre enseignant"}
    if path.endswith(("/auto/activate", "/auto/preview")):
        from datetime import datetime, timedelta, timezone
        return {"end_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()}
    if path.endswith("/auto/shift"):
        return {"minutes": 5}
    return {}


def test_second_teacher_cannot_reach_any_owned_course_object(env, monkeypatch, tmp_path):
    clients, engine = env
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "project_dir", str(tmp_path / "project"))
    owner = clients["teacher"]
    # Give the course a history event with a saved draft, so the backup route has a real target.
    ids = owner_ids(engine)
    assert post(owner, f"/api/v1/teacher/courses/{ids['course_id']}/restore", {"release_id": ids["release_id"]}).status_code == 200
    ids = owner_ids(engine)
    klass = owner.get("/api/v1/teacher/classes").json()[0]
    me = clients["a"].get("/api/v1/auth/me").json()
    extra = {"student_id": me["id"], "version_id": missions_of(clients["a"])[0]["mission_version_id"]}
    before = owner.get(f"/api/v1/teacher/courses/{ids['course_id']}").json()
    intruder = other_teacher(engine)
    help_id = post(clients["a"], f"/api/v1/student/missions/{extra['version_id']}/help", {"message": "Je bloque"}).json()["id"]
    # ADR-0034: one team, milestone and slot of the owner's class project, and a file of that team.
    base = f"/api/v1/teacher/classes/{klass['id']}/project"
    team_id = post(owner, f"{base}/teams", {"user_ids": [me["id"]]}).json()["team_id"]
    milestone_id = post(owner, f"{base}/milestones", {"title": "Conception"}).json()["id"]
    slot_id = post(owner, f"{base}/slots", {"starts_at": "2026-11-23T09:00:00+01:00", "ends_at": "2026-11-23T09:20:00+01:00"}).json()["id"]
    uploaded = clients["a"].post("/api/v1/student/project/files?name=plan.md", content=b"# Plan",
                                 headers={"X-CSRF-Token": clients["a"].cookies["academy_csrf"]})
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["id"]
    values = {**ids, "assignment_id": klass["id"], "user_id": me["id"], "help_id": help_id, "run_id": "requete",
              "team_id": team_id, "milestone_id": milestone_id, "slot_id": slot_id, "file_id": file_id}
    checked, failures = 0, []
    for path, method in api_routes():
        if not path.startswith("/api/v1/teacher/") or "{" not in path or NOT_COURSE_SCOPED.match(path):
            continue
        url = re.sub(r"\{([^}]+)\}", lambda m: str(values[m.group(1)]), path)
        body = body_for(path, method, ids, extra)
        headers = {"X-CSRF-Token": intruder.cookies["academy_csrf"]}
        code = intruder.request(method, url, json=body, headers=headers).status_code
        checked += 1
        if code not in (403, 404):
            failures.append((method, path, code))
    assert failures == []
    assert checked >= 25
    assert owner.get(f"/api/v1/teacher/courses/{ids['course_id']}").json() == before
    with Session(engine) as db:
        assert db.get(Course, ids["course_id"]).status != "archived"
    # The help request was not handled by the intruder.
    assert clients["a"].get("/api/v1/student/help").json()[0]["status"] == "pending"


def test_listings_and_assignment_hide_other_teachers_courses(env):
    clients, engine = env
    ids = owner_ids(engine)
    intruder = other_teacher(engine)
    assert intruder.get("/api/v1/teacher/courses").json() == []
    assert intruder.get("/api/v1/teacher/course-search").json() == []
    assert intruder.get("/api/v1/teacher/classes").json() == []
    cohort = post(intruder, "/api/v1/teacher/cohorts", {"label": "Cohorte intruse"}).json()
    response = post(intruder, f"/api/v1/teacher/cohorts/{cohort['id']}/assignments", {"course_release_id": ids["release_id"]})
    assert response.status_code in (403, 404, 422)
    # The owner still sees everything, and a course the intruder creates stays theirs only.
    assert [c["id"] for c in clients["teacher"].get("/api/v1/teacher/courses").json()] == [ids["course_id"]]
    created = post(intruder, "/api/v1/teacher/courses", {"slug": "cours-intrus", "title": "Cours intrus"}).json()
    assert [c["id"] for c in intruder.get("/api/v1/teacher/courses").json()] == [created["id"]]
    assert clients["teacher"].get(f"/api/v1/teacher/courses/{created['id']}").status_code == 404


def test_disabled_teacher_cannot_log_in_or_use_a_session(env):
    clients, engine = env
    from app.models import User
    from fastapi.testclient import TestClient
    from app.main import app
    with Session(engine) as db:
        db.scalar(select(User).where(User.username == "demo.enseignant")).enabled = False
        db.commit()
    assert clients["teacher"].get("/api/v1/teacher/courses").status_code == 401
    fresh = TestClient(app)
    assert fresh.post("/api/v1/auth/login", json={"username": "demo.enseignant", "password": "teacher-pass"}).status_code == 401
