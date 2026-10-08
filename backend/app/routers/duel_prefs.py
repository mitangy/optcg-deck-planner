"""Duel-web settings and uploaded playmats / card backs, stored per account.

Settings and the chosen playmat / card back follow a signed-in player to every
device. Every upload is kept (up to ``MAX_PER_KIND`` per kind) so the player
can switch back to an older image; guests keep using browser storage only.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import DuelCosmetic, DuelUserSettings, User
from app.rate_limit import RateLimiter
from app.schemas import (
    DuelCosmeticActiveIn,
    DuelCosmeticActiveOut,
    DuelCosmeticOut,
    DuelCosmeticsOut,
    DuelSettingsIn,
    DuelSettingsOut,
)

router = APIRouter(prefix="/duel", tags=["duel"])

KINDS = ("playmat", "cardBack")
# The client re-encodes before upload (playmat 2400px JPEG, card back 630px
# WebP); these leave headroom without letting one row grow unbounded.
MAX_BYTES = {"playmat": 4 * 1024 * 1024, "cardBack": 1024 * 1024}
MAX_PER_KIND = 12
# All accounts' images together. Images live in the Postgres database, whose
# plan has a hard storage cap; past this budget uploads stop instead of the
# whole database filling up (any Google account can sign in and upload).
MAX_TOTAL_COSMETIC_BYTES = 256 * 1024 * 1024
MAX_SETTINGS_CHARS = 4096
# Per-device connection fields never leave the browser (the join secret is a secret).
DEVICE_ONLY_KEYS = frozenset({"serverUrl", "joinSecret", "useDevKey", "devUserKey"})

# Length of a public link's signature (urlsafe base64 of HMAC-SHA256): 192 bits.
PUBLIC_SIG_CHARS = 32

_upload_rate = RateLimiter(max_calls=20, period_s=60, name="duel_prefs_upload_rate")


def _sniff_mime(data: bytes) -> str | None:
    """Image type from the file's own bytes; the request's Content-Type is ignored."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _prefs(db: Session, user_id: int) -> DuelUserSettings:
    row = db.get(DuelUserSettings, user_id)
    if row is None:
        row = DuelUserSettings(user_id=user_id, data="")
        db.add(row)
        db.flush()
    return row


def _active_attr(kind: str) -> str:
    return "active_playmat_id" if kind == "playmat" else "active_card_back_id"


def _check_kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="Unknown cosmetic kind")
    return kind


