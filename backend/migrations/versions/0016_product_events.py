"""Funnel events and return visits (#1499).

New table ``product_events`` (one row per funnel step: landing, home_view, game_start, ...) and
``users.last_seen_at`` (when a user's newest UTC day of activity began, stamped once a day).

Idempotent: the table, its indexes and the column are skipped when they already exist.

Revision ID: 0016
Revises: 0015
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "product_events" not in set(insp.get_table_names()):
        op.create_table(
            "product_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("anon_id", sa.String(length=64), nullable=True),
            sa.Column("app", sa.String(length=16), nullable=False),
            sa.Column("name", sa.String(length=40), nullable=False),
            sa.Column("device", sa.String(length=8), nullable=True),
            sa.Column("props", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    have = {i["name"] for i in sa.inspect(bind).get_indexes("product_events")}
    if "ix_product_events_name_created_at" not in have:
        op.create_index("ix_product_events_name_created_at", "product_events", ["name", "created_at"])
    if "ix_product_events_user_id" not in have:
        op.create_index("ix_product_events_user_id", "product_events", ["user_id"])
    if "last_seen_at" not in {c["name"] for c in insp.get_columns("users")}:
        if bind.dialect.name == "postgresql":
            # Fail fast instead of queueing behind a long transaction and blocking every login behind the ALTER.
            op.execute("SET LOCAL lock_timeout = '5s'")
        op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_seen_at")
    op.drop_table("product_events")
