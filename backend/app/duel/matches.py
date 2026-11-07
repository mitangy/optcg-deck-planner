"""Match helpers the duel routes, the report route and the idle-progress sweep share (refactor D-02)."""

from __future__ import annotations

import hashlib

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import duel_live, redis_client
from app.core.time import as_utc
from app.models import DuelMatch, DuelMatchProgress


def lock_match(db: Session, match_id: str) -> None:
    """Serialize every write for one match_id (result and per-turn progress) until commit."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    else:
        lock_id = int.from_bytes(
            hashlib.sha256(f"duel-match:{match_id}".encode()).digest()[:8],
            byteorder="big", signed=True,
        )
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})


def has_result(db: Session, match_id: str) -> bool:
    return db.scalar(select(DuelMatch.id).where(DuelMatch.match_id == match_id)) is not None


def latest_progress(db: Session, match_id: str) -> DuelMatchProgress | None:
    """The newest snapshot of an unfinished game: Redis's live copy or Postgres's stored one."""
    stored = db.get(DuelMatchProgress, match_id)
    r = redis_client.get_redis()
    if r is None:
        return stored
    try:
        live = duel_live.read_progress(r, match_id)
    except redis_client.RedisError:
        redis_client.report_failure("progress read")
        return stored
    if live is None or (stored is not None and as_utc(stored.updated_at) >= as_utc(live.updated_at)):
        return stored
    return live
