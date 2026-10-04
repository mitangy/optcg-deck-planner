from __future__ import annotations

from app import services
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def test_collection_value_is_copies_times_market_price_PRNUM(db):
    """Total value adds owned × market per card; unpriced cards are counted, not valued."""
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=10.0)
    add_catalog(db, "OP01-003", name="Nami", product_id=3, market=None)
    user = make_user(db, email="own@example.com", name="Owner", sub="sub-own")
    set_owned(db, user, "OP01-001", 3)
    set_owned(db, user, "OP01-002", 2)
    set_owned(db, user, "OP01-003", 1)

    col = services.owned_collection(db, user)
    by_id = {i.card_id: i for i in col.items}

    assert by_id["OP01-001"].value == 7.5
    assert by_id["OP01-002"].value == 20.0
    assert by_id["OP01-003"].value is None
    assert col.total_value == 27.5
    assert col.total_copies == 6
    assert col.unpriced_cards == 1


def test_collection_skips_zero_owned_and_lists_decks_PRNUM(db):
    """Cards set back to 0 owned leave the collection; used_in names the decks with the card."""
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=1.0)
    add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=50.0)
    user = make_user(db, email="zero@example.com", name="Zero", sub="sub-zero")
    add_deck_with_cards(db, user, "Deck A", {"OP01-001": 4})
    add_deck_with_cards(db, user, "Deck B", {"OP01-001": 2, "OP01-002": 1})
    set_owned(db, user, "OP01-001", 4)
    set_owned(db, user, "OP01-002", 0)

    col = services.owned_collection(db, user)

    assert [i.card_id for i in col.items] == ["OP01-001"]
    assert col.unique_cards == 1
    assert col.items[0].used_in == ["Deck A", "Deck B"]
