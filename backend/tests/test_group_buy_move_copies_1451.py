"""Add a friend who is not on the app after ordering, and move copies to them (#1451)."""

from __future__ import annotations

import pytest

from app.core.errors import Forbidden, Invalid, NotFound
from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuy, GroupBuyOrderAllocation
from app.group_buy.schemas import (
    GroupBuyArrivalLineIn,
    GroupBuyArrivalUndo,
    GroupBuyArrivalUpdate,
    GroupBuyHandoffUpdate,
    GroupBuyMoveCopies,
    GroupBuyOrderCreate,
    GroupBuyOrderLineIn,
)
from sqlalchemy import select

from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned
from tests.test_group_buy_orders import _add, _alt_owned, _arrive_all, _owned


def _setup(db, *, order: bool = True, host_need: int = 4, friend_need: int = 3):
    """Host needs 4 Luffy and a friend 3, locked; with ``order`` one package holds 6 of the 7 at $2.50.

    One copy stays unordered so the group buy is ordered, not completed, once the package arrives.
    """
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-001", name="Luffy", product_id=1009, market=9.0, special=True)
    host = make_user(db, email="h1451@example.com", name="Mikosaur", sub="sub-h1451")
    friend = make_user(db, email="f1451@example.com", name="Friend", sub="sub-f1451")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": host_need})
    add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": friend_need})
    set_owned(db, host, "OP01-001", 0)
    set_owned(db, friend, "OP01-001", 0)
    created = group_buy.create_group_buy(db, host, "Pool")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    order_detail = _add(db, host, created.id, std=host_need + friend_need - 1).detail if order else None
    return host, friend, created.id, order_detail


def _sam(db, host, gid) -> int:
    detail = group_buy.add_offline_member(db, host, gid, "Sam")
    return next(m.user_id for m in detail.members if m.is_offline)


def _move(db, host, gid, frm, to, qty, art=None, card="OP01-001"):
    return group_buy.move_copies(
        db,
        host,
        gid,
        GroupBuyMoveCopies(card_id=card, product_id=art, from_user_id=frm, to_user_id=to, qty=qty),
    )


def _member(detail, uid):
    return next(m for m in detail.members if m.user_id == uid)


def _allocs(db, gid, uid):
    return [
        (int(a.qty), int(a.qty_arrived))
        for a in db.scalars(select(GroupBuyOrderAllocation).order_by(GroupBuyOrderAllocation.id))
        if a.user_id == uid
    ]


def test_sam_can_be_added_and_renamed_while_ordered_but_not_once_completed_1451(db):
    host, _friend, gid, _ = _setup(db)
    sam = _sam(db, host, gid)
    renamed = group_buy.rename_offline_member(db, host, gid, sam, "Samuel")
    assert _member(renamed, sam).display_name == "Samuel"

    db.get(GroupBuy, gid).status = "completed"
    db.commit()
    with pytest.raises(Forbidden):
        group_buy.add_offline_member(db, host, gid, "Ann")
    with pytest.raises(Forbidden):
        group_buy.rename_offline_member(db, host, gid, sam, "Nope")


def test_sam_with_copies_cannot_be_removed_after_locking_but_an_empty_sam_can_1451(db):
    host, _friend, gid, _ = _setup(db, order=False)
    empty, busy = _sam(db, host, gid), None
    busy = next(
        m.user_id
        for m in group_buy.add_offline_member(db, host, gid, "Busy").members
        if m.is_offline and m.user_id != empty
    )
    _move(db, host, gid, host.id, busy, 1)

    with pytest.raises(Exception) as err:
        group_buy.remove_offline_member(db, host, gid, busy)
    assert "cannot be removed" in str(err.value)
    left = group_buy.remove_offline_member(db, host, gid, empty)
    assert empty not in [m.user_id for m in left.members]


