"""Tournament-room tickets: what the backend signs so the game server can tell a tournament room from a casual one.

A ticket is `tr1.<b64url(json)>.<b64url(hmac_sha256(key, body))>`, where the key is the shared game-token secret
with its own salt, so neither a game token nor a matchup-brief ticket verifies as one (and the reverse). It names
the tournament match and the two accounts that may sit in the room, and only the host of a ready match is given one.
The game server hides hands and turns undo off in a room that carries a valid ticket, and the result it reports
back is the only kind that may decide the match.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json

from app.core.config import Settings
from app.duel.tokens import game_token_secret

TICKET_PREFIX = "tr1"
TICKET_KIND = "tournament_room"
KEY_SALT = "tournament-room:"
TICKET_TTL_SECONDS = 15 * 60


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str, settings: Settings) -> str:
    key = (KEY_SALT + game_token_secret(settings)).encode("utf-8")
    return _b64url(hmac.new(key, body.encode("ascii"), hashlib.sha256).digest())


def mint_tournament_ticket(*, match_id: int, seats: tuple[int, int], settings: Settings, now: int) -> str:
    payload = {"k": TICKET_KIND, "tm": match_id, "seats": [seats[0], seats[1]], "exp": now + TICKET_TTL_SECONDS}
    body = _b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{TICKET_PREFIX}.{body}.{_sign(body, settings)}"


def verify_tournament_ticket(ticket: str, settings: Settings, now: int) -> dict | None:
    parts = ticket.split(".") if isinstance(ticket, str) else []
    if len(parts) != 3 or parts[0] != TICKET_PREFIX:
        return None
    _, body, sig = parts
    try:
        if not hmac.compare_digest(sig.encode("ascii"), _sign(body, settings).encode("ascii")):
            return None
        payload = json.loads(_b64url_decode(body))
    except (ValueError, TypeError, UnicodeError):
        return None
    if not isinstance(payload, dict) or payload.get("k") != TICKET_KIND:
        return None
    exp = payload.get("exp")
    if isinstance(exp, bool) or not isinstance(exp, (int, float)) or exp < now:
        return None
    return payload
