"""Group buy member contribution flags (#1177).

``include_singles`` (default true, today's behavior) and ``include_extra_copies``
(default false, today's behavior) on ``group_buy_members``.

Idempotent: a column that already exists is left alone, so a database that got
the columns another way (``create_all``) upgrades cleanly on SQLite and Postgres.

Revision ID: 0003
Revises: 0002
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_TABLE = "group_buy_members"


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    if "include_singles" not in existing:
        op.add_column(
            _TABLE,
            sa.Column("include_singles", sa.Boolean(), server_default=sa.true(), nullable=False),
        )
    if "include_extra_copies" not in existing:
        op.add_column(
            _TABLE,
            sa.Column("include_extra_copies", sa.Boolean(), server_default=sa.false(), nullable=False),
        )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("include_extra_copies")
        batch.drop_column("include_singles")
