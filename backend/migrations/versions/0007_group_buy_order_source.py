"""Remember which group buy orders Mark purchased made (#1418).

``group_buy_orders.from_receipt_apply``: ``receipt/undo`` drops an order that Mark purchased
created, but only reverses the arrivals of one the host added through the orders endpoint.
Orders backfilled by 0006 from old applies are Mark purchased orders.

Revision ID: 0007
Revises: 0006
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_TABLE = "group_buy_orders"


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    if "from_receipt_apply" not in existing:
        op.add_column(
            _TABLE,
            sa.Column(
                "from_receipt_apply", sa.Boolean(), server_default=sa.false(), nullable=False
            ),
        )
    op.execute(
        "UPDATE group_buy_orders SET from_receipt_apply = :t WHERE id IN "
        "(SELECT order_id FROM group_buy_receipt_applies WHERE order_id IS NOT NULL)"
        .replace(":t", "TRUE" if op.get_bind().dialect.name == "postgresql" else "1")
    )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("from_receipt_apply")
