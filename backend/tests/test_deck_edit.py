from __future__ import annotations

import pytest

from app.domain import (
    DON_DECK_LIMIT,
    MAIN_DECK_LIMIT,
    deck_size_counts,
    is_don_type,
    is_leader_type,
)
from app.models import CatalogCard, CatalogPrinting, OwnedPrinting
from app.services import (
    DeckOversizeError,
    get_deck_detail,
    reset_deck_owned,
    search_catalog,
    set_owned,
    upsert_deck_card,
)
from tests.conftest import add_catalog, add_deck_with_cards, make_user


def test_don_and_leader_type_helpers():
    from app.domain import is_don_product, synthetic_don_card_id
    from app.catalog_sync import resolve_catalog_card_id

    assert is_don_type("DON!!")
    assert is_don_type("Don")
    assert not is_don_type("Character")
    assert is_leader_type("Leader")
    assert is_leader_type("", "L")
    assert not is_leader_type("Character", "R")
    assert is_don_product(name="DON!! Card (Uta) (Gold)", card_type="", rarity="")
    assert synthetic_don_card_id(586181) == "DON-586181"
    assert (
        resolve_catalog_card_id(
            {"productId": 586181, "name": "DON!! Card (Uta) (Gold)"},
            {"CardType": "DON!!", "Rarity": "DON!!"},
        )
        == "DON-586181"
    )
    assert (
        resolve_catalog_card_id(
            {"productId": 1, "name": "Nami"},
            {"Number": "OP01-016", "CardType": "Character"},
        )
        == "OP01-016"
    )
    assert (
        resolve_catalog_card_id(
            {"productId": 2, "name": "Booster Box"},
            {},
        )
        is None
    )


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


def test_search_finds_a_card_by_a_reprint_printings_name_and_set_843(db):
    db.add_all(
        [
            CatalogCard(card_id="OP14-041", name="Boa Hancock - OP14-041", group_name="Azure Sea", market_price=1.0),
            CatalogPrinting(card_id="OP14-041", product_id=1, name="Boa Hancock (OP14-041)", group_name="Azure Sea", market_price=1.0),
            CatalogPrinting(card_id="OP14-041", product_id=2, name="Boa Hancock (OP14-041) (Heroine Leader)", group_name="Extra Booster: One Piece Heroines Edition Vol. 2", market_price=2.0),
            CatalogPrinting(card_id="OP14-041", product_id=3, name="Boa Hancock (OP14-041) (Heroine Leader) (Alt)", group_name="Extra Booster: One Piece Heroines Edition Vol. 2", market_price=3.0),
            CatalogCard(card_id="OP01-016", name="Nami", group_name="Romance Dawn", market_price=0.5),
            CatalogPrinting(card_id="OP01-016", product_id=4, name="Nami", group_name="Romance Dawn", market_price=0.5),
        ]
    )
    db.commit()

    by_printing_name = search_catalog(db, q="Heroine Leader")
    assert [c.card_id for c in by_printing_name] == ["OP14-041"]

    by_printing_set = search_catalog(db, q="Heroines Edition Vol. 2")
    assert [c.card_id for c in by_printing_set] == ["OP14-041"]


def _seed_alt_search_848(db):
    db.add_all(
        [
            CatalogCard(card_id="OP01-016", name="Nami", color="Red", card_type="Character", rarity="R", group_name="Romance Dawn", image_url="base.png", market_price=1.0),
            CatalogPrinting(card_id="OP01-016", product_id=1, name="Nami (016)", group_name="Romance Dawn", image_url="base.png", market_price=1.0, is_special=0),
            CatalogPrinting(card_id="OP01-016", product_id=2, name="Nami (016) (Parallel)", group_name="Romance Dawn", image_url="par.png", market_price=9.0, is_special=1),
            CatalogPrinting(card_id="OP01-016", product_id=3, name="Nami (016) (Manga)", group_name="Romance Dawn", image_url="manga.png", market_price=50.0, is_special=1),
        ]
    )
    db.commit()


def test_search_alts_lists_base_then_alt_rows_and_plain_search_stays_base_only_848(db):
    _seed_alt_search_848(db)

    plain = search_catalog(db, q="Nami")
    assert [(c.card_id, c.alt_product_id) for c in plain] == [("OP01-016", None)]

    rows = search_catalog(db, q="Nami", alts=True)
    assert [(c.alt_product_id, c.market_price, c.image_url) for c in rows] == [
        (None, 1.0, "base.png"),
        (2, 9.0, "par.png"),
        (3, 50.0, "manga.png"),
    ]
    assert rows[2].name == "Nami (016) (Manga)"
    assert all(c.card_id == "OP01-016" and c.color == "Red" for c in rows)


def test_search_alts_text_only_in_one_alt_returns_just_that_alt_848(db):
    _seed_alt_search_848(db)

    rows = search_catalog(db, q="Manga", alts=True)
    assert [(c.card_id, c.alt_product_id) for c in rows] == [("OP01-016", 3)]


