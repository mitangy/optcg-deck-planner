"""Pure settlement helpers for group-buy cost split."""

from __future__ import annotations

from dataclasses import dataclass


SHIPPING_SPLIT_MODES = frozenset({"equal", "by_cost", "by_copies"})


@dataclass(frozen=True)
class MemberSettlement:
    user_id: int
    card_cost: float
    copies: int
    shipping_share: float
    tax_share: float
    total_owed: float


def round_money(value: float) -> float:
    return round(value + 1e-9, 2)


def split_shipping(
    shipping_cost: float,
    *,
    card_costs: dict[int, float],
    copies: dict[int, int],
    mode: str,
) -> dict[int, float]:
    """Split shipping among members. Returns per-user shares (may not sum exactly before final round)."""
    shipping = max(0.0, float(shipping_cost or 0.0))
    mode = mode if mode in SHIPPING_SPLIT_MODES else "equal"
    user_ids = sorted(set(card_costs) | set(copies))
    if not user_ids or shipping <= 0:
        return {uid: 0.0 for uid in user_ids}

    if mode == "by_cost":
        weights = {uid: max(0.0, float(card_costs.get(uid, 0.0))) for uid in user_ids}
    elif mode == "by_copies":
        weights = {uid: float(max(0, int(copies.get(uid, 0)))) for uid in user_ids}
    else:
        # Equal among members who actually bought something; else equal among all.
        active = [uid for uid in user_ids if copies.get(uid, 0) > 0 or card_costs.get(uid, 0) > 0]
        pool = active or user_ids
        weights = {uid: 1.0 if uid in pool else 0.0 for uid in user_ids}

    total_w = sum(weights.values())
    if total_w <= 0:
        return {uid: 0.0 for uid in user_ids}

    raw = {uid: shipping * (weights[uid] / total_w) for uid in user_ids}
    # Largest-remainder style so rounded shares sum to shipping.
    floors = {uid: round_money(math_floor_cents(raw[uid])) for uid in user_ids}
    # Fix float: assign remainder cents to highest fractional parts.
    return _allocate_cents(shipping, raw, floors)


def split_tax(
    tax_cost: float,
    *,
    card_costs: dict[int, float],
) -> dict[int, float]:
    """Tax always splits proportional to each member's card cost."""
    return split_shipping(
        tax_cost,
        card_costs=card_costs,
        copies={uid: 1 for uid in card_costs},
        mode="by_cost",
    )


def math_floor_cents(value: float) -> float:
    cents = int(value * 100 + 1e-9)
    return cents / 100.0


def _allocate_cents(
    shipping: float,
    raw: dict[int, float],
    floors: dict[int, float],
) -> dict[int, float]:
    target_cents = int(round(shipping * 100))
    assigned = {uid: int(round(floors[uid] * 100)) for uid in raw}
    leftover = target_cents - sum(assigned.values())
    order = sorted(
        raw.keys(),
        key=lambda uid: (-(raw[uid] * 100 - assigned[uid]), uid),
    )
    i = 0
    while leftover > 0 and order:
        assigned[order[i % len(order)]] += 1
        leftover -= 1
        i += 1
    while leftover < 0 and order:
        uid = order[i % len(order)]
        if assigned[uid] > 0:
            assigned[uid] -= 1
            leftover += 1
        i += 1
    return {uid: assigned[uid] / 100.0 for uid in assigned}


def build_settlements(
    *,
    member_card_costs: dict[int, float],
    member_copies: dict[int, int],
    shipping_cost: float,
    shipping_split: str,
    tax_cost: float = 0.0,
) -> list[MemberSettlement]:
    shares = split_shipping(
        shipping_cost,
        card_costs=member_card_costs,
        copies=member_copies,
        mode=shipping_split,
    )
    tax_shares = split_tax(tax_cost, card_costs=member_card_costs)
    user_ids = sorted(
        set(member_card_costs) | set(member_copies) | set(shares) | set(tax_shares)
    )
    out: list[MemberSettlement] = []
    for uid in user_ids:
        card = round_money(float(member_card_costs.get(uid, 0.0)))
        ship = round_money(float(shares.get(uid, 0.0)))
        tax = round_money(float(tax_shares.get(uid, 0.0)))
        out.append(
            MemberSettlement(
                user_id=uid,
                card_cost=card,
                copies=int(member_copies.get(uid, 0)),
                shipping_share=ship,
                tax_share=tax,
                total_owed=round_money(card + ship + tax),
            )
        )
    return out
