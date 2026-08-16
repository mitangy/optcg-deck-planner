"""Group-buy receipt match + apply (stage bought copies)."""

from __future__ import annotations

from sqlalchemy import select

from app import group_buy
from app.models import Owned
from app.schemas import GroupBuyOrderUpdate, GroupBuyReceiptApplyRequest
from app.tcgplayer_receipt import parse_tcgplayer_receipt
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def _owned(db, user_id: int, card_id: str) -> int:
    row = db.scalar(
        select(Owned).where(Owned.user_id == user_id, Owned.card_id == card_id)
    )
    return int(row.qty) if row else 0


def test_receipt_match_and_full_apply(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_deck_with_cards(db, host, "Solo", {"OP01-001": 2, "OP01-002": 3})
    set_owned(db, host, "OP01-001", 0)
    set_owned(db, host, "OP01-002", 0)

    created = group_buy.create_group_buy(db, host, "Bulk buy")
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)

    receipt = """
Qty	Description
2	One Piece Card Game - Test Set - Luffy - Near Mint Foil
3	One Piece Card Game - Test Set - Zoro - Near Mint
""".strip()

    report = group_buy.build_receipt_match_report(db, host, created.id, receipt)
    assert report.can_apply_full
    assert report.summary["exact"] == 2
    assert report.summary["staged_copies"] == 5
    by_id = {l.card_id: l for l in report.lines}
    assert by_id["OP01-001"].status == "exact"
    assert by_id["OP01-002"].status == "exact"

    done = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt, allow_partial=False),
    )
    assert done.status == "completed"
    assert _owned(db, host.id, "OP01-001") == 2
    assert _owned(db, host.id, "OP01-002") == 3


def test_receipt_partial_apply_leaves_remainder(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 4, "OP01-002": 2})
    add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 3, "OP01-002": 4})
    set_owned(db, host, "OP01-001", 1)  # still 3
    set_owned(db, friend, "OP01-002", 1)  # still 3 of 002, 3 of 001

    created = group_buy.create_group_buy(db, host, "Partial")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)

    # Only enough Luffy for part of the pool (need 6); full Zoro (need 5)
    receipt = """
2	One Piece Card Game - Test Set - Luffy - Near Mint
5	One Piece Card Game - Test Set - Zoro - Near Mint Foil
""".strip()

    report = group_buy.build_receipt_match_report(db, host, created.id, receipt)
    assert not report.can_apply_full
    assert report.can_apply_partial
    by_id = {l.card_id: l for l in report.lines}
    assert by_id["OP01-001"].status == "short"
    assert by_id["OP01-001"].staged_qty == 2
    assert by_id["OP01-002"].status == "exact"

    updated = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt, allow_partial=True),
    )
    assert updated.status == "ordered"  # remainder still open
    # 2 Luffy applied across members; 5 Zoro applied fully
    assert _owned(db, host.id, "OP01-001") + _owned(db, friend.id, "OP01-001") == 1 + 2
    assert _owned(db, host.id, "OP01-002") + _owned(db, friend.id, "OP01-002") == 1 + 5

    remaining = {l.card_id: l.total_qty for l in updated.lines}
    assert remaining.get("OP01-001") == 4  # 6 - 2
    assert "OP01-002" not in remaining or remaining.get("OP01-002", 0) == 0


def test_receipt_stage_selected_cards_only(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_deck_with_cards(db, host, "Solo", {"OP01-001": 2, "OP01-002": 2})

    created = group_buy.create_group_buy(db, host, "Select")
    group_buy.lock_group_buy(db, host, created.id)

    receipt = """
2	One Piece Card Game - Test Set - Luffy - Near Mint
2	One Piece Card Game - Test Set - Zoro - Near Mint
""".strip()

    # Apply from locked (auto-marks ordered); only stage Luffy
    updated = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(
            receipt_text=receipt,
            card_ids=["OP01-001"],
            allow_partial=True,
        ),
    )
    assert updated.status == "ordered"
    assert _owned(db, host.id, "OP01-001") == 2
    assert _owned(db, host.id, "OP01-002") == 0
    remaining = {l.card_id: l.total_qty for l in updated.lines}
    assert remaining == {"OP01-002": 2}


def test_undo_full_apply_restores_pool_owned_and_settlement(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 2, "OP01-002": 1})
    add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 1, "OP01-002": 2})
    set_owned(db, host, "OP01-001", 0)
    set_owned(db, host, "OP01-002", 0)
    set_owned(db, friend, "OP01-001", 0)
    set_owned(db, friend, "OP01-002", 0)

    created = group_buy.create_group_buy(db, host, "Undo full")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)
    group_buy.update_order(
        db,
        host,
        created.id,
        GroupBuyOrderUpdate(shipping_cost=6.0, shipping_split="equal", tax_cost=3.0),
    )

    before = group_buy.get_group_buy(db, host, created.id)
    assert before.status == "ordered"
    assert before.can_undo_purchase is False
    assert before.cards_subtotal > 0
    before_owed = {m.user_id: m.total_owed for m in before.members}
    before_lines = {l.card_id: l.total_qty for l in before.lines}

    receipt = """
3	One Piece Card Game - Test Set - Luffy - Near Mint
3	One Piece Card Game - Test Set - Zoro - Near Mint
""".strip()

    done = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt, allow_partial=False),
    )
    assert done.status == "completed"
    assert done.can_undo_purchase is True
    assert done.has_receipt is True
    assert done.cards_subtotal == 0.0
    assert _owned(db, host.id, "OP01-001") == 2
    assert _owned(db, friend.id, "OP01-001") == 1

    undone = group_buy.undo_last_receipt_apply(db, host, created.id)
    assert undone.status == "ordered"
    assert undone.can_undo_purchase is False
    assert undone.has_receipt is True
    assert undone.receipt_text.strip() == receipt
    assert {l.card_id: l.total_qty for l in undone.lines} == before_lines
    assert {m.user_id: m.total_owed for m in undone.members} == before_owed
    assert undone.cards_subtotal == before.cards_subtotal
    assert _owned(db, host.id, "OP01-001") == 0
    assert _owned(db, host.id, "OP01-002") == 0
    assert _owned(db, friend.id, "OP01-001") == 0
    assert _owned(db, friend.id, "OP01-002") == 0


