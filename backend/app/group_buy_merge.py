"""Pure merge helpers for group-buy shopping lines (easy to unit test)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class MemberNeed:
    user_id: int
    display_name: str
    card_id: str
    qty: int
    product_id: int | None = None


@dataclass(frozen=True)
class MergedMemberQty:
    user_id: int
    display_name: str
    qty: int


@dataclass(frozen=True)
class MergedLine:
    card_id: str
    total_qty: int
    members: tuple[MergedMemberQty, ...]
    # First non-null product_id seen while merging (caller may override).
    suggested_product_id: int | None


def merge_member_needs(needs: list[MemberNeed]) -> list[MergedLine]:
    """Sum quantities per card_id across members; skip non-positive qtys."""
    by_card: dict[str, dict[int, MergedMemberQty]] = defaultdict(dict)
    suggested: dict[str, int | None] = {}

    for need in needs:
        if need.qty <= 0:
            continue
        card_id = need.card_id.upper().strip()
        existing = by_card[card_id].get(need.user_id)
        if existing is None:
            by_card[card_id][need.user_id] = MergedMemberQty(
                user_id=need.user_id,
                display_name=need.display_name,
                qty=need.qty,
            )
        else:
            by_card[card_id][need.user_id] = MergedMemberQty(
                user_id=need.user_id,
                display_name=need.display_name,
                qty=existing.qty + need.qty,
            )
        if suggested.get(card_id) is None and need.product_id:
            suggested[card_id] = need.product_id

    lines: list[MergedLine] = []
    for card_id in sorted(by_card):
        members = tuple(
            sorted(by_card[card_id].values(), key=lambda m: (m.display_name.lower(), m.user_id))
        )
        total = sum(m.qty for m in members)
        lines.append(
            MergedLine(
                card_id=card_id,
                total_qty=total,
                members=members,
                suggested_product_id=suggested.get(card_id),
            )
        )
    return lines
