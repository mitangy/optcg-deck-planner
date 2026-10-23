"""Moves live duel snapshots that stopped updating from Redis into Postgres.

With Redis configured a live game's log exists only in Redis (see duel_live)
until its room closes and sends the ``closed`` snapshot. A game-server process
that crashes never sends it, and Redis forgets the log after PROGRESS_TTL_S.
This sweep saves such logs as closed ``DuelMatchProgress`` rows (the shape a
room closing without a result leaves) once they have been silent long enough.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import duel_live, redis_client
from app.models import DuelMatch, DuelMatchProgress, User
from app.tournament_sync import sync_loop

log = logging.getLogger("uvicorn.error")

# A live game sends a snapshot every turn; this long without one means nobody is running it.
IDLE_AFTER_S = 30 * 60
SWEEP_INTERVAL_S = 10 * 60
FIRST_RUN_DELAY_S = 90
BATCH = 200


def sweep_idle_progress(r, db: Session, now: datetime | None = None, idle_after_s: float = IDLE_AFTER_S) -> int:
    """Save idle live snapshots to Postgres as closed rows and drop the Redis copy. Returns how many were saved."""
    # The match lock and result check are the ingest route's own, so a result and a sweep cannot interleave.
    from app.routers.duel import _has_result, _lock_match

    now = now or datetime.now(timezone.utc)
    saved = 0
    for match_id in duel_live.idle_progress_ids(r, now - timedelta(seconds=idle_after_s), BATCH):
        live = duel_live.read_progress(r, match_id)
        if live is None:
            duel_live.drop_index_entry(r, match_id)
            continue
        _lock_match(db, match_id)
        users = (live.seat0_user_id, live.seat1_user_id)
        keep = not _has_result(db, match_id) and len(set(db.scalars(select(User.id).where(User.id.in_(users))))) == 2
        if keep:
            row = db.get(DuelMatchProgress, match_id)
            if row is None:
                row = DuelMatchProgress(match_id=match_id, seat0_user_id=users[0], seat1_user_id=users[1])
                db.add(row)
            for field in ("ranked", "seat0_leader_id", "seat1_leader_id", "turns", "replay", "seat0_log", "seat1_log"):
                setattr(row, field, getattr(live, field))
            row.closed = True
            row.updated_at = live.updated_at
            saved += 1
        # Finished games and snapshots of deleted accounts have nowhere to go; the live copy just goes.
        db.commit()
        duel_live.delete_progress(r, match_id, users)
    return saved


def run_once() -> int | None:
    """One sweep, or None when Redis is off or another API worker is already sweeping."""
    from app.db import PROGRESS_SWEEP_LOCK_KEY, SessionLocal, try_advisory_lock

    r = redis_client.get_redis()
    if r is None:
        return None
    lock = try_advisory_lock(PROGRESS_SWEEP_LOCK_KEY)
    if lock is None:
        return None
    db = SessionLocal()
    try:
        saved = sweep_idle_progress(r, db)
        if saved:
            log.info("progress sweep: saved %d idle live game log(s) to Postgres", saved)
        return saved
    except redis_client.RedisError:
        redis_client.report_failure("progress sweep")
        return None
    finally:
        db.close()
        lock.release()


def start_background(settings) -> asyncio.Task | None:
    """The sweep task when REDIS_URL is set (without Redis nothing lives outside Postgres), else None."""
    if not settings.redis_url.strip():
        return None
    return asyncio.create_task(sync_loop(run_once, first_delay=FIRST_RUN_DELAY_S, interval=SWEEP_INTERVAL_S))


async def stop(task: asyncio.Task | None) -> None:
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