def test_only_the_host_can_move_copies_1451(db):
    host, friend, gid, _ = _setup(db)
    sam = _sam(db, host, gid)

    with pytest.raises(Forbidden):
        _move(db, friend, gid, host.id, sam, 1)


def test_copies_cannot_move_between_two_people_who_are_on_the_app_1451(db):
    host, friend, gid, _ = _setup(db)

    with pytest.raises(Invalid):
        _move(db, host, gid, host.id, friend.id, 1)


def test_cannot_move_to_the_same_person_or_someone_outside_the_group_buy_1451(db):
    host, friend, gid, _ = _setup(db)
    sam = _sam(db, host, gid)
    _move(db, host, gid, host.id, sam, 2)

    with pytest.raises(Invalid):
        _move(db, host, gid, sam, sam, 1)
    with pytest.raises(NotFound):
        _move(db, host, gid, host.id, 987654, 1)


def test_cannot_move_more_copies_than_they_have_1451(db):
    host, _friend, gid, _ = _setup(db)
    sam = _sam(db, host, gid)

    with pytest.raises(Invalid):
        _move(db, host, gid, host.id, sam, 5)
    with pytest.raises(Invalid):
        _move(db, host, gid, host.id, sam, 1, art=1009)


def test_moving_is_refused_while_open_and_once_completed_1451(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    host = make_user(db, email="h1451@example.com", name="Mikosaur", sub="sub-h1451")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 2})
    gid = group_buy.create_group_buy(db, host, "Pool").id
    sam = _sam(db, host, gid)
    with pytest.raises(Forbidden):
        _move(db, host, gid, host.id, sam, 1)

    group_buy.lock_group_buy(db, host, gid)
    _move(db, host, gid, host.id, sam, 1)
    db.get(GroupBuy, gid).status = "completed"
    db.commit()
    with pytest.raises(Forbidden):
        _move(db, host, gid, host.id, sam, 1)


def test_moving_two_copies_shifts_what_the_host_and_sam_owe_by_their_price_1451(db):
    host, friend, gid, _ = _setup(db)
    sam = _sam(db, host, gid)
    before = group_buy.get_group_buy(db, host, gid)
    assert _member(before, host.id).total_owed == pytest.approx(10.0)
    assert _member(before, sam).total_owed == 0

    after = _move(db, host, gid, host.id, sam, 2)

    assert _member(after, host.id).total_owed == pytest.approx(5.0)
    assert _member(after, sam).total_owed == pytest.approx(5.0)
    assert _member(after, friend.id).total_owed == pytest.approx(7.5)
    assert _member(after, sam).cards_still_needed == 2
    assert group_buy.get_group_buy(db, friend, gid).lines[0].member_arts == []
    line = after.lines[0]
    assert {m.user_id: m.qty for m in line.members} == {host.id: 2, sam: 2, friend.id: 3}
    assert {(r.user_id, r.qty) for r in line.member_arts} == {(host.id, 2), (sam, 2), (friend.id, 3)}


def test_copies_not_in_an_order_move_in_the_snapshot_alone_1451(db):
    host, _friend, gid, _ = _setup(db, order=False)
    sam = _sam(db, host, gid)

    after = _move(db, host, gid, host.id, sam, 4)

    assert {m.user_id: m.qty for m in after.lines[0].members if m.qty} == {sam: 4, _friend.id: 3}
    assert not any(m.user_id == host.id and m.qty for m in after.lines[0].members)


def test_not_arrived_copies_move_first_and_arrived_ones_stay_arrived_for_sam_1451(db):
    host, _friend, gid, order = _setup(db)
    line_id = order.orders[0].lines[0].id
    group_buy.set_order_arrival(
        db,
        host,
        gid,
        order.orders[0].id,
        GroupBuyArrivalUpdate(
            expected_version=order.orders[0].version,
            lines=[GroupBuyArrivalLineIn(line_id=line_id, qty_arrived=3)],
        ),
    )
    sam = _sam(db, host, gid)
    assert _allocs(db, gid, host.id) == [(4, 3)]

    _move(db, host, gid, host.id, sam, 1)
    assert _allocs(db, gid, host.id) == [(3, 3)] and _allocs(db, gid, sam) == [(1, 0)]

    _move(db, host, gid, host.id, sam, 2)
    assert _allocs(db, gid, host.id) == [(1, 1)]
    assert _allocs(db, gid, sam) == [(3, 2)]


