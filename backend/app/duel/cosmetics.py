"""Uploaded playmat and card-back helpers the prefs router and the player-report router share.

Lived in routers/duel_prefs.py; routers/reports.py reaches the same image checks and public
links, so they sit here and no router imports another (refactor D-02).
"""

from __future__ import annotations

import base64
import hashlib
import hmac

from app.core.config import Settings


# Length of a public link's signature (urlsafe base64 of HMAC-SHA256): 192 bits.
PUBLIC_SIG_CHARS = 32


def sniff_mime(data: bytes) -> str | None:
    """Image type from the file's own bytes; the request's Content-Type is ignored."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def active_attr(kind: str) -> str:
    return "active_playmat_id" if kind == "playmat" else "active_card_back_id"


def public_sig(cosmetic_id: int, settings: Settings) -> str:
    """Unguessable token that makes one image public: HMAC-SHA256 of ``cosmetic:{id}``, 192 bits."""
    secret = (settings.cosmetic_url_secret or settings.session_secret).encode()
    digest = hmac.new(secret, f"cosmetic:{cosmetic_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")[:PUBLIC_SIG_CHARS]


def public_path(cosmetic_id: int, settings: Settings) -> str:
    """Link (relative to the API base) anyone holding it can load without a session."""
    return f"/duel/cosmetics/{cosmetic_id}/public/{public_sig(cosmetic_id, settings)}"
