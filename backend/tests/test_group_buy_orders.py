"""Seller orders (packages) for a group buy: Owned moves on arrival only (#1418)."""

from __future__ import annotations

import pytest
from sqlalchemy import select, text

from app.core.errors import Conflict, Forbidden, Invalid
from app.core.models import User
from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuy, GroupBuyReceiptApply
from app.group_buy.schemas import (
    GroupBuyArrivalLineIn,
    GroupBuyArrivalUndo,
    GroupBuyArrivalUpdate,
    GroupBuyOrderCreate,
    GroupBuyOrderLineIn,
    GroupBuyOrderLinesUpdate,
    GroupBuyOrderUpdate,
    GroupBuyOrderPatch,
    GroupBuyReceiptApplyRequest,
)
from app.planner import decks as deck_svc
from app.planner.models import Owned, OwnedPrinting
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned
from alembic import command
from tests.db_support import make_bare_engine
from tests.test_alembic_baseline import _alembic_config
from tests.friend_support import as_user, client, make_user as make_http_user  # noqa: F401

def upgrade_to(engine, revision: str) -> None:
    cfg = _alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, revision)


ALT = "1\tOne Piece Card Game - Test Set - Luffy (OP01-001) (Parallel) - Near Mint"
STD = "Test Set - Luffy (OP01-001) - Near Mint"


def _receipt(alt: int = 0, std: int = 0) -> str:
    rows = ["Qty\tDescription"]
    if alt:
        rows.append(ALT.replace("1\t", f"{alt}\t", 1))
    if std:
        rows.append(f"{std}\tOne Piece Card Game - {STD}")
    return "\n".join(rows)


def _owned(db, user_id: int, card_id: str = "OP01-001") -> int:
    row = db.scalar(select(Owned).where(Owned.user_id == user_id, Owned.card_id == card_id))
    return int(row.qty) if row else 0


def _alt_owned(db, user_id: int, product_id: int = 1009, card_id: str = "OP01-001") -> int:
    row = db.scalar(
        select(OwnedPrinting).where(
            OwnedPrinting.user_id == user_id,
            OwnedPrinting.card_id == card_id,
            OwnedPrinting.product_id == product_id,
        )
    )
    return int(row.qty) if row else 0


def _locked_group(db, *, host_alt: bool = False):
    """Host (first snapshot row) and friend each need 2 Luffy; friend wants one as the 1009 alt.

    With ``host_alt`` the host wants one alt as well, so two members compete for the alt.
    """
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-001", name="Luffy", product_id=1009, market=9.0, special=True)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    host_deck = add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 2})
    friend_deck = add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 2})
    set_owned(db, host, "OP01-001", 0)
    set_owned(db, friend, "OP01-001", 0)
    deck_svc.set_deck_card_printing(db, friend, friend_deck.id, "OP01-001", 1009, 1)
    if host_alt:
        deck_svc.set_deck_card_printing(db, host, host_deck.id, "OP01-001", 1009, 1)
    created = group_buy.create_group_buy(db, host, "Orders")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    return host, friend, created.id


def _add(db, host, gid, *, alt=0, std=0, number="", arrived=False, **extra):
    return group_buy.add_order(
        db,
        host,
        gid,
        GroupBuyOrderCreate(
            order_number=number, receipt_text=_receipt(alt, std), mark_arrived=arrived, **extra
        ),
    )


def _order(detail, order_id):
    return next(o for o in detail.orders if o.id == order_id)


def _arrive_all(db, host, gid, order):
    return group_buy.set_order_arrival(
        db, host, gid, order.id, GroupBuyArrivalUpdate(expected_version=order.version, all=True)
    )


def test_adding_an_order_leaves_owned_unchanged_1418(db):
    host, friend, gid = _locked_group(db)

    added = _add(db, host, gid, alt=1, std=3)

    assert [o.qty_arrived for o in added.detail.orders] == [0]
    assert _owned(db, host.id) == 0 and _owned(db, friend.id) == 0
    assert _alt_owned(db, friend.id) == 0 and _alt_owned(db, host.id) == 0


