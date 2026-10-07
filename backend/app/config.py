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
    # Log Pose analyst service: its public URL (for personal connector links) and the
    # shared secret it sends to read full match replays. Replays stay closed when unset.
    analyst_public_url: str = ""
    analyst_service_secret: str = ""
    # In-app Log Pose chat: who may use it (comma-separated emails) and its spend caps in USD.
    # The daily cap is per player; the monthly cap covers everyone. Off when no emails are set.
    analyst_chat_emails: str = ""
    analyst_chat_daily_usd: float = 3.0
    analyst_chat_monthly_usd: float = 50.0
    # Extra CORS origins for Expo / duel-web (comma-separated).
    duel_cors_origins: str = (
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "https://optcgduel.app,"
        "https://optcg-duel-web.vercel.app,"
        "https://optcg-duel-web-miko21.vercel.app"
    )
    # Optional full-match regex for extra CORS origins (e.g. Vercel branch URLs).
    # Matching origins get CORS *without* credentials (no cookie sessions) and
    # are never valid OAuth return_to targets; see app/cors.py.
    duel_cors_origin_regex: str = ""
    # SPA origins (comma-separated) that proxy /api to this API and host their own
    # Google callback at {origin}/api/auth/callback when they are the return_to.
    # Each callback must be an authorized redirect URI in Google Cloud Console.
    oauth_callback_origins: str = ""
    # When true, any signed-in Google user is allowed (ignore ALLOWED_EMAILS)
    allow_any_google_user: bool = False
    # Local-only passwordless login (never enable in production)
    enable_dev_login: bool = False
    # Cookie-free POST /duel/dev-token for duel-web / Expo staging demos.
    # Safe to enable in production staging; does not unlock /auth/dev-login.
    enable_duel_dev_token: bool = False
    # Background pull of Limitless TCG tournament results for Log Pose. Unset: on in
    # production, off everywhere else (tests, local dev). TOURNAMENT_SYNC=true/false overrides.
    tournament_sync: bool | None = None
    tournament_sync_days: int = 30

    @property
    def analyst_chat_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.analyst_chat_emails.split(",") if e.strip()}

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
    def oauth_callback_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.oauth_callback_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        # Neon / Render provide postgres:// or postgresql://. Name the installed
        # driver explicitly: SQLAlchemy 2.1 defaults bare URLs to psycopg (v3),
        # which is not installed (requirements.txt ships psycopg2-binary).
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg2://" + url[len(prefix) :]
        return url

    @property
    def tournament_sync_enabled(self) -> bool:
        return self.is_production if self.tournament_sync is None else self.tournament_sync

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
