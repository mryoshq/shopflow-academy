"""ADR-0041: surprise draw of the project space (no individual work, deterministic draw, group of three, reveal once)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, ProjectDraw, ProjectMember
from app.project_draw import draw_groups
from test_project import PDF, add_students, project, upload  # noqa: F401  (fixture reuse)
from test_student import env, post  # noqa: F401  (fixture reuse)


def test_the_draw_is_deterministic_for_a_seed_with_one_group_of_three_and_never_a_solo():
    people = list(range(1, 8))
    first, left = draw_groups(people, [], "00c0ffee")
    assert (first, left) == draw_groups(list(reversed(people)), [], "00c0ffee")  # the order of the pool does not matter
    assert sorted(len(group["members"]) for group in first) == [2, 2, 3] and left == []
    assert sorted(uid for group in first for uid in group["members"]) == people
    assert any(draw_groups(people, [], seed)[0] != first for seed in ("0badcafe", "deadbeef", "12345678"))
    pair, _ = draw_groups([4, 9], [], "00c0ffee")
    assert [group["members"] for group in pair] == [[4, 9]]
    assert draw_groups([4], [], "00c0ffee") == ([], [4])  # one person alone: nothing is drawn
    # One-person teams that hold work keep it and are never put together; the excess is left for the teacher.
    groups, left = draw_groups([1], [(10, 2, True), (11, 3, True), (12, 4, False)], "00c0ffee")
    assert len(groups) == 2 and left == []
    assert sorted(group["host_team"] for group in groups) == [10, 11]


def test_hosts_only_when_a_partner_exists():
    groups, left = draw_groups([], [(10, 2, True), (11, 3, True), (12, 4, True)], "00c0ffee")
    assert groups == [] and left == [2, 3, 4]  # three teams with work cannot be merged: the teacher pairs them by hand
    groups, left = draw_groups([7], [(10, 2, True), (11, 3, True)], "00c0ffee")
    assert len(groups) == 1 and len(groups[0]["members"]) == 2 and len(left) == 1


def test_student_signs_up_and_leaves_before_the_draw_working_alone_is_not_offered(project):
    clients, _, _ = project
    a, b = clients["a"], clients["b"]
    page = a.get("/api/v1/student/project").json()
    cohort = page["cohort_id"]
    assert page["draw"] == {"registered": False, "registered_count": 0, "done": False} and page["surprise"] is None
    assert post(a, "/api/v1/student/project/draw/join", {"cohort_id": cohort}).json() == {"registered": True}
    assert post(a, "/api/v1/student/project/draw/join", {"cohort_id": cohort}).status_code == 200  # idempotent
    assert b.get("/api/v1/student/project").json()["draw"]["registered_count"] == 1
    assert post(a, "/api/v1/student/project/draw/leave", {"cohort_id": cohort}).json() == {"registered": False}
    assert a.get("/api/v1/student/project").json()["draw"]["registered"] is False
    assert post(a, "/api/v1/student/project/draw/join", {"cohort_id": 999_999}).status_code == 404  # not their class
    # Forming a team takes the student out of the draw; a member cannot sign up.
    post(a, "/api/v1/student/project/draw/join", {"cohort_id": cohort})
    post(a, "/api/v1/student/project/team", {"cohort_id": cohort})
    assert a.get("/api/v1/student/project").json()["draw"]["registered"] is False
    assert post(a, "/api/v1/student/project/draw/join", {"cohort_id": cohort}).status_code == 409


def test_preview_then_draw_trio_existing_teams_untouched_replay_confirmation_notifications_and_reveal(project):
    clients, engine, assignment = project
    a, b, teacher = clients["a"], clients["b"], clients["teacher"]
    cohort = a.get("/api/v1/student/project").json()["cohort_id"]
    more = add_students(engine, cohort, ["demo.etudiant03", "demo.etudiant04", "demo.etudiant05", "demo.etudiant06"])
    ids = {c["name"]: c["id"] for c in b.get("/api/v1/student/project").json()["classmates"]}
    # A and B formed their team; 06 is alone with a file; 03 signed up; 04 and 05 did nothing.
    post(a, "/api/v1/student/project/team", {"cohort_id": cohort})
    invitation = post(a, "/api/v1/student/project/invitations", {"user_id": b.get("/api/v1/auth/me").json()["id"]}).json()["id"]
    post(b, f"/api/v1/student/project/invitations/{invitation}/accept")
    duo = a.get("/api/v1/student/project").json()["team"]["id"]
    post(more["demo.etudiant06"], "/api/v1/student/project/team", {"cohort_id": cohort})
    solo_file = upload(more["demo.etudiant06"], "plan.pdf", PDF).json()["id"]
    solo = more["demo.etudiant06"].get("/api/v1/student/project").json()["team"]["id"]
    post(more["demo.etudiant03"], "/api/v1/student/project/draw/join", {"cohort_id": cohort})
    base = f"/api/v1/teacher/classes/{assignment}/project/draw"
    overview = teacher.get(base).json()
    assert [(item["name"], item["registered"]) for item in overview["free"]] == [
        ("demo.etudiant03", True), ("demo.etudiant04", False), ("demo.etudiant05", False)]
    assert overview["solo_teams"] == [{"team_id": solo, "name": "demo.etudiant06", "has_work": True}] and overview["draws"] == []
    assert post(teacher, f"{base}/preview", {"include_team_ids": [duo]}).status_code == 422  # only one-person teams
    # Without the teacher's agreement, the one-person team stays out: three free students make one group of three.
    preview = post(teacher, f"{base}/preview", {"seed": "00c0ffee"}).json()
    assert [sorted(group["members"]) for group in preview["groups"]] == [["demo.etudiant03", "demo.etudiant04", "demo.etudiant05"]]
    assert preview["previous"] is None
    # With it: four people, two pairs, and 06 keeps their team (and file).
    preview = post(teacher, f"{base}/preview", {"seed": "00c0ffee", "include_team_ids": [solo]}).json()
    assert post(teacher, f"{base}/preview", {"seed": "00c0ffee", "include_team_ids": [solo]}).json() == preview  # same seed, same result
    assert sorted(len(group["members"]) for group in preview["groups"]) == [2, 2]
    assert [group["existing_team"] for group in preview["groups"]].count(True) == 1
    # The class changes after the preview: the draw is refused.
    clients_04 = more["demo.etudiant04"]
    post(clients_04, "/api/v1/student/project/draw/join", {"cohort_id": cohort})  # signing up changes nothing to the pool
    body = {"seed": preview["seed"], "fingerprint": preview["fingerprint"], "include_team_ids": [solo]}
    assert post(teacher, base, {**body, "include_team_ids": []}).status_code == 409  # not what was previewed
    post(more["demo.etudiant05"], "/api/v1/student/project/team", {"cohort_id": cohort})
    assert "refaites l'aperçu" in post(teacher, base, body).json()["detail"]
    post(more["demo.etudiant05"], "/api/v1/student/project/leave")  # back to the previewed class
    drawn = post(teacher, base, body).json()
    assert drawn["replayed"] is False and sorted(map(sorted, drawn["groups"])) == sorted(sorted(group["members"]) for group in preview["groups"])
    # Same seed again (double click): replayed, nothing more.
    again = post(teacher, base, body).json()
    assert again["replayed"] is True and again["id"] == drawn["id"]
    with Session(engine) as db:
        assert db.scalar(select(ProjectDraw.id).where(ProjectDraw.cohort_id == cohort)) == drawn["id"]
        assert len(db.scalars(select(ProjectDraw)).all()) == 1
        members = {m.user_id: m for m in db.scalars(select(ProjectMember).where(ProjectMember.cohort_id == cohort))}
        teams: dict[int, list[int]] = {}
        for member in members.values():
            teams.setdefault(member.team_id, []).append(member.user_id)
        audit = db.scalar(select(AuditEvent).where(AuditEvent.action == "project.draw"))
    # Nobody alone; A and B untouched; 06 kept their team (and their file).
    assert all(len(people) >= 2 for people in teams.values()) and len(teams) == 3
    assert len(teams[duo]) == 2
    assert {members[uid].draw_id for uid in teams[duo]} == {None}
    assert ids["demo.etudiant06"] in teams[solo]
    assert more["demo.etudiant06"].get(f"/api/v1/student/project/files/{solo_file}").status_code == 200
    assert audit.details["seed"] == "00c0ffee" and audit.details["included_teams"] == [solo]
    # A second draw needs an explicit confirmation; with nobody left, there is nothing to draw.
    other = post(teacher, f"{base}/preview", {}).json()
    assert other["groups"] == [] and other["previous"]["id"] == drawn["id"]
    second = {"seed": other["seed"], "fingerprint": other["fingerprint"]}
    assert "confirmez" in post(teacher, base, second).json()["detail"]
    assert "moins de deux" in post(teacher, base, {**second, "confirm_again": True}).json()["detail"]
    # Each drawn student is notified and sees the reveal once.
    c = more["demo.etudiant03"]
    notes = [item for item in c.get("/api/v1/notifications").json()["items"] if item["kind"] == "project_draw"]
    assert len(notes) == 1 and notes[0]["text"].startswith("Binôme surprise : vous travaillerez avec ")
    assert all(item["kind"] != "project_draw" for item in a.get("/api/v1/notifications").json()["items"])
    page = c.get("/api/v1/student/project").json()
    assert page["surprise"]["draw_id"] == drawn["id"] and len(page["surprise"]["partners"]) == 1 and page["draw"]["done"] is True
    assert len(page["team"]["members"]) == 2 and page["team"]["full"] is False  # a pair may still welcome a third
    assert post(c, "/api/v1/student/project/surprise/seen", {"cohort_id": cohort}).status_code == 200
    assert c.get("/api/v1/student/project").json()["surprise"] is None
    assert post(c, "/api/v1/student/project/draw/leave", {"cohort_id": cohort}).status_code == 409  # the draw took place
    assert a.get("/api/v1/student/project").json()["surprise"] is None  # A was not drawn


def test_only_the_class_teacher_draws(project):
    clients, _, assignment = project
    base = f"/api/v1/teacher/classes/{assignment}/project/draw"
    assert post(clients["a"], f"{base}/preview", {}).status_code == 403
    assert clients["a"].get(base).status_code == 403
    assert post(clients["teacher"], "/api/v1/teacher/classes/999999/project/draw/preview", {}).status_code == 404
