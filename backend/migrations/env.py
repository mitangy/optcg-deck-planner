"""Alembic environment: same database URL and metadata as the app.

Run from backend/ (``alembic upgrade head``). Tests and tools may pass an open
connection through ``config.attributes["connection"]`` instead of a URL.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# Tables in the database that the API models do not own. The game server
# creates duel_match_outbox itself (game-server/src/writeback.ts), so
# autogenerate / `alembic check` must not propose dropping it.
EXTERNAL_TABLES = frozenset({"duel_match_outbox"})


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    if type_ == "table":
        return not (reflected and name in EXTERNAL_TABLES)
    table = getattr(obj, "table", None)
    return table is None or table.name not in EXTERNAL_TABLES


def _url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().sqlalchemy_url


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as conn:
        _run(conn)
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
