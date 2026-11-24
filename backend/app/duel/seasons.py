"""Ranked seasons (#1405): archive the board, reset Bounty, start the next season.

No ``duel_seasons`` row means Season 1, which began before launch (``started_at`` None).
The first reset creates that row, so the history always starts from a real row.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import User
from app.core.time import as_utc_or_none
from app.duel.leaderboard import current_board, ranked_records
from app.duel.models import DuelRating, DuelSeason, DuelSeasonStanding
from app.duel.ratings import INITIAL_RATING

ResetMode = Literal["soft", "hard"]
MAX_NAME_LEN = 64


@dataclass(frozen=True)
class SeasonInfo:
    number: int
    name: str
    started_at: datetime | None


def default_name(number: int) -> str:
    return f"Season {number}"


def current_season(db: Session) -> SeasonInfo:
    row = db.scalar(select(DuelSeason).where(DuelSeason.ended_at.is_(None)).order_by(DuelSeason.number.desc()))
    if row is None:
        return SeasonInfo(1, default_name(1), None)
    return SeasonInfo(row.number, row.name, as_utc_or_none(row.started_at))


def latest_since(*times: datetime | None) -> datetime | None:
    """The latest of the given times, ignoring None; None when there are none."""
    real = [t for t in times if t is not None]
    return max(real) if real else None


def reset_rating(rating: int, mode: ResetMode) -> int:
    """Bounty after a reset. Soft moves halfway back to 1000, rounding half away from zero
    (1001 -> 1001, 1003 -> 1002, 997 -> 998), so a lead never rounds down to nothing. Hard is 1000."""
    if mode == "hard":
        return INITIAL_RATING
    diff = rating - INITIAL_RATING
    half = (abs(diff) + 1) // 2
    return INITIAL_RATING + (half if diff >= 0 else -half)


class StaleSeason(Exception):
    """The open season is no longer the one the caller confirmed: another request already ended it (#1427)."""


def start_new_season(
    db: Session, mode: ResetMode, name: str | None, actor_id: int | None, expected_number: int | None = None
) -> DuelSeason:
    # Same lock order as match ingest (ascending user id), so a game finishing mid-reset waits instead of deadlocking.
    rated_ids = list(db.scalars(select(DuelRating.user_id).order_by(DuelRating.user_id)))
    if rated_ids:
        db.execute(select(User.id).where(User.id.in_(rated_ids)).order_by(User.id).with_for_update()).all()

    ending = db.scalar(select(DuelSeason).where(DuelSeason.ended_at.is_(None)).order_by(DuelSeason.number.desc()))
    if ending is None:
        ending = DuelSeason(number=1, name=default_name(1), started_at=None)
        db.add(ending)
        db.flush()
    # Re-check under the locks: a concurrent request may have ended the season we confirmed (#1427).
    if expected_number is not None and ending.number != expected_number:
        db.rollback()
        raise StaleSeason()
    now = datetime.now(timezone.utc)
    started = as_utc_or_none(ending.started_at)

    board = current_board(db)
    records = ranked_records(db, since=started)
    ratings = {r.user_id: r for r in db.scalars(select(DuelRating))}
    for row in board:
        rec = records.get(row.user_id)
        db.add(
            DuelSeasonStanding(
                season_id=ending.id,
                user_id=row.user_id,
                rank=row.rank,
                rating=row.rating,
                games_played=row.games_played,
                provisional=row.provisional,
                wins=rec.wins if rec else 0,
                losses=rec.losses if rec else 0,
                rating_after_reset=reset_rating(row.rating, mode),
            )
        )
    for rating in ratings.values():
        rating.rating = reset_rating(rating.rating, mode)
        rating.games_played = 0

    ending.ended_at = now
    ending.reset_mode = mode
    ending.ended_by_user_id = actor_id
    number = ending.number + 1
    fresh = DuelSeason(number=number, name=(name or "").strip()[:MAX_NAME_LEN] or default_name(number), started_at=now)
    db.add(fresh)
    db.commit()
    return fresh


def ended_seasons(db: Session) -> list[tuple[DuelSeason, int]]:
    """Ended seasons, newest first, with how many players each archived."""
    counts = dict(
        db.execute(
            select(DuelSeasonStanding.season_id, func.count()).group_by(DuelSeasonStanding.season_id)
        ).all()
    )
    rows = db.scalars(select(DuelSeason).where(DuelSeason.ended_at.is_not(None)).order_by(DuelSeason.number.desc()))
    return [(s, int(counts.get(s.id, 0))) for s in rows]
