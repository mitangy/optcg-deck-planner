"""Group buy seller orders / packages (#1418).

New tables ``group_buy_orders``, ``group_buy_order_lines`` and ``group_buy_order_allocations``,
and ``group_buy_receipt_applies.order_id`` so the arrival ledger knows which package it belongs to.

Backfill: every group buy that already has an external order id, a receipt apply, or is
ordered/completed becomes one order. Its receipt applies are attached to it and its apply lines
become order lines with allocations marked fully arrived (Owned was already credited then).
The old group_buys columns stay.

Idempotent: tables and the column are skipped when they already exist.

Revision ID: 0008
Revises: 0007
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _timestamp() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "group_buy_orders" not in tables:
        op.create_table(
            "group_buy_orders",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("group_buy_id", sa.Integer(), nullable=False),
            sa.Column("order_number", sa.String(length=200), nullable=False),
            sa.Column("seller_name", sa.String(length=200), nullable=False),
            sa.Column("tracking_url", sa.String(length=1000), nullable=False),
            sa.Column("receipt_text", sa.Text(), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=False),
            _timestamp(),
            sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["group_buy_id"], ["group_buys.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_group_buy_orders_group_buy_id"), "group_buy_orders", ["group_buy_id"]
        )
        op.create_index(
            op.f("ix_group_buy_orders_created_by_user_id"),
            "group_buy_orders",
            ["created_by_user_id"],
        )
        op.create_index(
            "uq_group_buy_order_number",
            "group_buy_orders",
            ["group_buy_id", "order_number"],
            unique=True,
            sqlite_where=sa.text("order_number <> ''"),
            postgresql_where=sa.text("order_number <> ''"),
        )

    if "group_buy_order_lines" not in tables:
        op.create_table(
            "group_buy_order_lines",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("order_id", sa.Integer(), nullable=False),
            sa.Column("card_id", sa.String(length=32), nullable=False),
            sa.Column("product_id", sa.Integer(), nullable=True),
            sa.Column("qty_ordered", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["order_id"], ["group_buy_orders.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("order_id", "card_id", "product_id", name="uq_group_buy_order_line"),
        )
        op.create_index(
            op.f("ix_group_buy_order_lines_order_id"), "group_buy_order_lines", ["order_id"]
        )
        op.create_index(
            op.f("ix_group_buy_order_lines_card_id"), "group_buy_order_lines", ["card_id"]
        )

    if "group_buy_order_allocations" not in tables:
        op.create_table(
            "group_buy_order_allocations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("order_line_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("qty", sa.Integer(), nullable=False),
            sa.Column("qty_arrived", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["order_line_id"], ["group_buy_order_lines.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_group_buy_order_allocations_order_line_id"),
            "group_buy_order_allocations",
            ["order_line_id"],
        )
        op.create_index(
            op.f("ix_group_buy_order_allocations_user_id"),
            "group_buy_order_allocations",
            ["user_id"],
        )

    apply_columns = {c["name"] for c in insp.get_columns("group_buy_receipt_applies")}
    if "order_id" not in apply_columns:
        if bind.dialect.name == "sqlite":
            # Batch mode cannot add a column with an unnamed foreign key; SQLite can do it inline.
            op.execute(
                "ALTER TABLE group_buy_receipt_applies ADD COLUMN order_id INTEGER "
                "REFERENCES group_buy_orders (id)"
            )
        else:
            op.add_column(
                "group_buy_receipt_applies", sa.Column("order_id", sa.Integer(), nullable=True)
            )
            op.create_foreign_key(
                None, "group_buy_receipt_applies", "group_buy_orders", ["order_id"], ["id"]
            )
        op.create_index(
            op.f("ix_group_buy_receipt_applies_order_id"),
            "group_buy_receipt_applies",
            ["order_id"],
        )

    _backfill(bind)


def _backfill(bind: sa.Connection) -> None:
    already = {
        row[0]
        for row in bind.execute(sa.text("SELECT DISTINCT group_buy_id FROM group_buy_orders"))
    }
    groups = bind.execute(
        sa.text(
            "SELECT g.id, g.host_user_id, g.external_order_id, g.receipt_text, g.status "
            "FROM group_buys g ORDER BY g.id"
        )
    ).all()
    for group_id, host_id, external_id, receipt_text, status in groups:
        if group_id in already:
            continue
        applies = bind.execute(
            sa.text(
                "SELECT id, applied_by_user_id, applied_at FROM group_buy_receipt_applies "
                "WHERE group_buy_id = :g ORDER BY id"
            ),
            {"g": group_id},
        ).all()
        number = (external_id or "").strip()
        if not number and not applies and status not in ("ordered", "completed"):
            continue
        arrived_at = max((a[2] for a in applies if a[2] is not None), default=None)
        creator = applies[0][1] if applies else host_id
        bind.execute(
            sa.text(
                "INSERT INTO group_buy_orders (group_buy_id, order_number, seller_name, "
                "tracking_url, receipt_text, created_by_user_id, arrived_at, version) "
                "VALUES (:g, :n, '', '', :r, :u, :a, 1)"
            ),
            {"g": group_id, "n": number, "r": receipt_text or "", "u": creator, "a": arrived_at},
        )
        order_id = bind.execute(
            sa.text("SELECT id FROM group_buy_orders WHERE group_buy_id = :g"), {"g": group_id}
        ).scalar_one()
        if applies:
            bind.execute(
                sa.text("UPDATE group_buy_receipt_applies SET order_id = :o WHERE group_buy_id = :g"),
                {"o": order_id, "g": group_id},
            )
        # A standard credit also stores the standard product id; only a special printing is an art.
        rows = bind.execute(
            sa.text(
                "SELECT l.user_id, l.card_id, "
                "CASE WHEN EXISTS (SELECT 1 FROM catalog_printings p WHERE p.card_id = l.card_id "
                "AND p.product_id = l.product_id AND p.is_special = 1) THEN l.product_id END AS art, "
                "SUM(l.qty) AS qty "
                "FROM group_buy_receipt_apply_lines l "
                "JOIN group_buy_receipt_applies a ON a.id = l.apply_id "
                "WHERE a.group_buy_id = :g AND l.qty > 0 "
                "GROUP BY l.user_id, l.card_id, art ORDER BY MIN(l.id)"
            ),
            {"g": group_id},
        ).all()
        line_ids: dict[tuple[str, int | None], int] = {}
        totals: dict[tuple[str, int | None], int] = {}
        for _user, card_id, art, qty in rows:
            totals[(card_id, art)] = totals.get((card_id, art), 0) + int(qty)
        for (card_id, art), qty in totals.items():
            bind.execute(
                sa.text(
                    "INSERT INTO group_buy_order_lines (order_id, card_id, product_id, qty_ordered) "
                    "VALUES (:o, :c, :p, :q)"
                ),
                {"o": order_id, "c": card_id, "p": art, "q": qty},
            )
            match = "product_id IS NULL" if art is None else "product_id = :p"
            line_ids[(card_id, art)] = bind.execute(
                sa.text(
                    "SELECT id FROM group_buy_order_lines "
                    f"WHERE order_id = :o AND card_id = :c AND {match}"
                ),
                {"o": order_id, "c": card_id, **({} if art is None else {"p": art})},
            ).scalar_one()
        for user_id, card_id, art, qty in rows:
            bind.execute(
                sa.text(
                    "INSERT INTO group_buy_order_allocations "
                    "(order_line_id, user_id, qty, qty_arrived) VALUES (:l, :u, :q, :q)"
                ),
                {"l": line_ids[(card_id, art)], "u": user_id, "q": int(qty)},
            )


def downgrade() -> None:
    op.drop_index(op.f("ix_group_buy_receipt_applies_order_id"), "group_buy_receipt_applies")
    with op.batch_alter_table(
        "group_buy_receipt_applies",
        naming_convention={"fk": "fk_%(table_name)s_%(column_0_name)s"},
    ) as batch:
        batch.drop_column("order_id")
    op.drop_table("group_buy_order_allocations")
    op.drop_table("group_buy_order_lines")
    op.drop_table("group_buy_orders")
