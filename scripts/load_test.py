#!/usr/bin/env python3
"""Ten simultaneous fictional students plus the teacher dashboard (P0-09).

Runs on the test stack only (scripts/test_stack.py up); a production address is
refused before any request. Uses the fictitious accounts of the test stack
(.local/test-stack-credentials.json, never printed) and the demonstration course. Each student: login, dashboard, opens the three missions,
reveals a hint, submits answers (including the same idempotency key twice in
parallel) and reads history, with the presence heartbeat and notification polling
of part H (ADR-0023); meanwhile the teacher polls the class overview and the live
grid, and sends one message to the class that every student must receive.

    python3 scripts/load_test.py [--base http://127.0.0.1:3180] [--rounds 2]

Exit code 1 when an unexpected HTTP status, a duplicated attempt or a slow p95 occurs (1.5 s per request;
the login, which hashes a password on purpose, has its own 3 s limit).
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_stack import BASE, CREDENTIALS, refuse_production  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
COURSE = "Démonstration — Données ShopFlow"
P95_LIMIT_MS = 1500
# The login hashes a password on purpose (Argon2, ADR-0038: once per 30-day session); 11 logins start at
# the same moment, so it gets its own limit. Every request of a lesson keeps the 1.5 s one.
LOGIN_P95_LIMIT_MS = 3000
MESSAGE = f"Test de charge {uuid.uuid4().hex[:6]} : message à toute la classe."
message = threading.Event()

lock = threading.Lock()
timings: dict[str, list[float]] = {}
problems: list[str] = []


class Session:
    def __init__(self, base: str):
        self.base = base
        self.cookies: dict[str, str] = {}
        self.opener = build_opener()

    def request(self, label: str, method: str, path: str, body: dict | None = None, expect: tuple[int, ...] = (200, 201)):
        headers = {"Origin": self.base, "Content-Type": "application/json", "User-Agent": "shopflow-load/1"}
        if self.cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        csrf = next((v for k, v in self.cookies.items() if k.endswith("academy_csrf")), None)
        if method != "GET" and csrf:
            headers["X-CSRF-Token"] = csrf
        data = json.dumps(body).encode() if body is not None else None
        started = time.perf_counter()
        try:
            response = self.opener.open(Request(self.base + path, data=data, method=method, headers=headers), timeout=30)
            status, raw, response_headers = response.status, response.read(), response.headers
        except HTTPError as error:
            status, raw, response_headers = error.code, error.read(), error.headers
        elapsed = (time.perf_counter() - started) * 1000
        for line in response_headers.get_all("Set-Cookie") or []:
            name, _, rest = line.partition("=")
            self.cookies[name] = rest.split(";", 1)[0]
        with lock:
            timings.setdefault(label, []).append(elapsed)
            if status not in expect:
                problems.append(f"{label}: HTTP {status}")
        try:
            return status, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return status, None


def student_flow(base: str, account: dict, rounds: int) -> dict:
    s = Session(base)
    s.request("login", "POST", "/api/v1/auth/login", {"username": account["username"], "password": account["password"]})
    result = {"attempt_ids": [], "duplicates_ok": True}
    for _ in range(rounds):
        _, dashboard = s.request("dashboard", "GET", "/api/v1/student/dashboard")
        course = next((c for c in (dashboard or {}).get("courses", []) if c["title"] == COURSE), None)
        if course is None:
            with lock:
                problems.append(f"{account['username']}: demo course not assigned")
            return result
        for mission in course["missions"]:
            if mission["status"] == "locked":
                s.request("mission (verrouillée)", "GET", f"/api/v1/student/missions/{mission['mission_version_id']}")
                continue
            vid = mission["mission_version_id"]
            s.request("présence", "POST", "/api/v1/presence", {"mission_version_id": vid})
            s.request("notifications", "GET", "/api/v1/notifications")
            _, view = s.request("mission", "GET", f"/api/v1/student/missions/{vid}")
            s.request("indice", "POST", f"/api/v1/student/missions/{vid}/hints")
            first_choice = view["definition"]["choices"][0]["id"]
            answer = {"choice_ids": [c["id"] for c in view["definition"]["choices"]]} if view["definition"]["kind"] == "reorder" else {"choice_ids": [first_choice]}
            key = uuid.uuid4().hex
            with ThreadPoolExecutor(max_workers=2) as pool:  # double click: same key in parallel
                replies = list(pool.map(lambda _: s.request("essai", "POST", f"/api/v1/student/missions/{vid}/attempts",
                                                             {"idempotency_key": key, "answer": answer}), range(2)))
            ids = {body["attempt_id"] for _, body in replies if body and "attempt_id" in body}
            if len(ids) != 1:
                result["duplicates_ok"] = False
            result["attempt_ids"].extend(ids)
            s.request("historique", "GET", f"/api/v1/student/missions/{vid}/attempts")
    message.wait(30)
    _, feed = s.request("notifications", "GET", "/api/v1/notifications")
    result["message_ok"] = any(item["text"] == MESSAGE for item in (feed or {}).get("items", []))
    return result


def teacher_flow(base: str, account: dict, stop: threading.Event) -> int:
    s = Session(base)
    s.request("login", "POST", "/api/v1/auth/login", {"username": account["username"], "password": account["password"]})
    _, classes = s.request("classes enseignant", "GET", "/api/v1/teacher/classes")
    target = next((c for c in classes or [] if c["course_title"] == COURSE and "démonstration" in c["cohort"].lower()), None)
    polls = 0
    main = s.request("cours principal", "GET", "/api/v1/teacher/main")[1] or {}
    if main.get("assignment_id"):
        s.request("message à la classe", "POST", f"/api/v1/teacher/classes/{main['assignment_id']}/messages", {"text": MESSAGE}, expect=(201,))
    message.set()
    while target and not stop.is_set():
        s.request("vue de classe", "GET", f"/api/v1/teacher/classes/{target['id']}/overview")
        if main.get("assignment_id"):
            s.request("suivi en direct", "GET", f"/api/v1/teacher/classes/{main['assignment_id']}/live")
        s.request("notifications", "GET", "/api/v1/notifications")
        polls += 1
        stop.wait(1.0)
    return polls


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=BASE)
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--credentials", default=str(CREDENTIALS))
    args = parser.parse_args()
    refuse_production(args.base)
    accounts = {item["username"]: item for item in json.loads(Path(args.credentials).read_text())}
    students = [accounts[f"demo.etudiant{i:02d}"] for i in range(1, 11)]
    stop = threading.Event()
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=11) as pool:
        teacher = pool.submit(teacher_flow, args.base, accounts["demo.enseignant"], stop)
        results = list(pool.map(lambda account: student_flow(args.base, account, args.rounds), students))
        stop.set()
        polls = teacher.result()
    duration = time.perf_counter() - started
    all_ids = [i for r in results for i in r["attempt_ids"]]
    duplicates = len(all_ids) - len(set(all_ids))
    print(f"10 étudiants + 1 enseignant, {args.rounds} tour(s), {duration:.1f} s, {sum(len(v) for v in timings.values())} requêtes, {polls} actualisations enseignant")
    print(f"{'requête':24} {'n':>4} {'p50 ms':>8} {'p95 ms':>8} {'max ms':>8}")
    worst = 0.0
    login_p95 = 0.0
    for label, values in sorted(timings.items()):
        p95 = percentile(values, 0.95)
        if label == "login":
            login_p95 = p95
        else:
            worst = max(worst, p95)
        print(f"{label:24} {len(values):>4} {statistics.median(values):>8.0f} {p95:>8.0f} {max(values):>8.0f}")
    received = sum(1 for r in results if r.get("message_ok"))
    ok = not problems and duplicates == 0 and all(r["duplicates_ok"] for r in results) and worst <= P95_LIMIT_MS and login_p95 <= LOGIN_P95_LIMIT_MS and received == len(results)
    print(f"Message de l'enseignant reçu : {received} / {len(results)}")
    print(f"Erreurs inattendues : {len(problems)}{' — ' + '; '.join(sorted(set(problems))[:5]) if problems else ''}")
    print(f"Doublons de tentative : {duplicates} ; double envoi même clé → 1 tentative : {'PASS' if all(r['duplicates_ok'] for r in results) else 'FAIL'}")
    print(f"p95 le plus lent hors connexion : {worst:.0f} ms (limite {P95_LIMIT_MS} ms)")
    print(f"p95 connexion : {login_p95:.0f} ms (limite {LOGIN_P95_LIMIT_MS} ms, 11 connexions simultanées)")
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
