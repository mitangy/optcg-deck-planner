"""Matchup-brief tickets: what the game server signs so Log Pose can write a brief for a casual or practice game.

A ticket is `mb1.<b64url(json)>.<b64url(hmac_sha256(key, body))>`, where the key is the shared game-token
secret with a salt, so a game token never verifies as a ticket. It carries everything the brief is about
(both leaders and the player's own deck), so a browser can't ask for a brief of an arbitrary matchup.
Ranked games never get one, and a ticket that says `ranked: true` is refused here too.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from collections import Counter
from dataclasses import dataclass

from app.config import Settings
from app.game_tokens import game_token_secret

TICKET_PREFIX = "mb1"
TICKET_PURPOSE = "match_brief"
KEY_SALT = "match-brief:"
MAX_DECK_CARDS = 60
# Mirrors schemas.CARD_ID_PATTERN (kept here so this module has no dependency on the API schemas).
_CARD_ID = re.compile(r"^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$")


@dataclass(frozen=True)
class BriefClaims:
    match_id: str
    seat: int
    leader: str
    opponent: str
    deck: tuple[str, ...]
    exp: int


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_body(body: str, settings: Settings) -> str:
    key = (KEY_SALT + game_token_secret(settings)).encode("utf-8")
    return _b64url(hmac.new(key, body.encode("ascii"), hashlib.sha256).digest())


def _card_id(value: object) -> str | None:
    return value if isinstance(value, str) and _CARD_ID.match(value) else None


def verify_brief_ticket(ticket: str, settings: Settings, now: int) -> BriefClaims | None:
    """The ticket's claims, or None unless it is a genuine, unexpired ticket for an unranked game."""
    parts = ticket.split(".") if isinstance(ticket, str) else []
    if len(parts) != 3 or parts[0] != TICKET_PREFIX:
        return None
    _, body, sig = parts
    try:
        if not hmac.compare_digest(sig.encode("ascii"), sign_body(body, settings).encode("ascii")):
            return None
        payload = json.loads(_b64url_decode(body))
    except (ValueError, TypeError, UnicodeError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("p") != TICKET_PURPOSE:
        return None
    if payload.get("ranked") is not False:
        return None
    exp = payload.get("exp")
    if isinstance(exp, bool) or not isinstance(exp, (int, float)) or exp < now:
        return None
    leader = _card_id(payload.get("leader"))
    opponent = _card_id(payload.get("opponent"))
    deck = payload.get("deck")
    if leader is None or opponent is None:
        return None
    if not isinstance(deck, list) or not 1 <= len(deck) <= MAX_DECK_CARDS:
        return None
    ids = [_card_id(c) for c in deck]
    if any(i is None for i in ids):
        return None
    mid = payload.get("mid")
    seat = payload.get("seat")
    return BriefClaims(
        match_id=mid if isinstance(mid, str) else "",
        seat=seat if seat in (0, 1) else 0,
        leader=leader,
        opponent=opponent,
        deck=tuple(i for i in ids if i is not None),
        exp=int(exp),
    )


def brief_key(claims: BriefClaims, variant: str) -> str:
    """The cache key: one brief per (variant, leader, opponent, deck), however the deck is ordered."""
    counts = Counter(claims.deck)
    deck = ",".join(f"{card}:{n}" for card, n in sorted(counts.items()))
    return hashlib.sha256(f"{variant}|{claims.leader}|{claims.opponent}|{deck}".encode("utf-8")).hexdigest()


def deck_counts(claims: BriefClaims) -> list[dict]:
    counts = Counter(claims.deck)
    return [{"id": card, "copies": n} for card, n in sorted(counts.items())]