def test_the_first_order_moves_locked_to_ordered_1418(db):
    host, _friend, gid = _locked_group(db)
    assert group_buy.get_group_buy(db, host, gid).ordered_at is None

    added = _add(db, host, gid, std=1)

    assert added.detail.status == "ordered"
    assert added.detail.ordered_at is not None


def test_copies_go_to_the_alt_wanter_even_when_not_first_and_split_across_orders_1418(db):
    host, friend, gid = _locked_group(db)

    first = _add(db, host, gid, alt=1, std=1).detail.orders[0]
    second = _add(db, host, gid, std=2).detail.orders[-1]

    def allocations(order):
        return {
            (line.product_id, a.user_id): a.qty for line in order.lines for a in line.allocations
        }

    assert allocations(first) == {(1009, friend.id): 1, (None, host.id): 1}
    assert allocations(second) == {(None, host.id): 1, (None, friend.id): 1}


def test_a_second_order_gives_the_alt_to_the_other_member_who_wants_it_1418(db):
    host, friend, gid = _locked_group(db, host_alt=True)

    first = _add(db, host, gid, alt=1).detail.orders[0]
    second = _add(db, host, gid, alt=1).detail.orders[-1]

    assert [a.user_id for line in first.lines for a in line.allocations] == [host.id]
    assert [a.user_id for line in second.lines for a in line.allocations] == [friend.id]


def test_arrival_credits_the_right_member_and_art_1418(db):
    host, friend, gid = _locked_group(db)
    order = _add(db, host, gid, alt=1, std=1).detail.orders[0]

    _arrive_all(db, host, gid, order)

    assert _alt_owned(db, friend.id) == 1 and _owned(db, friend.id) == 0
    assert _owned(db, host.id) == 1 and _alt_owned(db, host.id) == 0


def test_a_repeated_arrival_with_the_same_targets_changes_nothing_1418(db):
    host, friend, gid = _locked_group(db)
    order = _add(db, host, gid, alt=1, std=1).detail.orders[0]
    first = group_buy.set_order_arrival(
        db, host, gid, order.id, GroupBuyArrivalUpdate(expected_version=order.version, all=True)
    )
    applies = len(db.scalars(select(GroupBuyReceiptApply)).all())
    current = _order(first, order.id).version

    again = group_buy.set_order_arrival(
        db, host, gid, order.id, GroupBuyArrivalUpdate(expected_version=current, all=True)
    )

    assert _owned(db, host.id) == 1 and _alt_owned(db, friend.id) == 1
    assert len(db.scalars(select(GroupBuyReceiptApply)).all()) == applies
    assert _order(again, order.id).version == current


def test_lowering_the_arrived_count_takes_the_copies_back_1418(db):
    host, friend, gid = _locked_group(db)
    order = _add(db, host, gid, std=3).detail.orders[0]
    line = order.lines[0]
    arrived = _arrive_all(db, host, gid, order)
    assert _owned(db, host.id) == 2 and _owned(db, friend.id) == 1

    group_buy.set_order_arrival(
        db,
        host,
        gid,
        order.id,
        GroupBuyArrivalUpdate(
            expected_version=_order(arrived, order.id).version,
            lines=[GroupBuyArrivalLineIn(line_id=line.id, qty_arrived=2)],
        ),
    )

    # Copies fill allocations in allocation order: the host's came first, so the friend's goes back.
    assert _owned(db, host.id) == 2 and _owned(db, friend.id) == 0


def test_undoing_the_first_order_leaves_the_second_orders_copies_1418(db):
    host, friend, gid = _locked_group(db)
    first = _add(db, host, gid, alt=1, std=1).detail.orders[0]
    second = _add(db, host, gid, std=2).detail.orders[-1]
    _arrive_all(db, host, gid, first)
    detail = _arrive_all(db, host, gid, second)
    assert _owned(db, host.id) == 2 and _owned(db, friend.id) == 1

    group_buy.undo_order_arrival(
        db, host, gid, first.id, GroupBuyArrivalUndo(expected_version=_order(detail, first.id).version)
    )

    assert _alt_owned(db, friend.id) == 0
    assert _owned(db, host.id) == 1 and _owned(db, friend.id) == 1


