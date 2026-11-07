"""Scanner training samples (#852).

When a user confirms cards in the photo scanner we keep a small crop of each
card (a 200x280 JPEG, never the full photo) with its final label, so the
scanner can be retrained weekly. Sharing is on by default (``User.share_scans``).

Turning ``share_scans`` off stops new uploads (POST answers 403) but does NOT
delete rows already stored; ``DELETE /scan-samples/mine`` does that.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.models import ScanSample, User
from app.schemas import CARD_ID_PATTERN

router = APIRouter(prefix="/scan-samples", tags=["scan-samples"])

MAX_IMAGE_BYTES = 64 * 1024
MAX_ITEMS = 40
DAILY_CAP_PER_USER = 400
MAX_AGE_DAYS = 365
MAX_TOTAL_BYTES = 500 * 1024 * 1024
EXPORT_MAX_LIMIT = 500
JPEG_MAGIC = b"\xff\xd8\xff"
_DATA_URL = re.compile(r"^data:image/jpeg;base64,", re.IGNORECASE)
_CARD_ID = re.compile(CARD_ID_PATTERN)


class ScanSampleIn(BaseModel):
    image: str
    predicted_id: str | None = Field(default=None, max_length=32)
    confidence: Literal["sure", "check", "none"]
    final_id: str = Field(max_length=32)
    label: Literal["confirmed", "corrected"]


class ScanSamplesIn(BaseModel):
    items: list[ScanSampleIn] = Field(min_length=1, max_length=MAX_ITEMS)


def _norm_id(value: str) -> str:
    card_id = value.strip().upper()
    if not _CARD_ID.match(card_id):
        raise HTTPException(status_code=400, detail="Invalid card id")
    return card_id


def _decode_jpeg(image: str) -> bytes:
    raw = _DATA_URL.sub("", image, count=1)
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Image is not valid base64") from None
    if not data.startswith(JPEG_MAGIC):
        raise HTTPException(status_code=400, detail="Image must be a JPEG")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large")
    return data


def _prune(db: Session) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    db.execute(delete(ScanSample).where(ScanSample.created_at < cutoff))
    total = db.scalar(select(func.coalesce(func.sum(ScanSample.size), 0))) or 0
    if total <= MAX_TOTAL_BYTES:
        return
    rows = db.execute(select(ScanSample.id, ScanSample.size).order_by(ScanSample.id)).all()
    drop: list[int] = []
    for row_id, size in rows:
        if total <= MAX_TOTAL_BYTES:
            break
        drop.append(row_id)
        total -= size
    if drop:
        db.execute(delete(ScanSample).where(ScanSample.id.in_(drop)))


@router.post("")
def post_scan_samples(
    body: ScanSamplesIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Store crops of the cards the user confirmed. Returns ``{saved: n}``."""
    if not user.share_scans:
        raise HTTPException(status_code=403, detail="Scan sharing is turned off")
    prepared = []
    for item in body.items:
        prepared.append(
            (
                _decode_jpeg(item.image),
                _norm_id(item.predicted_id) if item.predicted_id else None,
                _norm_id(item.final_id),
                item,
            )
        )
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    recent = db.scalar(
        select(func.count())
        .select_from(ScanSample)
        .where(ScanSample.user_id == user.id, ScanSample.created_at >= since)
    ) or 0
    if recent + len(prepared) > DAILY_CAP_PER_USER:
        raise HTTPException(status_code=429, detail="Daily scan sample limit reached")
    for data, predicted_id, final_id, item in prepared:
        db.add(
            ScanSample(
                user_id=user.id,
                final_id=final_id,
                predicted_id=predicted_id,
                confidence=item.confidence,
                label=item.label,
                split="test" if secrets.randbelow(5) == 0 else "train",
                mime="image/jpeg",
                data=data,
                size=len(data),
            )
        )
    db.flush()
    _prune(db)
    db.commit()
    return {"saved": len(prepared)}


@router.get("/mine")
def get_my_scan_samples(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    count = db.scalar(
        select(func.count()).select_from(ScanSample).where(ScanSample.user_id == user.id)
    )
    return {"count": count or 0}


@router.delete("/mine")
def delete_my_scan_samples(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    result = db.execute(delete(ScanSample).where(ScanSample.user_id == user.id))
    db.commit()
    return {"deleted": result.rowcount or 0}


@router.get("/export")
def export_scan_samples(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_scan_training_token: Annotated[str | None, Header()] = None,
    after_id: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1)] = 200,
):
    """Page of samples for the weekly retrain, guarded by ``X-Scan-Training-Token``.

    Carries no user ids or emails.
    """
    expected = settings.scan_training_token or ""
    if not expected or not hmac.compare_digest(x_scan_training_token or "", expected):
        raise HTTPException(status_code=401, detail="Invalid scan training token")
    rows = db.scalars(
        select(ScanSample)
        .where(ScanSample.id > after_id)
        .order_by(ScanSample.id)
        .limit(min(limit, EXPORT_MAX_LIMIT))
    ).all()
    return {
        "items": [
            {
                "id": r.id,
                "split": r.split,
                "final_id": r.final_id,
                "predicted_id": r.predicted_id,
                "confidence": r.confidence,
                "label": r.label,
                "image_b64": base64.b64encode(r.data).decode("ascii"),
            }
            for r in rows
        ],
        "next_after_id": rows[-1].id if rows else after_id,
    }
