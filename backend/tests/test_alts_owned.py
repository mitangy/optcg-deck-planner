from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import services
from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import OwnedPrinting
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def _seed(db):
    user = make_user(db, email="alts@example.com", name="Alts", sub="sub-alts")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=1.0)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=20.0, special=True)
    return user


def test_alt_owned_lowers_still_need_on_deck_detail_625(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {"OP01-016": 4})
    set_owned(db, user, "OP01-016", 1)
    services.set_alt_owned(db, user, "OP01-016", 100, 2)

    card = services.get_deck_detail(db, user, deck.id).cards[0]

    assert card.owned == 1  # base stepper value stays base copies
    assert card.alts_owned == 2
    assert card.still_need == 1
    assert card.alt_arts[0].owned == 2


def test_alt_owned_lowers_shopping_still_need_and_cost_625(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {"OP01-016": 4})
    services.set_alt_owned(db, user, "OP01-016", 100, 3)

    item = services.shopping_list(db, user).items[0]

    assert item.alts_owned == 3
    assert item.still_need == 1
    assert item.remaining_cost == 1.0


def test_alt_owned_counts_in_deck_summary_owned_copies_625(db):
    user = _seed(db)
    add_deck_with_cards(db, user, "A", {"OP01-016": 4})
    services.set_alt_owned(db, user, "OP01-016", 100, 2)

    assert services.list_decks(db, user)[0].owned_copies == 2


def test_alt_owned_only_covers_what_earlier_leaders_leave_625(db):
    user = _seed(db)
    user.sum_across_leaders = True
    db.commit()
    add_catalog(db, "OP01-001", name="Luffy L", product_id=5, market=1.0)
    add_catalog(db, "OP02-001", name="Whitebeard L", product_id=6, market=1.0)
    d1 = add_deck_with_cards(db, user, "A", {"OP01-001": 1, "OP01-016": 3})
    d2 = add_deck_with_cards(db, user, "B", {"OP02-001": 1, "OP01-016": 3})
    d1.leader_card_id, d2.leader_card_id = "OP01-001", "OP02-001"
    db.commit()
    services.set_alt_owned(db, user, "OP01-016", 100, 4)

    first = next(c for c in services.get_deck_detail(db, user, d1.id).cards if c.card_id == "OP01-016")
    second = next(c for c in services.get_deck_detail(db, user, d2.id).cards if c.card_id == "OP01-016")

    assert first.still_need == 0
    assert second.still_need == 2  # 4 owned alts - 3 taken by the earlier leader


def test_set_alt_owned_rejects_non_special_printing_625(db):
    user = _seed(db)
    with pytest.raises(ValueError):
        services.set_alt_owned(db, user, "OP01-016", 1, 1)
    assert db.query(OwnedPrinting).count() == 0


def test_set_alt_owned_zero_removes_row_625(db):
    user = _seed(db)
    services.set_alt_owned(db, user, "OP01-016", 100, 2)
    services.set_alt_owned(db, user, "OP01-016", 100, 0)

    assert db.query(OwnedPrinting).count() == 0


def test_alt_owned_endpoint_sets_qty_and_rejects_base_625(db):
    user = _seed(db)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        client = TestClient(app)
        ok = client.put("/owned/op01-016/printings/100", json={"qty": 2})
        assert ok.status_code == 200
        assert ok.json() == {"card_id": "OP01-016", "product_id": 100, "qty": 2}
        bad = client.put("/owned/OP01-016/printings/1", json={"qty": 1})
        assert bad.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_collection_value_counts_alt_copies_at_alt_price_625(db):
    user = _seed(db)
    set_owned(db, user, "OP01-016", 2)
    services.set_alt_owned(db, user, "OP01-016", 100, 1)

    col = services.owned_collection(db, user)

    assert col.items[0].value == 22.0
    assert col.items[0].alts_owned == 1
    assert col.total_copies == 3
    assert col.total_value == 22.0


def test_collection_lists_cards_owned_only_as_alts_625(db):
    user = _seed(db)
    services.set_alt_owned(db, user, "OP01-016", 100, 2)

    col = services.owned_collection(db, user)

    assert [i.card_id for i in col.items] == ["OP01-016"]
    assert col.items[0].owned == 0
    assert col.items[0].value == 40.0


def test_reset_deck_owned_also_clears_alt_copies_625(db):
    user = _seed(db)
    deck = add_deck_with_cards(db, user, "A", {"OP01-016": 4})
    set_owned(db, user, "OP01-016", 1)
    services.set_alt_owned(db, user, "OP01-016", 100, 2)

    _count, detail = services.reset_deck_owned(db, user, deck.id)

    assert detail.cards[0].still_need == 4
    assert detail.cards[0].alts_owned == 0
