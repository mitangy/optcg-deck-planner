"""Who may use the Log Pose chat, which model it runs on, and the free-spots allowance.

Lived in the analyst routers; the credit and bot services read it too, so it sits here and no
service has to import a router (refactor D-02).
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.statuses import AccessStatus
from app.models import AnalystAccess, AnalystSetting, User
from app.roles import is_admin

# Drafts a player or the admin's bots may leave waiting for review before new ones are refused.
MAX_DRAFT_LESSONS = 100

FREE_SPOTS_KEY = "free_spots"

# The models the chat may run on; the first is the default.
CHAT_MODELS = ("claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-haiku-4-5")


def is_chat_owner(settings: Settings, user: User) -> bool:
    """Owners are everyone on ANALYST_CHAT_EMAILS: they always have the chat and answer access requests."""
    return is_admin(user) or user.email.strip().lower() in settings.analyst_chat_email_set


def is_model_admin(settings: Settings, user: User) -> bool:
    """Only ANALYST_MODEL_ADMIN_EMAILS may change the model Log Pose runs on."""
    return is_admin(user) or user.email.strip().lower() in settings.analyst_model_admin_email_set


def chat_model(db: Session) -> str:
    """The saved chat model, or the default when none is saved (or the saved one is no longer offered)."""
    value = db.scalar(select(AnalystSetting.value).where(AnalystSetting.key == "chat_model"))
    return value if value in CHAT_MODELS else CHAT_MODELS[0]


def service_configured(settings: Settings) -> bool:
    return bool(settings.analyst_service_secret and settings.analyst_public_url)


def access_status(db: Session, user: User) -> str | None:
    row = db.scalar(select(AnalystAccess.status).where(AnalystAccess.user_id == user.id))
    return row


def chat_enabled_for(settings: Settings, user: User, db: Session) -> bool:
    """The in-app chat panel is on for owners, and for players an owner approved, once the analyst service is configured."""
    if not service_configured(settings):
        return False
    return is_chat_owner(settings, user) or access_status(db, user) == AccessStatus.APPROVED


def requests_open(settings: Settings) -> bool:
    """Players can ask for access only when the service is on and someone is there to approve."""
    return service_configured(settings) and bool(settings.analyst_chat_email_set)


def free_spots(db: Session, settings: Settings) -> int:
    """How many players are approved at once when they ask: the owners' setting, else ANALYST_FREE_SPOTS."""
    value = db.scalar(select(AnalystSetting.value).where(AnalystSetting.key == FREE_SPOTS_KEY))
    try:
        return max(0, int(value)) if value is not None else settings.analyst_free_spots
    except ValueError:
        return settings.analyst_free_spots


def spots_used(db: Session) -> int:
    """Spots taken: every player the free-spots rule approved, whatever their status now, so a revoked player keeps theirs."""
    return db.scalar(select(func.count()).select_from(AnalystAccess).where(AnalystAccess.auto_approved.is_(True))) or 0
