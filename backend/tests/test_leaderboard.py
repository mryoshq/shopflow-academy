"""Sprint 2, part K (ADR-0026): class leaderboard, display names, daily progress."""

from datetime import timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth import utcnow
from app.leaderboard import Row, board, competition_ranks
from app.models import AuditEvent, BlockState
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)
from test_teacher_dashboard import the_class


def patch(client, path, payload):
    return client.patch(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def put(client, path, payload):
    return client.put(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def solve_block(client, prefix: str) -> None:
    """Complete the three demonstration missions (the third unlocks after the second)."""
    first, second, _ = [m["mission_version_id"] for m in missions_of(client)]
    view = client.get(f"/api/v1/student/missions/{first}").json()
    assert attempt(client, first, f"{prefix}-0001", choice_ids=[choice_id(view, "La jointure")]).json()["correct"]
    view = client.get(f"/api/v1/student/missions/{second}").json()
    picks = [choice_id(view, start) for start in ("Contrôler le type", "Normaliser", "Dédupliquer", "Traiter la ville")]
    assert attempt(client, second, f"{prefix}-0002", choice_ids=picks).json()["correct"]
    third = missions_of(client)[2]["mission_version_id"]
    view = client.get(f"/api/v1/student/missions/{third}").json()
    order = [choice_id(view, start) for start in ("Lire le fichier", "Valider le schéma", "Nettoyer", "Dédupliquer", "Charger")]
    assert attempt(client, third, f"{prefix}-0003", choice_ids=order).json()["correct"]


def test_competition_ranks_share_a_rank_and_skip_the_next():
    assert competition_ranks([(10, 5), (10, 5), (10, 0), (3, 0), (3, 0), (0, 0)]) == [1, 1, 3, 4, 4, 6]
    assert competition_ranks([]) == []


def test_top3_mode_keeps_the_podium_and_my_own_position():
    rows = [Row(i, f"Élève {i}", 50 - i * 5, 0, 0, 0) for i in range(1, 7)]
    for row, rank in zip(rows, competition_ranks([(r.points, r.bonus) for r in rows])):
        row.rank = row.today_rank = rank
    data = board(rows, me=6, top3_only=True)
    assert [row["rank"] for row in data["main"]] == [1, 2, 3, 6]
    assert [row["me"] for row in data["main"]] == [False, False, False, True]
    assert "account" not in data["main"][0]


def test_disabled_by_default_then_enabled_audited_with_ties_and_no_username(env):
    clients, engine = env
    teacher, a, b, out = clients["teacher"], clients["a"], clients["b"], clients["out"]
    klass = the_class(teacher)["id"]
    url = f"/api/v1/student/leaderboard/{klass}"
    assert a.get(url).status_code == 404
    assert a.get("/api/v1/student/dashboard").json()["courses"][0]["leaderboard_id"] is None
    settings = teacher.get(f"/api/v1/teacher/classes/{klass}/leaderboard").json()["settings"]
    assert settings == {"enabled": False, "top3_only": False, "hide_during_block": False}
    assert patch(teacher, f"/api/v1/teacher/classes/{klass}/leaderboard", {"enabled": True}).json()["enabled"] is True
    with Session(engine) as db:
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "leaderboard.settings"))
        assert event is not None and event.details == {"enabled": True}
    assert a.get("/api/v1/student/dashboard").json()["courses"][0]["leaderboard_id"] == klass
    assert out.get(url).status_code == 404  # not in the class
    # Students cannot change the settings.
    assert patch(a, f"/api/v1/teacher/classes/{klass}/leaderboard", {"enabled": False}).status_code in (401, 403)

    # Same score: same rank. Default names never reveal the account.
    for client, key in ((a, "lb-a"), (b, "lb-b")):
        first = missions_of(client)[0]["mission_version_id"]
        view = client.get(f"/api/v1/student/missions/{first}").json()
        attempt(client, first, f"{key}-0001", choice_ids=[choice_id(view, "La jointure")])
    data = a.get(url).json()
    assert data["hidden"] is False
    assert [(row["rank"], row["points"]) for row in data["main"]] == [(1, 10.0), (1, 10.0)]
    assert sorted(row["name"] for row in data["main"]) == ["Participant 1", "Participant 2"]
    assert sum(row["me"] for row in data["main"]) == 1
    text = a.get(url).text
    assert "demo.etudiant" not in text and "@" not in text and "mission" not in text


@pytest.mark.parametrize(("name", "ok"), [
    ("Nadia", True), ("Nadia B.", True), ("Yassine-27", True), ("  Inès   K  ", True), ("", True),
    ("nadia@ynov.com", False), ("www.site.ma", False), ("<b>Nadia</b>", False), ("x" * 25, False),
    ("Participant 3", False), ("Enseignant", False), ("Nadia\nB", True),
])
def test_display_name_is_filtered(env, name, ok):
    clients, _ = env
    response = put(clients["a"], "/api/v1/student/profile", {"public_name": name})
    assert (response.status_code == 200) is ok, response.text
    if ok:
        assert clients["a"].get("/api/v1/student/profile").json()["public_name"] == " ".join(name.split())


def test_chosen_name_top3_hide_during_block_and_daily_progress(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    klass = the_class(teacher)["id"]
    url = f"/api/v1/student/leaderboard/{klass}"
    patch(teacher, f"/api/v1/teacher/classes/{klass}/leaderboard", {"enabled": True, "hide_during_block": True})
    put(b, "/api/v1/student/profile", {"public_name": "Nadia B."})
    # The demonstration block was opened when the course was installed: within 15 minutes, hidden.
    data = a.get(url).json()
    assert data["hidden"] is True and data["main"] == [] and data["today"] == []
    assert teacher.get(f"/api/v1/teacher/classes/{klass}/leaderboard").json()["hidden_for_students"] is True
    with Session(engine) as db:
        db.execute(update(BlockState).values(opened_at=utcnow() - timedelta(minutes=20)))
        db.commit()
    solve_block(a, "day-a")
    data = a.get(url).json()
    assert data["hidden"] is False
    first = data["main"][0]
    assert first["me"] and first["rank"] == 1 and first["blocks_done"] == 1 and first["blocks_today"] == 1
    assert data["main"][1]["name"] == "Nadia B." and data["main"][1]["rank"] == 2
    assert data["today"][0]["blocks_today"] == 1 and data["best_progress"] == [first["name"]]
    # The teacher sees the accounts behind the names; students never do.
    teacher_view = teacher.get(f"/api/v1/teacher/classes/{klass}/leaderboard").json()
    assert {row["account"] for row in teacher_view["main"]} == {"demo.etudiant01", "demo.etudiant02"}
    assert "account" not in a.get(url).text
    # Ranks never reach the CSV export.
    export = teacher.get(f"/api/v1/teacher/classes/{klass}/export.csv").text.lower()
    assert "rang" not in export and "rank" not in export and "classement" not in export
    # Turned off again: 404 for students, nothing left on the dashboard.
    patch(teacher, f"/api/v1/teacher/classes/{klass}/leaderboard", {"enabled": False})
    assert a.get(url).status_code == 404
    assert a.get("/api/v1/student/dashboard").json()["courses"][0]["leaderboard_id"] is None
