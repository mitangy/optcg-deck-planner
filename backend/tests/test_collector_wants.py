from __future__ import annotations

from fastapi.testclient import TestClient

from app import services
from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import CollectorWant
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned

NAMI = "OP01-016"
ALT = 100
GOLD = 101


def _seed(db):
    user = make_user(db, email="coll@example.com", name="Coll", sub="sub-coll")
    add_catalog(db, NAMI, name="Nami", product_id=1, market=1.0)
    add_catalog(db, NAMI, name="Nami", product_id=ALT, market=20.0, special=True)
    add_catalog(db, NAMI, name="Nami Gold", product_id=GOLD, market=30.0, special=True)
    return user


def test_owned_gold_fills_collector_want_before_decks_1031(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {NAMI: 4})
    services.set_alt_owned(db, user, NAMI, ALT, 3)
    services.set_alt_owned(db, user, NAMI, GOLD, 1)
    services.set_collector_want(db, user, NAMI, GOLD, 1)

    item = services.shopping_list(db, user).items[0]
    card = services.get_deck_detail(db, user, deck.id).cards[0]
    summary = services.list_decks(db, user)[0]

    assert item.alts_owned == 3
    assert item.still_need == 1
    assert item.remaining_cost == 1.0
    assert card.alts_owned == 3
    assert card.still_need == 1
    assert summary.owned_copies == 3
    line = item.collector_wants[0]
    assert (line.product_id, line.want, line.have, line.still_need) == (GOLD, 1, 1, 0)
    assert line.remaining_cost == 0.0


def test_only_owned_copies_beyond_the_collector_want_count_for_decks_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    services.set_alt_owned(db, user, NAMI, GOLD, 2)
    services.set_collector_want(db, user, NAMI, GOLD, 1)

    item = services.shopping_list(db, user).items[0]

    assert item.alts_owned == 1
    assert item.still_need == 3
    assert item.collector_wants[0].have == 1


def test_collector_want_never_exceeds_what_is_owned_when_reserving_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    services.set_alt_owned(db, user, NAMI, GOLD, 1)
    services.set_collector_want(db, user, NAMI, GOLD, 3)

    item = services.shopping_list(db, user).items[0]

    assert item.alts_owned == 0  # the single gold is reserved, it cannot go negative
    assert item.still_need == 4
    assert item.collector_wants[0].have == 1
    assert item.collector_wants[0].still_need == 2


def test_picked_deck_alt_owned_only_via_collector_is_still_bought_1031(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {NAMI: 2})
    services.set_deck_card_printing(db, user, deck.id, NAMI, GOLD, 1)
    services.set_alt_owned(db, user, NAMI, GOLD, 1)
    services.set_collector_want(db, user, NAMI, GOLD, 1)

    item = services.shopping_list(db, user).items[0]

    # The owned gold belongs to the collector want, so the deck's gold pick is still bought.
    assert item.still_need == 2
    assert item.remaining_cost == 30.0 + 1.0


def test_totals_include_collector_still_needed_and_cost_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    services.set_collector_want(db, user, NAMI, GOLD, 2)

    res = services.shopping_list(db, user)
    item = res.items[0]

    assert item.need == 4  # collector copies never raise a deck's need
    assert item.still_need == 4
    line = item.collector_wants[0]
    assert (line.label, line.market_price, line.still_need, line.remaining_cost) == (
        "Nami Gold (Alt)",
        30.0,
        2,
        60.0,
    )
    assert res.collector_copies == 2
    assert res.cards_still_needed == 6
    assert res.remaining_market == 64.0


def test_collector_only_card_still_gets_a_parent_row_1031(db):
    user = _seed(db)
    services.set_collector_want(db, user, NAMI, GOLD, 1)

    res = services.shopping_list(db, user)

    assert [i.card_id for i in res.items] == [NAMI]
    item = res.items[0]
    assert (item.need, item.still_need, item.used_in) == (0, 0, [])
    assert item.collector_wants[0].still_need == 1
    assert res.cards_still_needed == 1
    assert res.remaining_market == 30.0


def test_include_collector_false_ignores_collector_wants_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    services.set_alt_owned(db, user, NAMI, GOLD, 1)
    services.set_collector_want(db, user, NAMI, GOLD, 1)

    res = services.shopping_list(db, user, include_collector=False)

    assert res.collector_copies == 0
    assert res.items[0].collector_wants == []
    assert res.items[0].still_need == 3


def test_printing_views_carry_collector_and_true_owned_1031(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {NAMI: 4})
    set_owned(db, user, NAMI, 1)
    services.set_alt_owned(db, user, NAMI, GOLD, 2)
    services.set_collector_want(db, user, NAMI, GOLD, 1)

    card = services.get_deck_detail(db, user, deck.id).cards[0]
    gold = next(p for p in card.alt_arts if p.product_id == GOLD)
    shop_gold = next(
        p for p in services.shopping_list(db, user).items[0].alt_arts if p.product_id == GOLD
    )

    assert (gold.owned, gold.collector) == (2, 1)
    assert (shop_gold.owned, shop_gold.collector) == (2, 1)
    assert card.collector_want == 1
    assert card.still_need == 2  # 4 - 1 base - 1 gold left for decks


def test_collector_endpoint_sets_rejects_base_and_zero_deletes_1031(db):
    user = _seed(db)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        client = TestClient(app)
        ok = client.put(f"/cards/{NAMI.lower()}/collector/{GOLD}", json={"qty": 2})
        assert ok.status_code == 200
        assert ok.json() == {"card_id": NAMI, "product_id": GOLD, "qty": 2}
        assert db.query(CollectorWant).one().qty == 2
        assert client.put(f"/cards/{NAMI}/collector/1", json={"qty": 1}).status_code == 400
        assert client.put(f"/cards/{NAMI}/collector/{GOLD}", json={"qty": 10}).status_code == 422
        gone = client.put(f"/cards/{NAMI}/collector/{GOLD}", json={"qty": 0})
        assert gone.json()["qty"] == 0
        assert db.query(CollectorWant).count() == 0
    finally:
        app.dependency_overrides.clear()
