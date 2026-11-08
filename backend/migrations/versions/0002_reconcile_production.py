"""Reconcile production with the 0001 baseline (refactor 3.8b).

Production was built by ``init_db``: ``create_all`` plus the ``_ensure_*`` ALTER
helpers. Those helpers added 17 columns as nullable with a DEFAULT, never added
two indexes to existing tables, and never followed the ``user_sharing.collection``
default change (#939). See refactor-review/alembic-prod-compare-2026-11-07.md.

After ``alembic stamp 0001`` this revision brings production to exactly the 0001
schema. On a database built by 0001 it changes nothing:

* backfill NULLs with the model default, then ``SET NOT NULL`` (guarded);
* drop the server defaults 0001 does not have (``decks.is_main``,
  ``group_buys.is_public``, ``users.session_version`` and
  ``users.sum_across_leaders`` keep theirs, as in 0001);
* ``CREATE INDEX IF NOT EXISTS`` for the two missing indexes;
* ``user_sharing.collection`` server default -> 'friends'.

Postgres (and offline SQL) get plain, idempotent statements. SQLite cannot alter
columns in place, so it inspects the table first and rebuilds it with
``batch_alter_table`` only when something actually differs.

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# (table, column, model default used to backfill NULLs, keeps its server default in 0001)
_FALSE = sa.false()
_COLUMNS: list[tuple[str, str, object, bool]] = [
    ("analyst_access", "auto_approved", _FALSE, False),
    ("analyst_access", "topup_usd", 0.0, False),
    ("analyst_usage", "duration_ms", 0, False),
    ("analyst_usage", "outcome", "ok", False),
    ("analyst_usage", "tool_calls", 0, False),
    ("decks", "is_main", _FALSE, True),
    ("duel_match_progress", "closed", _FALSE, False),
    ("feedback", "discord_author", "", False),
    ("group_buys", "external_order_id", "", False),
    ("group_buys", "is_public", _FALSE, True),
    ("group_buys", "order_notes", "", False),
    ("group_buys", "receipt_text", "", False),
    ("group_buys", "shipping_cost", 0.0, False),
    ("group_buys", "shipping_split", "equal", False),
    ("group_buys", "tax_cost", 0.0, False),
    ("users", "session_version", 0, True),
    ("users", "sum_across_leaders", _FALSE, True),
]

_INDEXES = [
    ("ix_analyst_eval_runs_suite", "analyst_eval_runs", "suite"),
    ("ix_analyst_usage_thread_id", "analyst_usage", "thread_id"),
]


def _backfill(table: str, column: str, value: object) -> None:
    # Typed columns: offline (--sql) mode renders literals and needs the type.
    kind = {float: sa.Float, int: sa.Integer, str: sa.String}.get(type(value))
    t = sa.table(table, sa.column(column, kind() if kind else sa.Boolean()))
    op.execute(t.update().where(t.c[column].is_(None)).values({column: value}))


def _upgrade_postgres() -> None:
    for table, column, value, keeps_default in _COLUMNS:
        _backfill(table, column, value)
        op.alter_column(table, column, nullable=False)
        if not keeps_default:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT")
    op.execute("ALTER TABLE user_sharing ALTER COLUMN collection SET DEFAULT 'friends'")


def _upgrade_sqlite() -> None:
    insp = sa.inspect(op.get_bind())
    for table in sorted({c[0] for c in _COLUMNS} | {"user_sharing"}):
        cols = {c["name"]: c for c in insp.get_columns(table)}
        changes: list[tuple[str, dict]] = []
        for t, column, value, keeps_default in _COLUMNS:
            if t != table:
                continue
            col = cols[column]
            kwargs: dict = {}
            if col["nullable"]:
                _backfill(table, column, value)
                kwargs["nullable"] = False
            if not keeps_default and col["default"] is not None:
                kwargs["server_default"] = None
            if kwargs:
                changes.append((column, kwargs))
        if table == "user_sharing":
            default = cols["collection"]["default"]
            if (default or "").strip("'\"") != "friends":
                changes.append(("collection", {"server_default": "friends"}))
        if changes:
            with op.batch_alter_table(table) as batch:
                for column, kwargs in changes:
                    batch.alter_column(column, **kwargs)
            if table == "users":
                # SQLite cannot reflect expression indexes, so the table rebuild drops this one.
                op.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))"
                )


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        _upgrade_postgres()
    else:
        _upgrade_sqlite()
    for name, table, column in _INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})")


def downgrade() -> None:
    # Intentionally a no-op. 0001 is the target schema and already has these
    # indexes and NOT NULL columns, so the inverse would only re-create the
    # production drift (nullable columns, extra defaults, the 'off' default),
    # and dropping the indexes would break 0001 itself.
    pass
