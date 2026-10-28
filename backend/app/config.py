from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = ""
    app_env: str = "development"
    app_base_url: str = "http://127.0.0.1:3080"
    # Comma-separated extra origins allowed for cookie/CSRF checks, e.g. the
    # loopback gateway when the teacher also uses http://127.0.0.1:3080 in production.
    app_extra_origins: str = ""
    # Key for opaque student choice IDs. Required in production (the app refuses to start
    # without it); outside production it falls back to a key derived from DATABASE_URL.
    app_secret: str = ""
    # One class, one teacher, one course (owner decision, sprint 2).
    main_course_slug: str = "python-data-engineering-sql"
    main_course_title: str = "Python Data Engineering & SQL Avancé"
    class_label: str = "Classe B3 IA/Data"
    # Course videos copied at import, served read-only by the gateway under /media/.
    media_dir: str = "/srv/media"
    # Laboratory database (service labdb, ADR-0017). Empty = SQL execution unavailable.
    lab_reader_url: str = ""
    lab_owner_url: str = ""
    # Student-written SQL (bonus sql_challenge): on only while the bypass battery passes.
    sql_challenge_enabled: bool = True
    ai_provider: str = "none"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


def allowed_origins(settings: "Settings") -> set[str]:
    allowed = {settings.app_base_url.rstrip("/")}
    allowed.update(item.strip().rstrip("/") for item in settings.app_extra_origins.split(",") if item.strip())
    if settings.app_env != "production":
        allowed.update({"http://127.0.0.1:3080", "http://localhost:3080"})
    return allowed


MIN_SECRET_LENGTH = 32


def check_secure_settings(settings: "Settings") -> None:
    """Refuse to start in production without a real APP_SECRET."""
    if settings.app_env == "production" and len(settings.app_secret.strip()) < MIN_SECRET_LENGTH:
        raise RuntimeError(f"APP_SECRET (>= {MIN_SECRET_LENGTH} characters) is required when APP_ENV=production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
