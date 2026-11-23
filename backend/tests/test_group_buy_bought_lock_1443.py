"""Cards already in a seller order stay on what was bought, whatever Shopping picks say (#1443)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuyOrderLine
from app.group_buy.schemas import GroupBuyOrderCreate, GroupBuyOrderLinesUpdate
from app.planner import decks as deck_svc
from app.planner import owned as owned_svc
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned
from tests.friend_support import as_user, client, make_user as make_http_user  # noqa: F401

ORDER = "AB12CD34-EF5678-90ABC"
ORDER_2 = "11223344-556677-88999"
PARALLEL = "Monkey D. Luffy (001) (Parallel)"
BASE = "Monkey D. Luffy (001)"


def _history(*orders: tuple[str, list[tuple[str, int, str]]]) -> str:
    """An Order History page: (order number, [(item name, qty, "$price")])."""
    blocks = []
    for number, items in orders:
        rows = [
            "ORDER DATE",
            "November 1, 2026",
            "ORDER NUMBER",
            number,
            "SHIPPED AND SOLD BY",
            "Sample Seller",
            "SHIPPED WITHOUT TRACKING",
            "ITEMS DETAILS PRICE QUANTITY",
        ]
        for name, qty, price in items:
            rows += [name, "Test Set", "Rarity: SR", f"Condition: Near Mint {price} {qty}"]
        blocks.append("\n".join(rows))
    return "\n".join(blocks)


def _group(db):
    """Host and friend each need 2 Luffy; the friend wants the Parallel art. Locked, nothing ordered."""
    add_catalog(db, "OP01-001", name="Monkey D. Luffy (001)", product_id=1001, market=2.5)
    add_catalog(db, "OP01-001", name="Monkey D. Luffy (001) (Parallel)", product_id=1009, market=9.0, special=True)
    add_catalog(db, "OP01-001", name="Monkey D. Luffy (001) (Manga)", product_id=1007, market=300.0, special=True)
    add_catalog(db, "OP01-002", name="Roronoa Zoro", product_id=2001, market=4.0)
    add_catalog(db, "OP01-002", name="Roronoa Zoro (Parallel)", product_id=2009, market=20.0, special=True)
    host = make_user(db, email="h1443@example.com", name="Host", sub="sub-h1443")
    friend = make_user(db, email="f1443@example.com", name="Friend", sub="sub-f1443")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 2, "OP01-002": 1})
    friend_deck = add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 2})
    for u in (host, friend):
        set_owned(db, u, "OP01-001", 0)
    set_owned(db, host, "OP01-002", 0)
    deck_svc.set_deck_card_printing(db, friend, friend_deck.id, "OP01-001", 1009, 2)
    created = group_buy.create_group_buy(db, host, "Locked")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    return host, friend, created.id


def _line(db, user, gid, card_id="OP01-001"):
    return next(l for l in group_buy.get_group_buy(db, user, gid).lines if l.card_id == card_id)


def _pick_the_pricey_manga(db, host, friend):
    """The members move their live Shopping picks to the $300 art after the buy."""
    owned_svc.set_display_art(db, host, "OP01-001", 1007)
    owned_svc.set_user_card_printing(db, friend, "OP01-001", 1007, 2)
    owned_svc.set_display_art(db, friend, "OP01-001", 1007)


def test_ordered_card_shows_the_bought_art_and_paid_price_not_live_picks_1443(db):
    host, friend, gid = _group(db)
    page = _history((ORDER, [(PARALLEL, 4, "$7.00")]))
    group_buy.import_order_history(db, host, gid, page, [ORDER])

    before = _line(db, host, gid)
    _pick_the_pricey_manga(db, host, friend)
    after = _line(db, host, gid)

    for line in (before, after):
        assert line.display_art == 1009
        assert line.bought_each == pytest.approx(7.0)
        assert line.remaining_cost == pytest.approx(28.0)
        assert [(b.product_id, b.qty, b.unit_price, b.paid) for b in line.bought_arts] == [(1009, 4, 7.0, True)]
        assert any(a.product_id == 1009 for a in line.alt_arts)
    assert _line(db, friend, gid).bought_arts[0].my_qty == 2


def test_unpaid_bought_copies_use_the_bought_arts_market_price_1443(db):
    host, friend, gid = _group(db)
    group_buy.add_order(
        db,
        host,
        gid,
        GroupBuyOrderCreate(order_number=ORDER, lines=[{"card_id": "OP01-001", "product_id": 1009, "qty": 4}]),
    )
    _pick_the_pricey_manga(db, host, friend)

    line = _line(db, host, gid)

    assert line.display_art == 1009
    assert line.bought_each == pytest.approx(9.0)
    assert line.remaining_cost == pytest.approx(36.0)
    assert [(b.unit_price, b.paid) for b in line.bought_arts] == [(9.0, False)]


def test_mixed_arts_show_the_one_bought_most_and_average_the_price_1443(db):
    host, friend, gid = _group(db)
    page = _history((ORDER, [(PARALLEL, 3, "$7.00"), (BASE, 1, "$2.00")]))
    group_buy.import_order_history(db, host, gid, page, [ORDER])
    _pick_the_pricey_manga(db, host, friend)

    line = _line(db, host, gid)

    assert line.display_art == 1009
    assert line.bought_each == pytest.approx(5.75)
    assert line.remaining_cost == pytest.approx(23.0)
    assert [(b.product_id, b.qty) for b in line.bought_arts] == [(None, 1), (1009, 3)]


def test_copies_not_in_an_order_yet_are_still_priced_the_live_way_1443(db):
    host, friend, gid = _group(db)
    page = _history((ORDER, [(PARALLEL, 2, "$7.00")]))
    group_buy.import_order_history(db, host, gid, page, [ORDER])
    open_before = _line(db, host, gid)

    owned_svc.set_user_card_printing(db, host, "OP01-001", 1007, 1)
    open_after = _line(db, host, gid)

    # Two bought at $7.00; the other two are the live buys, so the host's new Manga pick shows up there only.
    assert open_before.not_ordered == 2
    assert open_before.remaining_cost == pytest.approx(14.0 + 2 * 2.5)
    assert open_after.remaining_cost == pytest.approx(14.0 + 300.0 + 2.5)
    assert open_after.display_art == 1009


def test_a_card_with_nothing_ordered_still_follows_live_picks_1443(db):
    host, _friend, gid = _group(db)
    group_buy.import_order_history(db, host, gid, _history((ORDER, [(BASE, 1, "$2.00")])), [ORDER])

    owned_svc.set_display_art(db, host, "OP01-002", 2009)

    zoro = _line(db, host, gid, "OP01-002")
    assert zoro.display_art == 2009
    assert zoro.bought_arts == [] and zoro.bought_each is None
    assert zoro.remaining_cost == pytest.approx(4.0)


def test_order_history_import_stores_the_price_paid_per_copy_1443(db):
    host, _friend, gid = _group(db)
    page = _history((ORDER, [(PARALLEL, 1, "$6.00"), (PARALLEL, 3, "$8.00"), (BASE, 2, "$1,001.50")]))

    done = group_buy.import_order_history(db, host, gid, page, [ORDER])

    rows = {l.product_id: l.unit_price for l in db.scalars(select(GroupBuyOrderLine))}
    assert rows[1009] == pytest.approx(7.5)  # (1 x 6.00 + 3 x 8.00) / 4
    assert rows[None] == pytest.approx(1001.5)
    out = {l.product_id: l.unit_price for l in done.detail.orders[0].lines}
    assert out == {1009: pytest.approx(7.5), None: pytest.approx(1001.5)}


def test_editing_an_orders_items_keeps_the_price_paid_for_the_same_art_1443(db):
    host, _friend, gid = _group(db)
    done = group_buy.import_order_history(db, host, gid, _history((ORDER, [(PARALLEL, 2, "$7.00")])), [ORDER])
    order = done.detail.orders[0]

    group_buy.set_order_lines(
        db,
        host,
        gid,
        order.id,
        GroupBuyOrderLinesUpdate(
            expected_version=order.version, lines=[{"card_id": "OP01-001", "product_id": 1009, "qty": 3}]
        ),
    )

    assert _line(db, host, gid).bought_arts[0].qty == 3
    assert _line(db, host, gid).bought_each == pytest.approx(7.0)
