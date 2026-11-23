"""Price paid per copy on group buy order lines (#1443).

New nullable column ``group_buy_order_lines.unit_price``: filled from the Order History import so a
card the group already bought keeps showing what it cost, whatever the market does later.

Idempotent: skipped when the column already exists.

Revision ID: 0011
Revises: 0010
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_TABLE = "group_buy_order_lines"
_COLUMN = "unit_price"


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    if _COLUMN in cols:
        return
    op.add_column(_TABLE, sa.Column(_COLUMN, sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column(_TABLE, _COLUMN)
