"""Startup (app.core.db.init_db): Alembic upgrade to head, seed data, and the startup lock.

The schema is built by the migrations in backend/migrations, which
test_alembic_baseline.py and test_alembic_reconcile.py check against the
models. These tests cover what startup does with them. Runs on SQLite by
default and on Postgres under TEST_DATABASE_URL.
"""

from __future__ import annotations

import pytest
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.core import db as app_db
from app.core.migrate import UnstampedDatabaseError, alembic_config
from tests.db_support import requires_postgres


def _revision(engine) -> str | None:
    if not inspect(engine).has_table("alembic_version"):
        return None
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()


def _head() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def test_startup_on_an_empty_database_reaches_the_alembic_head_refactor_3_8c(startup_engine):
    app_db.init_db()
    assert _revision(startup_engine) == _head()
    names = set(inspect(startup_engine).get_table_names())
    assert {"users", "decks", "duel_events", "sim_games"} <= names


def test_a_second_startup_changes_nothing_and_keeps_the_data_refactor_3_8c(startup_engine):
    app_db.init_db()
    with startup_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (email, name, google_sub) VALUES ('keep@example.com', 'Keep', 'sub-keep')"))
    app_db.init_db()
    assert _revision(startup_engine) == _head()
    with startup_engine.connect() as conn:
        assert conn.execute(text("SELECT email FROM users")).scalars().all() == ["keep@example.com"]


def test_startup_refuses_a_database_that_has_tables_but_no_alembic_version_refactor_3_8c(startup_engine):
    """The old create_all startup left no revision; running 0001 on it would die on 'table already exists'."""
    with startup_engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(320) NOT NULL)"))
    with pytest.raises(UnstampedDatabaseError, match="alembic stamp 0001"):
        app_db.init_db()
    assert _revision(startup_engine) is None


def test_startup_leaves_the_apps_logging_alone_refactor_3_8c(startup_engine):
    """alembic's env.py would otherwise fileConfig() over the handlers and levels uvicorn and the app set."""
    import logging

    root = logging.getLogger()
    before = (root.level, list(root.handlers), logging.getLogger("alembic").level)
    root.setLevel(logging.DEBUG)
    try:
        app_db.init_db()
        assert root.level == logging.DEBUG
        assert list(root.handlers) == before[1]
    finally:
        root.setLevel(before[0])


@requires_postgres
def test_the_lifespan_migrates_only_while_it_holds_the_startup_lock_refactor_3_8c(startup_engine, monkeypatch):
    """Another worker already inside startup_lock: this one must not touch the schema until it is released."""
    import threading

    from fastapi.testclient import TestClient

    from sqlalchemy.orm import sessionmaker

    from app.main import app

    # The lifespan's boot backfills open SessionLocal; point it at this database too.
    monkeypatch.setattr(app_db, "SessionLocal", sessionmaker(bind=startup_engine))

    def boot() -> None:
        with TestClient(app):
            pass

    with startup_engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(:key)"), {"key": app_db.STARTUP_LOCK_KEY})
        worker = threading.Thread(target=boot, daemon=True)
        worker.start()
        worker.join(1.0)
        assert worker.is_alive()
        assert _revision(startup_engine) is None
        holder.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": app_db.STARTUP_LOCK_KEY})
        holder.commit()
    worker.join(30)
    assert not worker.is_alive()
    assert _revision(startup_engine) == _head()


@requires_postgres
def test_startup_waits_for_another_worker_holding_the_startup_lock_389(startup_engine):
    """Several uvicorn workers start at once; only one may run the migrations at a time."""
    import threading

    entered = threading.Event()

    def other_worker() -> None:
        with app_db.startup_lock(startup_engine):
            entered.set()

    with startup_engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(:key)"), {"key": app_db.STARTUP_LOCK_KEY})
        worker = threading.Thread(target=other_worker, daemon=True)
        worker.start()
        assert not entered.wait(0.5)
        holder.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": app_db.STARTUP_LOCK_KEY})
        holder.commit()
    assert entered.wait(5)
    worker.join(5)


_ADVISORY_LOCK_STATES = text(
    "SELECT a.state FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid "
    "WHERE l.locktype = 'advisory' AND l.granted AND l.classid = :hi AND l.objid = :lo"
)


def _advisory_lock_states(conn, key: int) -> list[str]:
    params = {"hi": key >> 32, "lo": key & 0xFFFFFFFF}
    return [row[0] for row in conn.execute(_ADVISORY_LOCK_STATES, params)]


@requires_postgres
def test_startup_lock_is_held_by_an_open_transaction_so_a_pooler_cannot_strand_it_733(startup_engine):
    """Behind pgbouncer transaction pooling a session lock is released (or stranded) on the
    wrong server connection; a transaction-scoped lock lives and dies with its transaction."""
    with startup_engine.connect() as observer:
        with app_db.startup_lock(startup_engine):
            observer.rollback()  # fresh snapshot of pg_locks / pg_stat_activity
            assert _advisory_lock_states(observer, app_db.STARTUP_LOCK_KEY) == ["idle in transaction"]
        observer.rollback()
        assert _advisory_lock_states(observer, app_db.STARTUP_LOCK_KEY) == []


@requires_postgres
def test_a_stale_lock_on_the_old_startup_key_does_not_block_startup_733(startup_engine):
    """The prod deploy hung on a session lock stranded under the old key; the new key must not wait on it."""
    import threading

    old_key = 0x6F707463675F7374  # "optcg_st", the key whose lock was stranded in prod
    assert app_db.STARTUP_LOCK_KEY != old_key
    entered = threading.Event()

    def worker() -> None:
        with app_db.startup_lock(startup_engine):
            entered.set()

    with startup_engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(:key)"), {"key": old_key})
        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        started = entered.wait(5)
        holder.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": old_key})
        holder.commit()
    assert started
    thread.join(5)
