"""Log Pose matchup stats: one row per side of each finished duel, and aggregates over them.

Only aggregates leave this module: win rates with a Wilson interval and sample size,
going first or second, and card inclusion. Games of players who turned sharing off
are left out entirely, as are matches without known leaders.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnalystPrefs, DuelMatch, DuelMatchLog, DuelMatchSeat

MIN_GAMES = 5


def _deck_counts(cards: object) -> dict[str, int] | None:
    if not isinstance(cards, list) or not all(isinstance(c, str) for c in cards):
        return None
    return dict(sorted(Counter(cards).items()))


def seats_for(match: DuelMatch, replay: dict | None) -> list[DuelMatchSeat]:
    """Both sides of a match, or none when either leader is unknown."""
    players = replay.get("players") if isinstance(replay, dict) else None
    first = replay.get("firstSeat") if isinstance(replay, dict) else None
    rows: list[DuelMatchSeat] = []
    for seat in (0, 1):
        leader = getattr(match, f"seat{seat}_leader_id")
        player = players[seat] if isinstance(players, list) and len(players) == 2 and isinstance(players[seat], dict) else None
        if not leader and player:
            leader = player.get("leaderId")
        if not leader:
            return []
        deck = _deck_counts(player.get("deck")) if player else None
        rows.append(
            DuelMatchSeat(
                match_id=match.match_id,
                seat=seat,
                user_id=getattr(match, f"seat{seat}_user_id"),
                leader_id=str(leader)[:32],
                won=match.winner_seat == seat,
                went_first=(first == seat) if first in (0, 1) else None,
                ranked=match.ranked,
                turns=match.turns,
                deck=json.dumps(deck, separators=(",", ":")) if deck else None,
            )
        )
    return rows


def backfill_seats(db: Session) -> int:
    """Add seat rows for matches recorded before stats existed. Safe to run on every start."""
    have = select(DuelMatchSeat.match_id)
    missing = db.scalars(select(DuelMatch).where(DuelMatch.match_id.not_in(have))).all()
    added = 0
    for match in missing:
        log = db.get(DuelMatchLog, match.match_id)
        try:
            replay = json.loads(log.replay) if log else None
        except ValueError:
            replay = None
        rows = seats_for(match, replay)
        db.add_all(rows)
        added += len(rows)
    if added:
        db.commit()
    return added


def wilson(wins: int, games: int, z: float = 1.96) -> tuple[float, float] | None:
    """95% Wilson score interval for a win rate."""
    if games == 0:
        return None
    p = wins / games
    denom = 1 + z * z / games
    centre = (p + z * z / (2 * games)) / denom
    half = z * math.sqrt(p * (1 - p) / games + z * z / (4 * games * games)) / denom
    return (round(max(0.0, centre - half), 3), round(min(1.0, centre + half), 3))


def _record(games: int, wins: int) -> dict:
    """A win record; under MIN_GAMES only the game count, so no single game's result shows."""
    if games < MIN_GAMES:
        return {"games": games, "wins": None, "win_rate": None, "interval": None, "too_few_games": True}
    return {
        "games": games,
        "wins": wins,
        "win_rate": round(wins / games, 3),
        "interval": wilson(wins, games),
        "too_few_games": False,
    }


def _pairs(db: Session, days: int, ranked_only: bool, leader: str | None) -> list[tuple[DuelMatchSeat, DuelMatchSeat]]:
    """(side, opponent side) for every shared match in the window; with a leader, only its sides."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    opted_out = set(db.scalars(select(AnalystPrefs.user_id).where(AnalystPrefs.share_matches.is_(False))).all())
    # Date by the match: backfilled seat rows were stamped when the backfill ran.
    q = select(DuelMatchSeat).join(DuelMatch, DuelMatch.match_id == DuelMatchSeat.match_id).where(DuelMatch.created_at >= since)
    if ranked_only:
        q = q.where(DuelMatchSeat.ranked.is_(True))
    by_match: dict[str, list[DuelMatchSeat]] = defaultdict(list)
    for row in db.scalars(q).all():
        by_match[row.match_id].append(row)
    pairs = []
    for rows in by_match.values():
        if len(rows) != 2 or any(r.user_id in opted_out for r in rows):
            continue
        a, b = sorted(rows, key=lambda r: r.seat)
        for side, opp in ((a, b), (b, a)):
            if leader is None or side.leader_id == leader:
                pairs.append((side, opp))
    return pairs


def _split(pairs: list[tuple[DuelMatchSeat, DuelMatchSeat]]) -> dict:
    first = [s for s, _ in pairs if s.went_first is True]
    second = [s for s, _ in pairs if s.went_first is False]
    turns = [s.turns for s, _ in pairs if s.turns]
    return {
        **_record(len(pairs), sum(s.won for s, _ in pairs)),
        "going_first": _record(len(first), sum(s.won for s in first)),
        "going_second": _record(len(second), sum(s.won for s in second)),
        "average_turns": round(sum(turns) / len(turns), 1) if turns and len(pairs) >= MIN_GAMES else None,
    }


def _card_rates(pairs: list[tuple[DuelMatchSeat, DuelMatchSeat]]) -> list[dict]:
    """Win rate with and without each card, for cards with enough games on both sides."""
    decks = [(json.loads(s.deck), s.won) for s, _ in pairs if s.deck]
    out = []
    for card in sorted({c for d, _ in decks for c in d}):
        with_card = [won for d, won in decks if card in d]
        without = [won for d, won in decks if card not in d]
        if len(with_card) < MIN_GAMES or len(without) < MIN_GAMES:
            continue
        out.append(
            {
                "id": card,
                "with": _record(len(with_card), sum(with_card)),
                "without": _record(len(without), sum(without)),
            }
        )
    return sorted(out, key=lambda r: -r["with"]["games"])


def matchup_stats(db: Session, leader: str | None, opponent: str | None, days: int, ranked_only: bool) -> dict:
    window = {"days": days, "ranked_only": ranked_only, "min_games": MIN_GAMES, "source": "optcgduel.app duels"}
    if leader is None:
        pairs = _pairs(db, days, ranked_only, None)
        by_leader: dict[str, list] = defaultdict(list)
        for side, opp in pairs:
            by_leader[side.leader_id].append((side, opp))
        total = len(pairs) // 2
        leaders = [
            {"leader": lid, "share": round(len(p) / (2 * total), 3) if total else None, **_split(p)}
            for lid, p in sorted(by_leader.items(), key=lambda kv: -len(kv[1]))
        ]
        return {**window, "total_games": total, "leaders": leaders}
    pairs = _pairs(db, days, ranked_only, leader)
    if opponent is not None:
        vs = [(s, o) for s, o in pairs if o.leader_id == opponent]
        if opponent == leader:
            # In a mirror every game is one win and one loss for the same leader.
            return {**window, "leader": leader, "opponent": opponent, "mirror": True, "games": len(vs) // 2}
        return {**window, "leader": leader, "opponent": opponent, **_split(vs)}
    by_opp: dict[str, list] = defaultdict(list)
    for side, opp in pairs:
        if opp.leader_id != leader:
            by_opp[opp.leader_id].append((side, opp))
    return {
        **window,
        "leader": leader,
        "overall": _split([(s, o) for s, o in pairs if o.leader_id != leader]),
        "opponents": [{"opponent": oid, **_split(p)} for oid, p in sorted(by_opp.items(), key=lambda kv: -len(kv[1]))],
        "cards": _card_rates([(s, o) for s, o in pairs if o.leader_id != leader]),
    }
