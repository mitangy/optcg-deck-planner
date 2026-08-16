from __future__ import annotations

from app.models import CatalogCard, Deck
from app.services import (
    delete_deck,
    get_deck_detail,
    list_decks,
    set_deck_as_main,
)
from tests.conftest import add_deck_with_cards, make_user


def _seed_leader_catalog(db) -> None:
    db.add(
        CatalogCard(
            card_id="OP01-001",
            name="Luffy",
            card_type="Leader",
            rarity="L",
        )
    )
    for cid, name in [
        ("OP01-016", "Nami"),
        ("OP01-017", "Zoro"),
        ("OP01-018", "Sanji"),
        ("OP01-019", "Usopp"),
        ("DON-001", "DON!!"),
    ]:
        db.add(
            CatalogCard(
                card_id=cid,
                name=name,
                card_type="DON!!" if cid.startswith("DON") else "Character",
                rarity="DON!!" if cid.startswith("DON") else "R",
            )
        )
    db.commit()


def _make_leader_deck(
    db,
    user,
    name: str,
    cards: dict[str, int],
    *,
    sort_order: int,
    is_main: bool = False,
    leader: str = "OP01-001",
) -> Deck:
    deck = add_deck_with_cards(db, user, name, cards)
    deck.leader_card_id = leader
    deck.sort_order = sort_order
    deck.is_main = is_main
    db.commit()
    db.refresh(deck)
    return deck


def test_additional_cards_compare_against_explicit_main(db):
    _seed_leader_catalog(db)
    user = make_user(db, email="a@test", name="A", sub="a")

    first = _make_leader_deck(
        db,
        user,
        "First import",
        {"OP01-001": 1, "OP01-016": 4, "OP01-017": 4},
        sort_order=1,
        is_main=False,
    )
    main = _make_leader_deck(
        db,
        user,
        "Main list",
        {"OP01-001": 1, "OP01-016": 4, "OP01-018": 4},
        sort_order=2,
        is_main=True,
    )
    variant = _make_leader_deck(
        db,
        user,
        "Tech variant",
        {"OP01-001": 1, "OP01-016": 4, "OP01-018": 4, "OP01-019": 2, "DON-001": 10},
        sort_order=3,
        is_main=False,
    )

    detail = get_deck_detail(db, user, variant.id)
    assert detail.is_main is False
    assert detail.prior_decks == ["Main list"]
    by_id = {c.card_id: c.section for c in detail.cards}
    assert by_id["OP01-001"] == "main"
    assert by_id["OP01-016"] == "main"
    assert by_id["OP01-018"] == "main"
    assert by_id["OP01-019"] == "additional"
    assert by_id["DON-001"] == "don"

    # Main deck itself has no Additional Cards section.
    main_detail = get_deck_detail(db, user, main.id)
    assert main_detail.is_main is True
    assert main_detail.prior_decks == []
    assert all(c.section in ("main", "don") for c in main_detail.cards)

    # Earlier non-main deck still compares only to Main (not itself as baseline).
    first_detail = get_deck_detail(db, user, first.id)
    assert first_detail.prior_decks == ["Main list"]
    first_by_id = {c.card_id: c.section for c in first_detail.cards}
    assert first_by_id["OP01-016"] == "main"
    assert first_by_id["OP01-017"] == "additional"
    assert "OP01-018" not in first_by_id


def test_fallback_main_is_earliest_same_leader_when_unset(db):
    _seed_leader_catalog(db)
    user = make_user(db, email="b@test", name="B", sub="b")

    early = _make_leader_deck(
        db,
        user,
        "Early",
        {"OP01-001": 1, "OP01-016": 4},
        sort_order=1,
        is_main=False,
    )
    late = _make_leader_deck(
        db,
        user,
        "Late",
        {"OP01-001": 1, "OP01-016": 4, "OP01-019": 2},
        sort_order=2,
        is_main=False,
    )

    summaries = {d.id: d for d in list_decks(db, user)}
    assert summaries[early.id].is_main is True
    assert summaries[late.id].is_main is False

    detail = get_deck_detail(db, user, late.id)
    assert detail.prior_decks == ["Early"]
    assert {c.card_id for c in detail.cards if c.section == "additional"} == {"OP01-019"}


