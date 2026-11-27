
from __future__ import annotations

import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


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
    ops_admin_token: str = ""
    scan_training_token: str = ""
    discord_bot_token: str = ""
    discord_feedback_channel_id: str = ""
    discord_feedback_poll_s: int = 30
    # Instagram auto-poster (#1477): Instagram API with Instagram Login for @optcgduel.
    ig_access_token: str = ""
    ig_user_id: str = ""
    ig_post_hour_utc: int = 17
    ig_dry_run: bool = False
    ig_api_version: str = "v23.0"
    # Public origin Instagram fetches post images from; empty uses backend_public_url.
    ig_media_base_url: str = ""
    # UTC weekdays (0 = Monday) on which an uploaded trailer is posted as a Reel with a trending song (#1482).
    ig_reel_weekdays: str = "0,3"
    # Reels go out as Trial Reels (shown to non-followers first): SS_PERFORMANCE (auto-share if it does well), MANUAL, or off.
    ig_reel_trial: str = "SS_PERFORMANCE"
    github_issues_token: str = ""
    github_issues_repo: str = "mitangy/optcg-deck-planner"
    game_token_secret: str = ""
    duel_ingest_secret: str = "dev-duel-ingest"
    analyst_public_url: str = ""
    analyst_service_secret: str = ""
    analyst_chat_emails: str = ""
    analyst_chat_daily_usd: float = 1.0
    analyst_chat_monthly_usd: float = 250.0
    analyst_user_credit_usd: float = 5.0
    analyst_free_spots: int = 50
    analyst_model_admin_emails: str = "optcgduel@gmail.com"
    admin_email: str = "optcgduel@gmail.com,gamefreakmichaeltang@gmail.com"
    # Unset keeps trusting X-Forwarded-For.
    proxy_shared_secret: str = ""
    vercel_token: str = ""
    vercel_team_id: str = ""
    render_api_key: str = ""
    github_token: str = ""
    github_repo: str = "mitangy/optcg-deck-planner"
    duel_cors_origins: str = (
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "https://optcgduel.app,"
        "https://optcg-duel-web.vercel.app,"
        "https://optcg-duel-web-miko21.vercel.app"
    )
    duel_cors_origin_regex: str = ""
    oauth_callback_origins: str = ""
    allow_any_google_user: bool = False
    enable_dev_login: bool = False
    enable_duel_dev_token: bool = False
    redis_url: str = ""
    game_server_url: str = ""
    cosmetic_url_secret: str = ""
    tournament_sync: bool | None = None
    tournament_sync_days: int = 30
    new_release_prices: bool | None = None
    new_release_price_days: int = 30
    new_release_price_interval_minutes: int = 60
    resend_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = ""

    @property
    def analyst_model_admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.analyst_model_admin_emails.split(",") if e.strip()}

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_email.split(",") if e.strip()}

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
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg2://" + url[len(prefix) :]
        return url

    @property
    def tournament_sync_enabled(self) -> bool:
        return self.is_production if self.tournament_sync is None else self.tournament_sync

    @property
    def discord_feedback_enabled(self) -> bool:
        return bool(self.discord_bot_token.strip() and self.discord_feedback_channel_id.strip())

    @property
    def instagram_enabled(self) -> bool:
        token = self.ig_access_token.strip()
        # Facebook-style (EAA...) system-user tokens can look the account id up, so IG_USER_ID is optional for them.
        # (Same prefix check as instagram.client.is_facebook_token, inlined to keep config free of app imports.)
        return bool(token and (self.ig_user_id.strip() or token.startswith("EAA")))

    @property
    def ig_reel_weekday_set(self) -> set[int]:
        days: set[int] = set()
        for part in self.ig_reel_weekdays.split(","):
            part = part.strip()
            if part.isdigit() and 0 <= int(part) <= 6:
                days.add(int(part))
        return days

    @property
    def ig_reel_trial_strategy(self) -> str | None:
        value = self.ig_reel_trial.strip().upper()
        if value == "OFF":
            return None
        return value if value in ("SS_PERFORMANCE", "MANUAL") else "SS_PERFORMANCE"

    @property
    def new_release_prices_enabled(self) -> bool:
        return self.is_production if self.new_release_prices is None else self.new_release_prices

    @property
    def new_release_price_interval_s(self) -> int:
        # Never faster than every 15 minutes, so a typo can't hammer TCGPlayer.
        return max(15, self.new_release_price_interval_minutes) * 60

    @property
    def is_production(self) -> bool:
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
    if settings.ops_admin_token:
        if settings.is_production and settings.ops_admin_token == DEFAULT_CATALOG_SYNC_TOKEN:
            raise RuntimeError("OPS_ADMIN_TOKEN must be set to a strong value in production")
        if settings.is_production and settings.ops_admin_token == settings.catalog_sync_token:
            raise RuntimeError("OPS_ADMIN_TOKEN must differ from CATALOG_SYNC_TOKEN in production")
    else:
        logger.warning("OPS_ADMIN_TOKEN unset; falling back to CATALOG_SYNC_TOKEN")
    return settings
