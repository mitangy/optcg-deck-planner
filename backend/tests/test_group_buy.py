from __future__ import annotations

import pytest

from sqlalchemy import select

from app import group_buy, services
from app.models import Owned
from app.schemas import GroupBuyOrderUpdate, GroupBuyReceiptApplyRequest
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


@pytest.fixture()
def two_players(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    add_catalog(
        db, "OP01-001", name="Luffy", product_id=1009, market=9.0, special=True
    )

    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 4, "OP01-002": 2})
    add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 3, "OP01-002": 4})
    set_owned(db, host, "OP01-001", 1)  # still need 3
    set_owned(db, friend, "OP01-002", 1)  # still need 3 of 002, 3 of 001
    return host, friend


def test_create_join_and_merge_sums_still_need(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Friday night", deck_ids=None)
    assert created.is_host
    assert created.member_count == 1
    assert created.status == "open"

    joined = group_buy.join_group_buy(db, friend, created.invite_token)
    assert joined.member_count == 2
    assert not joined.is_host

    # Host still needs 3 OP01-001 + 2 OP01-002; friend 3 + 3
    by_id = {line.card_id: line for line in joined.lines}
    assert by_id["OP01-001"].total_qty == 6
    assert by_id["OP01-002"].total_qty == 5
    assert {m.display_name: m.qty for m in by_id["OP01-001"].members} == {
        "Host": 3,
        "Friend": 3,
    }
    assert by_id["OP01-001"].product_id == 1001  # preferred standard printing


def test_lock_freezes_quantities_against_later_owned_changes(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Lock test")
    group_buy.join_group_buy(db, friend, created.invite_token)
    locked = group_buy.lock_group_buy(db, host, created.id)
    assert locked.status == "locked"
    before = {line.card_id: line.total_qty for line in locked.lines}

    # Friend buys their whole list after lock — live shopping would drop, snapshot must not.
    set_owned(db, friend, "OP01-001", 99)
    set_owned(db, friend, "OP01-002", 99)
    again = group_buy.get_group_buy(db, host, created.id)
    after = {line.card_id: line.total_qty for line in again.lines}
    assert after == before

    # New users cannot join locked pools.
    outsider = make_user(db, email="out@example.com", name="Out", sub="sub-out")
    with pytest.raises(PermissionError):
        group_buy.join_group_buy(db, outsider, created.invite_token)


def test_host_printing_override_and_export(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Export")
    group_buy.join_group_buy(db, friend, created.invite_token)
    updated = group_buy.set_line_override(db, host, created.id, "OP01-001", 1009)
    line = next(l for l in updated.lines if l.card_id == "OP01-001")
    assert line.product_id == 1009
    assert line.preferred_product_id == 1001

    # Selecting preferred again clears the override.
    reset = group_buy.set_line_override(db, host, created.id, "OP01-001", 1001)
    line = next(l for l in reset.lines if l.card_id == "OP01-001")
    assert line.product_id == 1001

    group_buy.set_line_override(db, host, created.id, "OP01-001", 1009)
    export = group_buy.export_tcgplayer(db, host, created.id)
    # No alt wants → host printing override still buys the whole line as AA.
    assert "6-1009" in export.paste_text.splitlines()
    assert "5-1002" in export.paste_text.splitlines()
    assert export.copy_count == 11
    assert export.with_product_id == 2


def test_export_allocates_alt_wants_not_whole_line(db, two_players):
    """Mass entry must split AA wants; not dump total_qty onto checkout printing."""
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "AA export")
    group_buy.join_group_buy(db, friend, created.invite_token)

    host_deck = next(d for d in services.list_decks(db, host) if d.name == "Host Deck")
    # Host still-need 3 of OP01-001; want only 1 AA. Friend still-need 3, no AA.
    services.set_deck_card_printing(db, host, host_deck.id, "OP01-001", 1009, 1)
    # Checkout override to AA used to export 6-1009 — must not when alts are set.
    group_buy.set_line_override(db, host, created.id, "OP01-001", 1009)

    export = group_buy.export_tcgplayer(db, host, created.id)
    lines = export.paste_text.splitlines()
    # Host 1×AA + 2×preferred, Friend 3×preferred → 1×1009 + 5×1001
    assert "1-1009" in lines
    assert "5-1001" in lines
    assert "6-1009" not in lines
    assert "5-1002" in lines  # OP01-002 unchanged
    assert export.copy_count == 11


def test_member_cannot_lock(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Perms")
    group_buy.join_group_buy(db, friend, created.invite_token)
    with pytest.raises(PermissionError):
        group_buy.lock_group_buy(db, friend, created.id)


def test_contribution_deck_filter(db, two_players):
    host, _friend = two_players
    # Second deck for host with only OP01-002
    deck_b = add_deck_with_cards(db, host, "Only Zoro", {"OP01-002": 4})
    created = group_buy.create_group_buy(db, host, "Filtered", deck_ids=[deck_b.id])
    assert len(created.lines) == 1
    assert created.lines[0].card_id == "OP01-002"
    # Host owned 0 of 002 in fixture... wait host has deck with 002 need 2 and no owned for 002
    # With only deck_b, need 4 of 002, owned 0 → still 4
    assert created.lines[0].total_qty == 4


def test_import_deck_auto_adds_to_open_group_buy_contribution(db, two_players):
    """Importing a deck while a filtered group buy is open appends it to contribution."""
    host, _friend = two_players
    add_catalog(db, "OP01-099", name="New Card", product_id=1099, market=3.0)
    host_deck = next(d for d in services.list_decks(db, host))
    created = group_buy.create_group_buy(db, host, "Auto add", deck_ids=[host_deck.id])
    before_ids = {line.card_id for line in created.lines}
    assert "OP01-099" not in before_ids

    new_deck = services.create_deck(db, host, "Imported", "4 OP01-099")
    detail = group_buy.get_group_buy(db, host, created.id)
    member = next(m for m in detail.members if m.user_id == host.id)
    assert member.deck_ids is not None
    assert new_deck.id in member.deck_ids
    assert "OP01-099" in {line.card_id for line in detail.lines}


def test_import_deck_noop_when_contribution_is_all_decks(db, two_players):
    """Null contribution already means all decks — import still surfaces in the pool."""
    host, _friend = two_players
    add_catalog(db, "OP01-098", name="Other", product_id=1098, market=2.0)
    created = group_buy.create_group_buy(db, host, "All decks", deck_ids=None)
    services.create_deck(db, host, "Imported All", "2 OP01-098")
    detail = group_buy.get_group_buy(db, host, created.id)
    member = next(m for m in detail.members if m.user_id == host.id)
    assert member.deck_ids is None
    assert "OP01-098" in {line.card_id for line in detail.lines}


def test_member_can_override_buy_qty(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Qty edit")
    group_buy.join_group_buy(db, friend, created.invite_token)

    # Host still needs 3 of OP01-001; buy only 1.
    updated = group_buy.set_member_qty(db, host, created.id, "OP01-001", 1)
    line = next(l for l in updated.lines if l.card_id == "OP01-001")
    assert line.my_qty == 1
    assert line.my_suggested_qty == 3
    assert line.my_is_custom is True
    assert line.total_qty == 4  # host 1 + friend 3

    # Matching suggested clears the override.
    cleared = group_buy.set_member_qty(db, host, created.id, "OP01-001", 3)
    line = next(l for l in cleared.lines if l.card_id == "OP01-001")
    assert line.my_is_custom is False
    assert line.my_qty == 3
    assert line.total_qty == 6


def test_qty_zero_opts_out_and_sync_resets(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Opt out")
    group_buy.join_group_buy(db, friend, created.invite_token)

    updated = group_buy.set_member_qty(db, friend, created.id, "OP01-001", 0)
    line = next(l for l in updated.lines if l.card_id == "OP01-001")
    assert line.total_qty == 3  # host only
    assert line.my_qty == 0
    assert line.my_is_custom is True
    assert line.my_excluded is True

    synced = group_buy.sync_member_quantities(db, friend, created.id)
    line = next(l for l in synced.lines if l.card_id == "OP01-001")
    assert line.my_qty == 3
    assert line.my_is_custom is False
    assert line.my_excluded is False
    assert line.total_qty == 6


def test_exclude_keeps_zero_total_line_for_viewer(db, two_players):
    """Sole buyer excluding a card keeps a grayed-out row (custom qty 0)."""
    host, _friend = two_players
    created = group_buy.create_group_buy(db, host, "Solo exclude")

    updated = group_buy.set_member_qty(db, host, created.id, "OP01-001", 0)
    line = next(l for l in updated.lines if l.card_id == "OP01-001")
    assert line.total_qty == 0
    assert line.my_qty == 0
    assert line.my_excluded is True
    assert line.my_suggested_qty == 3


def test_locked_group_rejects_qty_edits(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Locked qty")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    with pytest.raises(PermissionError):
        group_buy.set_member_qty(db, host, created.id, "OP01-001", 1)


def _owned(db, user_id: int, card_id: str) -> int:
    row = db.scalar(
        select(Owned).where(Owned.user_id == user_id, Owned.card_id == card_id)
    )
    return int(row.qty) if row else 0


def _receipt_for_pool(*rows: tuple[str, int, str]) -> str:
    """Build a simple TCGPlayer-style receipt: (card_name, qty, set_label)."""
    lines = ["Qty\tDescription"]
    for name, qty, set_name in rows:
        lines.append(f"{qty}\tOne Piece Card Game - {set_name} - {name} - Near Mint")
    return "\n".join(lines)


def test_complete_requires_receipt(db, two_players):
    """Naked Mark purchased without a receipt is blocked — use receipt apply."""
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Must receipt")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)
    with pytest.raises(PermissionError, match="receipt"):
        group_buy.complete_group_buy(db, host, created.id)


def test_complete_applies_owned_and_clears_shopping(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Purchased")
    group_buy.join_group_buy(db, friend, created.invite_token)
    # Host buys only 1 of OP01-001 (still-need was 3)
    group_buy.set_member_qty(db, host, created.id, "OP01-001", 1)
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)

    assert _owned(db, host.id, "OP01-001") == 1
    assert _owned(db, friend.id, "OP01-001") == 0

    # Snapshot totals after qty override: OP01-001=4, OP01-002=5
    receipt = _receipt_for_pool(("Luffy", 4, "Test Set"), ("Zoro", 5, "Test Set"))
    done = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt, allow_partial=False),
    )
    assert done.status == "completed"

    # Host: 1 existing + 1 bought; Friend: 0 + 3 bought
    assert _owned(db, host.id, "OP01-001") == 2
    assert _owned(db, friend.id, "OP01-001") == 3
    assert _owned(db, host.id, "OP01-002") == 2
    assert _owned(db, friend.id, "OP01-002") == 4

    host_shop = services.shopping_list(db, host)
    friend_shop = services.shopping_list(db, friend)
    host_by_id = {i.card_id: i.still_need for i in host_shop.items if i.still_need > 0}
    friend_by_id = {i.card_id: i.still_need for i in friend_shop.items if i.still_need > 0}
    # Host still needs 2 more OP01-001 (need 4, owned 2); OP01-002 filled
    assert host_by_id.get("OP01-001") == 2
    assert "OP01-002" not in host_by_id
    assert friend_by_id == {}  # friend fully covered

    with pytest.raises(PermissionError):
        group_buy.unlock_group_buy(db, host, created.id)
    # Idempotent completed status via naked complete
    again = group_buy.complete_group_buy(db, host, created.id)
    assert again.status == "completed"
    assert _owned(db, host.id, "OP01-001") == 2


def test_complete_requires_ordered_or_receipt(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Must order")
    group_buy.join_group_buy(db, friend, created.invite_token)
    with pytest.raises(PermissionError, match="receipt"):
        group_buy.complete_group_buy(db, host, created.id)
    group_buy.lock_group_buy(db, host, created.id)
    with pytest.raises(PermissionError, match="receipt"):
        group_buy.complete_group_buy(db, host, created.id)


def test_member_cannot_complete(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "No")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)
    with pytest.raises(PermissionError):
        group_buy.complete_group_buy(db, friend, created.id)


def test_mark_ordered_and_settlement(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Order")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)

    ordered = group_buy.mark_ordered(
        db,
        host,
        created.id,
        GroupBuyOrderUpdate(
            external_order_id="TCG-123",
            order_notes="Shipped to host",
            shipping_cost=3.0,
            shipping_split="by_cost",
        ),
    )
    assert ordered.status == "ordered"
    assert ordered.ordered_at is not None
    assert ordered.external_order_id == "TCG-123"
    assert ordered.shipping_cost == 3.0
    assert ordered.shipping_split == "by_cost"
    # Host: 3*2.5 + 2*1.0 = 9.5; Friend: 3*2.5 + 3*1.0 = 10.5; cards 20; ship by_cost
    assert ordered.cards_subtotal == 20.0
    assert ordered.grand_total == 23.0
    assert ordered.tax_cost == 0.0
    by_name = {m.display_name: m for m in ordered.members}
    assert by_name["Host"].card_cost == 9.5
    assert by_name["Friend"].card_cost == 10.5
    assert by_name["Host"].tax_share == 0.0
    assert round(by_name["Host"].shipping_share + by_name["Friend"].shipping_share, 2) == 3.0
    assert by_name["Host"].total_owed == round(
        by_name["Host"].card_cost + by_name["Host"].shipping_share, 2
    )

    with pytest.raises(PermissionError):
        group_buy.unlock_group_buy(db, host, created.id)

    updated = group_buy.update_order(
        db,
        host,
        created.id,
        GroupBuyOrderUpdate(shipping_split="equal", shipping_cost=2.0, tax_cost=4.0),
    )
    assert updated.shipping_split == "equal"
    assert updated.shipping_cost == 2.0
    assert updated.tax_cost == 4.0
    assert updated.grand_total == 26.0  # 20 + 2 + 4
    by_name = {m.display_name: m for m in updated.members}
    assert by_name["Host"].shipping_share == 1.0
    assert by_name["Friend"].shipping_share == 1.0
    # Tax by card cost: Host 9.5/20 * 4 = 1.9, Friend 10.5/20 * 4 = 2.1
    assert by_name["Host"].tax_share == 1.9
    assert by_name["Friend"].tax_share == 2.1
    assert by_name["Host"].total_owed == round(
        by_name["Host"].card_cost + by_name["Host"].shipping_share + by_name["Host"].tax_share, 2
    )

    done = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(
            receipt_text=_receipt_for_pool(("Luffy", 6, "Test Set"), ("Zoro", 5, "Test Set")),
            allow_partial=False,
        ),
    )
    assert done.status == "completed"
    assert done.external_order_id == "TCG-123"
    assert _owned(db, host.id, "OP01-001") == 4  # 1 owned + 3 bought


def test_mark_ordered_requires_lock(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Need lock")
    group_buy.join_group_buy(db, friend, created.invite_token)
    with pytest.raises(PermissionError, match="Lock for checkout"):
        group_buy.mark_ordered(db, host, created.id, None)


def test_member_cannot_mark_ordered(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "No order")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    with pytest.raises(PermissionError):
        group_buy.mark_ordered(db, friend, created.id, None)


def test_group_buy_shows_viewer_alt_wants(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Alts")
    group_buy.join_group_buy(db, friend, created.invite_token)

    host_deck = next(d for d in services.list_decks(db, host) if d.name == "Host Deck")
    services.set_deck_card_printing(db, host, host_deck.id, "OP01-001", 1009, 2)

    host_view = group_buy.get_group_buy(db, host, created.id)
    host_line = next(l for l in host_view.lines if l.card_id == "OP01-001")
    assert host_line.my_need == 4
    assert next(a.wanted for a in host_line.alt_arts if a.product_id == 1009) == 2

    # Friend sees their own wants (0), not the host's
    friend_view = group_buy.get_group_buy(db, friend, created.id)
    friend_line = next(l for l in friend_view.lines if l.card_id == "OP01-001")
    assert next(a.wanted for a in friend_line.alt_arts if a.product_id == 1009) == 0

    # Sync from group-buy style API updates host decks and shows on next fetch
    services.set_user_card_printing(db, host, "OP01-001", 1009, 1)
    host_view = group_buy.get_group_buy(db, host, created.id)
    host_line = next(l for l in host_view.lines if l.card_id == "OP01-001")
    assert next(a.wanted for a in host_line.alt_arts if a.product_id == 1009) == 1


def test_group_buy_remaining_allocates_alt_wants_not_whole_line(db, two_players):
    """Wanting 1 AA must not price every copy at the AA market (or checkout override)."""
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "AA price")
    group_buy.join_group_buy(db, friend, created.invite_token)

    host_deck = next(d for d in services.list_decks(db, host) if d.name == "Host Deck")
    # Host still-need 3 of OP01-001; want only 1 AA ($9), rest preferred ($2.5).
    services.set_deck_card_printing(db, host, host_deck.id, "OP01-001", 1009, 1)
    # Checkout printing override to AA used to inflate the whole line — must not.
    group_buy.set_line_override(db, host, created.id, "OP01-001", 1009)

    detail = group_buy.get_group_buy(db, host, created.id)
    line = next(l for l in detail.lines if l.card_id == "OP01-001")
    assert line.product_id == 1009
    # Host: 1×$9 + 2×$2.5 = 14; Friend: 3×$2.5 = 7.5 → 21.5
    assert line.remaining_cost == 21.5
    # Header total includes OP01-002 as well (host 2×$1 + friend 3×$1 = 5).
    assert detail.remaining_market == round(21.5 + 5.0, 2)

