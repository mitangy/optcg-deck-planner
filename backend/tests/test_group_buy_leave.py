"""Members can leave an open group buy (#881)."""

from __future__ import annotations

import pytest

from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuyMember, GroupBuyQtyOverride
from sqlalchemy import select
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


@pytest.fixture()
def pool(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 4})
    add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 3})
    set_owned(db, host, "OP01-001", 1)  # host needs 3
    created = group_buy.create_group_buy(db, host, "Leave pool")
    group_buy.join_group_buy(db, friend, created.invite_token)
    return host, friend, created


def test_member_leaves_and_their_quantities_are_gone_881(db, pool):
    host, friend, created = pool
    group_buy.set_member_qty(db, friend, created.id, "OP01-001", 7)
    merged = group_buy.get_group_buy(db, host, created.id)
    assert merged.lines[0].total_qty == 3 + 7

    group_buy.leave_group_buy(db, friend, created.id)

    after = group_buy.get_group_buy(db, host, created.id)
    assert after.member_count == 1
    assert [m.display_name for m in after.lines[0].members] == ["Host"]
    assert after.lines[0].total_qty == 3
    assert db.scalars(select(GroupBuyQtyOverride)).all() == []
    with pytest.raises(PermissionError):
        group_buy.get_group_buy(db, friend, created.id)


def test_leaving_keeps_other_members_overrides_881(db, pool):
    host, friend, created = pool
    group_buy.set_member_qty(db, host, created.id, "OP01-001", 9)
    group_buy.set_member_qty(db, friend, created.id, "OP01-001", 7)
    group_buy.leave_group_buy(db, friend, created.id)
    rows = db.scalars(select(GroupBuyQtyOverride)).all()
    assert [r.user_id for r in rows] == [host.id]


def test_host_cannot_leave_881(db, pool):
    host, _friend, created = pool
    with pytest.raises(ValueError, match="Host can't leave"):
        group_buy.leave_group_buy(db, host, created.id)
    assert len(db.scalars(select(GroupBuyMember)).all()) == 2


def test_member_cannot_leave_a_locked_group_buy_881(db, pool):
    host, friend, created = pool
    group_buy.lock_group_buy(db, host, created.id)
    with pytest.raises(ValueError, match="unlock"):
        group_buy.leave_group_buy(db, friend, created.id)
    assert len(db.scalars(select(GroupBuyMember)).all()) == 2


def test_non_member_cannot_leave_881(db, pool):
    _host, _friend, created = pool
    outsider = make_user(db, email="out@example.com", name="Out", sub="sub-out")
    with pytest.raises(PermissionError):
        group_buy.leave_group_buy(db, outsider, created.id)
    with pytest.raises(LookupError):
        group_buy.leave_group_buy(db, outsider, 99999)
