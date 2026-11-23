"""Copies in a locked group buy stop counting as Still need on Shopping (#1418)."""

from __future__ import annotations

from sqlalchemy import select

from app.group_buy import service as group_buy
from app.group_buy.schemas import GroupBuyArrivalUpdate, GroupBuyOrderCreate
from app.planner import decks as deck_svc
from app.planner import shopping as shopping_svc
from app.planner.models import DeckCard
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned

CARD = "OP01-001"
ALT_PID = 1009
ALT_ROW = "1\tOne Piece Card Game - Test Set - Luffy (OP01-001) (Parallel) - Near Mint"


def _receipt(alt: int = 0, std: int = 0) -> str:
    rows = ["Qty\tDescription"]
    if alt:
        rows.append(ALT_ROW.replace("1\t", f"{alt}\t", 1))
    if std:
        rows.append(f"{std}\tOne Piece Card Game - Test Set - Luffy (OP01-001) - Near Mint")
    return "\n".join(rows)


def _item(db, user):
    return next(i for i in shopping_svc.shopping_list(db, user).items if i.card_id == CARD)


def _still(db, user) -> int:
    return _item(db, user).still_need


def _need(db, deck, qty: int) -> None:
    row = db.scalar(select(DeckCard).where(DeckCard.deck_id == deck.id, DeckCard.card_id == CARD))
    row.needed = qty
    db.commit()


def _setup(db):
    """Host needs 3 Luffy, friend needs 2 (one as the 1009 alt); both own none."""
    add_catalog(db, CARD, name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, CARD, name="Luffy", product_id=ALT_PID, market=9.0, special=True)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    host_deck = add_deck_with_cards(db, host, "Host Deck", {CARD: 3})
    friend_deck = add_deck_with_cards(db, friend, "Friend Deck", {CARD: 2})
    set_owned(db, host, CARD, 0)
    set_owned(db, friend, CARD, 0)
    deck_svc.set_deck_card_printing(db, friend, friend_deck.id, CARD, ALT_PID, 1)
    created = group_buy.create_group_buy(db, host, "Spring buy")
    group_buy.join_group_buy(db, friend, created.invite_token)
    return host, friend, host_deck, friend_deck, created


def _locked(db):
    host, friend, host_deck, friend_deck, created = _setup(db)
    group_buy.lock_group_buy(db, host, created.id)
    return host, friend, host_deck, friend_deck, created.id


def _order(db, host, gid, *, alt=0, std=0):
    return group_buy.add_order(
        db, host, gid, GroupBuyOrderCreate(receipt_text=_receipt(alt, std), mark_arrived=False)
    ).detail


def _arrive(db, host, gid, order):
    return group_buy.set_order_arrival(
        db, host, gid, order.id, GroupBuyArrivalUpdate(expected_version=order.version, all=True)
    )


def test_still_need_drops_by_the_copies_in_a_locked_buy_1418(db):
    host, friend, _hd, _fd, created = _setup(db)
    assert (_still(db, host), _still(db, friend)) == (3, 2)

    group_buy.lock_group_buy(db, host, created.id)

    host_item, friend_item = _item(db, host), _item(db, friend)
    assert (host_item.still_need, friend_item.still_need) == (0, 0)
    assert (host_item.in_group_buy, friend_item.in_group_buy) == (3, 2)
    assert host_item.group_buys[0].group_buy_id == created.id
    assert host_item.group_buys[0].title == "Spring buy"
    assert host_item.group_buys[0].ordered is False


def test_still_need_stays_down_while_ordered_and_not_arrived_1418(db):
    host, friend, _hd, _fd, gid = _locked(db)

    _order(db, host, gid, alt=1, std=2)

    assert (_still(db, host), _still(db, friend)) == (0, 0)
    item = _item(db, host)
    assert item.in_group_buy == 3 and item.group_buys[0].ordered is True


def test_a_copy_that_arrives_counts_as_owned_not_subtracted_twice_1418(db):
    host, friend, host_deck, _fd, gid = _locked(db)
    # Host decides on a fourth copy after locking: that one is not in the buy. Two of the three
    # bought copies are in the order and arrive; the third is not ordered yet.
    _need(db, host_deck, 4)
    assert _still(db, host) == 1
    order = _order(db, host, gid, alt=1, std=2).orders[0]

    _arrive(db, host, gid, order)

    item = _item(db, host)
    assert item.owned == 2 and item.in_group_buy == 1
    assert item.still_need == 1
    assert _still(db, friend) == 0


def test_leftovers_of_a_closed_buy_return_to_shopping_1418(db):
    host, friend, _hd, _fd, gid = _locked(db)
    order = _order(db, host, gid, std=2).orders[0]
    _arrive(db, host, gid, order)
    held = sum(_item(db, u).in_group_buy for u in (host, friend))
    assert held == 3  # 5 copies in the buy, 2 arrived

    group_buy.close_group_buy(db, host, gid)

    for user in (host, friend):
        item = _item(db, user)
        assert item.in_group_buy == 0 and item.group_buys == []
        assert item.still_need == item.need - item.owned - item.alts_owned
    assert _still(db, host) + _still(db, friend) == 3


def test_an_alt_copy_in_transit_reduces_the_alt_want_not_the_standard_1418(db):
    host, friend, _hd, friend_deck, gid = _locked(db)
    # Friend wants two more copies after locking; the alt is still the only art they want.
    _need(db, friend_deck, 4)
    _order(db, host, gid, alt=1)
    item = _item(db, friend)

    assert item.in_group_buy == 2 and item.still_need == 2
    # The alt is on its way, so the 2 still to buy are standard (2 x 2.50), not alt + standard.
    assert item.remaining_cost == 5.0


def test_an_open_buy_does_not_ask_again_for_copies_in_a_locked_buy_1418(db):
    host, friend, host_deck, _fd, gid = _locked(db)
    _need(db, host_deck, 5)
    second = group_buy.create_group_buy(db, host, "Second buy")
    group_buy.join_group_buy(db, friend, second.invite_token)
    group = group_buy._get_group(db, second.id)

    needs = {n.user_id: n.qty for n in group_buy._member_needs_live(db, group)}

    assert needs == {host.id: 2}


def test_the_locked_buys_own_lines_are_not_reduced_by_itself_1418(db):
    host, friend, _hd, _fd, gid = _locked(db)
    group = group_buy._get_group(db, gid)
    members = {m.user_id: m for m in group.members}

    host_shop = group_buy._member_shopping(db, members[host.id]).items[0]
    friend_shop = group_buy._member_shopping(db, members[friend.id]).items[0]

    assert (host_shop.still_need, friend_shop.still_need) == (3, 2)
    assert {row.user_id: row.qty for row in group.snapshot_lines} == {host.id: 3, friend.id: 2}
    assert _still(db, host) == 0