def test_unlock_is_refused_once_an_order_exists_1418(db):
    host, _friend, gid = _locked_group(db)
    _add(db, host, gid, std=1)
    # The legacy ordered state has no way back; force the status to see the order itself block it.
    group = db.get(GroupBuy, gid)
    group.status = "locked"
    db.commit()

    with pytest.raises(Forbidden):
        group_buy.unlock_group_buy(db, host, gid)


def test_members_and_the_public_view_do_not_see_the_order_number_tracking_or_receipt_1418(db):
    host, friend, gid = _locked_group(db)
    _add(
        db,
        host,
        gid,
        std=1,
        number="TCG-123",
        seller_name="Card Shop",
        tracking_url="https://track.example/1",
    )
    token = group_buy.get_group_buy(db, host, gid).invite_token

    as_host = group_buy.get_group_buy(db, host, gid).orders[0]
    as_friend = group_buy.get_group_buy(db, friend, gid).orders[0]
    public = group_buy.public_group_buy_view(db, token).orders[0]

    assert (as_host.order_number, as_host.tracking_url) == ("TCG-123", "https://track.example/1")
    assert "Luffy" in as_host.receipt_text
    for seen in (as_friend, public):
        assert (seen.order_number, seen.tracking_url, seen.receipt_text) == ("", "", "")
        assert seen.seller_name == "Card Shop"


def test_a_tracking_link_must_be_https_1418(db):
    host, _friend, gid = _locked_group(db)
    for bad in ("http://track.example/1", "javascript:alert(1)", "track.example/1"):
        with pytest.raises(Invalid):
            _add(db, host, gid, std=1, tracking_url=bad)
    order = _add(db, host, gid, std=1).detail.orders[0]

    with pytest.raises(Invalid):
        group_buy.update_order_details(
            db, host, gid, order.id, GroupBuyOrderPatch(tracking_url="http://x.example")
        )
    ok = group_buy.update_order_details(
        db, host, gid, order.id, GroupBuyOrderPatch(tracking_url="https://x.example")
    )
    assert _order(ok, order.id).tracking_url == "https://x.example"


def test_an_order_with_arrived_copies_cannot_be_deleted_1418(db):
    host, friend, gid = _locked_group(db)
    order = _add(db, host, gid, std=3).detail.orders[0]
    arrived = _arrive_all(db, host, gid, order)

    with pytest.raises(Conflict):
        group_buy.delete_order(db, host, gid, order.id)
    assert _owned(db, host.id) == 2

    reverted = group_buy.undo_order_arrival(
        db, host, gid, order.id, GroupBuyArrivalUndo(expected_version=_order(arrived, order.id).version)
    )
    gone = group_buy.delete_order(db, host, gid, order.id)
    assert not gone.orders
    assert {l.card_id: l.total_qty for l in gone.lines} == {"OP01-001": 4}
    assert reverted.status == "ordered"


def test_a_stale_version_is_refused_and_only_the_host_can_change_orders_1418(client):
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
    assert as_user(c, host).post(f"/group-buys/{gid}/lock").status_code == 200
    body = {"order_number": "A1", "receipt_text": _receipt(std=4)}

    assert as_user(c, friend).post(f"/group-buys/{gid}/orders", json=body).status_code == 403
    added = as_user(c, host).post(f"/group-buys/{gid}/orders", json=body)
    assert added.status_code == 200
    oid = added.json()["order_id"]
    assert as_user(c, host).post(f"/group-buys/{gid}/orders", json=body).status_code == 409
    assert as_user(c, host).get(f"/group-buys/{gid}").json()["orders"][0]["order_number"] == "A1"
    assert as_user(c, friend).get(f"/group-buys/{gid}").json()["orders"][0]["order_number"] == ""
    assert (
        as_user(c, host)
        .post(f"/group-buys/{gid}/orders", json={"tracking_url": "http://x.example"})
        .status_code
        == 400
    )

    url = f"/group-buys/{gid}/orders/{oid}/arrival"
    assert as_user(c, friend).put(url, json={"expected_version": 1, "all": True}).status_code == 403
    assert as_user(c, host).put(url, json={"expected_version": 1, "all": True}).status_code == 200
    stale = as_user(c, host).put(url, json={"expected_version": 1, "lines": [{"line_id": 1, "qty_arrived": 0}]})
    assert stale.status_code == 409


