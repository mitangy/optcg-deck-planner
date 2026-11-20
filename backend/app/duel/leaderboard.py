from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session

from app.duel.models import DuelMatch, DuelRating
from app.duel.ratings import PROVISIONAL_GAMES


@dataclass(frozen=True)
class BoardRow:
    user_id: int
    rating: int
    games_played: int
    rank: int
    provisional: bool


def moved_ranked(stmt: Select) -> Select:
    """Ranked games that moved ratings. Pair-capped games are saved ranked with no change and never count as played."""
    return stmt.where(
        DuelMatch.ranked.is_(True),
        or_(
            DuelMatch.seat0_rating_before != DuelMatch.seat0_rating_after,
            DuelMatch.seat1_rating_before != DuelMatch.seat1_rating_after,
        ),
    )


def _competition_ranks(keys: list[int], first_rank: int) -> list[int]:
    """1, 1, 3 style ranks for keys already sorted best first."""
    ranks: list[int] = []
    for i, key in enumerate(keys):
        ranks.append(ranks[-1] if i > 0 and keys[i - 1] == key else first_rank + i)
    return ranks


def rank_board(players: list[tuple[int, int, int]]) -> list[BoardRow]:
    """players: (user_id, rating, games_played). Settled players first, provisional ones after them."""
    settled = [p for p in players if p[2] >= PROVISIONAL_GAMES]
    provisional = [p for p in players if p[2] < PROVISIONAL_GAMES]
    order = lambda p: (-p[1], -p[2], p[0])  # noqa: E731
    rows: list[BoardRow] = []
    first = 1
    for group, is_provisional in ((sorted(settled, key=order), False), (sorted(provisional, key=order), True)):
        ranks = _competition_ranks([p[1] for p in group], first)
        rows += [BoardRow(p[0], p[1], p[2], r, is_provisional) for p, r in zip(group, ranks)]
        first += len(group)
    return rows


def current_board(db: Session) -> list[BoardRow]:
    """Every player with a rated game, ranked. The one source for /duel/leaderboard and /duel/rating/me."""
    rows = db.execute(
        select(DuelRating.user_id, DuelRating.rating, DuelRating.games_played).where(DuelRating.games_played > 0)
    ).all()
    return rank_board([(r[0], r[1], r[2]) for r in rows])


def board_as_of(db: Session, cutoff: datetime) -> dict[int, int]:
    """user_id -> rank as the board stood at `cutoff`, rebuilt from each player's last rated game before it."""
    matches = db.execute(
        moved_ranked(
            select(
                DuelMatch.seat0_user_id,
                DuelMatch.seat1_user_id,
                DuelMatch.seat0_rating_after,
                DuelMatch.seat1_rating_after,
            )
        )
        .where(DuelMatch.created_at < cutoff)
        .order_by(DuelMatch.created_at, DuelMatch.id)
    ).all()
    rating: dict[int, int] = {}
    games: dict[int, int] = {}
    for s0, s1, after0, after1 in matches:
        rating[s0], rating[s1] = after0, after1
        games[s0] = games.get(s0, 0) + 1
        games[s1] = games.get(s1, 0) + 1
    return {r.user_id: r.rank for r in rank_board([(u, rating[u], games[u]) for u in rating])}


@dataclass(frozen=True)
class Record:
    wins: int = 0
    losses: int = 0
    gain: int = 0


def ranked_records(db: Session, *, since: datetime | None = None, user_id: int | None = None) -> dict[int, Record]:
    """Wins, losses and rating gained over rated games, optionally only since a time or for one player."""
    out: dict[int, Record] = {}
    for seat in (0, 1):
        uid_col = DuelMatch.seat0_user_id if seat == 0 else DuelMatch.seat1_user_id
        before = DuelMatch.seat0_rating_before if seat == 0 else DuelMatch.seat1_rating_before
        after = DuelMatch.seat0_rating_after if seat == 0 else DuelMatch.seat1_rating_after
        stmt = moved_ranked(
            select(
                uid_col,
                func.sum(case((DuelMatch.winner_seat == seat, 1), else_=0)),
                func.count(DuelMatch.id),
                func.sum(after - before),
            )
        ).group_by(uid_col)
        if since is not None:
            stmt = stmt.where(DuelMatch.created_at >= since)
        if user_id is not None:
            stmt = stmt.where(uid_col == user_id)
        for uid, wins, total, gain in db.execute(stmt).all():
            prev = out.get(uid, Record())
            w = int(wins or 0)
            out[uid] = Record(prev.wins + w, prev.losses + int(total) - w, prev.gain + int(gain or 0))
    return out


def window_board(records: dict[int, Record]) -> list[tuple[int, int]]:
    """(user_id, rank) for players ranked by rating gained, best first, equal gains sharing a rank."""
    order = sorted(records, key=lambda u: (-records[u].gain, u))
    ranks = _competition_ranks([records[u].gain for u in order], 1)
    return list(zip(order, ranks))