def _own_cosmetic(db: Session, user: User, cosmetic_id: int) -> DuelCosmetic:
    row = db.get(DuelCosmetic, cosmetic_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")
    return row


def _settings_out(row: DuelUserSettings | None) -> DuelSettingsOut:
    if row is None or not row.data:
        return DuelSettingsOut(settings=None)
    return DuelSettingsOut(
        settings=json.loads(row.data),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.get("/settings", response_model=DuelSettingsOut)
def get_settings_for_me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelSettingsOut:
    return _settings_out(db.get(DuelUserSettings, user.id))


@router.put("/settings", response_model=DuelSettingsOut)
def put_settings_for_me(
    body: DuelSettingsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelSettingsOut:
    kept = {k: v for k, v in body.settings.items() if k not in DEVICE_ONLY_KEYS}
    data = json.dumps(kept, separators=(",", ":"), sort_keys=True)
    if len(data) > MAX_SETTINGS_CHARS:
        raise HTTPException(status_code=413, detail="Settings are too large")
    row = _prefs(db, user.id)
    row.data = data
    db.commit()
    db.refresh(row)
    return _settings_out(row)


def _cosmetics_out(db: Session, user_id: int) -> DuelCosmeticsOut:
    rows = db.scalars(
        select(DuelCosmetic)
        .where(DuelCosmetic.user_id == user_id)
        .order_by(DuelCosmetic.created_at.desc(), DuelCosmetic.id.desc())
    ).all()
    prefs = db.get(DuelUserSettings, user_id)
    settings = get_settings()
    return DuelCosmeticsOut(
        items=[
            DuelCosmeticOut(
                id=r.id,
                kind=r.kind,
                size=r.size,
                created_at=r.created_at.isoformat(),
                public_path=public_path(r.id, settings),
            )
            for r in rows
        ],
        active=DuelCosmeticActiveOut(
            playmat=prefs.active_playmat_id if prefs else None,
            cardBack=prefs.active_card_back_id if prefs else None,
        ),
    )


@router.get("/cosmetics", response_model=DuelCosmeticsOut)
def list_cosmetics(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelCosmeticsOut:
    return _cosmetics_out(db, user.id)


@router.post("/cosmetics/{kind}", response_model=DuelCosmeticsOut, status_code=201)
async def upload_cosmetic(
    kind: str,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    activate: bool = True,
) -> DuelCosmeticsOut:
    _check_kind(kind)
    if not _upload_rate.allow(str(user.id)):
        raise HTTPException(status_code=429, detail="Too many uploads; try again in a minute")
    limit = MAX_BYTES[kind]
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status_code=413, detail="Image is too large")
    # Read in chunks so a body without Content-Length can't be buffered past the cap.
    buf = bytearray()
    async for chunk in request.stream():
        buf += chunk
        if len(buf) > limit:
            raise HTTPException(status_code=413, detail="Image is too large")
    data = bytes(buf)
    mime = _sniff_mime(data)
    if mime is None:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG or WebP image")
    stored = db.scalar(select(func.coalesce(func.sum(DuelCosmetic.size), 0))) or 0
    if stored + len(data) > MAX_TOTAL_COSMETIC_BYTES:
        raise HTTPException(status_code=507, detail="Image uploads are full right now; try again later")

    row = DuelCosmetic(user_id=user.id, kind=kind, mime=mime, data=data, size=len(data))
    db.add(row)
    db.flush()
    prefs = _prefs(db, user.id)
    if activate:
        setattr(prefs, _active_attr(kind), row.id)

    # Keep the newest MAX_PER_KIND; never drop the image in use.
    active_id = getattr(prefs, _active_attr(kind))
    ids = db.scalars(
        select(DuelCosmetic.id)
        .where(DuelCosmetic.user_id == user.id, DuelCosmetic.kind == kind)
        .order_by(DuelCosmetic.created_at.desc(), DuelCosmetic.id.desc())
    ).all()
    keep = MAX_PER_KIND - (1 if active_id in ids else 0)
    for old_id in [i for i in ids if i != active_id][keep:]:
        db.delete(db.get(DuelCosmetic, old_id))
    db.commit()
    return _cosmetics_out(db, user.id)


@router.put("/cosmetics/active", response_model=DuelCosmeticsOut)
def set_active_cosmetic(
    body: DuelCosmeticActiveIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelCosmeticsOut:
    kind = _check_kind(body.kind)
    if body.id is not None:
        row = _own_cosmetic(db, user, body.id)
        if row.kind != kind:
            raise HTTPException(status_code=422, detail="That image is a different kind")
    setattr(_prefs(db, user.id), _active_attr(kind), body.id)
    db.commit()
    return _cosmetics_out(db, user.id)


@router.delete("/cosmetics/{cosmetic_id}", response_model=DuelCosmeticsOut)
def delete_cosmetic(
    cosmetic_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelCosmeticsOut:
    row = _own_cosmetic(db, user, cosmetic_id)
    prefs = _prefs(db, user.id)
    attr = _active_attr(row.kind)
    if getattr(prefs, attr) == row.id:
        setattr(prefs, attr, None)
    db.delete(row)
    db.commit()
    return _cosmetics_out(db, user.id)


def public_sig(cosmetic_id: int, settings: Settings) -> str:
    """Unguessable token that makes one image public: HMAC-SHA256 of ``cosmetic:{id}``, 192 bits."""
    secret = (settings.cosmetic_url_secret or settings.session_secret).encode()
    digest = hmac.new(secret, f"cosmetic:{cosmetic_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")[:PUBLIC_SIG_CHARS]


def public_path(cosmetic_id: int, settings: Settings) -> str:
    """Link (relative to the API base) anyone holding it can load without a session."""
    return f"/duel/cosmetics/{cosmetic_id}/public/{public_sig(cosmetic_id, settings)}"


@router.get("/cosmetics/{cosmetic_id}/public/{sig}")
def public_cosmetic_image(
    cosmetic_id: int,
    sig: str,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """An image by its signed link, for opponents and the game server (no session needed).

    Only links this API handed to the owner work: the id alone, or a wrong
    signature, is a 404 (the same answer as a deleted image).
    """
    if not hmac.compare_digest(sig.encode(), public_sig(cosmetic_id, settings).encode()):
        raise HTTPException(status_code=404, detail="Image not found")
    row = db.get(DuelCosmetic, cosmetic_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=row.data,
        media_type=row.mime,
        headers={
            # Ids are never reused for different bytes, so the link is immutable.
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "cross-origin",
        },
    )


@router.get("/cosmetics/{cosmetic_id}/image")
def cosmetic_image(
    cosmetic_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    row = _own_cosmetic(db, user, cosmetic_id)
    return Response(
        content=row.data,
        media_type=row.mime,
        headers={
            # Ids are never reused for different bytes.
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
