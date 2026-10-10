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


def _ensure_analyst_review_citations() -> None:
    """Add analyst_match_reviews.citations (the sources a post-game analysis cites) on existing DBs."""
    inspector = inspect(engine)
    if "analyst_match_reviews" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("analyst_match_reviews")}
    if "citations" in existing:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE analyst_match_reviews ADD COLUMN citations TEXT"))


def _add_columns(table: str, columns: list[tuple[str, str]]) -> None:
    """Add the missing columns to an existing table (create_all does not alter tables)."""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns(table)}
    missing = [(name, typ) for name, typ in columns if name not in existing]
    if not missing:
        return
    with engine.begin() as conn:
        for name, typ in missing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {typ}"))


def _ensure_analyst_usage_columns() -> None:
    """Add the analytics columns to analyst_usage on existing DBs (#446)."""
    _add_columns(
        "analyst_usage",
        [
            ("thread_id", "INTEGER"),
            ("outcome", "VARCHAR(16) DEFAULT 'ok'"),
            ("refusal", "VARCHAR(16)"),
            ("tool_calls", "INTEGER DEFAULT 0"),
            ("duration_ms", "INTEGER DEFAULT 0"),
        ],
    )


def _ensure_analyst_access_credit_columns() -> None:
    """Add the credit, free-spot and top-up columns to analyst_access on existing DBs (#446)."""
    false = "FALSE" if engine.dialect.name == "postgresql" else "0"
    ts = "TIMESTAMP" if engine.dialect.name == "sqlite" else "TIMESTAMP WITH TIME ZONE"
    _add_columns(
        "analyst_access",
        [
            ("credit_usd", "FLOAT"),
            ("topup_usd", "FLOAT DEFAULT 0"),
            ("topup_month", "VARCHAR(7)"),
            ("auto_approved", f"BOOLEAN DEFAULT {false}"),
            ("topup_requested_at", ts),
        ],
    )


def _ensure_duel_progress_closed() -> None:
    """Add duel_match_progress.closed (room closed; its recording can be watched) on existing DBs (#476)."""
    false = "FALSE" if engine.dialect.name == "postgresql" else "0"
    _add_columns("duel_match_progress", [("closed", f"BOOLEAN DEFAULT {false}")])


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_group_buy_columns()
    _ensure_user_session_version()
    _ensure_deck_is_main()
    _ensure_user_sum_across_leaders()
    _ensure_user_username()
    _ensure_duel_match_replay_columns()
    _ensure_duel_progress_closed()
    _ensure_analyst_review_citations()
    _ensure_analyst_usage_columns()
    _ensure_analyst_access_credit_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
