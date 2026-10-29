"""Moderation helpers for uploaded images (#810).

A takedown is a soft delete: the row and its bytes stay in the database because a
reported image may be illegal content that has to be preserved, not destroyed.
A taken-down cosmetic is no longer served (signed public link and the owner's own
``/image`` both 404), no longer listed for its owner, cannot be selected, cannot be
deleted by its owner, and is cleared from the owner's active playmat / card back.

These helpers are generic (they take any ``DuelCosmetic``) so report handling and a
future admin uploads list share them. Callers commit.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import DuelCosmetic, DuelUserSettings

REASON_MAX = 200


def take_down_cosmetic(db: Session, cosmetic: DuelCosmetic, actor_id: int | None, reason: str = "") -> None:
    """Soft-delete ``cosmetic`` and stop it being active anywhere. Idempotent; keeps the bytes."""
    if cosmetic.taken_down_at is None:
        cosmetic.taken_down_at = datetime.now(timezone.utc)
        cosmetic.taken_down_by = actor_id
        cosmetic.taken_down_reason = (reason or "")[:REASON_MAX]
    db.execute(
        update(DuelUserSettings)
        .where(DuelUserSettings.active_playmat_id == cosmetic.id)
        .values(active_playmat_id=None)
    )
    db.execute(
        update(DuelUserSettings)
        .where(DuelUserSettings.active_card_back_id == cosmetic.id)
        .values(active_card_back_id=None)
    )
    db.flush()


def restore_cosmetic(db: Session, cosmetic: DuelCosmetic) -> None:
    """Undo a takedown. The owner has to pick the image as active again."""
    cosmetic.taken_down_at = None
    cosmetic.taken_down_by = None
    cosmetic.taken_down_reason = None
    db.flush()


def recent_takedowns(db: Session, since: datetime) -> list[dict]:
    """``[{user_id, kind, cosmetic_id}]`` for cosmetics taken down at or after ``since``."""
    rows = db.execute(
        select(DuelCosmetic.user_id, DuelCosmetic.kind, DuelCosmetic.id)
        .where(DuelCosmetic.taken_down_at.is_not(None), DuelCosmetic.taken_down_at >= since)
        .order_by(DuelCosmetic.id)
    ).all()
    return [{"user_id": uid, "kind": kind, "cosmetic_id": cid} for uid, kind, cid in rows]
