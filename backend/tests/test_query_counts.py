from __future__ import annotations

from sqlalchemy import event

from app.group_buy import service as group_buy
from app.planner import shopping
from tests.conftest import add_catalog, add_deck_with_cards, make_user


def _seed(db):
    user = make_user(db, email="qc@example.com", name="QC", sub="sub-qc")
    for i in range(5):
        add_catalog(db, f"OP01-{i + 1:03d}", name=f"Card {i}", product_id=100 + i, market=1.0)
    add_deck_with_cards(db, user, "Deck", {f"OP01-{i + 1:03d}": 2 for i in range(5)})
    return user


def test_shopping_list_does_not_reload_catalog_rows_for_alt_arts_1346(db):
    user = _seed(db)
    statements: list[str] = []
    engine = db.get_bind()

    def record(conn, cursor, statement, params, context, executemany):  # noqa: ARG001
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        shopping.shopping_list(db, user)
    finally:
        event.remove(engine, "before_cursor_execute", record)

    # 14 before the alt-art lookup took the catalog rows and primary ids from the caller.
    assert len(statements) <= 12


def test_group_buy_detail_builds_each_members_list_once_1346(db, monkeypatch):
    host = _seed(db)
    friend = make_user(db, email="qc2@example.com", name="QC2", sub="sub-qc2")
    created = group_buy.create_group_buy(db, host, "Pool")
    group_buy.join_group_buy(db, friend, created.invite_token)

    built: list[int] = []
    real = group_buy._compute_member_shopping

    def counting(db_, member):
        built.append(member.user_id)
        return real(db_, member)

    monkeypatch.setattr(group_buy, "_compute_member_shopping", counting)
    group_buy.get_group_buy(db, host, created.id)
    assert sorted(built) == sorted([host.id, friend.id])
