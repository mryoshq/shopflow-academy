from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.config import check_secure_settings, get_settings
from app.database import database_is_ready
from app.auth import router as auth_router
from app.curriculum import router as curriculum_router
from app.student import router as student_router
from app.teacher_dashboard import router as teacher_dashboard_router
from app.course_io import router as course_io_router
from app.classroom import router as classroom_router
from app.lab_api import router as lab_router
from app.leaderboard import router as leaderboard_router
from app.attempt_rules import router as attempt_rules_router
from app.live import router as live_router
from app.autoplan import router as autoplan_router, start_background
from app.results import router as results_router
from app.comfort import router as comfort_router
from app.observer import router as observer_router
from app.downloads import router as downloads_router
from app.experiences import router as experiences_router
from app.project import router as project_router
from app.project_draw import router as project_draw_router
from app.student_view import router as student_view_router
from app.rewards import router as rewards_router


class Health(BaseModel):
    status: str


def openapi_url_for(app_env: str) -> str | None:
    """The API schema is a development aid; it is not published in production."""
    return None if app_env == "production" else "/api/v1/openapi.json"


check_secure_settings(get_settings())


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Automatic block opening and time-based teacher events (ADR-0023), every few seconds."""
    stop = start_background(get_settings().live_tick_seconds) if get_settings().database_url else None
    yield
    if stop is not None:
        stop.set()


app = FastAPI(
    lifespan=lifespan,
    title="Rapidfox Academy API",
    version="0.1.0",
    openapi_url=openapi_url_for(get_settings().app_env),
    docs_url=None,
    redoc_url=None,
)
app.include_router(auth_router)
app.include_router(curriculum_router)
app.include_router(student_router)
app.include_router(teacher_dashboard_router)
app.include_router(course_io_router)
app.include_router(classroom_router)
app.include_router(lab_router)
app.include_router(leaderboard_router)
app.include_router(attempt_rules_router)
app.include_router(live_router)
app.include_router(autoplan_router)
app.include_router(results_router)
app.include_router(comfort_router)
app.include_router(observer_router)
app.include_router(downloads_router)
app.include_router(experiences_router)
app.include_router(project_router)
app.include_router(project_draw_router)
app.include_router(student_view_router)
app.include_router(rewards_router)


@app.get("/health/live", response_model=Health, tags=["health"])
def live() -> Health:
    return Health(status="ok")


@app.get("/health/ready", response_model=Health, tags=["health"])
def ready() -> Health:
    if not database_is_ready():
        raise HTTPException(status_code=503, detail="database unavailable")
    return Health(status="ok")


@app.get("/api/v1/status", response_model=Health, tags=["platform"])
def status() -> Health:
    return Health(status="foundation")
