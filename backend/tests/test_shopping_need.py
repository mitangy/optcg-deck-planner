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


def test_deck_pages_split_owned_across_leaders_when_summing(db):
    """Separate per leader: owned copies go to leaders in deck order, so deck
    pages add up to the Master Shopping still-need instead of each claiming all."""
    add_catalog(db, "OP01-003", name="Chopper", product_id=3, market=1.0)
    add_catalog(db, "LUF", name="Luffy", product_id=4, market=1.0)
    user = make_user(db, email="split@example.com", name="Split", sub="sub-split")
    luffy_a = add_deck_with_cards(db, user, "Luffy A", {"OP01-003": 4})
    sabo = add_deck_with_cards(db, user, "Sabo", {"OP01-003": 3})
    luffy_b = add_deck_with_cards(db, user, "Luffy B", {"OP01-003": 2})
    loose = add_deck_with_cards(db, user, "Loose", {"OP01-003": 1})
    luffy_a.leader_card_id = luffy_b.leader_card_id = "LUF"
    sabo.leader_card_id = "SAB"
    db.commit()
    set_owned(db, user, "OP01-003", 5)

    def card(deck):
        return services.get_deck_detail(db, user, deck.id).cards[0]

    # Shared mode: every deck is compared against all 5 owned.
    assert [card(d).still_need for d in (luffy_a, sabo, luffy_b, loose)] == [0, 0, 0, 0]
    assert card(sabo).earlier_leaders_need == 0

    user.sum_across_leaders = True
    db.commit()
    a, s, b, lo = (card(d) for d in (luffy_a, sabo, luffy_b, loose))
    # Luffy (first) takes 4 of 5; Sabo gets 1 of its 3; the leaderless deck gets none.
    assert (a.owned, a.still_need, a.earlier_leaders_need) == (5, 0, 0)
    assert (b.still_need, b.earlier_leaders_need) == (0, 0)  # same leader as A
    assert (s.owned, s.still_need, s.earlier_leaders_need, s.earlier_leaders) == (5, 2, 4, ["Luffy"])
    # Luffy B (a later deck) still counts toward Luffy's group, which comes first.
    assert (lo.still_need, lo.earlier_leaders_need, lo.earlier_leaders) == (1, 7, ["Luffy", "Sabo"])

    # One copy per leader group matches Master Shopping (8 need − 5 owned = 3).
    shop_still = services.shopping_list(db, user).items[0].still_need
    assert shop_still == 3 == a.still_need + s.still_need + lo.still_need


def test_shopping_need_sums_across_distinct_leaders_when_enabled(db):
    """sum_across_leaders: max within a leader, summed across leaders."""
    add_catalog(db, "OP01-003", name="Chopper", product_id=3, market=1.0)
    user = make_user(db, email="sum@example.com", name="Summer", sub="sub-sum")
    luffy_a = add_deck_with_cards(db, user, "Luffy A", {"OP01-003": 4})
    luffy_b = add_deck_with_cards(db, user, "Luffy B", {"OP01-003": 3})
    sabo = add_deck_with_cards(db, user, "Sabo", {"OP01-003": 3})
    leaderless = add_deck_with_cards(db, user, "Loose", {"OP01-003": 1})
    luffy_a.leader_card_id = "OP01-LUF"
    luffy_b.leader_card_id = "OP01-LUF"
    sabo.leader_card_id = "OP01-SAB"
    db.commit()

    # Default stays max across decks.
    assert services.shopping_list(db, user).items[0].need == 4

    user.sum_across_leaders = True
    db.commit()
    # Luffy max(4, 3) + Sabo 3 + leaderless deck 1.
    shop = services.shopping_list(db, user)
    assert shop.items[0].need == 8
    assert shop.cards_still_needed == 8

    set_owned(db, user, "OP01-003", 5)
    item = services.shopping_list(db, user).items[0]
    assert item.still_need == 3

    # Same leader only → still max, not sum.
    same_leader = services.shopping_list(db, user, deck_ids=[luffy_a.id, luffy_b.id])
    assert same_leader.items[0].need == 4
    assert services.shopping_list(db, user, deck_ids=[luffy_a.id, sabo.id, leaderless.id]).items[0].need == 8
