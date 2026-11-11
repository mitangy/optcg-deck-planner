"""Skip an Extra copy in one group buy (#1269).

New table ``group_buy_extra_skips``: per member, per group buy, per (card, alt printing),
how many Extra copies are left out of that group buy. The Shopping list is untouched.

Idempotent: a table that already exists is left alone, so a database that got it another
way (``create_all``) upgrades cleanly on SQLite and Postgres.

Revision ID: 0005
Revises: 0004
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

_TABLE = "group_buy_extra_skips"


def upgrade() -> None:
    if _TABLE in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_buy_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["group_buy_id"], ["group_buys.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "group_buy_id", "user_id", "card_id", "product_id", name="uq_group_buy_extra_skip"
        ),
    )
    op.create_index(op.f("ix_group_buy_extra_skips_card_id"), _TABLE, ["card_id"], unique=False)
    op.create_index(
        op.f("ix_group_buy_extra_skips_group_buy_id"), _TABLE, ["group_buy_id"], unique=False
    )
    op.create_index(op.f("ix_group_buy_extra_skips_user_id"), _TABLE, ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table(_TABLE)
