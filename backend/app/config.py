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
    # Shared HMAC secret for short-lived Colyseus join tokens (defaults to session_secret).
    game_token_secret: str = ""
    # Game-server → API match ingest header secret.
    duel_ingest_secret: str = "dev-duel-ingest"
    # Extra CORS origins for Expo / duel-web (comma-separated).
    duel_cors_origins: str = (
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )
    # When true, any signed-in Google user is allowed (ignore ALLOWED_EMAILS)
    allow_any_google_user: bool = False
    # Local-only passwordless login (never enable in production)
    enable_dev_login: bool = False
    # Cookie-free POST /duel/dev-token for duel-web / Expo staging demos.
    # Safe to enable in production staging; does not unlock /auth/dev-login.
    enable_duel_dev_token: bool = False

    @property
    def allowed_email_set(self) -> set[str]:
        return {
            e.strip().lower()
            for e in self.allowed_emails.split(",")
            if e.strip()
        }

    @property
    def duel_cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.duel_cors_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        # Neon / Render often provide postgres:// — SQLAlchemy wants postgresql://
        if url.startswith("postgres://"):
            return "postgresql://" + url[len("postgres://") :]
        return url

    @property
    def is_production(self) -> bool:
        # Any of these means a deployed / non-local environment where weak
        # defaults and dev login must be rejected.
        if self.frontend_origin.startswith("https://"):
            return True
        if self.backend_public_url.startswith("https://"):
            return True
        if self.sqlalchemy_url.startswith("postgresql"):
            return True
        return False


DEFAULT_SESSION_SECRETS = {"dev-change-me-in-production", "dev-secret-change-me"}
DEFAULT_CATALOG_SYNC_TOKEN = "dev-sync-token"
DEFAULT_DUEL_INGEST_SECRET = "dev-duel-ingest"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.session_secret in DEFAULT_SESSION_SECRETS:
        raise RuntimeError("SESSION_SECRET must be set to a strong value in production")
    if settings.is_production and settings.enable_dev_login:
        raise RuntimeError("ENABLE_DEV_LOGIN must be false in production")
    if settings.is_production and settings.catalog_sync_token == DEFAULT_CATALOG_SYNC_TOKEN:
        raise RuntimeError("CATALOG_SYNC_TOKEN must be set to a strong value in production")
    if settings.is_production and settings.duel_ingest_secret == DEFAULT_DUEL_INGEST_SECRET:
        raise RuntimeError("DUEL_INGEST_SECRET must be set to a strong value in production")
    return settings
