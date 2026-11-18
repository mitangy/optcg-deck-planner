
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.statuses import AccessStatus
from app.analyst.models import AnalystAccess, AnalystSetting
from app.core.models import User
from app.roles import is_admin

MAX_DRAFT_LESSONS = 100

FREE_SPOTS_KEY = "free_spots"

CHAT_MODELS = ("claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-haiku-4-5")


def is_chat_owner(settings: Settings, user: User) -> bool:
    return is_admin(user) or user.email.strip().lower() in settings.analyst_chat_email_set


def is_model_admin(settings: Settings, user: User) -> bool:
    return is_admin(user) or user.email.strip().lower() in settings.analyst_model_admin_email_set


def chat_model(db: Session) -> str:
    value = db.scalar(select(AnalystSetting.value).where(AnalystSetting.key == "chat_model"))
    return value if value in CHAT_MODELS else CHAT_MODELS[0]


def service_configured(settings: Settings) -> bool:
    return bool(settings.analyst_service_secret and settings.analyst_public_url)


def access_status(db: Session, user: User) -> str | None:
    row = db.scalar(select(AnalystAccess.status).where(AnalystAccess.user_id == user.id))
    return row


def chat_enabled_for(settings: Settings, user: User, db: Session) -> bool:
    if not service_configured(settings):
        return False
    return is_chat_owner(settings, user) or access_status(db, user) == AccessStatus.APPROVED


def requests_open(settings: Settings) -> bool:
    return service_configured(settings) and bool(settings.analyst_chat_email_set)


def free_spots(db: Session, settings: Settings) -> int:
    value = db.scalar(select(AnalystSetting.value).where(AnalystSetting.key == FREE_SPOTS_KEY))
    try:
        return max(0, int(value)) if value is not None else settings.analyst_free_spots
    except ValueError:
        return settings.analyst_free_spots


def spots_used(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(AnalystAccess).where(AnalystAccess.auto_approved.is_(True))) or 0
