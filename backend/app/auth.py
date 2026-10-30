"""Cookie sessions, login throttling and role/record authorization."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import compare_digest
from secrets import token_urlsafe
import re

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import allowed_origins, get_settings
from app.database import get_db
from app.models import AuthEvent, LoginThrottle, User, UserSession

router = APIRouter(prefix="/api/v1")
password_hash = PasswordHash.recommended()
_dummy_hash = password_hash.hash("not-an-account-password")
# Every sign-in lasts 30 days, renewed at each visit (GET /auth/me), at most once an hour (ADR-0029, then
# ADR-0038: the former « Rester connecté » behaviour is the only one). Sessions live in the database, so a
# restart or a redeployment signs nobody out.
SESSION_SECONDS = 30 * 24 * 60 * 60
RENEW_EVERY = timedelta(hours=1)
MAX_FAILURES = 5
WINDOW = timedelta(minutes=15)
LOCK = timedelta(minutes=1)
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def digest(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def cookie_names() -> tuple[str, str]:
    if get_settings().app_env == "production":
        return "__Host-academy_session", "__Host-academy_csrf"
    return "academy_session", "academy_csrf"


def check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin:
        return
    if origin not in allowed_origins(get_settings()):
        raise HTTPException(status_code=403, detail="origin not allowed")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)
    # Ignored since ADR-0038 (every session lasts 30 days); still accepted from an older page in cache.
    remember: bool | None = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str


@dataclass
class AuthContext:
    user: User
    session: UserSession


def _throttle(db: Session, username: str, now: datetime) -> LoginThrottle:
    key = digest(username)
    db.execute(
        text("INSERT INTO login_throttles (key, attempts, window_started_at) VALUES (:key, 0, :now) ON CONFLICT (key) DO NOTHING"),
        {"key": key, "now": now},
    )
    row = db.scalar(select(LoginThrottle).where(LoginThrottle.key == key).with_for_update())
    assert row is not None
    if aware(row.window_started_at) + WINDOW <= now:
        row.attempts = 0
        row.window_started_at = now
        row.blocked_until = None
    return row


def current_auth(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    name, _ = cookie_names()
    raw = request.cookies.get(name, "")
    if not TOKEN_RE.fullmatch(raw):
        raise HTTPException(status_code=401, detail="authentication required")
    record = db.get(UserSession, digest(raw))
    if record is None or record.revoked_at is not None or aware(record.expires_at) <= utcnow():
        raise HTTPException(status_code=401, detail="authentication required")
    user = db.get(User, record.user_id)
    if user is None or not user.enabled:
        raise HTTPException(status_code=401, detail="authentication required")
    return AuthContext(user=user, session=record)


def require_student(auth: AuthContext = Depends(current_auth)) -> AuthContext:
    if auth.user.role != "student":
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def require_teacher(auth: AuthContext = Depends(current_auth)) -> AuthContext:
    if auth.user.role != "teacher":
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def require_observer(auth: AuthContext = Depends(current_auth)) -> AuthContext:
    """Read-only observer (ADR-0025): GET routes under /api/v1/observer/ only."""
    if auth.user.role != "observer":
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def require_member(auth: AuthContext = Depends(current_auth)) -> AuthContext:
    """Students and teachers: presence, notifications, push and radio are not for observers (ADR-0025)."""
    if auth.user.role not in ("student", "teacher"):
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def require_csrf(
    request: Request,
    token: str | None = Header(default=None, alias="X-CSRF-Token"),
    auth: AuthContext = Depends(current_auth),
) -> AuthContext:
    check_origin(request)
    _, cookie_name = cookie_names()
    cookie = request.cookies.get(cookie_name, "")
    if not token or not TOKEN_RE.fullmatch(cookie) or not compare_digest(cookie, token) or not compare_digest(auth.session.csrf_hash, digest(cookie)):
        raise HTTPException(status_code=403, detail="CSRF verification failed")
    return auth


def require_member_csrf(auth: AuthContext = Depends(require_csrf)) -> AuthContext:
    if auth.user.role not in ("student", "teacher"):
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def require_teacher_csrf(auth: AuthContext = Depends(require_csrf)) -> AuthContext:
    if auth.user.role != "teacher":
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def set_session_cookies(response: Response, raw_session: str, raw_csrf: str, max_age: int) -> None:
    session_name, csrf_name = cookie_names()
    secure = get_settings().app_env == "production"
    response.set_cookie(session_name, raw_session, max_age=max_age, httponly=True, secure=secure, samesite="lax", path="/")
    response.set_cookie(csrf_name, raw_csrf, max_age=max_age, httponly=False, secure=secure, samesite="lax", path="/")


@router.post("/auth/login", response_model=UserOut, tags=["auth"])
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> UserOut:
    check_origin(request)
    username = payload.username.strip().casefold()
    if not username:
        raise HTTPException(status_code=401, detail="invalid credentials")
    now = utcnow()
    result: User | None = None
    raw_session = ""
    raw_csrf = ""
    blocked = False
    with db.begin():
        throttle = _throttle(db, username, now)
        blocked = throttle.blocked_until is not None and aware(throttle.blocked_until) > now
        if not blocked:
            user = db.scalar(select(User).where(User.username == username))
            valid = password_hash.verify(payload.password, user.password_hash if user else _dummy_hash)
            if user and user.enabled and valid:
                throttle.attempts = 0
                throttle.blocked_until = None
                result = user
                raw_session, raw_csrf = token_urlsafe(32), token_urlsafe(32)
                db.add(UserSession(token_hash=digest(raw_session), user_id=user.id, csrf_hash=digest(raw_csrf), created_at=now,
                                   expires_at=now + timedelta(seconds=SESSION_SECONDS)))
                db.add(AuthEvent(user_id=user.id, action="login"))
            else:
                throttle.attempts += 1
                if throttle.attempts >= MAX_FAILURES:
                    throttle.blocked_until = now + LOCK
    if blocked:
        raise HTTPException(status_code=429, detail="too many attempts")
    if result is None:
        raise HTTPException(status_code=401, detail="invalid credentials")
    set_session_cookies(response, raw_session, raw_csrf, SESSION_SECONDS)
    response.headers["Cache-Control"] = "no-store"
    return UserOut(id=result.id, username=result.username, role=result.role)


@router.post("/auth/logout", status_code=204, tags=["auth"])
def logout(response: Response, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    auth.session.revoked_at = utcnow()
    db.add(AuthEvent(user_id=auth.user.id, action="logout"))
    db.commit()
    session_name, csrf_name = cookie_names()
    response.delete_cookie(session_name, path="/")
    response.delete_cookie(csrf_name, path="/")
    response.headers["Cache-Control"] = "no-store"


@router.get("/auth/me", response_model=UserOut, tags=["auth"])
def me(request: Request, response: Response, auth: AuthContext = Depends(current_auth), db: Session = Depends(get_db)) -> UserOut:
    response.headers["Cache-Control"] = "no-store"
    now = utcnow()
    session = auth.session
    session_name, csrf_name = cookie_names()
    raw_csrf = request.cookies.get(csrf_name, "")
    if TOKEN_RE.fullmatch(raw_csrf) and aware(session.expires_at) < now + timedelta(seconds=SESSION_SECONDS) - RENEW_EVERY:
        # Same session and CSRF tokens, longer life: the browser keeps both cookies 30 more days.
        session.expires_at = now + timedelta(seconds=SESSION_SECONDS)
        db.commit()
        set_session_cookies(response, request.cookies[session_name], raw_csrf, SESSION_SECONDS)
    return UserOut(id=auth.user.id, username=auth.user.username, role=auth.user.role)


@router.get("/student/profiles/{user_id}", response_model=UserOut, tags=["student"])
def student_profile(user_id: int, response: Response, auth: AuthContext = Depends(require_student)) -> UserOut:
    if user_id != auth.user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    response.headers["Cache-Control"] = "no-store"
    return UserOut(id=auth.user.id, username=auth.user.username, role=auth.user.role)


@router.get("/teacher/students/{user_id}", response_model=UserOut, tags=["teacher"])
def teacher_student(user_id: int, response: Response, auth: AuthContext = Depends(require_teacher), db: Session = Depends(get_db)) -> UserOut:
    student = db.get(User, user_id)
    if student is None or student.role != "student":
        raise HTTPException(status_code=404, detail="student not found")
    response.headers["Cache-Control"] = "no-store"
    return UserOut(id=student.id, username=student.username, role=student.role)


def require_student_csrf(auth: AuthContext = Depends(require_csrf)) -> AuthContext:
    if auth.user.role != "student":
        raise HTTPException(status_code=403, detail="forbidden")
    return auth


def display_name(username: str) -> str:
    """Never greet with a full e-mail address."""
    return username.split("@", 1)[0]
