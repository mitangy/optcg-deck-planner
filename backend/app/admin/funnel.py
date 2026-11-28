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
from app.roles import STAFF_ROLES

FUNNEL_STEPS = ("landing", "home_view", "game_start", "game_done", "signup")


def build_funnel_steps(db: Session, since: datetime) -> list[dict]:
    """Visitors and raw events per step.

    A visitor is the account when there is one. A browser id that was ever seen signed in counts as that
    account, so one person is not two visitors across the sign-in. Staff are left out: they test the funnel.
    """
    staff = set(db.scalars(select(User.id).where(User.role.in_(STAFF_ROLES))))
    owner: dict[str, int] = {}
    for anon, uid in db.execute(
        select(ProductEvent.anon_id, ProductEvent.user_id)
        .where(ProductEvent.created_at >= since, ProductEvent.anon_id.is_not(None), ProductEvent.user_id.is_not(None))
        .distinct()
    ):
        owner[anon] = uid
    steps = []
    for name in FUNNEL_STEPS:
        base = (ProductEvent.name == name, ProductEvent.created_at >= since)
        pairs = db.execute(select(ProductEvent.user_id, ProductEvent.anon_id).where(*base)).all()
        events = 0
        visitors: set[str] = set()
        for uid, anon in pairs:
            uid = uid if uid is not None else owner.get(anon)
            if uid in staff:
                continue
            events += 1
            visitors.add(f"u{uid}" if uid is not None else f"a{anon}")
        steps.append({"step": name, "visitors": len(visitors), "events": events})
    return steps


def _newest_activity(db: Session, since: datetime) -> dict[int, datetime]:
    """Newest match or bot/practice game per user created since ``since``: the history from before ``last_seen_at``."""
    out: dict[int, datetime] = {}
    queries = (
        select(DuelMatchSeat.user_id, func.max(DuelMatchSeat.created_at))
        .join(User, User.id == DuelMatchSeat.user_id)
        .where(User.created_at >= since, DuelMatchSeat.created_at >= since)
        .group_by(DuelMatchSeat.user_id),
        select(DuelSoloGame.user_id, func.max(DuelSoloGame.created_at))
        .join(User, User.id == DuelSoloGame.user_id)
        .where(User.created_at >= since, DuelSoloGame.created_at >= since)
        .group_by(DuelSoloGame.user_id),
    )
    for q in queries:
        for uid, newest in db.execute(q):
            t = as_utc_or_none(newest)
            if t is not None and (uid not in out or t > out[uid]):
                out[uid] = t
    return out


def build_retention(db: Session, now: datetime, weeks: int) -> list[dict]:
    """Per signup week, how many real accounts were active again 1 / 7 or more days (24 h each) after signup.

    ``last_seen_at`` keeps only the newest day, so "returned" means the newest activity is at least N x 24 h
    after ``created_at``. Accounts too new to have reached that point are left out of that rate's denominator.
    """
    today = now.date()
    first_week = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks - 1)
    since = datetime(first_week.year, first_week.month, first_week.day, tzinfo=timezone.utc)
    rows = db.execute(
        select(User.id, User.created_at, User.last_seen_at).where(
            User.created_at >= since,
            User.placeholder_group_buy_id.is_(None),
            User.role.not_in(STAFF_ROLES),
            ~User.email.like(f"%{GUEST_SUFFIX}"),
        )
    ).all()
    history = _newest_activity(db, since)
    cohorts: dict[date, dict] = {
        first_week + timedelta(weeks=i): {"size": 0, "d1_eligible": 0, "d1_returned": 0, "d7_eligible": 0, "d7_returned": 0}
        for i in range(weeks)
    }
    for uid, created, seen in rows:
        signup = as_utc_or_none(created)
        if signup is None:
            continue
        c = cohorts.get(signup.date() - timedelta(days=signup.date().weekday()))
        if c is None:
            continue
        newest = max((t for t in (as_utc_or_none(seen), history.get(uid)) if t is not None), default=None)
        c["size"] += 1
        for key, n in (("d1", 1), ("d7", 7)):
            due = signup + timedelta(days=n)
            if due <= now:
                c[f"{key}_eligible"] += 1
                if newest is not None and newest >= due:
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
        "retention": build_retention(db, now, max(2, min(12, -(-days // 7)))),
    }
