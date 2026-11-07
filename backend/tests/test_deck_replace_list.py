"""Replace a deck's cards with a pasted deck code (#1016)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import CatalogCard, DeckCard, DeckCardPrinting
from app.planner.decks import replace_deck_list
from tests.conftest import add_catalog, add_deck_with_cards, make_user
from tests.friend_support import as_user, client, make_user as make_http_user  # noqa: F401


def _seed(db) -> None:
    for cid in ("OP01-001", "OP02-001"):
        db.add(CatalogCard(card_id=cid, name=cid, card_type="Leader", rarity="L"))
    db.commit()
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=1.0)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=9.0, special=True)
    add_catalog(db, "OP01-017", name="Zoro", product_id=2, market=1.0)
    add_catalog(db, "OP01-018", name="Sanji", product_id=3, market=1.0)


def _needed(db, deck_id: int) -> dict[str, int]:
    return {
        r.card_id: r.needed
        for r in db.scalars(select(DeckCard).where(DeckCard.deck_id == deck_id))
    }


def _alts(db, deck_id: int) -> dict[tuple[str, int], int]:
    return {
        (r.card_id, r.product_id): r.qty
        for r in db.scalars(select(DeckCardPrinting).where(DeckCardPrinting.deck_id == deck_id))
    }


def test_replace_deck_list_swaps_cards_and_keeps_name_and_id_1016(db):
    _seed(db)
    user = make_user(db, email="a@t", name="A", sub="a")
    deck = add_deck_with_cards(db, user, "My Red", {"OP01-001": 1, "OP01-016": 4, "OP01-017": 4})
    deck.sort_order = 7
    deck.hidden_from_friends = True
    db.commit()

    detail = replace_deck_list(db, user, deck.id, "1xOP01-001\n2xOP01-016\n4xOP01-018")

    assert detail.id == deck.id
    assert detail.name == "My Red"
    assert _needed(db, deck.id) == {"OP01-001": 1, "OP01-016": 2, "OP01-018": 4}
    db.refresh(deck)
    assert deck.sort_order == 7
    assert deck.hidden_from_friends is True


def test_replace_deck_list_drops_removed_alt_wants_and_clamps_kept_1016(db):
    _seed(db)
    user = make_user(db, email="a@t", name="A", sub="a")
    deck = add_deck_with_cards(db, user, "D", {"OP01-001": 1, "OP01-016": 4, "OP01-017": 4})
    db.add(DeckCardPrinting(deck_id=deck.id, card_id="OP01-016", product_id=100, qty=3))
    db.add(DeckCardPrinting(deck_id=deck.id, card_id="OP01-017", product_id=555, qty=2))
    db.commit()

    replace_deck_list(db, user, deck.id, "1xOP01-001\n1xOP01-016")

    assert _alts(db, deck.id) == {("OP01-016", 100): 1}


def test_replace_deck_list_leader_change_moves_main_flag_1016(db):
    _seed(db)
    user = make_user(db, email="a@t", name="A", sub="a")
    first = add_deck_with_cards(db, user, "First", {"OP01-001": 1, "OP01-016": 4})
    second = add_deck_with_cards(db, user, "Second", {"OP01-001": 1, "OP01-017": 4})
    for d, order, main in ((first, 1, True), (second, 2, False)):
        d.leader_card_id = "OP01-001"
        d.sort_order = order
        d.is_main = main
    db.commit()

    replace_deck_list(db, user, first.id, "1xOP02-001\n4xOP01-016")

    db.refresh(first)
    db.refresh(second)
    assert first.leader_card_id == "OP02-001"
    assert first.is_main is True  # first deck of its new leader
    assert second.is_main is True  # inherited Main from the old leader's former Main


def test_replace_deck_list_rejects_another_users_deck_1016(client):
    c, S = client
    owner = make_http_user(S, "Owner")
    other = make_http_user(S, "Other")
    with S() as db:
        deck_id = add_deck_with_cards(db, _user(db, owner), "Mine", {"OP01-016": 1}).id

    r = as_user(c, other).put(f"/decks/{deck_id}/decklist", json={"decklist": "4xOP01-016"})
    assert r.status_code == 404
    with S() as db:
        assert _needed(db, deck_id) == {"OP01-016": 1}


def test_replace_deck_list_empty_paste_is_400_and_keeps_deck_1016(client):
    c, S = client
    uid = make_http_user(S, "Kai")
    with S() as db:
        deck_id = add_deck_with_cards(db, _user(db, uid), "Mine", {"OP01-016": 2}).id

    r = as_user(c, uid).put(f"/decks/{deck_id}/decklist", json={"decklist": "  \n "})
    assert r.status_code == 400
    with S() as db:
        assert _needed(db, deck_id) == {"OP01-016": 2}


def test_replace_deck_list_rejects_over_limit_don_1016(db):
    _seed(db)
    db.add(CatalogCard(card_id="DON-001", name="DON!!", card_type="DON!!", rarity="DON!!"))
    db.commit()
    user = make_user(db, email="a@t", name="A", sub="a")
    deck = add_deck_with_cards(db, user, "D", {"OP01-016": 1})

    with pytest.raises(ValueError, match="DON"):
        replace_deck_list(db, user, deck.id, "1xOP01-001\n11xDON-001")
    assert _needed(db, deck.id) == {"OP01-016": 1}


def _user(db, uid):
    from app.models import User

    return db.get(User, uid)
