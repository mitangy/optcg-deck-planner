"""Pulls tournament results from Limitless TCG (play.limitlesstcg.com) for Log Pose.

Only leaders, decklists, records and who beat which leader are kept. Player names and
handles are read from the API to join pairings to decks in memory and are never stored.
The public API allows 50 requests per 5 minutes, so every request is throttled and a 429
is waited out.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections import Counter
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Tournament, TournamentDeck, TournamentGame

log = logging.getLogger("uvicorn.error")

API = "https://play.limitlesstcg.com/api"
MIN_PLAYERS = 8
# Events younger than this may still be running, so they are pulled again.
RECENT_DAYS = 2
REQUEST_INTERVAL = 7.0
SYNC_INTERVAL = 6 * 60 * 60
FIRST_RUN_DELAY = 60
PAGE_SIZE = 50
MAX_PAGES = 20

_SET_LABEL = re.compile(r"\[\s*((?:OP|ST|EB|PRB)\d+(?:\.\d+)?)", re.IGNORECASE)


class RateLimited(Exception):
    """Limitless kept answering 429 after every retry."""


class LimitlessClient:
    """GETs from the Limitless API at most once per `interval` seconds, backing off on 429."""

    def __init__(
        self,
        http: httpx.Client | None = None,
        interval: float = REQUEST_INTERVAL,
        retries: int = 4,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.http = http or httpx.Client(timeout=30, headers={"User-Agent": "optcg-deck-planner log-pose"})
        self.interval = interval
        self.retries = retries
        self.sleep = sleep
        self.clock = clock
        self._last: float | None = None
        self.requests = 0

    def _wait(self) -> None:
        if self._last is not None:
            gap = self.interval - (self.clock() - self._last)
            if gap > 0:
                self.sleep(gap)

    def get(self, path: str, params: dict | None = None):
        for attempt in range(self.retries + 1):
            self._wait()
            self._last = self.clock()
            self.requests += 1
            resp = self.http.get(f"{API}{path}", params=params)
            if resp.status_code != 429:
                resp.raise_for_status()
                return resp.json()
            if attempt == self.retries:
                break
            try:
                wait = float(resp.headers.get("retry-after", ""))
            except ValueError:
                wait = 30.0 * 2**attempt
            self.sleep(min(max(wait, self.interval), 300.0))
        raise RateLimited(path)

    def close(self) -> None:
        self.http.close()


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _parse_date(raw: str) -> datetime:
    return _utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))


def set_label(name: str) -> str | None:
    """The set an event was played for, from a name prefix like "[OP17.5] Cup"."""
    m = _SET_LABEL.search(name or "")
    return m.group(1).upper() if m else None


def card_id(card: dict) -> str | None:
    s, n = card.get("set"), card.get("number")
    return f"{s}-{n}" if s and n else None


def parse_decklist(decklist: dict | None) -> dict[str, int]:
    """The main deck (characters, events, stages) as {card id: copies}; the leader is kept apart."""
    counts: Counter[str] = Counter()
    if not isinstance(decklist, dict):
        return {}
    for section in ("character", "event", "stage"):
        for card in decklist.get(section) or []:
            cid = card_id(card) if isinstance(card, dict) else None
            count = card.get("count") if isinstance(card, dict) else None
            if cid and isinstance(count, int) and count > 0:
                counts[cid] += count
    return dict(sorted(counts.items()))


def _leader_of(entry: dict) -> str | None:
    leader = (entry.get("decklist") or {}).get("leader")
    cid = card_id(leader) if isinstance(leader, dict) else None
    if cid:
        return cid
    deck = entry.get("deck")
    value = deck.get("id") if isinstance(deck, dict) else None
    return value if isinstance(value, str) and value else None


# Limitless marks a tie as winner 0 and a double loss as -1: neither side won.
_TIE = {0, "0", -1, "-1", "tie", "draw"}


def _winner_side(pairing: dict) -> str | None:
    """A, B or tie; None while the pairing has no result."""
    w = pairing.get("winner")
    if w == pairing.get("player1"):
        return "A"
    if w == pairing.get("player2"):
        return "B"
    return "tie" if w in _TIE else None


def parse_event(standings: list, pairings: list) -> tuple[list[dict], list[dict]]:
    """Deck rows and game rows for one event. Handles join pairings to leaders here and go no further."""
    decks: list[dict] = []
    leader_by_handle: dict[str, str] = {}
    for entry in standings if isinstance(standings, list) else []:
        if not isinstance(entry, dict):
            continue
        leader = _leader_of(entry)
        if not leader:
            continue
        record = entry.get("record") or {}
        placing = entry.get("placing")
        decks.append(
            {
                "leader_id": leader[:32],
                "decklist": parse_decklist(entry.get("decklist")),
                "wins": int(record.get("wins") or 0),
                "losses": int(record.get("losses") or 0),
                "ties": int(record.get("ties") or 0),
                "placing": placing if isinstance(placing, int) and placing > 0 else None,
            }
        )
        handle = entry.get("player")
        if isinstance(handle, str) and handle:
            leader_by_handle[handle] = leader[:32]
    games: list[dict] = []
    for p in pairings if isinstance(pairings, list) else []:
        if not isinstance(p, dict):
            continue
        # A bye has no player2, a pairing with no result no winner: neither finds a leader or a side.
        a, b = leader_by_handle.get(p.get("player1")), leader_by_handle.get(p.get("player2"))
        winner = _winner_side(p)
        if a is None or b is None or winner is None:
            continue
        games.append({"round": int(p.get("round") or 0), "leader_a": a, "leader_b": b, "winner": winner})
    return decks, games


def _is_complete(row: Tournament | None, date: datetime) -> bool:
    """Already synced after the event was old enough that nothing more can change."""
    return row is not None and _utc(row.synced_at) >= date + timedelta(days=RECENT_DAYS)


def store_event(db: Session, meta: dict, details: dict, decks: list[dict], games: list[dict], now: datetime) -> None:
    """Replace one event's rows in a single transaction, so a re-sync never doubles anything."""
    tid = meta["id"]
    db.execute(delete(TournamentGame).where(TournamentGame.tournament_id == tid))
    db.execute(delete(TournamentDeck).where(TournamentDeck.tournament_id == tid))
    row = db.get(Tournament, tid)
    if row is None:
        row = Tournament(id=tid)
        db.add(row)
    row.name = str(meta.get("name") or "")[:300]
    row.date = _parse_date(meta["date"])
    row.players = int(meta.get("players") or 0)
    row.set_label = set_label(row.name)
    row.online = bool(details.get("isOnline"))
    row.platform = (str(details["platform"])[:40] if details.get("platform") else None)
    row.synced_at = now
    db.add_all(
        TournamentDeck(
            tournament_id=tid,
            leader_id=d["leader_id"],
            decklist=json.dumps(d["decklist"], separators=(",", ":")),
            wins=d["wins"],
            losses=d["losses"],
            ties=d["ties"],
            placing=d["placing"],
        )
        for d in decks
    )
    db.add_all(TournamentGame(tournament_id=tid, **g) for g in games)
    db.commit()


