"""Log Pose's game corpus: every recorded duel, anonymized, for the analyst to search and replay.

Games of players who turned sharing off are left out. Results never carry names, user ids,
match ids or exact ratings: each game gets an opaque game id, the two sides are "A" and "B",
and ratings are shown as 200-point bands. There is deliberately no filter by player.
"""

from __future__ import annotations

import json
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnalystCorpusId, AnalystPrefs, DuelMatch, DuelMatchLog, DuelMatchSeat

MAX_GAMES = 50


def rating_band(rating: int | None) -> str | None:
    if rating is None:
        return None
    low = max(0, rating // 200 * 200)
    return f"{low}-{low + 199}"


def _game_ids(db: Session, match_ids: list[str]) -> dict[str, str]:
    """Opaque game ids for these matches, made on first use."""
    have = {r.match_id: r.game_id for r in db.scalars(select(AnalystCorpusId).where(AnalystCorpusId.match_id.in_(match_ids)))}
    for mid in match_ids:
        if mid not in have:
            gid = "g_" + secrets.token_urlsafe(9)
            db.add(AnalystCorpusId(match_id=mid, game_id=gid))
            have[mid] = gid
    db.commit()
    return have


def _opted_out(db: Session) -> set[int]:
    return set(db.scalars(select(AnalystPrefs.user_id).where(AnalystPrefs.share_matches.is_(False))).all())


def _side(seat: DuelMatchSeat, rating: int | None) -> dict:
    return {"leader": seat.leader_id, "won": seat.won, "went_first": seat.went_first, "rating_band": rating_band(rating)}


def search_games(
    db: Session,
    *,
    leader: str | None = None,
    opponent: str | None = None,
    card: str | None = None,
    result: str | None = None,
    went_first: bool | None = None,
    ranked_only: bool = False,
    days: int = 90,
    min_turns: int | None = None,
    max_turns: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Shared games matching the filters, newest first. With a leader (or only an opponent),
    side A is that leader's side; result, went_first and card then apply to side A.
    Without either, A is the first seat and card matches either deck."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = (
        select(DuelMatchSeat, DuelMatch)
        .join(DuelMatch, DuelMatch.match_id == DuelMatchSeat.match_id)
        .where(DuelMatch.created_at >= since)
    )
    if ranked_only:
        q = q.where(DuelMatch.ranked.is_(True))
    by_match: dict[str, list[DuelMatchSeat]] = defaultdict(list)
    matches: dict[str, DuelMatch] = {}
    for seat, match in db.execute(q).all():
        by_match[seat.match_id].append(seat)
        matches[seat.match_id] = match
    opted_out = _opted_out(db)
    with_replay = set(db.scalars(select(DuelMatchLog.match_id).where(DuelMatchLog.match_id.in_(list(by_match)))).all())

    found: list[tuple[DuelMatch, DuelMatchSeat, DuelMatchSeat]] = []
    for mid, rows in by_match.items():
        if len(rows) != 2 or any(r.user_id in opted_out for r in rows):
            continue
        s0, s1 = sorted(rows, key=lambda r: r.seat)
        if leader:
            a, b = (s0, s1) if s0.leader_id == leader else (s1, s0) if s1.leader_id == leader else (None, None)
        elif opponent:
            a, b = (s0, s1) if s1.leader_id == opponent else (s1, s0) if s0.leader_id == opponent else (None, None)
        else:
            a, b = s0, s1
        if a is None or (opponent and b.leader_id != opponent):
            continue
        match = matches[mid]
        if result is not None and a.won != (result == "won"):
            continue
        if went_first is not None and a.went_first is not went_first:
            continue
        if min_turns is not None and (match.turns or 0) < min_turns:
            continue
        if max_turns is not None and (match.turns is None or match.turns > max_turns):
            continue
        if card:
            decks = [a] if (leader or opponent) else [a, b]
            if not any(card in json.loads(s.deck or "{}") for s in decks):
                continue
        found.append((match, a, b))

    found.sort(key=lambda t: (t[0].created_at, t[0].id), reverse=True)
    total = len(found)
    page = found[offset : offset + min(limit, MAX_GAMES)]
    ids = _game_ids(db, [m.match_id for m, _, _ in page])
    games = []
    for match, a, b in page:
        rating = lambda s: getattr(match, f"seat{s.seat}_rating_before")  # noqa: E731
        games.append(
            {
                "game_id": ids[match.match_id],
                "date": match.created_at.date().isoformat() if match.created_at else None,
                "ranked": match.ranked,
                "turns": match.turns,
                "has_replay": match.match_id in with_replay,
                "A": _side(a, rating(a)),
                "B": _side(b, rating(b)),
            }
        )
    return {"total": total, "offset": offset, "games": games, "window_days": days}


def game_replay(db: Session, game_id: str) -> dict | None:
    """The full replay of one corpus game with its sides as A (first seat) and B, or None when it
    isn't in the corpus (unknown id, no replay kept, or a player has since turned sharing off)."""
    row = db.scalar(select(AnalystCorpusId).where(AnalystCorpusId.game_id == game_id))
    if row is None:
        return None
    match = db.scalar(select(DuelMatch).where(DuelMatch.match_id == row.match_id))
    log = db.get(DuelMatchLog, row.match_id)
    if match is None or log is None:
        return None
    if {match.seat0_user_id, match.seat1_user_id} & _opted_out(db):
        return None
    return {
        "game_id": game_id,
        "date": match.created_at.date().isoformat() if match.created_at else None,
        "ranked": match.ranked,
        "sides": {"A": 0, "B": 1},
        "rating_bands": {"A": rating_band(match.seat0_rating_before), "B": rating_band(match.seat1_rating_before)},
        "replay": json.loads(log.replay),
    }
