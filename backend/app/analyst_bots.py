"""Log Pose's bot game corpus (#635): bot-vs-bot self-play games, kept apart from real duels.

Rows live in `bot_matches`, never in duel_matches / duel_match_seats, so nothing here reaches
matchup_stats, ratings or the leaderboard. The analyst reads them only through the service-secret
endpoints, and every number it quotes from here is labelled as a bot simulation.

Sides are "A" (seat 0) and "B" (seat 1). Line stats say how often a bot's side won in games where
a line happened (a Leader activation, an optional effect accepted, a Counter Event, a cheat-out)
against games where it did not.
"""

from __future__ import annotations

import json
import re
import secrets
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from app.analyst_stats import MIN_GAMES, _record
from app.models import BotMatch

MAX_REPLAY_BYTES = 1_000_000
MAX_BATCH_GAMES = 25
MAX_GAMES = 50
CARD_RE = re.compile(r"^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$")
LEVEL_RE = re.compile(r"^[a-z]{3,12}/[a-z]{3,12}$")
SOURCE = "bot self-play on optcgduel.app's engine"

_INT_KEYS = ("activations", "leaderActivations", "decisions")
_MAP_KEYS = ("activationsByCard", "optionalAccepts", "optionalDeclines", "counterEvents", "cheatOuts", "mainEvents")
MAX_MAP_ENTRIES = 300


def clean_levels(value: str | None) -> str:
    text = (value or "").strip().lower().replace(",", "/")
    return text if LEVEL_RE.match(text) else ""


def _clean_tally(raw: object) -> dict:
    """Keep only the known tally fields, as non-negative ints."""
    out: dict = {}
    if not isinstance(raw, dict):
        return out
    for key in _INT_KEYS:
        v = raw.get(key)
        if isinstance(v, int) and not isinstance(v, bool) and v >= 0:
            out[key] = v
    for key in _MAP_KEYS:
        m = raw.get(key)
        if isinstance(m, dict):
            out[key] = {
                str(k)[:80]: v
                for k, v in list(m.items())[:MAX_MAP_ENTRIES]
                if isinstance(v, int) and not isinstance(v, bool) and v >= 0
            }
    return out


def clean_tallies(raw: object) -> dict:
    """{"A": tally, "B": tally} from a [seat0, seat1] list or an {"A", "B"} dict."""
    if isinstance(raw, list) and len(raw) == 2:
        raw = {"A": raw[0], "B": raw[1]}
    if not isinstance(raw, dict):
        return {}
    return {side: _clean_tally(raw.get(side)) for side in ("A", "B") if isinstance(raw.get(side), dict)}


def _deck_counts(cards: object) -> dict[str, int]:
    return dict(sorted(Counter(c for c in cards if isinstance(c, str)).items())) if isinstance(cards, list) else {}


def validate_replay(replay: object) -> str | None:
    """Why a replay can't be stored, or None."""
    if not isinstance(replay, dict):
        return "replay is not an object"
    players = replay.get("players")
    if not isinstance(players, list) or len(players) != 2:
        return "replay needs two players"
    for p in players:
        if not isinstance(p, dict) or not isinstance(p.get("leaderId"), str) or not CARD_RE.match(p["leaderId"]):
            return "replay has a bad leader id"
        deck = p.get("deck")
        if not isinstance(deck, list) or not 1 <= len(deck) <= 60 or not all(isinstance(c, str) and CARD_RE.match(c) for c in deck):
            return "replay has a bad deck"
    if not isinstance(replay.get("intents"), list):
        return "replay has no intents"
    if replay.get("firstSeat") not in (0, 1):
        return "replay has no first seat"
    return None


def ingest_batch(db: Session, batch_id: str, default_levels: str, games: list[dict]) -> dict:
    """Store the games of one batch. Safe to send again: a (batch id, index) already stored is skipped."""
    have = set(db.scalars(select(BotMatch.batch_index).where(BotMatch.batch_id == batch_id)).all())
    accepted = duplicates = 0
    rejected: list[dict] = []
    seen: set[int] = set()
    for g in games:
        index = g["index"]
        if index in have or index in seen:
            duplicates += 1
            continue
        seen.add(index)
        replay = g["replay"]
        problem = validate_replay(replay)
        text = json.dumps(replay, separators=(",", ":")) if problem is None else ""
        if problem is None and len(text) > MAX_REPLAY_BYTES:
            problem = "replay too large"
        if problem:
            rejected.append({"index": index, "reason": problem})
            continue
        end = replay.get("end") if isinstance(replay.get("end"), dict) else {}
        winner = end.get("winner") if end.get("winner") in (0, 1) else None
        turns = g.get("turns")
        db.add(
            BotMatch(
                game_id="b_" + secrets.token_urlsafe(9),
                batch_id=batch_id,
                batch_index=index,
                rules_version=str(replay.get("rulesVersion") or "")[:32],
                registry_hash=str(replay.get("registryHash") or "")[:32],
                levels=clean_levels(g.get("levels")) or default_levels,
                leader_a=replay["players"][0]["leaderId"],
                leader_b=replay["players"][1]["leaderId"],
                winner=winner,
                turns=turns if isinstance(turns, int) and 0 <= turns <= 500 else None,
                first_seat=replay["firstSeat"],
                decks=json.dumps({"A": _deck_counts(replay["players"][0]["deck"]), "B": _deck_counts(replay["players"][1]["deck"])}, separators=(",", ":")),
                tallies=json.dumps(clean_tallies(g.get("tallies")), separators=(",", ":")),
                replay=text,
            )
        )
        accepted += 1
    db.commit()
    return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected}


