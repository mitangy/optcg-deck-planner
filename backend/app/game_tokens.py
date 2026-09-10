"""HMAC game tokens shared with the Colyseus game-server (browser-capable bearer)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.config import Settings, get_settings

GAME_TOKEN_TTL_SECONDS = 60 * 15  # 15 minutes


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def game_token_secret(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return (settings.game_token_secret or settings.session_secret).strip()


def mint_game_token(
    *,
    user_id: int,
    email: str,
    settings: Settings | None = None,
    ttl_seconds: int = GAME_TOKEN_TTL_SECONDS,
) -> dict[str, Any]:
    settings = settings or get_settings()
    now = int(time.time())
    exp = now + ttl_seconds
    payload = {"uid": int(user_id), "email": email, "iat": now, "exp": exp}
    body = _b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    sig = _b64url(
        hmac.new(
            game_token_secret(settings).encode("utf-8"),
            body.encode("ascii"),
            hashlib.sha256,
        ).digest()
    )
    return {"token": f"{body}.{sig}", "expires_at": exp, "user_id": int(user_id)}


def verify_game_token(
    token: str,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    settings = settings or get_settings()
    if not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    if not body or not sig:
        return None
    expected = _b64url(
        hmac.new(
            game_token_secret(settings).encode("utf-8"),
            body.encode("ascii"),
            hashlib.sha256,
        ).digest()
    )
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    try:
        exp = int(payload["exp"])
        uid = int(payload["uid"])
    except (KeyError, TypeError, ValueError):
        return None
    if exp < int(time.time()):
        return None
    email = payload.get("email")
    if not isinstance(email, str):
        return None
    return {"uid": uid, "email": email, "exp": exp}
