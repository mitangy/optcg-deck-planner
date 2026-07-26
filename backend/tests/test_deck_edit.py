from __future__ import annotations

import pytest

from app.domain import (
    DON_DECK_LIMIT,
    MAIN_DECK_LIMIT,
    deck_size_counts,
    is_don_type,
    is_leader_type,
)
from app.models import CatalogCard
from app.services import DeckOversizeError, get_deck_detail, search_catalog, upsert_deck_card
from tests.conftest import add_catalog, add_deck_with_cards, make_user


def test_don_and_leader_type_helpers():
    assert is_don_type("DON!!")
    assert is_don_type("Don")
    assert not is_don_type("Character")
    assert is_leader_type("Leader")
    assert is_leader_type("", "L")
    assert not is_leader_type("Character", "R")


def test_deck_size_counts_split_don(db):
    db.add(
        CatalogCard(
            card_id="OP01-001",
            name="Leader",
            card_type="Leader",
            rarity="L",
        )
    )
    db.add(
        CatalogCard(
            card_id="OP01-016",
            name="Nami",
            card_type="Character",
            rarity="R",
        )
    )
    db.add(
        CatalogCard(
            card_id="DON-001",
            name="DON!!",
            card_type="DON!!",
            rarity="DON!!",
        )
    )
    db.commit()
    from sqlalchemy import select

    catalog = {c.card_id: c for c in db.scalars(select(CatalogCard)).all()}
    main, don = deck_size_counts(
        [("OP01-001", 1), ("OP01-016", 4), ("DON-001", 10)],
        catalog,
    )
    assert main == 5
    assert don == 10


def test_search_catalog_by_name_color_and_type(db):
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.5)
    row = db.get(CatalogCard, "OP01-016")
    assert row is not None
    row.color = "Blue"
    row.card_type = "Character"
    db.add(
        CatalogCard(
            card_id="DON-001",
            name="DON!! Card",
            card_type="DON!!",
            color="",
            market_price=0.1,
        )
    )
    db.commit()

    by_name = search_catalog(db, q="nami")
    assert [c.card_id for c in by_name] == ["OP01-016"]

    by_color = search_catalog(db, color="Blue")
    assert [c.card_id for c in by_color] == ["OP01-016"]

    by_type = search_catalog(db, card_type="DON")
    assert [c.card_id for c in by_type] == ["DON-001"]


def test_upsert_deck_card_add_and_remove(db):
    user = make_user(db, email="a@test", name="A", sub="sub-a")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.0)
    deck = add_deck_with_cards(db, user, "Test", {"OP01-001": 1})

    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 4)
    assert any(c.card_id == "OP01-016" and c.needed == 4 for c in detail.cards)

    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 0)
    assert all(c.card_id != "OP01-016" for c in detail.cards)


def test_upsert_requires_confirm_over_main_limit(db):
    user = make_user(db, email="b@test", name="B", sub="sub-b")
    for i in range(MAIN_DECK_LIMIT):
        cid = f"OP99-{i:03d}"
        add_catalog(db, cid, name=f"Card {i}", product_id=100 + i, market=1.0)
    add_catalog(db, "OP99-999", name="Extra", product_id=999, market=1.0)

    starter = {f"OP99-{i:03d}": 1 for i in range(MAIN_DECK_LIMIT)}
    deck = add_deck_with_cards(db, user, "Full", starter)

    with pytest.raises(DeckOversizeError) as exc:
        upsert_deck_card(db, user, deck.id, "OP99-999", 1)
    assert exc.value.current == MAIN_DECK_LIMIT
    assert exc.value.projected == MAIN_DECK_LIMIT + 1

    detail = upsert_deck_card(
        db, user, deck.id, "OP99-999", 1, confirm_oversize=True
    )
    assert detail.main_cards == MAIN_DECK_LIMIT + 1

    # Already over the limit — further adds should not require re-confirm.
    add_catalog(db, "OP99-998", name="Another", product_id=998, market=1.0)
    detail = upsert_deck_card(db, user, deck.id, "OP99-998", 1)
    assert detail.main_cards == MAIN_DECK_LIMIT + 2

    # Drop back to the limit, then crossing again requires confirm.
    detail = upsert_deck_card(db, user, deck.id, "OP99-999", 0)
    detail = upsert_deck_card(db, user, deck.id, "OP99-998", 0)
    assert detail.main_cards == MAIN_DECK_LIMIT
    with pytest.raises(DeckOversizeError):
        upsert_deck_card(db, user, deck.id, "OP99-999", 1)


def test_don_deck_hard_cap(db):
    user = make_user(db, email="c@test", name="C", sub="sub-c")
    for i in range(DON_DECK_LIMIT):
        cid = f"DON-{i:03d}"
        db.add(
            CatalogCard(
                card_id=cid,
                name=f"DON {i}",
                card_type="DON!!",
                market_price=0.1,
            )
        )
    db.add(
        CatalogCard(
            card_id="DON-999",
            name="Extra DON",
            card_type="DON!!",
            market_price=0.1,
        )
    )
    db.commit()

    starter = {f"DON-{i:03d}": 1 for i in range(DON_DECK_LIMIT)}
    deck = add_deck_with_cards(db, user, "DON Deck", starter)

    with pytest.raises(ValueError, match="DON!! deck"):
        upsert_deck_card(db, user, deck.id, "DON-999", 1)

    detail = get_deck_detail(db, user, deck.id)
    assert detail.don_cards == DON_DECK_LIMIT
    assert all(c.section == "don" for c in detail.cards)
