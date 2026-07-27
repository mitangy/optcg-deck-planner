from __future__ import annotations

import pytest

from app.services import (
    allocate_still_need_buys,
    clamp_alt_want_map,
    get_deck_detail,
    remaining_cost_for_buys,
    set_deck_card_printing,
    shopping_list,
    upsert_deck_card,
)
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def test_clamp_alt_want_map_reduces_largest_first():
    assert clamp_alt_want_map({10: 3, 20: 2}, 4) == {10: 2, 20: 2}
    clamped = clamp_alt_want_map({10: 3, 20: 2}, 2)
    assert clamped == {20: 2}  # largest (10:3) reduced to 0 and dropped
    assert clamp_alt_want_map({10: 1}, 0) == {}
    assert clamp_alt_want_map({10: 1, 20: 1}, 5) == {10: 1, 20: 1}


def test_allocate_still_need_buys_alts_then_standard():
    buys = allocate_still_need_buys(
        4,
        [(100, 2, 18.0), (200, 1, 90.0)],
        standard_product_id=1,
        standard_price=1.2,
    )
    assert buys == [(100, 2, 18.0), (200, 1, 90.0), (1, 1, 1.2)]
    assert remaining_cost_for_buys(buys) == round(2 * 18 + 90 + 1.2, 2)

    buys2 = allocate_still_need_buys(
        1,
        [(100, 2, 18.0)],
        standard_product_id=1,
        standard_price=1.2,
    )
    assert buys2 == [(100, 1, 18.0)]


def test_set_alt_want_capped_by_need(db):
    user = make_user(db, email="a@t.com", name="A", sub="a")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=1.2)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=18.0, special=True)
    add_catalog(db, "OP01-016", name="Nami", product_id=200, market=90.0, special=True)
    deck = add_deck_with_cards(db, user, "Blue", {"OP01-016": 4})

    detail = set_deck_card_printing(db, user, deck.id, "OP01-016", 100, 2)
    alts = {a.product_id: a.wanted for a in detail.cards[0].alt_arts}
    assert alts[100] == 2
    assert alts[200] == 0

    detail = set_deck_card_printing(db, user, deck.id, "OP01-016", 200, 2)
    alts = {a.product_id: a.wanted for a in detail.cards[0].alt_arts}
    assert alts[100] == 2 and alts[200] == 2

    with pytest.raises(ValueError, match="cannot exceed Need"):
        set_deck_card_printing(db, user, deck.id, "OP01-016", 100, 3)


def test_lowering_need_auto_clamps_alt_wants(db):
    user = make_user(db, email="b@t.com", name="B", sub="b")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=1.2)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=18.0, special=True)
    add_catalog(db, "OP01-016", name="Nami", product_id=200, market=90.0, special=True)
    deck = add_deck_with_cards(db, user, "Blue", {"OP01-016": 4})
    set_deck_card_printing(db, user, deck.id, "OP01-016", 100, 2)
    set_deck_card_printing(db, user, deck.id, "OP01-016", 200, 2)

    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 3, confirm_oversize=True)
    alts = {a.product_id: a.wanted for a in detail.cards[0].alt_arts}
    assert sum(alts.values()) == 3
    # Largest-first: both were 2; product_id 100 reduced first among equals? sort (-qty, pid)
    # Both qty 2, so lower product_id 100 is first in sort (-2, 100) before (-2, 200)
    assert alts[100] == 1
    assert alts[200] == 2

    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 0, confirm_oversize=True)
    assert all(c.card_id != "OP01-016" for c in detail.cards)
    # Re-add card — prior printings cleared
    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 2, confirm_oversize=True)
    assert all(a.wanted == 0 for a in detail.cards[0].alt_arts)


def test_shopping_merges_max_alt_wants_and_prices_alts(db):
    user = make_user(db, email="c@t.com", name="C", sub="c")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=1.2)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=18.0, special=True)
    d1 = add_deck_with_cards(db, user, "A", {"OP01-016": 4})
    d2 = add_deck_with_cards(db, user, "B", {"OP01-016": 2})
    set_deck_card_printing(db, user, d1.id, "OP01-016", 100, 2)
    set_deck_card_printing(db, user, d2.id, "OP01-016", 100, 1)

    shop = shopping_list(db, user)
    item = next(i for i in shop.items if i.card_id == "OP01-016")
    assert item.need == 4
    assert item.still_need == 4
    aa = next(a for a in item.alt_arts if a.product_id == 100)
    assert aa.wanted == 2  # max across decks
    # 2×AA + 2×standard
    assert item.remaining_cost == round(2 * 18.0 + 2 * 1.2, 2)

    set_owned(db, user, "OP01-016", 3)
    shop = shopping_list(db, user)
    item = next(i for i in shop.items if i.card_id == "OP01-016")
    assert item.still_need == 1
    assert item.remaining_cost == 18.0  # remaining 1 allocated to AA want


def test_get_deck_detail_includes_wanted(db):
    user = make_user(db, email="d@t.com", name="D", sub="d")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=1.2)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=18.0, special=True)
    deck = add_deck_with_cards(db, user, "Blue", {"OP01-016": 4})
    set_deck_card_printing(db, user, deck.id, "OP01-016", 100, 1)
    detail = get_deck_detail(db, user, deck.id)
    assert detail.cards[0].alt_arts[0].wanted == 1
