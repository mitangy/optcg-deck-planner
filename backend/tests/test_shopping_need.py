from __future__ import annotations

from app import services
from app.domain import parse_decklist
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def test_parse_decklist_qty_after_card_id():
    parsed = {c.card_id: c.needed for c in parse_decklist("OP01-001 3\nOP01-002 x4")}
    assert parsed["OP01-001"] == 3
    assert parsed["OP01-002"] == 4


def test_shopping_need_is_max_across_decks_not_sum(db):
    """Master shopping need = max copies among decks that use the card."""
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=1.0)
    add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=1.0)
    user = make_user(db, email="shop@example.com", name="Shopper", sub="sub-shop")
    add_deck_with_cards(db, user, "Deck A", {"OP01-001": 3, "OP01-002": 4})
    add_deck_with_cards(db, user, "Deck B", {"OP01-001": 2})

    shop = services.shopping_list(db, user)
    by_id = {item.card_id: item for item in shop.items}

    # Deck A needs 3, Deck B needs 2 → master need is 3 (not 5, not capped-sum 4).
    assert by_id["OP01-001"].need == 3
    assert by_id["OP01-001"].still_need == 3
    assert set(by_id["OP01-001"].used_in) == {"Deck A", "Deck B"}
    assert by_id["OP01-002"].need == 4

    set_owned(db, user, "OP01-001", 1)
    shop = services.shopping_list(db, user)
    luffy = next(i for i in shop.items if i.card_id == "OP01-001")
    assert luffy.need == 3
    assert luffy.still_need == 2


def test_shopping_need_respects_deck_filter_max(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=1.0)
    user = make_user(db, email="filter@example.com", name="Filter", sub="sub-filter")
    deck_a = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 3})
    deck_b = add_deck_with_cards(db, user, "Deck B", {"OP01-001": 4})

    only_a = services.shopping_list(db, user, deck_ids=[deck_a.id])
    assert only_a.items[0].need == 3

    only_b = services.shopping_list(db, user, deck_ids=[deck_b.id])
    assert only_b.items[0].need == 4

    both = services.shopping_list(db, user, deck_ids=[deck_a.id, deck_b.id])
    assert both.items[0].need == 4
