from __future__ import annotations

import json
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import Engine, create_engine, func, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import AnalystEvalRun, Base

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


def _ensure_share_link_include_extras() -> None:
    """Add include_extras on existing DBs; old links keep showing added cards (#527)."""
    inspector = inspect(engine)
    if "share_links" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("share_links")}
    if "include_extras" in existing:
        return
    default = "TRUE" if engine.dialect.name == "postgresql" else "1"
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE share_links ADD COLUMN include_extras BOOLEAN "
                f"NOT NULL DEFAULT {default}"
            )
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


def _ensure_deck_hidden_from_friends() -> None:
    """Add decks.hidden_from_friends on existing DBs; old decks stay visible to friends (#703)."""
    false = "FALSE" if engine.dialect.name == "postgresql" else "0"
    _add_columns("decks", [("hidden_from_friends", f"BOOLEAN NOT NULL DEFAULT {false}")])


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


# pg_advisory_lock key for startup work (schema creation, migrations, backfills).
STARTUP_LOCK_KEY = 0x6F707463675F7374  # "optcg_st"


@contextmanager
def startup_lock(bind: Engine | None = None) -> Iterator[None]:
    """Run startup work in one worker at a time.

    With several uvicorn workers (or instances) on Postgres, every worker runs
    the lifespan at once; concurrent CREATE TABLE / ALTER TABLE race and fail.
    The others wait here and then find nothing left to do. SQLite (local, one
    process) needs no lock.
    """
    bind = bind or engine
    if bind.dialect.name != "postgresql":
        yield
        return
    with bind.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:key)"), {"key": STARTUP_LOCK_KEY})
        conn.commit()
        try:
            yield
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": STARTUP_LOCK_KEY})
            conn.commit()


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


def _ensure_user_role_columns() -> None:
    """Add the role and ban columns to users on existing DBs (#667)."""
    ts = "TIMESTAMP" if engine.dialect.name == "sqlite" else "TIMESTAMP WITH TIME ZONE"
    _add_columns(
        "users",
        [
            ("role", "VARCHAR(16) NOT NULL DEFAULT 'user'"),
            ("banned_at", ts),
            ("ban_reason", "VARCHAR(200)"),
            ("banned_by", "INTEGER"),
        ],
    )


def _ensure_eval_run_columns() -> None:
    """Add the suite and headline-metric columns to analyst_eval_runs on existing DBs; older runs are the main suite (#679)."""
    false = "FALSE" if engine.dialect.name == "postgresql" else "0"
    _add_columns(
        "analyst_eval_runs",
        [
            ("suite", "VARCHAR(16) NOT NULL DEFAULT 'main'"),
            ("metric_name", "VARCHAR(60)"),
            ("metric_value", "FLOAT"),
            ("lower_is_better", f"BOOLEAN NOT NULL DEFAULT {false}"),
        ],
    )


def _ensure_admin_role(bind: Engine | None = None) -> None:
    """Exactly one admin: settings.admin_email. Any other admin row goes back to user (#667)."""
    bind = bind or engine
    admin = get_settings().admin_email.strip().lower()
    with bind.begin() as conn:
        conn.execute(
            text("UPDATE users SET role = 'user' WHERE role = 'admin' AND lower(email) <> :email"),
            {"email": admin},
        )
        conn.execute(
            text("UPDATE users SET role = 'admin' WHERE lower(email) = :email AND role <> 'admin'"),
            {"email": admin},
        )


# The eval runs from before the admin page, so the accuracy chart starts with history (#667).
_HISTORIC_EVAL_RUNS = (
    {
        "run_at": datetime(2026, 10, 8, 0, 45, tzinfo=timezone.utc),
        "label": "Baseline",
        "model": "claude-opus-5-5",
        "correct": 43.5,
        "total": 50,
        "groups": {"A": {"correct": 15, "total": 15}, "B": {"correct": 11.5, "total": 12}, "C": {"correct": 13, "total": 13}, "D": {"correct": 4, "total": 10}},
        "spend_usd": 5.97,
        "notes": "Paid eval, 50 cases x 2 reps",
    },
    {
        "run_at": datetime(2026, 10, 8, 1, 30, tzinfo=timezone.utc),
        "label": "PR #415 prompt + grader",
        "model": "claude-opus-5-5",
        "correct": 48.5,
        "total": 50,
        "groups": {"A": {"correct": 15, "total": 15}, "B": {"correct": 11.5, "total": 12}, "C": {"correct": 13, "total": 13}, "D": {"correct": 9, "total": 10}},
        "spend_usd": 7.14,
        "notes": "Grader, D judge and prompt all changed; D jump not split between Log Pose and grading",
    },
)


def _seed_eval_runs(bind: Engine | None = None) -> None:
    """Insert the two historic eval runs when the table is empty."""
    bind = bind or engine
    with Session(bind) as session:
        if session.scalar(select(func.count()).select_from(AnalystEvalRun)):
            return
        for run in _HISTORIC_EVAL_RUNS:
            session.add(AnalystEvalRun(**{**run, "groups": json.dumps(run["groups"])}))
        session.commit()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_group_buy_columns()
    _ensure_user_session_version()
    _ensure_deck_is_main()
    _ensure_user_sum_across_leaders()
    _ensure_deck_hidden_from_friends()
    _ensure_user_username()
    _ensure_share_link_include_extras()
    _ensure_duel_match_replay_columns()
    _ensure_duel_progress_closed()
    _ensure_analyst_review_citations()
    _ensure_analyst_usage_columns()
    _ensure_analyst_access_credit_columns()
    _ensure_user_role_columns()
    _ensure_eval_run_columns()
    _ensure_admin_role()
    _seed_eval_runs()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
