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


class Health(BaseModel):
    status: str


def openapi_url_for(app_env: str) -> str | None:
    """The API schema is a development aid; it is not published in production."""
    return None if app_env == "production" else "/api/v1/openapi.json"


check_secure_settings(get_settings())

app = FastAPI(
    title="ShopFlow Academy API",
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
