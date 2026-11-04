"""Read-only teacher summary. Points come exclusively from the existing progress helpers."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import aware
from app.models import HelpRequest, HintReveal
from app.progress import MissionScore, attempts_for, course_score


def student_summary(db: Session, user_id: int, release_id: int, missions: list[dict],
                    scores: dict[int, MissionScore], states: dict[int, dict], opened: set[int]) -> dict:
    ids = list(scores)
    graded = {vid: value for vid, value in scores.items() if not value.lesson}
    by_id = {mission["mission_version_id"]: mission for mission in missions}
    remaining = {vid: value for vid, value in graded.items() if not value.completed}
    never = {vid for vid, value in remaining.items() if value.attempts == 0}
    closed = {vid for vid in never if by_id[vid].get("chapter_id") not in opened}
    locked = {vid for vid in never - closed if states[vid]["status"] == "locked"}
    help_filter = (HelpRequest.user_id == user_id, HelpRequest.course_release_id == release_id,
                   HelpRequest.mission_version_id.in_(ids))
    pending_filter = (*help_filter, HelpRequest.status == "pending")
    pending_count = db.scalar(select(func.count()).select_from(HelpRequest).where(*pending_filter)) or 0
    requests = list(db.scalars(select(HelpRequest).where(*pending_filter).order_by(HelpRequest.created_at.desc(), HelpRequest.id.desc()).limit(10)))
    dates = [aware(attempt.created_at) for attempt, _ in attempts_for(db, [user_id], ids)]
    dates += [aware(value) for value in db.scalars(select(HintReveal.created_at).where(HintReveal.user_id == user_id, HintReveal.mission_version_id.in_(ids)))]
    latest_help = db.scalar(select(func.max(HelpRequest.created_at)).where(*help_filter))
    if latest_help is not None:
        dates.append(aware(latest_help))
    return {
        **course_score(scores), "remaining": len(remaining),
        "attempted_unfinished": sum(1 for value in remaining.values() if value.attempts > 0),
        "not_started_open": len(never - closed - locked), "not_started_closed": len(closed), "not_started_locked": len(locked),
        "help_pending_count": pending_count,
        "help_pending": [{"mission": by_id[row.mission_version_id]["title"], "created_at": aware(row.created_at).isoformat()} for row in requests],
        "last_activity": max(dates).isoformat() if dates else None,
    }