def test_undo_partial_then_second_apply_lifo(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_deck_with_cards(db, host, "Solo", {"OP01-001": 4, "OP01-002": 2})
    set_owned(db, host, "OP01-001", 0)
    set_owned(db, host, "OP01-002", 0)

    created = group_buy.create_group_buy(db, host, "Undo LIFO")
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)

    receipt_a = """
2	One Piece Card Game - Test Set - Luffy - Near Mint
""".strip()
    after_a = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt_a, allow_partial=True),
    )
    assert after_a.status == "ordered"
    assert after_a.can_undo_purchase is True
    assert _owned(db, host.id, "OP01-001") == 2
    remaining_a = {l.card_id: l.total_qty for l in after_a.lines}
    assert remaining_a.get("OP01-001") == 2
    assert remaining_a.get("OP01-002") == 2

    receipt_b = """
2	One Piece Card Game - Test Set - Luffy - Near Mint
2	One Piece Card Game - Test Set - Zoro - Near Mint
""".strip()
    after_b = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt_b, allow_partial=True),
    )
    assert after_b.status == "completed"
    assert _owned(db, host.id, "OP01-001") == 4
    assert _owned(db, host.id, "OP01-002") == 2

    # Undo latest (B) first — back to post-A state
    undo_b = group_buy.undo_last_receipt_apply(db, host, created.id)
    assert undo_b.status == "ordered"
    assert undo_b.can_undo_purchase is True
    assert _owned(db, host.id, "OP01-001") == 2
    assert _owned(db, host.id, "OP01-002") == 0
    remaining = {l.card_id: l.total_qty for l in undo_b.lines}
    assert remaining.get("OP01-001") == 2
    assert remaining.get("OP01-002") == 2

    # Undo A — full pool restored
    undo_a = group_buy.undo_last_receipt_apply(db, host, created.id)
    assert undo_a.status == "ordered"
    assert undo_a.can_undo_purchase is False
    assert _owned(db, host.id, "OP01-001") == 0
    assert _owned(db, host.id, "OP01-002") == 0
    full = {l.card_id: l.total_qty for l in undo_a.lines}
    assert full == {"OP01-001": 4, "OP01-002": 2}


def test_undo_apply_from_locked_restores_locked(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_deck_with_cards(db, host, "Solo", {"OP01-001": 2})
    set_owned(db, host, "OP01-001", 0)

    created = group_buy.create_group_buy(db, host, "From locked")
    group_buy.lock_group_buy(db, host, created.id)
    assert group_buy.get_group_buy(db, host, created.id).ordered_at is None

    receipt = """
2	One Piece Card Game - Test Set - Luffy - Near Mint
""".strip()
    done = group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt, allow_partial=True),
    )
    assert done.status == "completed"
    assert done.ordered_at is not None
    assert _owned(db, host.id, "OP01-001") == 2

    undone = group_buy.undo_last_receipt_apply(db, host, created.id)
    assert undone.status == "locked"
    assert undone.ordered_at is None
    assert undone.can_undo_purchase is False
    assert _owned(db, host.id, "OP01-001") == 0
    assert {l.card_id: l.total_qty for l in undone.lines} == {"OP01-001": 2}


def test_undo_clamps_owned_when_user_already_spent_copies(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_deck_with_cards(db, host, "Solo", {"OP01-001": 3})
    set_owned(db, host, "OP01-001", 0)

    created = group_buy.create_group_buy(db, host, "Clamp owned")
    group_buy.lock_group_buy(db, host, created.id)
    group_buy.mark_ordered(db, host, created.id, None)

    receipt = """
3	One Piece Card Game - Test Set - Luffy - Near Mint
""".strip()
    group_buy.apply_receipt_to_group_buy(
        db,
        host,
        created.id,
        GroupBuyReceiptApplyRequest(receipt_text=receipt, allow_partial=True),
    )
    assert _owned(db, host.id, "OP01-001") == 3
    # Simulate user removing inventory after purchase
    set_owned(db, host, "OP01-001", 1)

    undone = group_buy.undo_last_receipt_apply(db, host, created.id)
    assert undone.status == "ordered"
    assert _owned(db, host.id, "OP01-001") == 0
    assert {l.card_id: l.total_qty for l in undone.lines} == {"OP01-001": 3}


def test_parse_user_receipt_smoke():
    """Sanity: the user's pasted receipt shape parses without error."""
    text = """
Qty	Description
2	One Piece Card Game - 500 Years in the Future - Perfume Femur - Near Mint Foil
4	One Piece Card Game - Royal Blood - Sabo - Near Mint Foil
1	One Piece Card Game - Extra Booster: One Piece Heroines Edition - DON!! Card (Nami) - Near Mint
""".strip()
    lines = parse_tcgplayer_receipt(text)
    assert len(lines) == 3
    assert lines[2].card_name.startswith("DON!!")
