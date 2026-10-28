"""Interactive experiences of the Academy (ADR-0033): the course gives their exact values.

``GET /api/v1/experiences/voyage/data`` returns the ``data`` of the first « voyage » experience found in
the courses the user may see (a student: releases of their classes; a teacher: their own courses), or
``null``: the page then uses its built-in default values.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_member
from app.database import get_db
from app.models import Chapter, Course, CourseModule, CourseRelease, Mission

router = APIRouter(prefix="/api/v1", tags=["experiences"])
EXPERIENCES = {"voyage"}


def experience_data(value: object, name: str) -> dict | None:
    if isinstance(value, dict):
        if value.get("kind") == "experience" and value.get("experience") == name and isinstance(value.get("data"), dict):
            return value["data"]
        items = list(value.values())
    elif isinstance(value, list):
        items = value
    else:
        return None
    for item in items:
        found = experience_data(item, name)
        if found is not None:
            return found
    return None


@router.get("/experiences/{name}/data")
def experience(name: str, response: Response, auth: AuthContext = Depends(require_member), db: Session = Depends(get_db)) -> dict:
    if name not in EXPERIENCES:
        raise HTTPException(status_code=404, detail="experience not found")
    response.headers["Cache-Control"] = "no-store"
    sources: list[object] = []
    if auth.user.role == "student":
        from app.student import assigned_releases

        sources = [release.student_snapshot for release in assigned_releases(db, auth.user.id)]
    else:
        courses = db.scalars(select(Course.id).where(Course.created_by == auth.user.id)).all()
        if courses:
            sources = list(db.scalars(select(CourseRelease.student_snapshot).where(CourseRelease.course_id.in_(courses))
                                      .order_by(CourseRelease.id.desc())))
            sources += list(db.scalars(select(Mission.draft_definition).join(Chapter, Chapter.id == Mission.chapter_id)
                                       .join(CourseModule, CourseModule.id == Chapter.module_id).where(CourseModule.course_id.in_(courses))))
    for source in sources:
        found = experience_data(source, name)
        if found is not None:
            return {"experience": name, "data": found}
    return {"experience": name, "data": None}
