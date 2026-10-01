"""Test database selection: in-memory SQLite by default, Postgres when
``TEST_DATABASE_URL`` is set (CI runs the suite both ways).

Postgres runs get a clean ``public`` schema from every ``make_test_engine()``
call. That drops everything, so the URL must point at a throwaway local
database; non-local hosts are refused.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool, StaticPool

from app.models import Base

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def test_database_url() -> str | None:
    url = os.environ.get("TEST_DATABASE_URL", "").strip()
    return url or None


def using_postgres() -> bool:
    return test_database_url() is not None


# Environment selection, not a hidden failure: Postgres-only cases run when CI
# (or a local cluster) provides TEST_DATABASE_URL.
requires_postgres = pytest.mark.skipif(
    not using_postgres(), reason="needs TEST_DATABASE_URL pointing at a local Postgres"
)


def _postgres_engine() -> Engine:
    url = make_url(test_database_url())
    host = url.host
    # No host or a socket directory means a local unix socket.
    if host and not host.startswith("/") and host not in _LOCAL_HOSTS:
        raise RuntimeError(f"TEST_DATABASE_URL host {host!r} is not local; refusing to wipe it")
    if url.drivername in ("postgres", "postgresql"):
        url = url.set(drivername="postgresql+psycopg2")
    return create_engine(url, poolclass=NullPool)


def reset_postgres_schema(engine: Engine) -> None:
    """Wipe the database: drop every table (including migration-test leftovers)."""
    with engine.connect() as conn:
        # A previous test's engine may still hold an open transaction.
        conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = current_database() AND pid <> pg_backend_pid()"
            )
        )
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()


def make_bare_engine() -> Engine:
    """An engine on an empty database (no tables): for building legacy schemas."""
    if using_postgres():
        engine = _postgres_engine()
        reset_postgres_schema(engine)
        return engine
    return create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )


def make_test_engine() -> Engine:
    """An engine on a fresh database with the current ORM schema created."""
    engine = make_bare_engine()
    Base.metadata.create_all(bind=engine)
    return engine
