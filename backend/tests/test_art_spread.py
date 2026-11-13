"""One of each art (#1292): spread a card's copies evenly over the base art and every alt."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.errors import Invalid
from app.core.models import User
from app.planner import owned as owned_svc, shopping as shopping_svc
from app.planner.decks import get_deck_detail, set_deck_card_printing, spread_deck_card_arts
from app.planner.models import DeckCardPrinting, ShoppingExtraPrinting
from app.planner.printings import even_art_split
from tests.conftest import add_catalog, add_deck_with_cards, make_user
from tests.test_abuse_limits import _signed_in, client  # noqa: F401  (fixture)

CARD = "OP18-093"


def _card(db, email):
    """A user and a card with a base art (1) and two alts; 300 is cheaper, so it is listed first."""
    add_catalog(db, CARD, name="Sleeptids", product_id=1, market=1.0)
    add_catalog(db, CARD, name="Sleeptids", product_id=200, market=10.0, special=True)
    add_catalog(db, CARD, name="Sleeptids", product_id=300, market=5.0, special=True)
    return make_user(db, email=email, name="S", sub="sub-" + email)


def _wants(db, deck_id):
    rows = db.scalars(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id, DeckCardPrinting.card_id == CARD
        )
    ).all()
    return {r.product_id: r.qty for r in rows}


@pytest.mark.parametrize(
    "needed,alts,expected",
    [
        (8, 2, [3, 2]),  # base 3, alt1 3, alt2 2
        (3, 3, [1, 1, 0]),  # remainder goes base first, then alts in order
        (2, 2, [1, 0]),
        (0, 2, [0, 0]),
        (5, 0, []),
    ],
)
def test_even_art_split_gives_the_remainder_to_base_then_alts_in_order_1292(needed, alts, expected):
    assert even_art_split(needed, alts) == expected


def test_spread_deck_card_splits_8_copies_3_3_2_in_ui_order_1292(db):
    user = _card(db, "a@t.com")
    deck = add_deck_with_cards(db, user, "A", {CARD: 8})
    detail = spread_deck_card_arts(db, user, deck.id, CARD.lower())
    # The UI lists the cheaper alt (300) first and base takes the rest.
    assert [(a.product_id, a.wanted) for a in detail.cards[0].alt_arts] == [(300, 3), (200, 2)]
    assert _wants(db, deck.id) == {300: 3, 200: 2}


def test_spread_deck_card_with_fewer_copies_than_arts_fills_listed_order_1292(db):
    user = _card(db, "b@t.com")
    deck = add_deck_with_cards(db, user, "A", {CARD: 2})
    spread_deck_card_arts(db, user, deck.id, CARD)
    assert _wants(db, deck.id) == {300: 1}


def test_spread_replaces_uneven_wants_instead_of_clamping_against_them_1292(db):
    user = _card(db, "c@t.com")
    deck = add_deck_with_cards(db, user, "A", {CARD: 8})
    set_deck_card_printing(db, user, deck.id, CARD, 200, 8)
    spread_deck_card_arts(db, user, deck.id, CARD)
    assert _wants(db, deck.id) == {300: 3, 200: 2}
    assert get_deck_detail(db, user, deck.id).cards[0].needed == 8


def test_spread_rejects_a_card_without_alt_arts_1292(db):
    user = make_user(db, email="d@t.com", name="D", sub="d")
    add_catalog(db, "OP01-001", name="Luffy", product_id=5, market=1.0)
    deck = add_deck_with_cards(db, user, "A", {"OP01-001": 4})
    with pytest.raises(Invalid, match="no alt arts"):
        spread_deck_card_arts(db, user, deck.id, "OP01-001")


def test_spread_across_decks_splits_each_decks_own_need_1292(db):
    user = _card(db, "e@t.com")
    d1 = add_deck_with_cards(db, user, "A", {CARD: 8})
    d2 = add_deck_with_cards(db, user, "B", {CARD: 2})
    assert owned_svc.spread_user_card_arts(db, user, CARD) == 2
    assert _wants(db, d1.id) == {300: 3, 200: 2}
    assert _wants(db, d2.id) == {300: 1}


def test_spread_across_decks_leaves_decks_outside_the_filter_alone_1292(db):
    user = _card(db, "f@t.com")
    d1 = add_deck_with_cards(db, user, "A", {CARD: 8})
    d2 = add_deck_with_cards(db, user, "B", {CARD: 8})
    set_deck_card_printing(db, user, d2.id, CARD, 200, 4)
    assert owned_svc.spread_user_card_arts(db, user, CARD, deck_ids=[d1.id]) == 1
    assert _wants(db, d1.id) == {300: 3, 200: 2}
    assert _wants(db, d2.id) == {200: 4}


def test_spread_across_decks_also_splits_a_master_shopping_extra_1292(db):
    user = _card(db, "g@t.com")
    shopping_svc.set_shopping_extra(db, user, CARD, 8)
    assert owned_svc.spread_user_card_arts(db, user, CARD) == 0
    rows = db.scalars(
        select(ShoppingExtraPrinting).where(ShoppingExtraPrinting.card_id == CARD)
    ).all()
    assert {r.product_id: r.qty for r in rows} == {300: 3, 200: 2}


def test_spread_http_routes_are_not_taken_for_a_product_id_1292(client):  # noqa: F811
    c, SessionLocal = client
    _signed_in(c, SessionLocal)
    with SessionLocal() as db:
        user = db.scalar(select(User))
        add_catalog(db, CARD, name="Sleeptids", product_id=1, market=1.0)
        add_catalog(db, CARD, name="Sleeptids", product_id=200, market=10.0, special=True)
        deck = add_deck_with_cards(db, user, "A", {CARD: 4})
        deck_id = deck.id

    res = c.put(f"/decks/{deck_id}/cards/{CARD}/printings/spread")
    assert res.status_code == 200
    assert res.json()["cards"][0]["alt_arts"][0]["wanted"] == 2
    res = c.put(f"/cards/{CARD}/printings/spread", json={"deck_ids": [deck_id]})
    assert res.json() == {"card_id": CARD, "decks_updated": 1}
    assert c.put(f"/cards/{CARD}/printings/spread").json()["decks_updated"] == 1
