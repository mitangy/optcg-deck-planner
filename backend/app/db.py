from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
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
    if not additions:
        return
    with engine.begin() as conn:
        for name, typ in additions:
            conn.execute(text(f"ALTER TABLE group_buys ADD COLUMN {name} {typ}"))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_group_buy_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
