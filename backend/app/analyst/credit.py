
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analyst.access import is_chat_owner
from app.core.config import Settings
from app.analyst.models import AnalystAccess, AnalystUsage
from app.core.models import User

TOPUP_USD = 5.0


def day_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def month_start(now: datetime) -> datetime:
    return day_start(now).replace(day=1)


def next_month_start(now: datetime) -> datetime:
    first = month_start(now)
    return first.replace(year=first.year + 1, month=1) if first.month == 12 else first.replace(month=first.month + 1)


def month_key(now: datetime) -> str:
    return f"{now.year:04d}-{now.month:02d}"


def spent_since(db: Session, since: datetime, user_id: int | None = None) -> float:
    q = select(func.coalesce(func.sum(AnalystUsage.cost_usd), 0.0)).where(AnalystUsage.created_at >= since)
    if user_id is not None:
        q = q.where(AnalystUsage.user_id == user_id)
    return float(db.scalar(q) or 0.0)


def credit_for(settings: Settings, user: User, row: AnalystAccess | None, now: datetime) -> float | None:
    if is_chat_owner(settings, user):
        return None
    credit = row.credit_usd if row is not None and row.credit_usd is not None else settings.analyst_user_credit_usd
    if row is not None and row.topup_month == month_key(now):
        credit += row.topup_usd or 0.0
    return credit


def refusal_for(settings: Settings, *, spent_today: float, spent_month: float, credit: float | None, credit_spent: float) -> str | None:
    if spent_month >= settings.analyst_chat_monthly_usd:
        return "monthly"
    if credit is not None and credit_spent >= credit:
        return "credit"
    if spent_today >= settings.analyst_chat_daily_usd:
        return "daily"
    return None