def test_mark_purchased_still_credits_each_member_and_records_one_arrived_order_1418(db):
    host, friend, gid = _locked_group(db)

    done = group_buy.apply_receipt_to_group_buy(
        db, host, gid, GroupBuyReceiptApplyRequest(receipt_text=_receipt(alt=1, std=3), allow_partial=False)
    )

    assert done.status == "completed"
    assert _alt_owned(db, friend.id) == 1 and _owned(db, friend.id) == 1
    assert _owned(db, host.id) == 2
    assert [(o.status, o.qty_arrived) for o in done.orders] == [("arrived", 4)]


def test_closing_completes_without_crediting_copies_that_never_arrived_1418(db):
    host, friend, gid = _locked_group(db)
    first = _add(db, host, gid, alt=1, std=1).detail.orders[0]
    _arrive_all(db, host, gid, first)
    _add(db, host, gid, std=2)

    closed = group_buy.close_group_buy(db, host, gid)

    assert closed.status == "completed"
    assert _owned(db, host.id) == 1 and _owned(db, friend.id) == 0
    assert _alt_owned(db, friend.id) == 1
    with pytest.raises(Forbidden):
        group_buy.set_order_arrival(
            db, host, gid, first.id, GroupBuyArrivalUpdate(expected_version=99, all=True)
        )


def test_the_buy_completes_when_every_copy_arrived_and_none_is_unordered_1418(db):
    host, _friend, gid = _locked_group(db)
    first = _add(db, host, gid, alt=1, std=1).detail.orders[0]
    after_first = _arrive_all(db, host, gid, first)
    assert after_first.status == "ordered"

    added = _add(db, host, gid, std=2)
    assert added.detail.status == "ordered"
    done = _arrive_all(db, host, gid, added.detail.orders[-1])

    assert done.status == "completed"
    assert all(l.not_ordered == 0 for l in done.lines)


def test_an_order_with_copies_beyond_the_pool_shows_them_as_extra_1418(db):
    host, friend, gid = _locked_group(db)

    order = _add(db, host, gid, std=5).detail.orders[0]
    _arrive_all(db, host, gid, order)

    assert (order.qty_ordered, order.qty_allocated, order.qty_extra) == (5, 4, 1)
    assert _owned(db, host.id) + _owned(db, friend.id) == 4


def test_line_counts_split_what_is_in_an_order_arrived_and_not_ordered_yet_1418(db):
    host, friend, gid = _locked_group(db)
    first = _add(db, host, gid, alt=1, std=1).detail.orders[0]

    before = group_buy.get_group_buy(db, friend, gid).lines[0]
    assert (before.in_order, before.arrived, before.not_ordered) == (2, 0, 2)
    assert (before.my_in_order, before.my_arrived, before.my_not_ordered) == (1, 0, 1)

    _arrive_all(db, host, gid, first)
    after = group_buy.get_group_buy(db, friend, gid).lines[0]
    assert (after.in_order, after.arrived, after.not_ordered) == (2, 2, 2)
    assert (after.my_in_order, after.my_arrived, after.my_not_ordered) == (1, 1, 1)