def _side(match: BotMatch, side: str) -> dict:
    seat = 0 if side == "A" else 1
    return {
        "leader": match.leader_a if side == "A" else match.leader_b,
        "won": None if match.winner is None else match.winner == seat,
        "went_first": None if match.first_seat is None else match.first_seat == seat,
    }


def search_bot_games(
    db: Session,
    *,
    leader: str | None = None,
    opponent: str | None = None,
    card: str | None = None,
    result: str | None = None,
    went_first: bool | None = None,
    levels: str | None = None,
    min_turns: int | None = None,
    max_turns: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Bot games matching the filters, newest first, with the same side rules as the real-game corpus search:
    with a leader (or only an opponent) side A is that leader's side and result, went_first and card apply to it."""
    q = select(BotMatch).options(defer(BotMatch.replay), defer(BotMatch.tallies)).order_by(BotMatch.created_at.desc(), BotMatch.id.desc())
    if levels:
        q = q.where(BotMatch.levels == levels)
    found: list[tuple[BotMatch, str, str]] = []
    for m in db.scalars(q).all():
        if leader:
            a, b = ("A", "B") if m.leader_a == leader else ("B", "A") if m.leader_b == leader else (None, None)
        elif opponent:
            a, b = ("A", "B") if m.leader_b == opponent else ("B", "A") if m.leader_a == opponent else (None, None)
        else:
            a, b = "A", "B"
        if a is None or (opponent and _side(m, b)["leader"] != opponent):
            continue
        side = _side(m, a)
        if m.winner is None and result is not None:
            continue
        if result is not None and side["won"] != (result == "won"):
            continue
        if went_first is not None and side["went_first"] is not went_first:
            continue
        if min_turns is not None and (m.turns or 0) < min_turns:
            continue
        if max_turns is not None and (m.turns is None or m.turns > max_turns):
            continue
        if card:
            decks = json.loads(m.decks or "{}")
            sides = [a] if (leader or opponent) else [a, b]
            if not any(card in decks.get(s, {}) for s in sides):
                continue
        found.append((m, a, b))
    page = found[offset : offset + min(limit, MAX_GAMES)]
    games = [
        {
            "game_id": m.game_id,
            "source": SOURCE,
            "date": m.created_at.date().isoformat() if m.created_at else None,
            "levels": m.levels,
            "rules_version": m.rules_version,
            "turns": m.turns,
            "has_replay": True,
            "A": _side(m, a),
            "B": _side(m, b),
            "sides": {"A": 0 if a == "A" else 1, "B": 0 if b == "A" else 1},
        }
        for m, a, b in page
    ]
    return {"total": len(found), "offset": offset, "games": games, "source": SOURCE}


def bot_game_replay(db: Session, game_id: str) -> dict | None:
    m = db.scalar(select(BotMatch).where(BotMatch.game_id == game_id))
    if m is None:
        return None
    return {
        "game_id": m.game_id,
        "source": SOURCE,
        "date": m.created_at.date().isoformat() if m.created_at else None,
        "levels": m.levels,
        "rules_version": m.rules_version,
        "sides": {"A": 0, "B": 1},
        "replay": json.loads(m.replay),
    }


# --- simulated stats ---------------------------------------------------------------------------

def lines_of(tally: dict) -> set[str]:
    """The named lines a side played in one game."""
    out: set[str] = set()
    if tally.get("leaderActivations", 0) > 0:
        out.add("leader_activation")
    for card, n in tally.get("activationsByCard", {}).items():
        if n > 0:
            out.add(f"activation:{card}")
    for card, n in tally.get("optionalAccepts", {}).items():
        if n > 0:
            out.add(f"optional_accepted:{card}")
    for card, n in tally.get("optionalDeclines", {}).items():
        if n > 0:
            out.add(f"optional_declined:{card}")
    counters = {c: n for c, n in tally.get("counterEvents", {}).items() if n > 0}
    if counters:
        out.add("counter_event")
        out.update(f"counter_event:{c}" for c in counters)
    cheats = {c: n for c, n in tally.get("cheatOuts", {}).items() if n > 0}
    if cheats:
        out.add("cheat_out")
        out.update(f"cheat_out:{c}" for c in cheats)
    for card, n in tally.get("mainEvents", {}).items():
        if n > 0:
            out.add(f"main_event:{card}")
    return out


def _row(match: BotMatch, side: str, tally: dict) -> dict:
    s = _side(match, side)
    o = _side(match, "B" if side == "A" else "A")
    return {"leader": s["leader"], "opp": o["leader"], "won": bool(s["won"]), "first": s["went_first"], "turns": match.turns, "lines": lines_of(tally)}


def _split(rows: list[dict]) -> dict:
    first = [r for r in rows if r["first"] is True]
    second = [r for r in rows if r["first"] is False]
    turns = [r["turns"] for r in rows if r["turns"]]
    return {
        **_record(len(rows), sum(r["won"] for r in rows)),
        "going_first": _record(len(first), sum(r["won"] for r in first)),
        "going_second": _record(len(second), sum(r["won"] for r in second)),
        "average_turns": round(sum(turns) / len(turns), 1) if turns and len(rows) >= MIN_GAMES else None,
    }


def _line_stats(rows: list[dict], limit: int) -> list[dict]:
    """Win rate in games where a line happened vs games where it didn't, for lines with enough games on both sides."""
    names = Counter(n for r in rows for n in r["lines"])
    out = []
    for name, count in names.items():
        if count < MIN_GAMES or len(rows) - count < MIN_GAMES:
            continue
        with_line = [r for r in rows if name in r["lines"]]
        without = [r for r in rows if name not in r["lines"]]
        out.append({"line": name, "with": _record(len(with_line), sum(r["won"] for r in with_line)), "without": _record(len(without), sum(r["won"] for r in without))})
    return sorted(out, key=lambda r: (-r["with"]["games"], r["line"]))[:limit]


def sim_stats(db: Session, leader: str | None, opponent: str | None, levels: str | None, days: int, rules_version: str | None, line_limit: int = 25) -> dict:
    """Simulated matchup win rates and line stats from bot games. Only aggregates leave this function."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(BotMatch).options(defer(BotMatch.replay)).where(BotMatch.created_at >= since, BotMatch.winner.is_not(None))
    if levels:
        q = q.where(BotMatch.levels == levels)
    if rules_version:
        q = q.where(BotMatch.rules_version == rules_version)
    matches = db.scalars(q).all()
    rows: list[dict] = []
    for m in matches:
        tallies = json.loads(m.tallies or "{}")
        rows.append(_row(m, "A", tallies.get("A", {})))
        rows.append(_row(m, "B", tallies.get("B", {})))
    window = {
        "source": SOURCE,
        "label": "simulated games between bots, not players",
        "days": days,
        "levels": levels,
        "rules_versions": dict(Counter(m.rules_version for m in matches)),
        "min_games": MIN_GAMES,
    }
    if leader is None:
        by_leader: dict[str, list[dict]] = defaultdict(list)
        for r in rows:
            by_leader[r["leader"]].append(r)
        total = len(matches)
        return {
            **window,
            "total_games": total,
            "leaders": [
                {"leader": lid, "share": round(len(p) / (2 * total), 3) if total else None, **_split(p)}
                for lid, p in sorted(by_leader.items(), key=lambda kv: -len(kv[1]))
            ],
        }
    mine = [r for r in rows if r["leader"] == leader]
    if opponent is not None:
        if opponent == leader:
            return {**window, "leader": leader, "opponent": opponent, "mirror": True, "games": len(mine) // 2}
        vs = [r for r in mine if r["opp"] == opponent]
        return {**window, "leader": leader, "opponent": opponent, **_split(vs), "lines": _line_stats(vs, line_limit)}
    non_mirror = [r for r in mine if r["opp"] != leader]
    by_opp: dict[str, list[dict]] = defaultdict(list)
    for r in non_mirror:
        by_opp[r["opp"]].append(r)
    return {
        **window,
        "leader": leader,
        "overall": _split(non_mirror),
        "opponents": [{"opponent": oid, **_split(p)} for oid, p in sorted(by_opp.items(), key=lambda kv: -len(kv[1]))],
        "lines": _line_stats(non_mirror, line_limit),
    }