def list_events(client: LimitlessClient, since: datetime, min_players: int) -> list[dict]:
    """Events newer than `since` with enough players, newest first (the listing is newest first)."""
    out: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        batch = client.get("/tournaments", {"game": "OP", "limit": PAGE_SIZE, "page": page})
        if not isinstance(batch, list) or not batch:
            break
        for ev in batch:
            if not isinstance(ev, dict) or not ev.get("id") or not ev.get("date"):
                continue
            if _parse_date(ev["date"]) < since:
                return out
            if int(ev.get("players") or 0) >= min_players:
                out.append(ev)
        if len(batch) < PAGE_SIZE:
            break
    return out


LAST_RUN: dict = {}


def sync_tournaments(
    db: Session,
    client: LimitlessClient,
    days: int = 30,
    min_players: int = MIN_PLAYERS,
    now: datetime | None = None,
) -> dict:
    """One sync run. Returns its summary; a failing event is counted and skipped, not raised."""
    now = now or datetime.now(timezone.utc)
    started = time.monotonic()
    summary = {"at": now.isoformat(), "days": days, "listed": 0, "synced": 0, "skipped": 0, "ineligible": 0, "failed": 0, "games": 0, "rate_limited": False}
    try:
        events = list_events(client, now - timedelta(days=days), min_players)
        summary["listed"] = len(events)
        for ev in events:
            date = _parse_date(ev["date"])
            if _is_complete(db.get(Tournament, ev["id"]), date):
                summary["skipped"] += 1
                continue
            try:
                details = client.get(f"/tournaments/{ev['id']}/details")
                if not (isinstance(details, dict) and details.get("isPublic") and details.get("decklists")):
                    summary["ineligible"] += 1
                    continue
                standings = client.get(f"/tournaments/{ev['id']}/standings")
                pairings = client.get(f"/tournaments/{ev['id']}/pairings")
                decks, games = parse_event(standings, pairings)
                store_event(db, ev, details, decks, games, now)
                summary["synced"] += 1
                summary["games"] += len(games)
            except RateLimited:
                raise
            except Exception as exc:  # one broken event must not stop the rest
                db.rollback()
                summary["failed"] += 1
                log.warning("tournament sync: event %s failed: %s", ev.get("id"), exc)
    except RateLimited:
        summary["rate_limited"] = True
    except Exception as exc:
        summary["error"] = str(exc)[:200]
    summary["requests"] = client.requests
    summary["seconds"] = round(time.monotonic() - started, 1)
    LAST_RUN.clear()
    LAST_RUN.update(summary)
    log.info(json.dumps({"event": "tournament_sync", **summary}, separators=(",", ":")))
    return summary


def sync_status(db: Session) -> dict:
    newest = db.scalar(select(func.max(Tournament.date)))
    synced = db.scalar(select(func.max(Tournament.synced_at)))
    return {
        "last_synced_at": _utc(synced).isoformat() if synced else None,
        "newest_event_date": _utc(newest).isoformat() if newest else None,
        "events": db.scalar(select(func.count()).select_from(Tournament)) or 0,
        "decks": db.scalar(select(func.count()).select_from(TournamentDeck)) or 0,
        "games": db.scalar(select(func.count()).select_from(TournamentGame)) or 0,
        "last_run": dict(LAST_RUN) or None,
    }


def run_once(days: int) -> dict:
    from app.db import SessionLocal

    client = LimitlessClient()
    db = SessionLocal()
    try:
        return sync_tournaments(db, client, days=days)
    finally:
        db.close()
        client.close()


async def sync_loop(
    run: Callable[[], object],
    first_delay: float = FIRST_RUN_DELAY,
    interval: float = SYNC_INTERVAL,
) -> None:
    """Run `run` shortly after startup and then every `interval` seconds. Nothing it raises ends the loop."""
    await asyncio.sleep(first_delay)
    while True:
        try:
            await asyncio.to_thread(run)
        except Exception as exc:
            log.error("tournament sync run crashed: %s", exc)
        await asyncio.sleep(interval)


def start_background(settings) -> asyncio.Task | None:
    """The sync task when TOURNAMENT_SYNC is on (default in production only), else None."""
    if not settings.tournament_sync_enabled:
        return None
    days = settings.tournament_sync_days
    return asyncio.create_task(sync_loop(lambda: run_once(days)))
