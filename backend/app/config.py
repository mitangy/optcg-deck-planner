"""Application settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "OPTCG Deck Tracker"
    # SQLite for local; set DATABASE_URL to Neon Postgres in production
    database_url: str = "sqlite:///./optcg.db"
    session_secret: str = "dev-change-me-in-production"
    frontend_origin: str = "http://localhost:5173"
    backend_public_url: str = "http://localhost:8000"
    google_client_id: str = ""
    google_client_secret: str = ""
    allowed_emails: str = ""
    catalog_sync_token: str = "dev-sync-token"
    # When true, any signed-in Google user is allowed (ignore ALLOWED_EMAILS)
    allow_any_google_user: bool = False
    # Local-only passwordless login (never enable in production)
    enable_dev_login: bool = False

    @property
    def allowed_email_set(self) -> set[str]:
        return {
            e.strip().lower()
            for e in self.allowed_emails.split(",")
            if e.strip()
        }

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        # Neon / Render often provide postgres:// — SQLAlchemy wants postgresql://
        if url.startswith("postgres://"):
            return "postgresql://" + url[len("postgres://") :]
        return url

    @property
    def is_production(self) -> bool:
        return self.frontend_origin.startswith("https://")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.session_secret in {
        "dev-change-me-in-production",
        "dev-secret-change-me",
    }:
        raise RuntimeError("SESSION_SECRET must be set to a strong value in production")
    if settings.is_production and settings.enable_dev_login:
        raise RuntimeError("ENABLE_DEV_LOGIN must be false in production")
    return settings