def test_previewing_an_order_saves_nothing_and_lists_who_gets_each_copy_1418(db):
    host, friend, gid = _locked_group(db)

    preview = group_buy.preview_order(db, host, gid, _receipt(alt=1, std=1) + "\n1\tNot A Real Card")

    alt_line = next(l for l in preview.lines if l.product_id == 1009)
    assert [(a.user_id, a.qty) for a in alt_line.allocations] == [(friend.id, 1)]
    assert [u.description for u in preview.unmatched] == ["Not A Real Card"]
    detail = group_buy.get_group_buy(db, host, gid)
    assert detail.orders == [] and detail.receipt_text == "" and detail.status == "locked"


def test_adding_an_order_returns_the_lines_that_matched_no_card_1418(db):
    host, _friend, gid = _locked_group(db)

    added = group_buy.add_order(
        db,
        host,
        gid,
        GroupBuyOrderCreate(receipt_text=_receipt(std=1) + "\n2\tMystery Sleeves"),
    )

    assert [(u.qty, u.description) for u in added.unmatched] == [(2, "Mystery Sleeves")]


def test_migration_turns_existing_applies_into_one_arrived_order_1418():
    engine = make_bare_engine()
    upgrade_to(engine, "0007")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, email, name, google_sub) VALUES (1, 'h@x', 'H', 'h'), (2, 'f@x', 'F', 'f')"))
        for gid, status, ext in ((1, "completed", "TCG-9"), (2, "ordered", ""), (3, "locked", ""), (4, "locked", "REF-4")):
            conn.execute(
                text(
                    "INSERT INTO group_buys (id, host_user_id, title, status, invite_token, external_order_id, "
                    "receipt_text, order_notes, shipping_cost, shipping_split, tax_cost, is_public) "
                    "VALUES (:i, 1, 't', :s, :tok, :e, 'the receipt', '', 0, 'equal', 0, false)"
                ),
                {"i": gid, "s": status, "tok": f"tok{gid}", "e": ext},
            )
        conn.execute(
            text(
                "INSERT INTO catalog_printings (card_id, product_id, name, image_url, tcgplayer_url, group_name, is_special) "
                "VALUES ('OP01-001', 1001, 'Luffy', '', '', '', 0), ('OP01-001', 1009, 'Luffy Alt', '', '', '', 1)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO group_buy_receipt_applies (id, group_buy_id, applied_by_user_id, status_before, set_ordered_at) "
                "VALUES (1, 1, 1, 'ordered', 0), (2, 1, 1, 'ordered', 0)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO group_buy_receipt_apply_lines (apply_id, user_id, card_id, product_id, qty) VALUES "
                "(1, 1, 'OP01-001', 1001, 1), (1, 2, 'OP01-001', 1009, 1), (2, 1, 'OP01-001', 1001, 1)"
            )
        )
    upgrade_to(engine, "head")
    with engine.connect() as conn:
        orders = conn.execute(
            text("SELECT group_buy_id, order_number, receipt_text FROM group_buy_orders ORDER BY group_buy_id")
        ).all()
        lines = conn.execute(
            text("SELECT card_id, product_id, qty_ordered FROM group_buy_order_lines ORDER BY product_id")
        ).all()
        allocations = conn.execute(
            text("SELECT user_id, qty, qty_arrived FROM group_buy_order_allocations ORDER BY user_id")
        ).all()
        attached = conn.execute(text("SELECT order_id FROM group_buy_receipt_applies ORDER BY id")).scalars().all()
        flags = conn.execute(
            text("SELECT group_buy_id, from_receipt_apply FROM group_buy_orders ORDER BY group_buy_id")
        ).all()
    engine.dispose()

    assert [(g, n) for g, n, _ in orders] == [(1, "TCG-9"), (2, ""), (4, "REF-4")]
    assert all(r == "the receipt" for _, _, r in orders)
    # A standard credit stored its product id too; only the special printing counts as an art.
    assert sorted(lines, key=lambda l: l[1] or 0) == [("OP01-001", None, 2), ("OP01-001", 1009, 1)]
    assert allocations == [(1, 2, 2), (2, 1, 1)]
    assert attached == [attached[0], attached[0]] and attached[0] is not None
    # Only the order built from old Mark purchased applies is one receipt/undo may drop.
    assert [(g, bool(f)) for g, f in flags] == [(1, True), (2, False), (4, False)]


