"""Member hand-off tracking for group buys (#1418).

New table ``group_buy_handoffs``: one row per member once the host starts handing their
arrived cards over (status, tracking link, note, copies covered, paid flag).

Idempotent: skipped when the table already exists.

Revision ID: 0010
Revises: 0009
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

_TABLE = "group_buy_handoffs"


def upgrade() -> None:
    if _TABLE in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_buy_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tracking_url", sa.String(length=1000), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=False),
        sa.Column("qty_handed", sa.Integer(), nullable=False),
        sa.Column("paid", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["group_buy_id"], ["group_buys.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_buy_id", "user_id", name="uq_group_buy_handoff"),
    )
    op.create_index(op.f("ix_group_buy_handoffs_group_buy_id"), _TABLE, ["group_buy_id"])
    op.create_index(op.f("ix_group_buy_handoffs_user_id"), _TABLE, ["user_id"])


def downgrade() -> None:
    op.drop_table(_TABLE)
