from __future__ import annotations

import asyncio
import weakref
from collections.abc import AsyncGenerator, Iterator
from contextlib import contextmanager

import anyio.to_thread
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

connect_args = {}
engine_kwargs: dict = {}
if settings.sqlalchemy_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # Neon (and most managed Postgres) drop idle connections; pre-ping validates
    # a pooled connection before use and pool_recycle proactively retires stale
    # ones so requests after an idle period don't hit "server closed the
    # connection" errors.
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(
    settings.sqlalchemy_url,
    connect_args=connect_args,
    **engine_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# "optcg_s2": the old key's session lock got stranded on a pooled Neon backend.
STARTUP_LOCK_KEY = 0x6F707463675F7332


@contextmanager
def startup_lock(bind: Engine | None = None) -> Iterator[None]:
    """Run startup work in one worker at a time.

    With several uvicorn workers (or instances) on Postgres, every worker runs
    the lifespan at once; concurrent CREATE TABLE / ALTER TABLE race and fail.
    The others wait here and then find nothing left to do. SQLite (local, one
    process) needs no lock.

    The lock is transaction-scoped and the transaction stays open for the whole
    block. Prod goes through Neon's pgbouncer in transaction pooling mode, where
    a session-level lock and its unlock can land on different server connections
    and the lock is never released (#733).
    """
    bind = bind or engine
    if bind.dialect.name != "postgresql":
        yield
        return
    with bind.connect() as conn:
        with conn.begin():
            conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": STARTUP_LOCK_KEY})
            yield


CATALOG_SYNC_LOCK_KEY = 0x6F707463675F6373
TOURNAMENT_SYNC_LOCK_KEY = 0x6F707463675F7473
PROGRESS_SWEEP_LOCK_KEY = 0x6F707463675F7073
DISCORD_FEEDBACK_LOCK_KEY = 0x6F707463675F6466
INSTAGRAM_POST_LOCK_KEY = 0x6F707463675F6967


class AdvisoryLock:
    def __init__(self, conn, key: int) -> None:
        self._conn = conn
        self._key = key

    def release(self) -> None:
        conn, self._conn = self._conn, None
        if conn is None:
            return
        try:
            conn.rollback()
        finally:
            conn.close()


def try_advisory_lock(key: int, bind: Engine | None = None) -> AdvisoryLock | None:
    """Take ``key`` without waiting: the lock, or None when another worker holds it.

    The lock is transaction-scoped and the transaction stays open (never
    committed) until release(). Behind Neon's transaction-mode pgbouncer a
    session lock would stay on a pooled backend that the unlock may never
    reach; an open transaction pins one backend for the whole job, and the
    lock goes away with it, even if the worker dies. SQLite (local, one
    process) has no other worker to exclude: it always gets a no-op lock, and
    each job's in-process guard still applies.
    """
    bind = bind or engine
    if bind.dialect.name != "postgresql":
        return AdvisoryLock(None, key)
    conn = bind.connect()
    try:
        got = conn.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key}).scalar()
    except BaseException:
        conn.close()
        raise
    if not got:
        conn.close()
        return None
    return AdvisoryLock(conn, key)


def init_db(bind: Engine | None = None) -> None:
    from app.core.migrate import upgrade_to_head
    from app.core.seed import seed_reference_data

    bind = bind or engine
    was_empty = upgrade_to_head(bind)
    seed_reference_data(bind, new_database=was_empty)


_POOL_HEADROOM = 3
_request_slots: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = weakref.WeakKeyDictionary()


def _request_slot_count() -> int:
    pool = engine.pool
    size = getattr(pool, "size", None)
    if not callable(size):  # SQLite in memory / NullPool: no queue to protect
        return 1_000_000
    return max(1, size() + getattr(pool, "_max_overflow", 0) - _POOL_HEADROOM)


def get_session_factory() -> sessionmaker:
    """The session factory, as a dependency, for handlers that must not hold a
    session (and a request slot) across a slow upstream call."""
    return SessionLocal


async def get_db() -> AsyncGenerator[Session, None]:
    loop = asyncio.get_running_loop()
    slots = _request_slots.get(loop)
    if slots is None:
        slots = _request_slots[loop] = asyncio.Semaphore(_request_slot_count())
    async with slots:
        db = SessionLocal()
        try:
            yield db
        finally:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(db.close, limiter=anyio.CapacityLimiter(1))
