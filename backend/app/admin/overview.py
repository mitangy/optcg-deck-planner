"""Player and planner analytics behind GET /admin/overview (#667), taken out of the admin router (refactor 3.9d)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.analyst.credit import month_start, spent_since
from app.core.statuses import AccessStatus
from app.core.time import as_utc_or_none
from app.models import (
    AnalystAccess,
    AnalystUsage,
    Deck,
    DuelMatch,
    DuelMatchSeat,
    User,
)
from app.roles import STAFF_ROLES

GUEST_SUFFIX = "@localhost"
TOP_LEADERS_LIMIT = 25


def last_days(now: datetime, n: int) -> list[date]:
    """The last n UTC days, oldest first, ending today."""
    today = now.date()
    return [today - timedelta(days=i) for i in range(n - 1, -1, -1)]


def bucket_by_day(stamps: list[datetime | None], days: list[date]) -> dict[date, int]:
    """Count timestamps per UTC day in Python, so it behaves the same on SQLite and Postgres."""
    counts = {d: 0 for d in days}
    for t in stamps:
        t = as_utc_or_none(t)
        if t is not None and t.date() in counts:
            counts[t.date()] += 1
    return counts


def is_guest():
    return User.email.like(f"%{GUEST_SUFFIX}")


def build_overview(db: Session, days: int) -> dict:
    now = datetime.now(timezone.utc)
    d1, d7, d30 = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    guest = is_guest()

    def users(*where) -> int:
        return int(db.scalar(select(func.count()).select_from(User).where(*where)) or 0)

    total = users()
    guests = users(guest)
    accounts = {
        "total": total,
        "real": total - guests,
        "guests": guests,
        "staff": users(User.role.in_(STAFF_ROLES)),
        "banned": users(User.banned_at.is_not(None)),
        "new_7d": users(User.created_at >= d7),
        "new_30d": users(User.created_at >= d30),
    }

    window = last_days(now, days)
    window_start = datetime.combine(window[0], datetime.min.time(), tzinfo=timezone.utc)
    signups = db.execute(select(User.created_at, guest).where(User.created_at >= window_start)).all()
    real_by_day = bucket_by_day([c for c, g in signups if not g], window)
    guest_by_day = bucket_by_day([c for c, g in signups if g], window)

    def active(since: datetime, real_only: bool = False) -> int:
        ids: set[int] = set()
        seats = select(DuelMatchSeat.user_id).where(DuelMatchSeat.created_at >= since).distinct()
        ids.update(db.scalars(seats))
        for col in (DuelMatch.seat0_user_id, DuelMatch.seat1_user_id):
            ids.update(db.scalars(select(col).where(DuelMatch.created_at >= since).distinct()))
        if real_only and ids:
            ids = set(db.scalars(select(User.id).where(User.id.in_(ids), ~guest)))
        return len(ids)

    active_out = {
        "d1": active(d1),
        "d7": active(d7),
        "d30": active(d30),
        "real_d7": active(d7, True),
        "real_d30": active(d30, True),
    }

    matches30 = db.execute(select(DuelMatch.created_at, DuelMatch.ranked).where(DuelMatch.created_at >= window_start)).all()
    ranked_by_day = bucket_by_day([t for t, r in matches30 if r], window)
    casual_by_day = bucket_by_day([t for t, r in matches30 if not r], window)
    avg_turns = db.scalar(select(func.avg(DuelMatch.turns)).where(DuelMatch.created_at >= d30, DuelMatch.turns.is_not(None)))
    matches = {
        "total": int(db.scalar(select(func.count()).select_from(DuelMatch)) or 0),
        "last_7d": int(db.scalar(select(func.count()).select_from(DuelMatch).where(DuelMatch.created_at >= d7)) or 0),
        "ranked_7d": int(
            db.scalar(select(func.count()).select_from(DuelMatch).where(DuelMatch.created_at >= d7, DuelMatch.ranked.is_(True))) or 0
        ),
        "avg_turns_30d": round(float(avg_turns), 1) if avg_turns is not None else None,
    }

    games = func.count()
    wins = func.sum(case((DuelMatchSeat.won.is_(True), 1), else_=0))

    def top_leaders(since: datetime) -> list[dict]:
        rows = db.execute(
            select(DuelMatchSeat.leader_id, games, wins)
            .where(DuelMatchSeat.created_at >= since)
            .group_by(DuelMatchSeat.leader_id)
            .order_by(games.desc(), DuelMatchSeat.leader_id)
            .limit(TOP_LEADERS_LIMIT)
        ).all()
        return [{"leader_id": lid, "games": int(g), "wins": int(w or 0)} for lid, g, w in rows]

    leaders_window = top_leaders(window_start)
    # Kept under its old name for older clients: always the last 30 days, whatever the window.
    leaders_30d = leaders_window if days == 30 else top_leaders(d30)

    month = month_start(now)
    return {
        "generated_at": now.isoformat(),
        "days": days,
        "accounts": accounts,
        "signups_by_day": [{"day": d.isoformat(), "real": real_by_day[d], "guests": guest_by_day[d]} for d in window],
        "active": active_out,
        "matches_by_day": [{"day": d.isoformat(), "ranked": ranked_by_day[d], "casual": casual_by_day[d]} for d in window],
        "matches": matches,
        "top_leaders": leaders_window,
        "top_leaders_30d": leaders_30d,
        "planner": {
            "decks": int(db.scalar(select(func.count()).select_from(Deck)) or 0),
            "users_with_decks": int(db.scalar(select(func.count(func.distinct(Deck.user_id)))) or 0),
        },
        "log_pose": {
            "questions_month": int(
                db.scalar(select(func.count()).select_from(AnalystUsage).where(AnalystUsage.kind == "chat", AnalystUsage.created_at >= month)) or 0
            ),
            "spend_month_usd": round(spent_since(db, month), 4),
            "users_with_access": int(
                db.scalar(select(func.count()).select_from(AnalystAccess).where(AnalystAccess.status == AccessStatus.APPROVED)) or 0
            ),
        },
    }
