"""Imported OPTCGSim games (#1030): validation, name scrubbing and storage rules.

Privacy: the player's and the opponent's names are never stored. The combat log names
both players on most lines, so they are replaced with fixed placeholders before it is kept.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime
from email.utils import parsedate_to_datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.time import as_utc
from app.models import SimGame

MAX_IMPORT_GAMES = 500
MAX_COMBAT_LOG_CHARS = 400_000
MAX_DECK_ENTRIES = 80
ME_PLACEHOLDER = "Me#1"
OPP_PLACEHOLDER = "Opp#2"

_ZW = re.compile("[​‌‍﻿]")
_DECK_ENTRY = re.compile(r"^\d{1,2}x[A-Za-z0-9]{2,6}-\d{2,4}[A-Za-z0-9_]{0,4}$")
_CARD_ID = re.compile(r"^[A-Za-z0-9]{2,6}-\d{2,4}[A-Za-z0-9_]{0,4}$")
_PLY = re.compile(r"^RZ1\|PLY\|(\d+)\|([^|]*)\|", re.M)


def _norm(s: str) -> str:
    return _ZW.sub("", s).strip()


def scrub_names(log: str, my_name: str, opp_name: str | None) -> str:
    """Replace both players' names by placeholders. Zero-width characters are stripped from the log first
    (the sim puts one before the "#"), so a name matches however it was typed."""
    text = _ZW.sub("", log)
    me = _norm(my_name)
    opps = {_norm(opp_name)} if opp_name else set()
    for m in _PLY.finditer(text):  # the PLY lines name the opponent even when the record does not
        n = _norm(m.group(2))
        if n and n != me:
            opps.add(n)
    swaps = [(me, ME_PLACEHOLDER)] + [(o, OPP_PLACEHOLDER) for o in opps if o and o != me]
    for name, placeholder in sorted(swaps, key=lambda s: -len(s[0])):
        if name:
            text = text.replace(name, placeholder)
    return text


def _deck(value: object) -> list[str] | None:
    if not isinstance(value, list) or not value or len(value) > MAX_DECK_ENTRIES:
        return None
    if not all(isinstance(e, str) and _DECK_ENTRY.match(e) for e in value):
        return None
    return list(value)


def _leader(value: object) -> str | None:
    return value if isinstance(value, str) and _CARD_ID.match(value) else None


def _played_at(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    return as_utc(dt)


def _match_key(raw: dict, my_deck: list[str]) -> str:
    key = raw.get("matchKey")
    if isinstance(key, str) and 8 <= len(key) <= 200:
        return key
    basis = "|".join([str(raw.get("date")), str(raw.get("playerLeader")), str(raw.get("oppLeader")), str(raw.get("result")), *my_deck])
    return "derived:" + hashlib.sha256(basis.encode()).hexdigest()


def build_row(user_id: int, raw: object) -> SimGame | None:
    """A SimGame for one raw match record, or None when it is not usable. Stores no names."""
    if not isinstance(raw, dict):
        return None
    name = raw.get("playerName")
    result = raw.get("result")
    my_deck, opp_deck = _deck(raw.get("decklist")), _deck(raw.get("oppDecklist"))
    if not isinstance(name, str) or not _norm(name) or result not in ("Won", "Lost") or my_deck is None or opp_deck is None:
        return None
    log = raw.get("combatLog")
    if not isinstance(log, str) or not log.strip() or len(log) > MAX_COMBAT_LOG_CHARS:
        log = None
    opp_name = raw.get("oppPlayerName")
    turns = raw.get("turnNumber")
    order = raw.get("turnOrder")
    return SimGame(
        id=str(uuid.uuid4()),
        user_id=user_id,
        match_key=_match_key(raw, my_deck),
        played_at=_played_at(raw.get("date")),
        my_leader=_leader(raw.get("playerLeader")),
        opp_leader=_leader(raw.get("oppLeader")),
        my_deck=my_deck,
        opp_deck=opp_deck,
        result=result,
        turns=turns if isinstance(turns, int) and not isinstance(turns, bool) and 0 <= turns < 1000 else None,
        went_first=(order == 0) if order in (0, 1) else None,
        has_log=log is not None,
        combat_log=scrub_names(log, name, opp_name if isinstance(opp_name, str) else None) if log else None,
        source="optcgsim",
    )


def import_games(db: Session, user_id: int, games: list[object]) -> dict[str, int]:
    """Store the usable games for this user. Duplicates (same match key) are skipped, never overwritten."""
    seen = set(db.scalars(select(SimGame.match_key).where(SimGame.user_id == user_id)).all())
    imported = dup = invalid = 0
    for raw in games:
        row = build_row(user_id, raw)
        if row is None:
            invalid += 1
        elif row.match_key in seen:
            dup += 1
        else:
            try:
                with db.begin_nested():
                    db.add(row)
                    db.flush()
            except IntegrityError:  # a parallel import stored it first
                dup += 1
                continue
            seen.add(row.match_key)
            imported += 1
    db.commit()
    return {"imported": imported, "skipped_duplicates": dup, "skipped_invalid": invalid, "total": len(games)}


def clear_games(db: Session, user_id: int) -> int:
    n = db.execute(delete(SimGame).where(SimGame.user_id == user_id)).rowcount
    db.commit()
    return n or 0
