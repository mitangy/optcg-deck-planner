"""First-party error reporting (#1500).

New table ``client_errors``: uncaught errors from the planner, the duel app and the API, grouped by
fingerprint (a repeat within an hour bumps ``count``). ``user_id`` is set null when the account is deleted.

Idempotent: the table is skipped when it already exists.

Revision ID: 0017
Revises: 0016
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "client_errors" in set(sa.inspect(bind).get_table_names()):
        return
    op.create_table(
        "client_errors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("app", sa.String(length=16), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("stack", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=200), nullable=False),
        sa.Column("release", sa.String(length=40), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("fingerprint", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_client_errors_last_seen_at", "client_errors", ["last_seen_at"])
    op.create_index("ix_client_errors_fingerprint", "client_errors", ["fingerprint"])


def downgrade() -> None:
    op.drop_table("client_errors")
