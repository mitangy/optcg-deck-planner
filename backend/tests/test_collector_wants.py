from __future__ import annotations

from fastapi.testclient import TestClient

from app.planner import decks as deck_svc, shopping as shopping_svc, owned as owned_svc
from app.social import friend_view
from app.core.auth import get_current_user
from app.core.db import get_db
from app.main import app
from app.planner.models import CollectorWant
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned

NAMI = "OP01-016"
ALT = 100
GOLD = 101
ZORO = "OP01-025"
ZORO_GOLD = 200


def _seed(db):
    user = make_user(db, email="coll@example.com", name="Coll", sub="sub-coll")
    add_catalog(db, NAMI, name="Nami", product_id=1, market=1.0)
    add_catalog(db, NAMI, name="Nami", product_id=ALT, market=20.0, special=True)
    add_catalog(db, NAMI, name="Nami Gold", product_id=GOLD, market=30.0, special=True)
    return user


def test_owned_gold_fills_collector_want_before_decks_1031(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {NAMI: 4})
    owned_svc.set_alt_owned(db, user, NAMI, ALT, 3)
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 1)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    item = shopping_svc.shopping_list(db, user).items[0]
    card = deck_svc.get_deck_detail(db, user, deck.id).cards[0]
    summary = deck_svc.list_decks(db, user)[0]

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
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 2)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    item = shopping_svc.shopping_list(db, user).items[0]

    assert item.alts_owned == 1
    assert item.still_need == 3
    assert item.collector_wants[0].have == 1


def test_collector_want_never_exceeds_what_is_owned_when_reserving_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 1)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 3)

    item = shopping_svc.shopping_list(db, user).items[0]

    assert item.alts_owned == 0  # the single gold is reserved, it cannot go negative
    assert item.still_need == 4
    assert item.collector_wants[0].have == 1
    assert item.collector_wants[0].still_need == 2


def test_picked_deck_alt_owned_only_via_collector_is_still_bought_1031(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {NAMI: 2})
    deck_svc.set_deck_card_printing(db, user, deck.id, NAMI, GOLD, 1)
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 1)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    item = shopping_svc.shopping_list(db, user).items[0]

    # The owned gold belongs to the collector want, so the deck's gold pick is still bought.
    assert item.still_need == 2
    assert item.remaining_cost == 30.0 + 1.0


def test_totals_include_collector_still_needed_and_cost_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 2)

    res = shopping_svc.shopping_list(db, user)
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
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    res = shopping_svc.shopping_list(db, user)

    assert [i.card_id for i in res.items] == [NAMI]
    item = res.items[0]
    assert (item.need, item.still_need, item.used_in) == (0, 0, [])
    assert item.collector_wants[0].still_need == 1
    assert res.cards_still_needed == 1
    assert res.remaining_market == 30.0


def test_include_collector_false_ignores_collector_wants_1031(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {NAMI: 4})
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 1)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    res = shopping_svc.shopping_list(db, user, include_collector=False)

    assert res.collector_copies == 0
    assert res.items[0].collector_wants == []
    assert res.items[0].still_need == 3


def test_printing_views_carry_collector_and_true_owned_1031(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {NAMI: 4})
    set_owned(db, user, NAMI, 1)
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 2)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    card = deck_svc.get_deck_detail(db, user, deck.id).cards[0]
    gold = next(p for p in card.alt_arts if p.product_id == GOLD)
    shop_gold = next(
        p for p in shopping_svc.shopping_list(db, user).items[0].alt_arts if p.product_id == GOLD
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


def test_collector_copies_are_not_tradeable_spares_for_friends_1032(db):
    user = _seed(db)
    # Own 2 gold, collector want 1, no deck: one is claimed by the collector want, one is spare.
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 2)
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)

    held, _ = friend_view.holdings(db, user)

    assert held[NAMI].owned_total == 2
    assert held[NAMI].reserved == 1
    assert held[NAMI].spare == 1

    # Own 1 gold and want 1: the only copy fills the collector want, nothing is spare.
    owned_svc.set_alt_owned(db, user, NAMI, GOLD, 1)
    held, _ = friend_view.holdings(db, user)

    assert held[NAMI].spare == 0


def _seed_two_decks(db):
    """Deck A holds Nami, deck B holds Zoro; each card has a gold collector want."""
    user = _seed(db)
    add_catalog(db, ZORO, name="Zoro", product_id=2, market=2.0)
    add_catalog(db, ZORO, name="Zoro Gold", product_id=ZORO_GOLD, market=50.0, special=True)
    deck_a = add_deck_with_cards(db, user, "A", {NAMI: 4})
    deck_b = add_deck_with_cards(db, user, "B", {ZORO: 3})
    owned_svc.set_collector_want(db, user, NAMI, GOLD, 1)
    owned_svc.set_collector_want(db, user, ZORO, ZORO_GOLD, 2)
    return user, deck_a, deck_b


def test_deck_filter_leaves_out_extra_copies_of_cards_not_in_the_selected_decks_1182(db):
    user, deck_a, _deck_b = _seed_two_decks(db)

    res = shopping_svc.shopping_list(db, user, deck_ids=[deck_a.id])

    assert [i.card_id for i in res.items] == [NAMI]
    assert res.collector_copies == 1
    assert res.remaining_market == 4 * 1.0 + 30.0  # Zoro's 2 x $50 gold is not counted


def test_deck_filter_still_counts_extra_copies_of_cards_in_the_selected_decks_1182(db):
    user, _deck_a, deck_b = _seed_two_decks(db)

    res = shopping_svc.shopping_list(db, user, deck_ids=[deck_b.id])

    item = res.items[0]
    assert [i.card_id for i in res.items] == [ZORO]
    assert [(w.product_id, w.still_need) for w in item.collector_wants] == [(ZORO_GOLD, 2)]
    assert res.remaining_market == 3 * 2.0 + 100.0


def test_unfiltered_list_counts_every_extra_copy_1182(db):
    user, _a, _b = _seed_two_decks(db)

    res = shopping_svc.shopping_list(db, user)

    assert sorted(i.card_id for i in res.items) == [NAMI, ZORO]
    assert res.remaining_market == 4 * 1.0 + 30.0 + 3 * 2.0 + 100.0


def test_hiding_added_cards_leaves_out_collector_only_cards_1182(db):
    user, _a, _b = _seed_two_decks(db)
    add_catalog(db, "OP01-001", name="Sanji", product_id=3, market=5.0)
    add_catalog(db, "OP01-001", name="Sanji Gold", product_id=300, market=40.0, special=True)
    shopping_svc.set_shopping_extra(db, user, "OP01-001", 1)
    owned_svc.set_collector_want(db, user, "OP01-001", 300, 1)

    shown = shopping_svc.shopping_list(db, user)
    hidden = shopping_svc.shopping_list(db, user, include_extras=False)

    assert "OP01-001" in [i.card_id for i in shown.items]
    assert sorted(i.card_id for i in hidden.items) == [NAMI, ZORO]
    assert hidden.remaining_market == shown.remaining_market - 5.0 - 40.0


def test_extra_copies_of_a_card_added_directly_count_when_a_deck_filter_is_on_1182(db):
    user, deck_a, _b = _seed_two_decks(db)
    shopping_svc.set_shopping_extra(db, user, ZORO, 1)

    res = shopping_svc.shopping_list(db, user, deck_ids=[deck_a.id])

    assert sorted(i.card_id for i in res.items) == [NAMI, ZORO]
    assert res.remaining_market == 4 * 1.0 + 30.0 + 2.0 + 100.0
