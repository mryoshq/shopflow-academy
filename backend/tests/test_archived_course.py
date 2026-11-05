"""ADR-0051: an archived course is never visible on the student side, on any student page or route."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Assignment, Course, CourseRelease, MissionVersion, User
from test_security_matrix import api_routes
from test_student import env, missions_of, post  # noqa: F401  (fixture reuse)


def test_an_archived_course_is_never_visible_to_students(env):
    clients, engine = env
    student, teacher = clients["a"], clients["teacher"]
    missions = missions_of(student)
    assert missions, "the demo course is visible before archiving"
    with Session(engine) as db:
        course = db.scalar(select(Course).where(Course.slug == "demo-shopflow-donnees"))
        release = db.scalar(select(CourseRelease).where(CourseRelease.course_id == course.id, CourseRelease.status == "published"))
        values = {"assignment_id": db.scalar(select(Assignment.id).where(Assignment.course_release_id == release.id)),
                  "release_id": release.id, "version_id": missions[0]["mission_version_id"],
                  "user_id": db.scalar(select(User.id).where(User.username == "demo.etudiant01")), "file_id": 1}
        titles = [course.title] + [m["title"] for m in missions]
        version_ids = list(db.scalars(select(MissionVersion.id)))
    dashboard = student.get("/api/v1/student/dashboard").text
    assert all(title in dashboard for title in titles[1:])

    # Archived by the teacher, with the application's own route.
    assert post(teacher, f"/api/v1/teacher/courses/{course.id}/archive").status_code == 200

    checked = 0
    for path, method in api_routes():
        if method != "GET" or not path.startswith("/api/v1/student/"):
            continue
        url = re.sub(r"\{([^}]+)\}", lambda m: str(values[m.group(1)]), path)
        response = student.get(url)
        checked += 1
        if response.status_code == 200 and "json" in response.headers.get("content-type", ""):
            body = response.text
            assert not any(title in body for title in titles), f"{url} shows the archived course"
    assert checked >= 10
    assert student.get("/api/v1/student/dashboard").json()["courses"] == []
    for version_id in version_ids:  # every mission of the archived course answers 404
        assert student.get(f"/api/v1/student/missions/{version_id}").status_code == 404
    assert student.get(f"/api/v1/student/courses/{release.id}").status_code in (403, 404, 409)
