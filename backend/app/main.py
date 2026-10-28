from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.database import database_is_ready


class Health(BaseModel):
    status: str


app = FastAPI(title="ShopFlow Academy API", version="0.1.0", openapi_url="/api/v1/openapi.json", docs_url=None, redoc_url=None)


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
