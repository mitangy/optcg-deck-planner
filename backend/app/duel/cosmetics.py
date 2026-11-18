
from __future__ import annotations

import base64
import hashlib
import hmac

from app.core.config import Settings


PUBLIC_SIG_CHARS = 32


def sniff_mime(data: bytes) -> str | None:
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
    secret = (settings.cosmetic_url_secret or settings.session_secret).encode()
    digest = hmac.new(secret, f"cosmetic:{cosmetic_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")[:PUBLIC_SIG_CHARS]


def public_path(cosmetic_id: int, settings: Settings) -> str:
    return f"/duel/cosmetics/{cosmetic_id}/public/{public_sig(cosmetic_id, settings)}"