def test_search_alts_owned_count_is_the_viewers_own_printing_848(db):
    _seed_alt_search_848(db)
    me = make_user(db, email="me@test", name="Me", sub="sub-me")
    other = make_user(db, email="o@test", name="O", sub="sub-o")
    db.add_all(
        [
            OwnedPrinting(user_id=me.id, card_id="OP01-016", product_id=3, qty=2),
            OwnedPrinting(user_id=other.id, card_id="OP01-016", product_id=2, qty=7),
        ]
    )
    db.commit()

    rows = search_catalog(db, q="Nami", alts=True, user_id=me.id)
    assert {c.alt_product_id: c.owned for c in rows} == {None: 0, 2: 0, 3: 2}


def _seed_fuzzy_848(db):
    db.add_all(
        [
            CatalogCard(card_id="OP01-001", name="Monkey.D.Luffy", group_name="Romance Dawn", market_price=3.0),
            CatalogPrinting(card_id="OP01-001", product_id=1, name="Monkey.D.Luffy", group_name="Romance Dawn", market_price=3.0),
            CatalogCard(card_id="OP02-002", name="Roronoa Zoro", group_name="Paramount War", market_price=2.0),
            CatalogPrinting(card_id="OP02-002", product_id=2, name="Roronoa Zoro", group_name="Paramount War", market_price=2.0),
            CatalogCard(card_id="OP03-003", name="Nami", group_name="Pillars of Strength", market_price=1.0),
            CatalogPrinting(card_id="OP03-003", product_id=3, name="Nami", group_name="Pillars of Strength", market_price=1.0),
        ]
    )
    db.commit()


def test_search_tolerates_typos_and_punctuation_in_card_names_848(db):
    _seed_fuzzy_848(db)

    assert [c.card_id for c in search_catalog(db, q="lufy")] == ["OP01-001"]
    assert [c.card_id for c in search_catalog(db, q="Monkey D Luffy")] == ["OP01-001"]
    assert [c.card_id for c in search_catalog(db, q="luffy monkey")] == ["OP01-001"]
    assert [c.card_id for c in search_catalog(db, q="roronoa zoro")] == ["OP02-002"]


def test_search_tolerates_a_typo_in_a_set_name_848(db):
    _seed_fuzzy_848(db)

    assert [c.card_id for c in search_catalog(db, q="Romance Dwan")] == ["OP01-001"]


def test_search_does_not_fuzzy_match_unrelated_words_848(db):
    _seed_fuzzy_848(db)

    assert search_catalog(db, q="xylophone") == []
    assert search_catalog(db, q="zzzz") == []
    # Two typos away from "Nami": too far for a 4-letter token.
    assert search_catalog(db, q="xamu") == []
    # A short token must match a word's start; one typo is not allowed there.
    assert search_catalog(db, q="nmi") == []


def test_search_ranks_substring_matches_above_fuzzy_only_ones_848(db):
    # "Lufy Sword" is an exact substring hit but pricier; the fuzzy hit is cheaper.
    db.add_all(
        [
            CatalogCard(card_id="OP01-001", name="Luffy", group_name="Romance Dawn", market_price=1.0),
            CatalogCard(card_id="OP09-009", name="Lufy Sword", group_name="Wings", market_price=50.0),
        ]
    )
    db.commit()

    assert [c.card_id for c in search_catalog(db, q="lufy")] == ["OP09-009", "OP01-001"]


def test_search_fuzzy_results_still_obey_color_filter_848(db):
    _seed_fuzzy_848(db)
    db.get(CatalogCard, "OP01-001").color = "Red"
    db.commit()

    assert search_catalog(db, q="lufy", color="Blue") == []


def test_upsert_deck_card_add_and_remove(db):
    user = make_user(db, email="a@test", name="A", sub="sub-a")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.0)
    deck = add_deck_with_cards(db, user, "Test", {"OP01-001": 1})

    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 4)
    assert any(c.card_id == "OP01-016" and c.needed == 4 for c in detail.cards)

    detail = upsert_deck_card(db, user, deck.id, "OP01-016", 0)
    assert all(c.card_id != "OP01-016" for c in detail.cards)


def test_reset_deck_owned_zeros_cards_in_deck(db):
    user = make_user(db, email="owned@test", name="O", sub="sub-o")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.0)
    add_catalog(db, "OP01-025", name="Usopp", product_id=2, market=1.0)
    deck = add_deck_with_cards(db, user, "Reset me", {"OP01-016": 4, "OP01-025": 2})
    set_owned(db, user, "OP01-016", 3)
    set_owned(db, user, "OP01-025", 1)
    # Card not in this deck should be left alone.
    set_owned(db, user, "OP99-001", 5)

    reset_count, detail = reset_deck_owned(db, user, deck.id)
    assert reset_count == 2
    by_id = {c.card_id: c for c in detail.cards}
    assert by_id["OP01-016"].owned == 0
    assert by_id["OP01-016"].still_need == 4
    assert by_id["OP01-025"].owned == 0

    from sqlalchemy import select
    from app.models import Owned

    other = db.scalar(
        select(Owned).where(Owned.user_id == user.id, Owned.card_id == "OP99-001")
    )
    assert other is not None and other.qty == 5


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