def test_arrived_copies_leave_the_hosts_owned_without_going_below_zero_1451(db):
    host, _friend, gid, order = _setup(db)
    _arrive_all(db, host, gid, order.orders[0])
    assert _owned(db, host.id) == 4
    set_owned(db, host, "OP01-001", 1)
    sam = _sam(db, host, gid)

    _move(db, host, gid, host.id, sam, 3)

    assert _owned(db, host.id) == 0
    assert _allocs(db, gid, host.id) == [(1, 1)]


def test_moving_copies_back_from_sam_credits_the_host_1451(db):
    host, _friend, gid, order = _setup(db)
    _arrive_all(db, host, gid, order.orders[0])
    sam = _sam(db, host, gid)
    _move(db, host, gid, host.id, sam, 3)
    assert _owned(db, host.id) == 1

    back = _move(db, host, gid, sam, host.id, 2)

    assert _owned(db, host.id) == 3
    assert _member(back, host.id).total_owed == pytest.approx(7.5)
    assert _allocs(db, gid, sam) == [(1, 1)]


def test_undoing_an_arrival_after_a_move_takes_copies_from_whoever_holds_them_1451(db):
    host, friend, gid, order = _setup(db)
    set_owned(db, host, "OP01-001", 3)
    set_owned(db, friend, "OP01-001", 3)
    _arrive_all(db, host, gid, order.orders[0])
    sam = _sam(db, host, gid)
    assert _owned(db, host.id) == 7
    _move(db, host, gid, host.id, sam, 2)
    _move(db, host, gid, friend.id, sam, 1)
    assert (_owned(db, host.id), _owned(db, friend.id)) == (5, 4)

    current = group_buy.get_group_buy(db, host, gid).orders[0]
    group_buy.undo_order_arrival(
        db, host, gid, current.id, GroupBuyArrivalUndo(expected_version=current.version)
    )

    assert (_owned(db, host.id), _owned(db, friend.id)) == (3, 3)


def test_alternate_art_copies_move_with_their_own_printing_1451(db):
    host, _friend, gid, _ = _setup(db, order=False)
    group_buy.add_order(
        db,
        host,
        gid,
        GroupBuyOrderCreate(
            lines=[
                GroupBuyOrderLineIn(card_id="OP01-001", product_id=1009, qty=2),
                GroupBuyOrderLineIn(card_id="OP01-001", qty=4),
            ],
            mark_arrived=True,
        ),
    )
    sam = _sam(db, host, gid)
    detail = group_buy.get_group_buy(db, host, gid)
    host_arts = {r.product_id: r.qty for r in detail.lines[0].member_arts if r.user_id == host.id}
    assert host_arts.get(1009, 0) >= 1
    before_std, before_alt = _owned(db, host.id), _alt_owned(db, host.id)

    _move(db, host, gid, host.id, sam, 1, art=1009)

    assert _alt_owned(db, host.id) == before_alt - 1
    assert _owned(db, host.id) == before_std


def test_the_hand_off_count_is_clamped_to_what_is_left_1451(db):
    host, friend, gid, order = _setup(db)
    _arrive_all(db, host, gid, order.orders[0])
    group_buy.set_handoff(
        db, host, gid, friend.id, GroupBuyHandoffUpdate(status="handed_over", qty_handed=2)
    )
    sam = _sam(db, host, gid)

    after = _move(db, host, gid, friend.id, sam, 1)

    row = _member(after, friend.id)
    assert row.qty_handed == 1
    assert _owned(db, friend.id) == 1
