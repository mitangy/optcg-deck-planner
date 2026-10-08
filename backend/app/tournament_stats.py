"""Log Pose tournament stats: aggregates over Limitless TCG events kept by tournament_sync.

Kept apart from analyst_stats (optcgduel.app duels). Games are pairings between two leaders;
ties are counted separately and are not wins or games for a win rate. Reuses the duel stats'
Wilson interval and too-few-games rule.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analyst_stats import MIN_GAMES, _record
from app.models import Tournament, TournamentDeck, TournamentGame

SOURCE = "Limitless TCG tournaments"
# A leader needs this many decisive games before it can be ranked by win rate.
RANK_MIN_GAMES = 20
TOP_PLACINGS = 5
TOP_CARDS = 40
TOP_LEADERS = 10


def _tally(results: list[str]) -> dict:
    """A record from per-game results ('win', 'loss', 'tie'): decisive games only, ties on the side."""
    wins = results.count("win")
    games = wins + results.count("loss")
    return {**_record(games, wins), "ties": results.count("tie")}


def _events(db: Session, days: int, min_players: int) -> list[Tournament]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(Tournament).where(Tournament.date >= since, Tournament.players >= min_players).order_by(Tournament.date.desc())
    return list(db.scalars(q).all())


def _outcomes(games: list[TournamentGame]) -> list[tuple[str, str, str, TournamentGame]]:
    """(leader, opponent, result for that leader, game) once per side of every game."""
    out = []
    for g in games:
        a_res = {"A": "win", "B": "loss", "tie": "tie"}[g.winner]
        b_res = {"A": "loss", "B": "win", "tie": "tie"}[g.winner]
        out.append((g.leader_a, g.leader_b, a_res, g))
        if g.leader_a != g.leader_b:
            out.append((g.leader_b, g.leader_a, b_res, g))
    return out


def _card_rates(decks: list[TournamentDeck]) -> dict:
    lists = [json.loads(d.decklist) for d in decks if d.decklist and d.decklist != "{}"]
    seen: Counter[str] = Counter()
    copies: Counter[str] = Counter()
    for deck in lists:
        for cid, n in deck.items():
            seen[cid] += 1
            copies[cid] += n
    cards = [
        {"id": cid, "decks": n, "rate": round(n / len(lists), 3), "average_copies": round(copies[cid] / n, 1)}
        for cid, n in seen.items()
    ]
    cards.sort(key=lambda c: (-c["decks"], c["id"]))
    return {"decklists": len(lists), "too_few_decks": len(lists) < MIN_GAMES, "cards": cards[:TOP_CARDS]}


def tournament_stats(db: Session, leader: str | None, opponent: str | None, days: int, min_players: int) -> dict:
    events = _events(db, days, min_players)
    ids = [e.id for e in events]
    window = {"days": days, "min_players": min_players, "min_games": MIN_GAMES, "source": SOURCE}
    if not ids:
        return {**window, "events": [], "total_decks": 0, "total_games": 0, **({"leader": leader} if leader else {"leaders": []})}
    by_id = {e.id: e for e in events}
    decks = list(db.scalars(select(TournamentDeck).where(TournamentDeck.tournament_id.in_(ids))).all())
    games = list(db.scalars(select(TournamentGame).where(TournamentGame.tournament_id.in_(ids))).all())
    outcomes = _outcomes(games)
    event_out = lambda e: {"id": e.id, "name": e.name, "date": e.date.date().isoformat(), "players": e.players}  # noqa: E731

    if leader is None:
        decks_by: Counter[str] = Counter(d.leader_id for d in decks)
        results: dict[str, list[str]] = defaultdict(list)
        for lid, opp, res, _g in outcomes:
            if lid != opp:
                results[lid].append(res)
        rows = [
            {"leader": lid, "decks": n, "share": round(n / len(decks), 3), **_tally(results[lid])}
            for lid, n in sorted(decks_by.items(), key=lambda kv: (-kv[1], kv[0]))
        ]
        ranked = sorted((r for r in rows if r["games"] >= RANK_MIN_GAMES), key=lambda r: (-r["win_rate"], -r["games"]))
        return {
            **window,
            "events": [event_out(e) for e in events],
            "total_decks": len(decks),
            "total_games": len(games),
            "leaders": rows,
            "top_win_rate": ranked[:TOP_LEADERS],
            "top_win_rate_min_games": RANK_MIN_GAMES,
        }

    mine = [o for o in outcomes if o[0] == leader]
    if opponent is not None:
        vs = [o for o in mine if o[1] == opponent]
        used = {o[3].tournament_id for o in vs}
        base = {**window, "leader": leader, "opponent": opponent, "events": [event_out(e) for e in events if e.id in used]}
        if opponent == leader:
            # A mirror is a win and a loss for the same leader, so it has no win rate.
            return {**base, "mirror": True, "games": len(vs)}
        return {**base, **_tally([r for _l, _o, r, _g in vs])}

    leader_decks = [d for d in decks if d.leader_id == leader]
    by_opp: dict[str, list[str]] = defaultdict(list)
    for _l, opp, res, _g in mine:
        if opp != leader:
            by_opp[opp].append(res)
    placed = sorted((d for d in leader_decks if d.placing), key=lambda d: (d.placing, -by_id[d.tournament_id].players))
    used = {d.tournament_id for d in leader_decks}
    return {
        **window,
        "leader": leader,
        "events": [event_out(e) for e in events if e.id in used],
        "meta": {"decks": len(leader_decks), "total_decks": len(decks), "share": round(len(leader_decks) / len(decks), 3) if decks else 0.0},
        "overall": _tally([r for _l, o, r, _g in mine if o != leader]),
        "mirror_games": sum(1 for g in games if g.leader_a == leader and g.leader_b == leader),
        "opponents": [{"opponent": o, **_tally(rs)} for o, rs in sorted(by_opp.items(), key=lambda kv: (-len(kv[1]), kv[0]))],
        "top_placings": [
            {
                "event_id": d.tournament_id,
                "event": by_id[d.tournament_id].name,
                "date": by_id[d.tournament_id].date.date().isoformat(),
                "players": by_id[d.tournament_id].players,
                "placing": d.placing,
                "record": {"wins": d.wins, "losses": d.losses, "ties": d.ties},
                "decklist": json.loads(d.decklist),
            }
            for d in placed[:TOP_PLACINGS]
        ],
        **_card_rates(leader_decks),
    }
