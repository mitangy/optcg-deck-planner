from __future__ import annotations

from app.planner import decks as deck_svc, owned as owned_svc
from app.planner.models import CatalogCard
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def _page_cost(cards) -> float:
    """What the deck page adds up as "left": the front end's per-card price of the copies still to buy."""
    total = 0.0
    for c in cards:
        if c.section == "don" or c.card_type == "DON!!":
            continue
        left = c.still_need
        line = 0.0
        for alt in c.alt_arts:
            if left <= 0:
                break
            reserved = min(alt.owned, alt.collector)
            take = min(max(0, alt.wanted - (alt.owned - reserved)), left)
            if take > 0:
                left -= take
                line += take * (alt.market_price or 0)
        line += left * (c.market_price or 0)
        total += round(line, 2)
    return round(total, 2)


def test_deck_list_dollars_left_equal_the_deck_page_with_shared_owned_and_alt_picks_1342(db):
    user = make_user(db, email="cost@example.com", name="Cost", sub="sub-cost")
    user.sum_across_leaders = True
    db.commit()
    add_catalog(db, "OP01-001", name="Luffy L", product_id=5, market=1.0)
    add_catalog(db, "OP02-001", name="Whitebeard L", product_id=6, market=1.0)
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.0)
    add_catalog(db, "OP01-016", name="Nami", product_id=100, market=20.0, special=True)
    add_catalog(db, "OP01-020", name="Zoro", product_id=2, market=0.5)
    first = add_deck_with_cards(db, user, "A", {"OP01-001": 1, "OP01-016": 3, "OP01-020": 4})
    second = add_deck_with_cards(db, user, "B", {"OP02-001": 1, "OP01-016": 3, "OP01-020": 2})
    first.leader_card_id, second.leader_card_id = "OP01-001", "OP02-001"
    db.commit()
    set_owned(db, user, "OP01-016", 2)
    set_owned(db, user, "OP01-020", 1)
    owned_svc.set_user_card_printing(db, user, "OP01-016", 100, 1)

    by_id = {s.id: s for s in deck_svc.list_decks(db, user)}

    for deck in (first, second):
        page = _page_cost(deck_svc.get_deck_detail(db, user, deck.id).cards)
        assert by_id[deck.id].remaining_cost == page
    # Deck B shares owned copies with deck A, so it costs more than it would alone.
    assert by_id[second.id].remaining_cost > 0
    assert by_id[first.id].remaining_cost != by_id[second.id].remaining_cost


def test_deck_list_dollars_left_ignore_don_cards_and_unpriced_lines_1342(db):
    user = make_user(db, email="cost2@example.com", name="Cost2", sub="sub-cost2")
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.0)
    add_catalog(db, "OP01-017", name="No price", product_id=2, market=None)
    add_catalog(db, "DON-001", name="DON!! Card", product_id=3, market=1.5)
    db.get(CatalogCard, "DON-001").card_type = "DON!!"
    db.commit()
    deck = add_deck_with_cards(db, user, "A", {"OP01-016": 2, "OP01-017": 3, "DON-001": 10})

    summary = deck_svc.list_decks(db, user)[0]

    assert summary.remaining_cost == 4.0
    assert summary.remaining_cost == _page_cost(deck_svc.get_deck_detail(db, user, deck.id).cards)


def test_deck_list_dollars_left_respect_the_shopping_deck_filter_1342(db):
    user = make_user(db, email="cost3@example.com", name="Cost3", sub="sub-cost3")
    user.sum_across_leaders = True
    db.commit()
    add_catalog(db, "OP01-001", name="Luffy L", product_id=5, market=1.0)
    add_catalog(db, "OP02-001", name="Whitebeard L", product_id=6, market=1.0)
    add_catalog(db, "OP01-016", name="Nami", product_id=1, market=2.0)
    first = add_deck_with_cards(db, user, "A", {"OP01-001": 1, "OP01-016": 3})
    second = add_deck_with_cards(db, user, "B", {"OP02-001": 1, "OP01-016": 3})
    first.leader_card_id, second.leader_card_id = "OP01-001", "OP02-001"
    db.commit()
    set_owned(db, user, "OP01-016", 3)

    every = {s.id: s for s in deck_svc.list_decks(db, user)}
    only_second = {s.id: s for s in deck_svc.list_decks(db, user, [second.id])}

    assert every[second.id].remaining_cost == 7.0  # 3 Nami at 2.0 + the leader at 1.0
    assert only_second[second.id].remaining_cost == 1.0  # the 3 owned Nami are all deck B's now
    detail = deck_svc.get_deck_detail(db, user, second.id, deck_ids=[second.id])
    assert only_second[second.id].remaining_cost == _page_cost(detail.cards)