def _money(detail):
    return (
        detail.cards_subtotal,
        detail.grand_total,
        {m.user_id: (m.card_cost, m.shipping_share, m.total_owed, m.cards_still_needed) for m in detail.members},
    )


def test_what_members_owe_is_the_same_before_an_order_after_it_and_after_arrival_1418(db):
    host, friend, gid = _locked_group(db)
    group_buy.update_order(
        db, host, gid, GroupBuyOrderUpdate(shipping_cost=8.0, tax_cost=2.0, shipping_split="by_copies")
    )
    before = group_buy.get_group_buy(db, host, gid)
    assert before.cards_subtotal > 0

    # Two standard copies go to the host, so every one of the host's copies is in this order.
    added = _add(db, host, gid, std=2).detail
    arrived = _arrive_all(db, host, gid, added.orders[0])
    closed = group_buy.close_group_buy(db, host, gid)

    assert _money(added) == _money(before)
    assert _money(arrived) == _money(before)
    assert _money(closed) == _money(before)


def test_lines_keep_cards_that_are_fully_in_an_order_with_their_snapshot_quantities_1418(db):
    host, friend, gid = _locked_group(db)

    detail = _add(db, host, gid, alt=1, std=3).detail

    (line,) = detail.lines
    assert (line.total_qty, line.my_qty) == (4, 2)
    assert (line.in_order, line.not_ordered, line.my_in_order, line.my_not_ordered) == (4, 0, 2, 0)
    friend_line = group_buy.get_group_buy(db, friend, gid).lines[0]
    assert (friend_line.my_qty, friend_line.my_in_order, friend_line.my_not_ordered) == (2, 2, 0)


def test_mass_entry_lists_only_copies_not_in_an_order_1418(db):
    host, _friend, gid = _locked_group(db)
    assert group_buy.export_tcgplayer(db, host, gid).copy_count == 4

    _add(db, host, gid, alt=1, std=1)

    assert group_buy.export_tcgplayer(db, host, gid).copy_count == 2


def test_a_receipt_match_only_needs_copies_not_in_an_order_1418(db):
    host, _friend, gid = _locked_group(db)
    _add(db, host, gid, std=3)

    report = group_buy.build_receipt_match_report(db, host, gid, _receipt(std=4))

    assert [(l.needed_qty, l.staged_qty) for l in report.lines] == [(1, 1)]


def test_receipt_undo_only_takes_back_arrivals_of_an_order_added_on_purpose_1418(db):
    host, friend, gid = _locked_group(db)
    _add(db, host, gid, std=4, arrived=True)
    assert _owned(db, host.id) == 2

    undone = group_buy.undo_last_receipt_apply(db, host, gid)

    assert _owned(db, host.id) == 0 and _owned(db, friend.id) == 0
    assert [(o.status, o.qty_arrived) for o in undone.orders] == [("on_the_way", 0)]
    assert undone.status == "ordered"


def _set_lines(db, host, gid, order, **kw):
    return group_buy.set_order_lines(
        db, host, gid, order.id, GroupBuyOrderLinesUpdate(expected_version=order.version, **kw)
    )


def test_an_order_saved_with_only_a_number_can_get_its_items_later_1418(db):
    host, _friend, gid = _locked_group(db)
    added = group_buy.add_order(db, host, gid, GroupBuyOrderCreate(order_number="A-1"))
    order = _order(added.detail, added.order_id)
    assert order.lines == [] and group_buy.export_tcgplayer(db, host, gid).copy_count == 4

    result = _set_lines(db, host, gid, order, receipt_text=_receipt(alt=1, std=3))

    after = _order(result.detail, order.id)
    assert after.qty_ordered == 4 and after.qty_allocated == 4 and after.version == order.version + 1
    assert group_buy.export_tcgplayer(db, host, gid).copy_count == 0


