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


# pg_advisory_xact_lock key for startup work (schema creation, migrations, backfills).
# "optcg_s2": the key changed after #733, when a session-level lock on the old key
# ("optcg_st" = 0x6F707463675F7374) was stranded on a pooled Neon backend.
STARTUP_LOCK_KEY = 0x6F707463675F7332  # "optcg_s2"


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


# Background jobs that must run in one API worker at a time (try_advisory_lock).
CATALOG_SYNC_LOCK_KEY = 0x6F707463675F6373  # "optcg_cs"
TOURNAMENT_SYNC_LOCK_KEY = 0x6F707463675F7473  # "optcg_ts"
PROGRESS_SWEEP_LOCK_KEY = 0x6F707463675F7073  # "optcg_ps"
DISCORD_FEEDBACK_LOCK_KEY = 0x6F707463675F6466  # "optcg_df"


class AdvisoryLock:
    """A held Postgres transaction-level advisory lock; release() is safe from any thread."""

    def __init__(self, conn, key: int) -> None:
        self._conn = conn
        self._key = key

    def release(self) -> None:
        conn, self._conn = self._conn, None
        if conn is None:
            return
        try:
            # Ending the transaction drops the lock; there is no separate unlock.
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
    """Bring the database to the current schema and seed its reference data.

    Called once per worker from the lifespan, inside ``startup_lock``. The
    schema is owned by Alembic (backend/migrations): ``upgrade head`` is a no-op
    on an up-to-date database. Data that is not schema (the admin role, the
    historic eval runs, the default event) lives in ``app.core.seed``.
    """
    from app.core.migrate import upgrade_to_head
    from app.core.seed import seed_reference_data

    bind = bind or engine
    was_empty = upgrade_to_head(bind)
    # The default event is seeded only on a brand-new database, so deleting every event stays deleted.
    seed_reference_data(bind, new_database=was_empty)


# Connections kept free for background jobs (advisory locks pin one for a whole run).
_POOL_HEADROOM = 3
_request_slots: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = weakref.WeakKeyDictionary()


def _request_slot_count() -> int:
    """How many requests may hold a Session at once: the pool's capacity minus headroom."""
    pool = engine.pool
    size = getattr(pool, "size", None)
    if not callable(size):  # SQLite in memory / NullPool: no queue to protect
        return 1_000_000
    return max(1, size() + getattr(pool, "_max_overflow", 0) - _POOL_HEADROOM)


async def get_db() -> AsyncGenerator[Session, None]:
    """One Session per request, admitted only while a pool connection is certain to be free (#802).

    A request holds its connection from the first query (auth) to the end, but needs
    a fresh worker thread for each sync dependency and for the route itself. With
    more requests than pool connections, the extra requests sat in worker threads
    waiting for a connection while the requests holding every connection waited
    for a thread: nothing could finish, the pool never refilled, and the whole API
    froze. Waiting here, on the event loop, costs no thread, so a request that holds
    a connection can always get one.
    """
    loop = asyncio.get_running_loop()
    slots = _request_slots.get(loop)
    if slots is None:
        slots = _request_slots[loop] = asyncio.Semaphore(_request_slot_count())
    async with slots:
        db = SessionLocal()
        try:
            yield db
        finally:
            # close() rolls back over the network, so it runs off the event loop (on
            # the loop it stalled every request, one round trip each). Shielded so a
            # client that disconnects mid-request still returns its connection, and
            # on its own limiter (as FastAPI's own teardown) so it never queues
            # behind busy routes.
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(db.close, limiter=anyio.CapacityLimiter(1))
