"""Getting each member's arrived cards from the host to them (#1418, option D)."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.errors import Forbidden, Invalid
from app.core.models import User
from app.group_buy import service as group_buy
from app.group_buy.schemas import GroupBuyHandoffUpdate, GroupBuyOrderCreate
from tests.conftest import add_catalog, add_deck_with_cards, make_user
from tests.db_support import make_bare_engine
from tests.friend_support import as_user, client, make_user as make_http_user  # noqa: F401
from tests.test_group_buy_orders import _add, _arrive_all, _locked_group, _receipt, upgrade_to


def _arrived_group(db):
    """Host and friend each need 2 Luffy; one order of 4 plain copies arrived, so friend holds 2."""
    host, friend, gid = _locked_group(db)
    added = _add(db, host, gid, std=4).detail
    _arrive_all(db, host, gid, added.orders[0])
    return host, friend, gid


def _me(detail, user):
    return next(m for m in detail.members if m.user_id == user.id)


def _set(db, host, gid, user, **fields):
    return group_buy.set_handoff(db, host, gid, user.id, GroupBuyHandoffUpdate(**fields))


def test_ready_to_hand_over_is_arrived_copies_minus_handed_over_1418(db):
    host, friend, gid = _locked_group(db)
    added = _add(db, host, gid, std=4).detail
    assert _me(added, friend).ready_to_hand_over == 0

    arrived = _arrive_all(db, host, gid, added.orders[0])
    assert _me(arrived, friend).ready_to_hand_over == 2

    partial = _set(db, host, gid, friend, status="shipped", qty_handed=1)
    assert _me(partial, friend).ready_to_hand_over == 1


def test_handing_over_covers_the_copies_that_arrived_by_default_1418(db):
    host, friend, gid = _arrived_group(db)

    shipped = _set(db, host, gid, friend, status="shipped")

    assert _me(shipped, friend).qty_handed == 2
    assert _me(shipped, friend).ready_to_hand_over == 0


def test_going_back_to_waiting_makes_the_cards_ready_again_1418(db):
    host, friend, gid = _arrived_group(db)
    _set(db, host, gid, friend, status="handed_over")

    undone = _set(db, host, gid, friend, status="waiting")

    assert _me(undone, friend).handoff_status == "waiting"
    assert _me(undone, friend).qty_handed == 0
    assert _me(undone, friend).ready_to_hand_over == 2


def test_a_hand_off_tracking_link_must_be_https_1418(db):
    host, friend, gid = _arrived_group(db)

    with pytest.raises(Invalid):
        _set(db, host, gid, friend, status="shipped", tracking_url="http://track.example/1")

    ok = _set(db, host, gid, friend, status="shipped", tracking_url=" https://track.example/1 ")
    assert _me(ok, friend).handoff_tracking_url == "https://track.example/1"


def test_the_host_counts_as_received_and_has_no_hand_off_to_set_1418(db):
    host, _friend, gid = _arrived_group(db)

    assert _me(group_buy.get_group_buy(db, host, gid), host).handoff_status == "received"
    with pytest.raises(Invalid):
        _set(db, host, gid, host, status="shipped")


def test_hand_off_waits_until_the_group_buy_is_ordered_1418(db):
    host, friend, gid = _locked_group(db)

    with pytest.raises(Invalid):
        _set(db, host, gid, friend, status="shipped")


def test_a_member_confirms_only_after_the_host_shipped_or_handed_over_1418(db):
    host, friend, gid = _arrived_group(db)

    with pytest.raises(Invalid):
        group_buy.confirm_handoff_received(db, friend, gid)
    _set(db, host, gid, friend, paid=True)  # a row exists, still waiting
    with pytest.raises(Invalid):
        group_buy.confirm_handoff_received(db, friend, gid)
    _set(db, host, gid, friend, status="shipped", tracking_url="https://track.example/1")

    done = group_buy.confirm_handoff_received(db, friend, gid)

    assert _me(done, friend).handoff_status == "received"
    stranger = User(email="s@example.com", name="S", google_sub="sub-s")
    db.add(stranger)
    db.commit()
    with pytest.raises(Forbidden):
        group_buy.confirm_handoff_received(db, stranger, gid)


def test_the_host_marks_who_paid_and_a_status_change_keeps_it_1418(db):
    host, friend, gid = _arrived_group(db)
    assert _me(group_buy.get_group_buy(db, host, gid), friend).paid is False

    paid = _set(db, host, gid, friend, paid=True)
    assert _me(paid, friend).paid is True

    shipped = _set(db, host, gid, friend, status="shipped")
    assert _me(shipped, friend).paid is True
    assert _me(_set(db, host, gid, friend, paid=False), friend).paid is False


def test_only_the_host_and_that_member_see_the_hand_off_details_1418(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    other = make_user(db, email="other@example.com", name="Other", sub="sub-other")
    created = group_buy.create_group_buy(db, host, "Three")
    token = created.invite_token
    gid = created.id
    for person in (friend, other):
        add_deck_with_cards(db, person, "D", {"OP01-001": 2})
        group_buy.join_group_buy(db, person, token)
    group_buy.lock_group_buy(db, host, gid)
    added = group_buy.add_order(db, host, gid, GroupBuyOrderCreate(receipt_text=_receipt(std=4))).detail
    _arrive_all(db, host, gid, added.orders[0])
    _set(db, host, gid, friend, status="shipped", tracking_url="https://track.example/1", note="Box 2", paid=True)

    host_sees = _me(group_buy.get_group_buy(db, host, gid), friend)
    own = _me(group_buy.get_group_buy(db, friend, gid), friend)
    peer = _me(group_buy.get_group_buy(db, other, gid), friend)

    for seen in (host_sees, own):
        assert (seen.handoff_status, seen.handoff_tracking_url, seen.handoff_note, seen.paid) == (
            "shipped",
            "https://track.example/1",
            "Box 2",
            True,
        )
    assert (peer.handoff_status, peer.handoff_tracking_url, peer.handoff_note, peer.paid) == ("", "", "", False)
    public = group_buy.public_group_buy_view(db, token)
    assert [(m.handoff_status, m.handoff_tracking_url, m.paid) for m in public.members] == [("", "", False)] * 3


def test_a_member_cannot_set_anyones_hand_off_over_http_1418(client):
    c, S = client
    host = make_http_user(S, "host")
    friend = make_http_user(S, "friend")
    with S() as db:
        add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
        for uid in (host, friend):
            add_deck_with_cards(db, db.get(User, uid), "D", {"OP01-001": 2})
        created = group_buy.create_group_buy(db, db.get(User, host), "Http")
        group_buy.join_group_buy(db, db.get(User, friend), created.invite_token)
        gid = created.id
    as_user(c, host).post(f"/group-buys/{gid}/lock")
    receipt = "Qty\tDescription\n4\tOne Piece Card Game - Test Set - Luffy (OP01-001) - Near Mint"
    as_user(c, host).post(f"/group-buys/{gid}/orders", json={"receipt_text": receipt})
    url = f"/group-buys/{gid}/handoffs/{friend}"

    assert as_user(c, friend).put(url, json={"status": "handed_over"}).status_code == 403
    assert as_user(c, friend).put(url, json={"paid": True}).status_code == 403
    assert as_user(c, host).put(url, json={"status": "handed_over", "paid": True}).status_code == 200
    mine = as_user(c, friend).post(f"/group-buys/{gid}/handoffs/me/received")
    assert mine.status_code == 200
    me = next(m for m in mine.json()["members"] if m["user_id"] == friend)
    assert me["handoff_status"] == "received" and me["paid"] is True


def test_migration_0010_creates_one_hand_off_row_per_member_1418():
    engine = make_bare_engine()
    upgrade_to(engine, "0009")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, email, name, google_sub) VALUES (1, 'h@x', 'H', 'h')"))
        conn.execute(
            text(
                "INSERT INTO group_buys (id, host_user_id, title, status, invite_token, external_order_id, "
                "receipt_text, order_notes, shipping_cost, shipping_split, tax_cost, is_public) "
                "VALUES (1, 1, 't', 'ordered', 'tok', '', '', '', 0, 'equal', 0, false)"
            )
        )
    upgrade_to(engine, "head")
    insert = text(
        "INSERT INTO group_buy_handoffs (group_buy_id, user_id, status, tracking_url, note, qty_handed) "
        "VALUES (1, 1, 'waiting', '', '', 0)"
    )
    with engine.begin() as conn:
        conn.execute(insert)
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(insert)
    engine.dispose()