def test_replacing_an_orders_items_redoes_allocation_around_the_other_orders_1418(db):
    host, _friend, gid = _locked_group(db)
    _add(db, host, gid, std=2)
    second = _add(db, host, gid, std=1)
    order = _order(second.detail, second.order_id)

    result = _set_lines(db, host, gid, order, receipt_text=_receipt(std=3))

    after = _order(result.detail, order.id)
    # 4 copies are needed in all and 2 already sit in the first order: only 2 are left to allocate.
    assert (after.qty_ordered, after.qty_allocated, after.qty_extra) == (3, 2, 1)


def test_replacing_items_can_pick_cards_by_hand_1418(db):
    host, _friend, gid = _locked_group(db)
    added = _add(db, host, gid, std=1)
    order = _order(added.detail, added.order_id)

    result = _set_lines(db, host, gid, order, lines=[GroupBuyOrderLineIn(card_id="OP01-001", qty=2)])

    assert _order(result.detail, order.id).qty_ordered == 2


def test_items_cannot_change_once_anything_in_the_order_arrived_1418(db):
    host, _friend, gid = _locked_group(db)
    added = _add(db, host, gid, std=2, arrived=True)
    order = _order(added.detail, added.order_id)

    with pytest.raises(Conflict):
        _set_lines(db, host, gid, order, receipt_text=_receipt(std=1))

    assert _order(group_buy.get_group_buy(db, host, gid), order.id).qty_ordered == 2


def test_a_stale_version_cannot_replace_items_1418(db):
    host, _friend, gid = _locked_group(db)
    added = _add(db, host, gid, std=2)
    order = _order(added.detail, added.order_id)
    _set_lines(db, host, gid, order, receipt_text=_receipt(std=1))

    with pytest.raises(Conflict):
        _set_lines(db, host, gid, order, receipt_text=_receipt(std=2))


def test_only_the_host_can_replace_items_and_something_must_be_sent_1418(db):
    host, friend, gid = _locked_group(db)
    added = _add(db, host, gid, std=1)
    order = _order(added.detail, added.order_id)

    with pytest.raises(Forbidden):
        _set_lines(db, friend, gid, order, receipt_text=_receipt(std=1))
    with pytest.raises(Invalid):
        _set_lines(db, host, gid, order)


def _missing(detail):
    """(name, art or 0 for standard, qty) of every not-ordered copy on the first line."""
    return sorted(
        (m.display_name, m.product_id or 0, m.qty) for m in detail.lines[0].not_ordered_members
    )


def test_a_card_part_in_an_order_lists_who_is_still_missing_copies_and_which_art_1439(db):
    """(#1439) Host needs 2 standard, Friend needs 1 alt (1009) + 1 standard."""
    host, friend, gid = _locked_group(db)
    assert _missing(group_buy.get_group_buy(db, friend, gid)) == []

    _add(db, host, gid, std=1)
    seen = group_buy.get_group_buy(db, friend, gid)

    assert seen.lines[0].not_ordered == 3
    assert _missing(seen) == [("Friend", 0, 1), ("Friend", 1009, 1), ("Host", 0, 1)]

    _add(db, host, gid, alt=1)
    seen = group_buy.get_group_buy(db, friend, gid)

    assert seen.lines[0].not_ordered == 2
    assert _missing(seen) == [("Friend", 0, 1), ("Host", 0, 1)]


def test_the_not_ordered_members_add_up_to_the_not_ordered_count_1439(db):
    host, friend, gid = _locked_group(db)
    _add(db, host, gid, alt=1, std=2)
    line = group_buy.get_group_buy(db, host, gid).lines[0]

    assert line.not_ordered == 1
    assert sum(m.qty for m in line.not_ordered_members) == line.not_ordered


def test_the_public_view_names_not_ordered_members_like_everything_else_1439(db):
    host, friend, gid = _locked_group(db)
    _add(db, host, gid, std=1)
    token = group_buy.get_group_buy(db, host, gid).invite_token

    public = group_buy.public_group_buy_view(db, token).lines[0]

    assert {m.display_name for m in public.not_ordered_members} == {"Host", "Member 1"}
