"""Files to download from the course (ADR-0032): served only to signed-in users who may see the course.

A file id is ``<sha256 prefix>.<ext>`` (copied at import, outside the public media folder). A student
gets it when one of the releases assigned to their classes contains it; a teacher when one of their
own courses (draft or release) contains it. Observers and everyone else get 404. Always sent as an
attachment, never rendered by the browser.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_member
from app.config import get_settings
from app.curriculum_schema import DOWNLOAD_ID
from app.database import get_db
from app.models import Chapter, Course, CourseModule, CourseRelease, Mission

router = APIRouter(prefix="/api/v1", tags=["downloads"])
TYPES = {"pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         "zip": "application/zip", "csv": "text/csv; charset=utf-8", "sql": "text/plain; charset=utf-8",
         "py": "text/plain; charset=utf-8", "md": "text/markdown; charset=utf-8"}


def find_file(value: object, file_id: str) -> dict | None:
    """The download entry with this id inside a course tree or snapshot (name and title), if any."""
    if isinstance(value, dict):
        if value.get("id") == file_id and "name" in value and "size" in value:
            return value
        items = value.values()
    elif isinstance(value, list):
        items = value
    else:
        return None
    for item in items:
        found = find_file(item, file_id)
        if found:
            return found
    return None


def visible_entry(db: Session, auth: AuthContext, file_id: str) -> dict | None:
    if auth.user.role == "student":
        from app.student import assigned_releases

        for release in assigned_releases(db, auth.user.id):
            if file_id in json.dumps(release.student_snapshot):
                found = find_file(release.student_snapshot, file_id)
                if found:
                    return found
        return None
    if auth.user.role == "teacher":
        courses = db.scalars(select(Course.id).where(Course.created_by == auth.user.id)).all()
        if not courses:
            return None
        for snapshot in db.scalars(select(CourseRelease.student_snapshot).where(CourseRelease.course_id.in_(courses))):
            found = find_file(snapshot, file_id)
            if found:
                return found
        drafts = db.scalars(select(Mission.draft_definition).join(Chapter, Chapter.id == Mission.chapter_id)
                            .join(CourseModule, CourseModule.id == Chapter.module_id).where(CourseModule.course_id.in_(courses)))
        for draft in drafts:
            found = find_file(draft, file_id)
            if found:
                return found
    return None


@router.get("/downloads/{file_id}")
def download(file_id: str, auth: AuthContext = Depends(require_member), db: Session = Depends(get_db)) -> FileResponse:
    if not DOWNLOAD_ID.fullmatch(file_id):
        raise HTTPException(status_code=404, detail="file not found")
    entry = visible_entry(db, auth, file_id)
    path = Path(get_settings().downloads_dir) / file_id
    if entry is None or not path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(path, media_type=TYPES[file_id.rsplit(".", 1)[1]], filename=str(entry["name"]),
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                                 "Content-Security-Policy": "default-src 'none'; sandbox"})
