from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base

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


def _ensure_group_buy_columns() -> None:
    """Add Phase 2 columns on existing DBs (create_all does not alter tables)."""
    inspector = inspect(engine)
    if "group_buys" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("group_buys")}
    dialect = engine.dialect.name
    additions: list[tuple[str, str]] = []
    if "ordered_at" not in existing:
        additions.append(
            (
                "ordered_at",
                "TIMESTAMP" if dialect == "sqlite" else "TIMESTAMP WITH TIME ZONE",
            )
        )
    if "external_order_id" not in existing:
        additions.append(("external_order_id", "VARCHAR(200) DEFAULT ''"))
    if "order_notes" not in existing:
        additions.append(("order_notes", "TEXT DEFAULT ''"))
    if "shipping_cost" not in existing:
        additions.append(("shipping_cost", "FLOAT DEFAULT 0"))
    if "shipping_split" not in existing:
        additions.append(("shipping_split", "VARCHAR(32) DEFAULT 'equal'"))
    if "tax_cost" not in existing:
        additions.append(("tax_cost", "FLOAT DEFAULT 0"))
    if "receipt_text" not in existing:
        additions.append(("receipt_text", "TEXT DEFAULT ''"))
    if "is_public" not in existing:
        default = "FALSE" if dialect == "postgresql" else "0"
        additions.append(("is_public", f"BOOLEAN DEFAULT {default}"))
    if not additions:
        return
    with engine.begin() as conn:
        for name, typ in additions:
            conn.execute(text(f"ALTER TABLE group_buys ADD COLUMN {name} {typ}"))


def _ensure_user_session_version() -> None:
    """Add session_version on existing DBs (create_all does not alter tables)."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("users")}
    if "session_version" in existing:
        return
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE users ADD COLUMN session_version INTEGER DEFAULT 0")
        )


def _ensure_deck_is_main() -> None:
    """Add is_main on existing DBs (create_all does not alter tables)."""
    inspector = inspect(engine)
    if "decks" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("decks")}
    if "is_main" in existing:
        return
    # Postgres requires boolean literals (DEFAULT 0 → DatatypeMismatch).
    default = "FALSE" if engine.dialect.name == "postgresql" else "0"
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE decks ADD COLUMN is_main BOOLEAN DEFAULT {default}"))


def _ensure_user_sum_across_leaders() -> None:
    """Add sum_across_leaders on existing DBs (create_all does not alter tables)."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("users")}
    if "sum_across_leaders" in existing:
        return
    default = "FALSE" if engine.dialect.name == "postgresql" else "0"
    with engine.begin() as conn:
        conn.execute(
            text(f"ALTER TABLE users ADD COLUMN sum_across_leaders BOOLEAN DEFAULT {default}")
        )


def _ensure_user_username(bind: Engine | None = None) -> None:
    """Add users.username + its case-insensitive unique index on existing DBs.

    Idempotent: the column is added only when missing and the index uses
    IF NOT EXISTS (supported by both SQLite and Postgres). The column is
    nullable, so the ALTER is a metadata-only change on Postgres.
    """
    bind = bind or engine
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("users")}
    with bind.begin() as conn:
        if "username" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(20)"))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower "
                "ON users (lower(username))"
            )
        )


def _ensure_duel_match_replay_columns() -> None:
    """Add leader ids and turn count to duel_matches on existing DBs."""
    inspector = inspect(engine)
    if "duel_matches" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("duel_matches")}
    additions = [
        (name, typ)
        for name, typ in (
            ("seat0_leader_id", "VARCHAR(32)"),
            ("seat1_leader_id", "VARCHAR(32)"),
            ("turns", "INTEGER"),
        )
        if name not in existing
    ]
    if not additions:
        return
    with engine.begin() as conn:
        for name, typ in additions:
            conn.execute(text(f"ALTER TABLE duel_matches ADD COLUMN {name} {typ}"))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_group_buy_columns()
    _ensure_user_session_version()
    _ensure_deck_is_main()
    _ensure_user_sum_across_leaders()
    _ensure_user_username()
    _ensure_duel_match_replay_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
