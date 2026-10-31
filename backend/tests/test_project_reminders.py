"""ADR-0045: milestone reminders, 3 days then 1 day before, at 9:00 Morocco time; idempotent and targeted."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.autoplan import tick
from app.models import Notification, ProjectMilestone, ProjectReminder
from app.project_reminders import TZ, due_now, message, run, schedule
from test_project import add_students, project, put, upload  # noqa: F401  (fixture reuse)
from test_student import env, post  # noqa: F401  (fixture reuse)

UTC = timezone.utc


def at(text: str) -> datetime:
    """A Morocco local time (« 2026-11-18 09:00 »), as an aware datetime."""
    return datetime.fromisoformat(text).replace(tzinfo=TZ)


def test_calendar_at_nine_morocco_time_across_an_offset_change():
    # The legal offset changes on 22 March 2026 (tzdata): the 9:00 send time stays 9:00 in Morocco.
    due = at("2026-03-23 18:00")
    j3, j1 = schedule(due)
    assert (j3["key"], j1["key"]) == ("j3", "j1")
    assert j3["send_at"].astimezone(TZ).strftime("%Y-%m-%d %H:%M") == "2026-03-20 09:00"
    assert j1["send_at"].astimezone(TZ).strftime("%Y-%m-%d %H:%M") == "2026-03-22 09:00"
    assert j3["send_at"].utcoffset() != j1["send_at"].utcoffset()  # the offset did change in between
    assert j1["send_at"].astimezone(UTC) == datetime(2026, 3, 22, 9, tzinfo=TZ).astimezone(UTC)
    # A deadline at 00:30 is « the next day » in Morocco even when it is still the previous day in UTC elsewhere.
    late = at("2026-11-21 00:30")
    assert schedule(late)[1]["send_at"].astimezone(TZ).date().isoformat() == "2026-11-20"

    class Milestone:  # the fields due_now reads
        reminders, due_at = True, due
    assert due_now(Milestone, at("2026-03-20 08:59")) is None
    assert due_now(Milestone, at("2026-03-20 09:00"))["key"] == "j3"
    assert due_now(Milestone, at("2026-03-20 23:59"))["key"] == "j3"  # catch-up the same day
    assert due_now(Milestone, at("2026-03-21 10:00")) is None  # never the next day
    assert due_now(Milestone, at("2026-03-22 15:00"))["key"] == "j1"
    assert due_now(Milestone, at("2026-03-23 18:00")) is None  # deadline reached
    Milestone.reminders = False
    assert due_now(Milestone, at("2026-03-22 10:00")) is None


def test_targets_idempotence_log_and_text(project):
    clients, engine, assignment = project
    a, b, teacher = clients["a"], clients["b"], clients["teacher"]
    cohort = a.get("/api/v1/student/project").json()["cohort_id"]
    more = add_students(engine, cohort, ["demo.etudiant03", "demo.etudiant04", "demo.etudiant05", "demo.etudiant06"])
    ids = {c["name"]: c["id"] for c in a.get("/api/v1/student/project").json()["classmates"]}
    me = a.get("/api/v1/auth/me").json()["id"]
    base = f"/api/v1/teacher/classes/{assignment}/project"
    due = at("2026-11-21 23:59")
    rendu = post(teacher, f"{base}/milestones", {"title": "Rendu final", "due_at": due.isoformat()}).json()
    pairing = post(teacher, f"{base}/milestones", {"title": "Binôme formé", "due_at": due.isoformat(), "sort_order": 1}).json()
    # Team 1 (A + 03) has submitted nothing; team 2 (B + 04) submitted for « Rendu final »; 05 signed up for the draw; 06 alone.
    team1 = post(teacher, f"{base}/teams", {"user_ids": [me, ids["demo.etudiant03"]]}).json()["team_id"]
    team2 = post(teacher, f"{base}/teams", {"user_ids": [ids["demo.etudiant02"], ids["demo.etudiant04"]]}).json()["team_id"]
    post(b, f"/api/v1/student/project/milestones/{rendu['id']}/submissions", {"text": "Version 1"})
    post(more["demo.etudiant05"], "/api/v1/student/project/draw/join", {"cohort_id": cohort})

    with Session(engine) as db:
        assert run(db, at("2026-11-18 08:00")) == []  # too early
        first = run(db, at("2026-11-18 09:00"))
        assert sorted(first) == sorted([me, ids["demo.etudiant03"], ids["demo.etudiant06"]])
        assert run(db, at("2026-11-18 15:00")) == []  # once per milestone, target and reminder
        logged = {(r.milestone_id, r.reminder, r.target) for r in db.scalars(select(ProjectReminder))}
        assert logged == {(rendu["id"], "j3", f"team:{team1}"), (pairing["id"], "j3", f"user:{ids['demo.etudiant06']}")}
        assert f"team:{team2}" not in str(logged)
        texts = {n.text for n in db.scalars(select(Notification).where(Notification.kind == "project_reminder"))}
        assert texts == {"Rappel : « Rendu final » est attendu le 21/11/2026 à 23:59. Il vous reste 3 jours.",
                         "Rappel : « Binôme formé » est attendu le 21/11/2026 à 23:59. Il vous reste 3 jours."}
        # J-1: again, to those still concerned; the text says « 1 jour ».
        second = run(db, at("2026-11-20 09:05"))
        assert sorted(second) == sorted([me, ids["demo.etudiant03"], ids["demo.etudiant06"]])
        assert "Il vous reste 1 jour." in message(db.get(ProjectMilestone, rendu["id"]), at("2026-11-20 09:05"))
        assert run(db, at("2026-11-22 09:00")) == []  # after the deadline
    # A team that submits meanwhile is no longer reminded; nothing twice to the same person (dedup per recipient).
    with Session(engine) as db:
        mine = db.scalars(select(Notification).where(Notification.recipient_id == me, Notification.kind == "project_reminder")).all()
        assert len(mine) == 2


def test_the_background_pass_sends_and_the_teacher_sees_and_turns_reminders_off(project):
    clients, engine, assignment = project
    a, teacher = clients["a"], clients["teacher"]
    cohort = a.get("/api/v1/student/project").json()["cohort_id"]
    base = f"/api/v1/teacher/classes/{assignment}/project"
    future = datetime.now(UTC) + timedelta(days=10)
    milestone = post(teacher, f"{base}/milestones", {"title": "Conception", "due_at": future.isoformat()}).json()
    no_date = post(teacher, f"{base}/milestones", {"title": "Sans date"}).json()
    view = teacher.get(base).json()
    plan = next(item["reminders"] for item in view["milestones"] if item["id"] == milestone["id"])
    assert plan["enabled"] is True and [i["key"] for i in plan["items"]] == ["j3", "j1"] and {i["status"] for i in plan["items"]} == {"planned"}
    assert all(datetime.fromisoformat(i["send_at"]).astimezone(TZ).hour == 9 for i in plan["items"])
    assert all(i["local"].endswith("T09:00") for i in plan["items"])
    assert next(item["reminders"] for item in view["milestones"] if item["id"] == no_date["id"])["items"] == []
    # Off for this milestone: nothing is sent, the plan says so.
    changed = teacher.patch(f"/api/v1/teacher/project/milestones/{milestone['id']}", json={"reminders": False},
                            headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    assert changed.status_code == 200
    plan = next(item["reminders"] for item in teacher.get(base).json()["milestones"] if item["id"] == milestone["id"])
    assert plan["enabled"] is False and {i["status"] for i in plan["items"]} == {"off"}
    post(a, "/api/v1/student/project/team", {"cohort_id": cohort})
    j3 = schedule(future)[0]["send_at"]
    with Session(engine) as db:
        assert tick(db, j3 + timedelta(minutes=1)) is not None
        assert db.scalars(select(ProjectReminder)).all() == []
    teacher.patch(f"/api/v1/teacher/project/milestones/{milestone['id']}", json={"reminders": True},
                  headers={"X-CSRF-Token": teacher.cookies["academy_csrf"]})
    with Session(engine) as db:
        tick(db, j3 + timedelta(minutes=1))  # the existing background pass of the backend
        assert [r.reminder for r in db.scalars(select(ProjectReminder))] == ["j3"]
    plan = next(item["reminders"] for item in teacher.get(base).json()["milestones"] if item["id"] == milestone["id"])
    assert [i["status"] for i in plan["items"]] == ["sent", "planned"] and plan["items"][0]["sent"] == 1
    # Another teacher cannot switch it (ownership).
    assert a.patch(f"/api/v1/teacher/project/milestones/{milestone['id']}", json={"reminders": False},
                   headers={"X-CSRF-Token": a.cookies["academy_csrf"]}).status_code == 403