def test_set_deck_as_main_switches_baseline(db):
    _seed_leader_catalog(db)
    user = make_user(db, email="c@test", name="C", sub="c")

    a = _make_leader_deck(
        db,
        user,
        "A",
        {"OP01-001": 1, "OP01-016": 4},
        sort_order=1,
        is_main=True,
    )
    b = _make_leader_deck(
        db,
        user,
        "B",
        {"OP01-001": 1, "OP01-016": 4, "OP01-019": 2},
        sort_order=2,
        is_main=False,
    )

    set_deck_as_main(db, user, b.id)
    db.refresh(a)
    db.refresh(b)
    assert a.is_main is False
    assert b.is_main is True

    a_detail = get_deck_detail(db, user, a.id)
    assert a_detail.prior_decks == ["B"]
    assert {c.card_id for c in a_detail.cards if c.section == "additional"} == set()

    b_detail = get_deck_detail(db, user, b.id)
    assert b_detail.is_main is True
    assert b_detail.prior_decks == []
    assert all(c.section == "main" for c in b_detail.cards)


def test_delete_main_promotes_next_same_leader(db):
    _seed_leader_catalog(db)
    user = make_user(db, email="d@test", name="D", sub="d")

    main = _make_leader_deck(
        db,
        user,
        "Main",
        {"OP01-001": 1, "OP01-016": 4},
        sort_order=1,
        is_main=True,
    )
    next_deck = _make_leader_deck(
        db,
        user,
        "Next",
        {"OP01-001": 1, "OP01-019": 4},
        sort_order=2,
        is_main=False,
    )

    delete_deck(db, user, main.id)
    db.refresh(next_deck)
    assert next_deck.is_main is True
    summaries = list_decks(db, user)
    assert len(summaries) == 1
    assert summaries[0].is_main is True


def test_set_main_requires_leader(db):
    user = make_user(db, email="e@test", name="E", sub="e")
    deck = add_deck_with_cards(db, user, "No leader", {"OP01-016": 4})
    import pytest

    with pytest.raises(ValueError, match="no leader"):
        set_deck_as_main(db, user, deck.id)


def test_list_decks_groups_by_leader_with_main_first(db):
    _seed_leader_catalog(db)
    db.add(
        CatalogCard(
            card_id="OP02-001",
            name="Zoro Leader",
            card_type="Leader",
            rarity="L",
        )
    )
    db.commit()
    user = make_user(db, email="f@test", name="F", sub="f")

    luffy_variant = _make_leader_deck(
        db,
        user,
        "Luffy Tech",
        {"OP01-001": 1, "OP01-019": 4},
        sort_order=1,
        is_main=False,
        leader="OP01-001",
    )
    zoro_main = _make_leader_deck(
        db,
        user,
        "Zoro Core",
        {"OP02-001": 1, "OP01-017": 4},
        sort_order=2,
        is_main=True,
        leader="OP02-001",
    )
    luffy_main = _make_leader_deck(
        db,
        user,
        "Luffy Core",
        {"OP01-001": 1, "OP01-016": 4},
        sort_order=3,
        is_main=True,
        leader="OP01-001",
    )
    no_leader = add_deck_with_cards(db, user, "Orphan", {"OP01-018": 4})
    no_leader.sort_order = 0
    db.commit()

    names = [d.name for d in list_decks(db, user)]
    # Leaders sorted by name (Luffy before Zoro); Main first within group; no-leader last.
    assert names == ["Luffy Core", "Luffy Tech", "Zoro Core", "Orphan"]
    summaries = {d.name: d for d in list_decks(db, user)}
    assert summaries["Luffy Core"].is_main is True
    assert summaries["Luffy Tech"].is_main is False
    assert summaries["Zoro Core"].is_main is True
    # IDs still resolve for detail after reordering.
    assert get_deck_detail(db, user, luffy_variant.id).prior_decks == ["Luffy Core"]
    assert get_deck_detail(db, user, luffy_main.id).is_main is True
    assert get_deck_detail(db, user, zoro_main.id).is_main is True
