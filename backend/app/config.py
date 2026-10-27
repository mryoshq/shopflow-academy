from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = ""
    app_env: str = "development"
    app_base_url: str = "http://127.0.0.1:3080"
    # Comma-separated extra origins allowed for cookie/CSRF checks, e.g. the
    # loopback gateway when the teacher also uses http://127.0.0.1:3080 in production.
    app_extra_origins: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


def allowed_origins(settings: "Settings") -> set[str]:
    allowed = {settings.app_base_url.rstrip("/")}
    allowed.update(item.strip().rstrip("/") for item in settings.app_extra_origins.split(",") if item.strip())
    if settings.app_env != "production":
        allowed.update({"http://127.0.0.1:3080", "http://localhost:3080"})
    return allowed


@lru_cache
def get_settings() -> Settings:
    return Settings()
