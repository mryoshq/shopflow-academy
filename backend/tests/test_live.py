"""Sprint 2, part H (ADR-0023): presence, notifications, per-student unlock, automatic opening,
teacher events and Web Push."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.autoplan import schedule, tick
from app.auth import utcnow
from app.config import get_settings
from app.models import AuditEvent, BlockPlan, Notification, Presence, User
from test_classroom import course_of, give_to_class, two_block_course
from test_student import attempt, choice_id, env, missions_of, post  # noqa: F401  (fixture reuse)
from test_teacher_dashboard import the_class


def put(client, path, payload):
    return client.put(path, json=payload, headers={"X-CSRF-Token": client.cookies["academy_csrf"]})


def user_id(engine, name: str) -> int:
    with Session(engine) as db:
        return db.scalar(select(User.id).where(User.username == name))


def notes(client) -> list[dict]:
    return client.get("/api/v1/notifications").json()["items"]


def actions(engine) -> list[str]:
    with Session(engine) as db:
        return list(db.scalars(select(AuditEvent.action).order_by(AuditEvent.id)).all())


def blocks_class(clients, engine) -> tuple[dict, dict]:
    built = two_block_course(clients["teacher"])
    return built, give_to_class(clients["teacher"], engine, built["course"])


# Presence ----------------------------------------------------------------------------------

def test_heartbeat_shows_presence_and_current_mission_in_the_live_grid(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    klass = the_class(teacher)
    version = missions_of(a)[0]["mission_version_id"]
    beat = post(a, "/api/v1/presence", {"mission_version_id": version}).json()
    assert beat["interval_seconds"] == 30 and beat["unread"] == 0
    grid = teacher.get(f"/api/v1/teacher/classes/{klass['id']}/live").json()
    row = next(item for item in grid["students"] if item["name"] == "demo.etudiant01")
    assert row["online"] is True and row["mission"] == missions_of(a)[0]["title"]
    assert grid["online_count"] == 1 and grid["student_count"] == 2
    assert {cell["state"] for cell in row["cells"]} <= {"not_started", "in_progress", "done", "closed"}
    # Not seen for 2 minutes: offline.
    with Session(engine) as db:
        db.execute(update(Presence).values(seen_at=utcnow() - timedelta(minutes=2)))
        db.commit()
    row = next(item for item in teacher.get(f"/api/v1/teacher/classes/{klass['id']}/live").json()["students"] if item["name"] == "demo.etudiant01")
    assert row["online"] is False and row["mission"] is None
    # A student cannot read the grid; another teacher gets 404 (ownership matrix covers the rest).
    assert a.get(f"/api/v1/teacher/classes/{klass['id']}/live").status_code == 403


# Teacher messages --------------------------------------------------------------------------

def test_message_to_the_class_read_receipts_limits_and_audit(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    klass = the_class(teacher)
    sent = post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "Pause de 5 minutes, reprenez à 10 h 35."})
    assert sent.status_code == 201 and sent.json()["recipients"] == 2
    note = notes(a)[0]
    assert note["kind"] == "message" and note["text"] == "Pause de 5 minutes, reprenez à 10 h 35." and note["sender"] == "demo.enseignant"
    assert a.get("/api/v1/notifications").json()["unread"] == 1
    # Another user cannot mark it read (404), the recipient can; the teacher sees the receipt.
    assert post(b, f"/api/v1/notifications/{note['id']}/read").status_code == 404
    assert post(a, f"/api/v1/notifications/{note['id']}/read").status_code == 200
    history = teacher.get(f"/api/v1/teacher/classes/{klass['id']}/messages").json()
    assert history[0]["read_count"] == 1 and {r["student"]: bool(r["read_at"]) for r in history[0]["recipients"]} == {
        "demo.etudiant01": True, "demo.etudiant02": False}
    # One student only.
    only_b = post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "Venez me voir.", "student_ids": [user_id(engine, "demo.etudiant02")]})
    assert only_b.json()["recipients"] == 1 and notes(b)[0]["text"] == "Venez me voir." and notes(a)[0]["text"] != "Venez me voir."
    # 280 characters, plain text, students of the class only.
    assert post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "x" * 281}).status_code == 422
    assert post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "<b>gras</b>"}).status_code == 422
    assert post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "Bonjour", "student_ids": [999999]}).status_code == 404
    assert post(a, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "Bonjour"}).status_code == 403
    # Rate limit: 5 messages per minute.
    codes = [post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": f"Message {n}"}).status_code for n in range(5)]
    assert codes == [201, 201, 201, 429, 429]
    assert actions(engine).count("message.send") == 5
    assert post(a, "/api/v1/notifications/read-all").json()["read"] >= 1


# Per-student block unlock ------------------------------------------------------------------

def test_block_opened_for_one_student_only_is_audited_and_notified(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    built, klass = blocks_class(clients, engine)
    alice = user_id(engine, "demo.etudiant01")
    url = f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc A']}/students/{alice}"
    assert post(teacher, f"{url}/unlock").json()["changed"] is True
    assert post(teacher, f"{url}/unlock").json()["changed"] is False  # idempotent
    block = course_of(a)["modules"][0]["blocks"][0]
    assert block["open"] is True and block["for_you"] is True and [m["title"] for m in course_of(a)["missions"]] == ["Mission a1", "Mission a2"]
    assert course_of(b)["modules"][0]["blocks"][0]["open"] is False and course_of(b)["missions"] == []
    assert notes(a)[0]["kind"] == "block_unlocked" and "ouvert pour vous" in notes(a)[0]["text"]
    grid = teacher.get(f"/api/v1/teacher/classes/{klass['assignment']}/live").json()
    cell = next(r for r in grid["students"] if r["id"] == alice)["cells"][0]
    assert cell["for_student"] is True and cell["state"] == "not_started"
    # Withdrawn: closed again for Alice; opening for the class later says « for_you » False.
    assert post(teacher, f"{url}/relock").json()["changed"] is True
    assert course_of(a)["modules"][0]["blocks"][0]["open"] is False
    post(teacher, f"{url}/unlock")
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc A']}/open")
    assert course_of(a)["modules"][0]["blocks"][0]["for_you"] is False
    assert {"block.unlock_student", "block.relock_student"} <= set(actions(engine))
    # The class opening notifies both students.
    assert notes(b)[0]["kind"] == "block_open"


# Automatic opening ---------------------------------------------------------------------------

def test_weighted_schedule():
    start = datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)
    blocks = [{"chapter_id": 1, "title": "A", "minutes": 10}, {"chapter_id": 2, "title": "B", "minutes": 30}, {"chapter_id": 3, "title": "C", "minutes": 20}]
    plan = schedule(blocks, {}, start, start + timedelta(minutes=120))
    assert [(i["chapter_id"], i["at"][11:16]) for i in plan] == [(1, "09:00"), (2, "09:20"), (3, "10:20")]
    # Block A already open: its weight counts first, only B and C are planned.
    plan = schedule(blocks, {1: start}, start, start + timedelta(minutes=60))
    assert [(i["chapter_id"], i["at"][11:16]) for i in plan] == [(2, "09:10"), (3, "09:40")]
    assert schedule(blocks, {1: start, 2: start, 3: start}, start, start + timedelta(hours=1)) == []


def test_automatic_opening_catches_up_never_closes_and_is_controlled(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    built, klass = blocks_class(clients, engine)
    base = f"/api/v1/teacher/classes/{klass['assignment']}/auto"
    now = utcnow()
    end = (now + timedelta(minutes=60)).isoformat()
    preview = post(teacher, f"{base}/preview", {"end_at": end}).json()
    assert [i["title"] for i in preview["items"]] == ["Bloc A", "Bloc B"]
    with Session(engine) as db:
        assert db.get(BlockPlan, klass["assignment"]) is None  # preview saves nothing
    assert post(teacher, f"{base}/preview", {"end_at": (now - timedelta(minutes=5)).isoformat()}).status_code == 422
    plan = post(teacher, f"{base}/activate", {"end_at": end}).json()
    assert plan["enabled"] is True and len(plan["items"]) == 2
    # Bloc A is due now: the next pass opens it; the teacher gets « dans 2 min » for B later, then « faite ».
    assert tick(Session(engine), now + timedelta(seconds=1))["opened"] == 1
    assert [m["title"] for m in course_of(a)["missions"]] == ["Mission a1", "Mission a2"]
    assert "auto.open" in actions(engine)
    kinds = [n["kind"] for n in notes(teacher)]
    assert "auto_done" in kinds and notes(a)[0]["kind"] == "block_open"
    tick(Session(engine), now + timedelta(minutes=29))
    assert "auto_soon" in [n["kind"] for n in notes(teacher)]
    # Pause: nothing opens, even past due; resume moves the rest by the length of the pause.
    post(teacher, f"{base}/pause")
    assert tick(Session(engine), now + timedelta(minutes=45))["opened"] == 0
    with Session(engine) as db:
        db.execute(update(BlockPlan).values(paused_at=utcnow() - timedelta(minutes=10)))
        db.commit()
    resumed = post(teacher, f"{base}/resume").json()
    moved = datetime.fromisoformat(resumed["items"][1]["at"])
    assert timedelta(minutes=39) <= moved - now <= timedelta(minutes=41)
    shifted = post(teacher, f"{base}/shift", {"minutes": -5}).json()
    assert datetime.fromisoformat(shifted["items"][1]["at"]) == moved - timedelta(minutes=5)
    # Advance opens B now; nothing is ever closed by the plan.
    post(teacher, f"{base}/advance")
    assert [m["title"] for m in course_of(a)["missions"]] == ["Mission a1", "Mission a2", "Mission b1"]
    tick(Session(engine), now + timedelta(hours=3))
    assert len(course_of(a)["missions"]) == 3
    assert post(teacher, f"{base}/advance").status_code == 409
    assert post(teacher, f"{base}/stop").json()["enabled"] is False
    assert {"auto.activate", "auto.pause", "auto.resume", "auto.shift", "auto.advance", "auto.stop"} <= set(actions(engine))


def test_restart_catch_up_and_recalculation_proposal(env):
    clients, engine = env
    teacher, a = clients["teacher"], clients["a"]
    built, klass = blocks_class(clients, engine)
    base = f"/api/v1/teacher/classes/{klass['assignment']}/auto"
    now = utcnow()
    post(teacher, f"{base}/activate", {"end_at": (now + timedelta(minutes=30)).isoformat()})
    # The server was down for an hour: the next pass opens both overdue blocks at once.
    assert tick(Session(engine), now + timedelta(hours=1))["opened"] == 2
    assert len(course_of(a)["missions"]) == 3
    # A new plan, then the teacher opens Bloc B by hand, out of order: the plan no longer matches,
    # a recalculation is proposed (Bloc A later, after B's share of time), then accepted.
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc B']}/close")
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc A']}/close")
    post(teacher, f"{base}/activate", {"end_at": (now + timedelta(minutes=90)).isoformat()})
    assert teacher.get(base).json()["proposal"] == []
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc B']}/open")
    state = teacher.get(base).json()
    assert [i["title"] for i in state["proposal"]] == ["Bloc A"]
    accepted = post(teacher, f"{base}/recalculate").json()
    assert [i["title"] for i in accepted["items"] if not i["opened"]] == ["Bloc A"] and accepted["proposal"] == []
    # Bloc A was already opened automatically by the first plan: the new plan still tells the teacher.
    tick(Session(engine), now + timedelta(hours=3))
    assert [n["kind"] for n in notes(teacher)].count("auto_done") == 3
    assert "auto.recalculate" in actions(engine)


# Teacher events --------------------------------------------------------------------------

def test_teacher_events_help_blocked_block_done_disconnect_and_settings(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    first = missions_of(a)[0]["mission_version_id"]
    view = a.get(f"/api/v1/student/missions/{first}").json()
    post(a, f"/api/v1/student/missions/{first}/help", {"message": "Je ne comprends pas le grain."})
    assert notes(teacher)[0]["kind"] == "help" and "demo.etudiant01" in notes(teacher)[0]["text"]
    for n in range(4):
        attempt(a, first, f"blocked-{n:04d}", choice_ids=[choice_id(view, "Supprimer")])
    assert [n["kind"] for n in notes(teacher)].count("blocked") == 1  # once, at the threshold
    # Block completed by 100 % of a class (threshold 80 %): one notification only, even after several passes.
    built, klass = blocks_class(clients, engine)
    post(teacher, f"/api/v1/teacher/classes/{klass['assignment']}/blocks/{built['chapters']['Bloc A']}/open")
    with Session(engine) as db:
        tick(db)
    assert not [n for n in notes(teacher) if n["kind"] == "block_done"]
    for client in (a, b):
        a1 = next(m for m in course_of(client)["missions"] if m["title"] == "Mission a1")["mission_version_id"]
        mission = client.get(f"/api/v1/student/missions/{a1}").json()
        assert attempt(client, a1, f"bloc-a-{id(client)}", choice_ids=[choice_id(mission, "Bonne réponse")]).json()["correct"] is True
    with Session(engine) as db:
        tick(db)
        tick(db)
    done = [n for n in notes(teacher) if n["kind"] == "block_done"]
    assert len(done) == 1 and "Bloc A" in done[0]["text"] and "2 étudiants sur 2 (100 %)" in done[0]["text"]
    # Disconnection: online for a while, then not seen for 2 minutes.
    post(b, "/api/v1/presence", {})
    with Session(engine) as db:
        db.execute(update(Presence).values(online_since=utcnow() - timedelta(minutes=10), seen_at=utcnow() - timedelta(minutes=2)))
        db.commit()
        tick(db)
        tick(db)
    assert [n["kind"] for n in notes(teacher)].count("disconnect") == 1
    # Settings: help notifications off.
    settings = teacher.get("/api/v1/teacher/notification-settings").json()
    assert put(teacher, "/api/v1/teacher/notification-settings", {**settings, "help": False, "block_done_percent": 50}).status_code == 200
    second = missions_of(b)[0]["mission_version_id"]
    post(b, f"/api/v1/student/missions/{second}/help", {"message": "Aide"})
    assert [n["kind"] for n in notes(teacher)].count("help") == 1
    assert put(teacher, "/api/v1/teacher/notification-settings", {**settings, "block_done_percent": 5}).status_code == 422
    assert a.get("/api/v1/teacher/notification-settings").status_code == 403


def test_help_handled_notifies_the_student(env):
    clients, _ = env
    teacher, a = clients["teacher"], clients["a"]
    first = missions_of(a)[0]["mission_version_id"]
    help_id = post(a, f"/api/v1/student/missions/{first}/help", {"message": "?"}).json()["id"]
    post(teacher, f"/api/v1/teacher/help/{help_id}/handle")
    assert notes(a)[0]["kind"] == "help_handled"


# Web Push --------------------------------------------------------------------------------

def test_web_push_keys_endpoints_and_vapid_signature(env, monkeypatch):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

    from app.webpush import allowed_endpoint, b64url, unb64url, vapid_header

    clients, engine = env
    a = clients["a"]
    assert a.get("/api/v1/push/key").json() == {"enabled": False, "public_key": None}
    assert post(a, "/api/v1/push/subscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}).status_code == 409
    key = ec.generate_private_key(ec.SECP256R1())
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    monkeypatch.setattr(get_settings(), "vapid_private_key", b64url(key.private_numbers().private_value.to_bytes(32, "big")))
    monkeypatch.setattr(get_settings(), "vapid_public_key", b64url(public))
    assert a.get("/api/v1/push/key").json()["enabled"] is True
    for bad in ("http://fcm.googleapis.com/x", "https://evil.example.com/push", "https://fcm.googleapis.com.evil.com/x", "https://127.0.0.1/x"):
        assert not allowed_endpoint(bad)
        assert post(a, "/api/v1/push/subscribe", {"endpoint": bad}).status_code == 422
    for good in ("https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x",
                 "https://web.push.apple.com/QK", "https://wns2-par02p.notify.windows.com/w/?token=x"):
        assert allowed_endpoint(good)
    assert post(a, "/api/v1/push/subscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}).status_code == 201
    assert post(a, "/api/v1/push/subscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}).status_code == 201  # idempotent
    # The VAPID token is a valid ES256 JWT for the push service origin, signed with our key.
    header = vapid_header("https://fcm.googleapis.com/fcm/send/abc")
    token = header.split("t=")[1].split(",")[0]
    head, claims, signature = token.split(".")
    import json
    assert json.loads(unb64url(claims))["aud"] == "https://fcm.googleapis.com"
    raw = unb64url(signature)
    key.public_key().verify(encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
                            f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))
    assert header.endswith(f"k={b64url(public)}")
    assert post(a, "/api/v1/push/unsubscribe", {"endpoint": "https://fcm.googleapis.com/fcm/send/abc"}).json() == {"subscribed": False}


def test_notifications_are_private(env):
    clients, engine = env
    teacher, a, b = clients["teacher"], clients["a"], clients["b"]
    klass = the_class(teacher)
    post(teacher, f"/api/v1/teacher/classes/{klass['id']}/messages", {"text": "Pour Alice", "student_ids": [user_id(engine, "demo.etudiant01")]})
    assert all(n["text"] != "Pour Alice" for n in notes(b))
    with Session(engine) as db:
        note = db.scalar(select(Notification).where(Notification.text == "Pour Alice"))
    assert post(teacher, f"/api/v1/notifications/{note.id}/read").status_code == 404
