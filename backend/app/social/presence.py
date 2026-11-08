"""Who is online or in a game, and the friendship rows keyed by user pair.

Lived in the friends router; the duel, reports, admin and tournament code read it too, so it sits
here and no module has to import a router for it (refactor D-02).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import redis_client
from app.duel import live as duel_live
from app.core.time import as_utc
from app.social.models import DuelPresence, Friendship

# A game-server snapshot lands every ~15s; allow a few missed pushes.
PRESENCE_TTL = timedelta(seconds=60)
# The lobby polls about every 10s while open.
ONLINE_TTL = timedelta(seconds=45)


def pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def friendship(db: Session, a: int, b: int) -> Friendship | None:
    low, high = pair(a, b)
    return db.scalar(
        select(Friendship).where(Friendship.user_low_id == low, Friendship.user_high_id == high)
    )


def live_presence(db: Session, user_ids: list[int], now: datetime) -> dict[int, list[DuelPresence]]:
    """Fresh presence rows per user (stale rows from a dead game-server are skipped)."""
    if not user_ids:
        return {}
    rows: list[DuelPresence] | None = None
    r = redis_client.get_redis()
    if r is not None:
        try:
            rows = duel_live.read_presence(r, user_ids)
        except redis_client.RedisError:
            redis_client.report_failure("presence read")
    if rows is None:
        rows = list(db.scalars(select(DuelPresence).where(DuelPresence.user_id.in_(user_ids))))
    out: dict[int, list[DuelPresence]] = {}
    for row in rows:
        if now - as_utc(row.updated_at) <= PRESENCE_TTL:
            out.setdefault(row.user_id, []).append(row)
    return out


def friend_status(
    rows: list[DuelPresence], seen_at: datetime | None, now: datetime
) -> tuple[str, str | None, bool]:
    """(status, spectatable room id, ranked) for one friend."""
    players = [r for r in rows if r.role == "player"]
    # A live game outranks an open lobby room if a player somehow holds both.
    for row in sorted(players, key=lambda r: r.phase == "waiting"):
        if row.phase == "waiting":
            # Waiting rooms stay private: joining one takes an invite.
            return "waiting", None, row.ranked
        return "in_game", row.room_id, row.ranked
    for row in rows:
        if row.role == "spectator":
            # Same rule as for players: an unstarted room's id is invite-only.
            room_id = None if row.phase == "waiting" else row.room_id
            return "spectating", room_id, row.ranked
    if seen_at is not None and now - as_utc(seen_at) <= ONLINE_TTL:
        return "online", None, False
    return "offline", None, False


def room_server_url(rows: list[DuelPresence], room_id: str | None) -> str | None:
    """The pool a room is on, as its game server last reported it."""
    return next((r.server_url for r in rows if r.room_id == room_id and r.server_url), None)
