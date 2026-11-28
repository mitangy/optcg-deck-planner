"""Admin funnel and return-visit numbers (#1499), computed from ``product_events`` and the activity tables."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin.models import ProductEvent
from app.admin.overview import GUEST_SUFFIX, last_days
from app.core.models import User
from app.core.time import as_utc_or_none
from app.duel.models import DuelMatchSeat, DuelSoloGame

FUNNEL_STEPS = ("landing", "home_view", "game_start", "game_done", "signup")


def _day(dt: datetime | None) -> date | None:
    dt = as_utc_or_none(dt)
    return dt.date() if dt is not None else None


def build_funnel_steps(db: Session, since: datetime) -> list[dict]:
    """Distinct visitors and raw events per step. A signed-in visitor counts once by account, a guest by client id."""
    steps = []
    for name in FUNNEL_STEPS:
        base = (ProductEvent.name == name, ProductEvent.created_at >= since)
        events = int(db.scalar(select(func.count()).select_from(ProductEvent).where(*base)) or 0)
        users = int(db.scalar(select(func.count(func.distinct(ProductEvent.user_id))).where(*base)) or 0)
        anon = int(
            db.scalar(
                select(func.count(func.distinct(ProductEvent.anon_id))).where(*base, ProductEvent.user_id.is_(None))
            )
            or 0
        )
        steps.append({"step": name, "visitors": users + anon, "events": events})
    return steps


def _newest_activity(db: Session, since: datetime) -> dict[int, date]:
    """Newest match or bot/practice game per user created since ``since``: the history from before ``last_seen_at``."""
    out: dict[int, date] = {}
    queries = (
        select(DuelMatchSeat.user_id, func.max(DuelMatchSeat.created_at))
        .join(User, User.id == DuelMatchSeat.user_id)
        .where(User.created_at >= since)
        .group_by(DuelMatchSeat.user_id),
        select(DuelSoloGame.user_id, func.max(DuelSoloGame.created_at))
        .join(User, User.id == DuelSoloGame.user_id)
        .where(User.created_at >= since)
        .group_by(DuelSoloGame.user_id),
    )
    for q in queries:
        for uid, newest in db.execute(q):
            d = _day(newest)
            if d is not None and (uid not in out or d > out[uid]):
                out[uid] = d
    return out


def build_retention(db: Session, today: date, weeks: int) -> list[dict]:
    """Per signup week, how many real accounts were seen again on day 1 / day 7 or later.

    ``last_seen_at`` keeps only the newest day, so "returned" means the newest activity is at least N days
    after signup. Accounts too new to have reached day N are left out of that rate's denominator.
    """
    first_week = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks - 1)
    since = datetime(first_week.year, first_week.month, first_week.day, tzinfo=timezone.utc)
    rows = db.execute(
        select(User.id, User.created_at, User.last_seen_at).where(
            User.created_at >= since,
            User.placeholder_group_buy_id.is_(None),
            ~User.email.like(f"%{GUEST_SUFFIX}"),
        )
    ).all()
    history = _newest_activity(db, since)
    cohorts: dict[date, dict] = {
        first_week + timedelta(weeks=i): {"size": 0, "d1_eligible": 0, "d1_returned": 0, "d7_eligible": 0, "d7_returned": 0}
        for i in range(weeks)
    }
    for uid, created, seen in rows:
        signup = _day(created)
        if signup is None:
            continue
        c = cohorts.get(signup - timedelta(days=signup.weekday()))
        if c is None:
            continue
        newest = max((d for d in (seen, history.get(uid)) if d is not None), default=None)
        c["size"] += 1
        for key, n in (("d1", 1), ("d7", 7)):
            if signup + timedelta(days=n) <= today:
                c[f"{key}_eligible"] += 1
                if newest is not None and newest >= signup + timedelta(days=n):
                    c[f"{key}_returned"] += 1
    return [{"week_start": w.isoformat(), **c} for w, c in cohorts.items()]


def build_funnel(db: Session, days: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    window = last_days(now, days)
    since = datetime(window[0].year, window[0].month, window[0].day, tzinfo=timezone.utc)
    return {
        "generated_at": now.isoformat(),
        "days": days,
        "steps": build_funnel_steps(db, since),
        "retention": build_retention(db, now.date(), max(2, min(12, -(-days // 7)))),
    }
