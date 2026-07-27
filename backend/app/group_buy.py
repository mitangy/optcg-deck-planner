"""Group buy (collaborative shopping pool) service."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.group_buy_merge import MemberNeed, MergedMemberQty, merge_member_needs
from app.group_buy_settlement import SHIPPING_SPLIT_MODES, build_settlements, round_money
from app.models import (
    CatalogCard,
    CatalogPrinting,
    GroupBuy,
    GroupBuyLineOverride,
    GroupBuyMember,
    GroupBuyQtyOverride,
    GroupBuySnapshotLine,
    Owned,
    User,
)
from app.schemas import (
    GroupBuyDetail,
    GroupBuyExport,
    GroupBuyInvitePreview,
    GroupBuyLineOut,
    GroupBuyMemberOut,
    GroupBuyMemberQtyOut,
    GroupBuyOrderUpdate,
    GroupBuyReceiptApplyRequest,
    GroupBuyReceiptLineOut,
    GroupBuyReceiptMatchReport,
    GroupBuyReceiptUnmatchedOut,
    GroupBuySummary,
)
from app.tcgplayer_receipt import aggregate_receipt_matches, parse_tcgplayer_receipt
from app import services

FROZEN_STATUSES = frozenset({"locked", "ordered", "completed"})

TCGPLAYER_MASS_ENTRY_BASE = "https://www.tcgplayer.com/massentry"
TCGPLAYER_PRODUCT_LINE = "One Piece Card Game"
MASS_ENTRY_URL_MAX_LEN = 1800


def _display_name(user: User) -> str:
    return (user.name or user.email or f"User {user.id}").strip()


def _parse_deck_ids(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list) or not data:
        return None
    out: list[int] = []
    for item in data:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out or None


def _dump_deck_ids(deck_ids: list[int] | None) -> str | None:
    if not deck_ids:
        return None
    return json.dumps(sorted(set(int(x) for x in deck_ids)))


def _get_group(db: Session, group_id: int) -> GroupBuy:
    group = db.scalar(
        select(GroupBuy)
        .where(GroupBuy.id == group_id)
        .options(
            selectinload(GroupBuy.members).selectinload(GroupBuyMember.user),
            selectinload(GroupBuy.host),
            selectinload(GroupBuy.snapshot_lines),
            selectinload(GroupBuy.line_overrides),
            selectinload(GroupBuy.qty_overrides),
        )
    )
    if group is None:
        raise LookupError("Group buy not found")
    return group


def _require_member(group: GroupBuy, user: User) -> GroupBuyMember:
    for member in group.members:
        if member.user_id == user.id:
            return member
    raise PermissionError("Not a member of this group buy")


def _require_host(group: GroupBuy, user: User) -> None:
    if group.host_user_id != user.id:
        raise PermissionError("Only the host can do that")


def _qty_override_map(group: GroupBuy) -> dict[tuple[int, str], int]:
    return {
        (row.user_id, row.card_id.upper()): int(row.qty)
        for row in group.qty_overrides
    }


def _member_needs_live(db: Session, group: GroupBuy) -> list[MemberNeed]:
    """Shopping still-need as default, with per-member qty overrides applied."""
    overrides = _qty_override_map(group)
    needs: list[MemberNeed] = []
    for member in group.members:
        shopping = services.shopping_list(
            db, member.user, deck_ids=_parse_deck_ids(member.deck_ids_json)
        )
        name = _display_name(member.user)
        shop_by_id = {item.card_id.upper(): item for item in shopping.items}
        card_ids = set(shop_by_id) | {
            card_id for (uid, card_id) in overrides if uid == member.user_id
        }
        for card_id in sorted(card_ids):
            item = shop_by_id.get(card_id)
            suggested = item.still_need if item else 0
            key = (member.user_id, card_id)
            is_custom = key in overrides
            qty = overrides[key] if is_custom else suggested
            if qty <= 0:
                continue
            needs.append(
                MemberNeed(
                    user_id=member.user_id,
                    display_name=name,
                    card_id=card_id,
                    qty=qty,
                    product_id=item.product_id if item else None,
                    suggested_qty=suggested,
                    is_custom=is_custom,
                )
            )
    return needs


def _member_needs_locked(group: GroupBuy) -> list[MemberNeed]:
    users = {m.user_id: m.user for m in group.members}
    needs: list[MemberNeed] = []
    for line in group.snapshot_lines:
        if line.qty <= 0:
            continue
        user = users.get(line.user_id)
        name = _display_name(user) if user else f"User {line.user_id}"
        needs.append(
            MemberNeed(
                user_id=line.user_id,
                display_name=name,
                card_id=line.card_id,
                qty=line.qty,
                product_id=line.product_id,
                suggested_qty=line.qty,
                is_custom=False,
            )
        )
    return needs


def _catalog_bundle(
    db: Session,
    card_ids: set[str],
    wanted: dict[str, dict[int, int]] | None = None,
):
    catalog = {}
    if card_ids:
        rows = db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
        catalog = {r.card_id: r for r in rows}
    product_ids = services._primary_product_ids(db, card_ids)
    alts = services._alt_arts_map(db, card_ids, wanted=wanted)
    printings: dict[int, CatalogPrinting] = {}
    if card_ids:
        rows = db.scalars(
            select(CatalogPrinting).where(CatalogPrinting.card_id.in_(card_ids))
        ).all()
        printings = {r.product_id: r for r in rows}
    return catalog, product_ids, alts, printings


def _viewer_zero_customs(
    db: Session,
    group: GroupBuy,
    viewer_user_id: int,
) -> dict[str, MergedMemberQty]:
    """Custom qty=0 rows so the viewer can bump a line back up from the UI."""
    if group.status != "open":
        return {}
    member = next((m for m in group.members if m.user_id == viewer_user_id), None)
    if member is None:
        return {}
    shopping = services.shopping_list(
        db, member.user, deck_ids=_parse_deck_ids(member.deck_ids_json)
    )
    shop_by_id = {item.card_id.upper(): item for item in shopping.items}
    name = _display_name(member.user)
    out: dict[str, MergedMemberQty] = {}
    for (uid, card_id), qty in _qty_override_map(group).items():
        if uid != viewer_user_id or qty > 0:
            continue
        item = shop_by_id.get(card_id)
        out[card_id] = MergedMemberQty(
            user_id=viewer_user_id,
            display_name=name,
            qty=0,
            suggested_qty=item.still_need if item else 0,
            is_custom=True,
        )
    return out


def _build_lines(
    db: Session,
    group: GroupBuy,
    viewer_user_id: int | None = None,
) -> tuple[list[GroupBuyLineOut], dict[int, tuple[int, float]]]:
    needs = (
        _member_needs_locked(group)
        if group.status in FROZEN_STATUSES
        else _member_needs_live(db, group)
    )
    zero_customs = (
        _viewer_zero_customs(db, group, viewer_user_id) if viewer_user_id is not None else {}
    )
    merged = merge_member_needs(needs)
    product_overrides = {o.card_id.upper(): o.product_id for o in group.line_overrides}
    card_ids = {line.card_id for line in merged} | set(zero_customs)

    viewer_wants: dict[str, dict[int, int]] = {}
    viewer_need: dict[str, int] = {}
    viewer_shop_alts: dict[str, list] = {}
    # Per-member alt wants for pricing (allocate AA qty, rest at preferred).
    member_shop_alts: dict[int, dict[str, list]] = {}
    for member in group.members:
        shop = services.shopping_list(
            db, member.user, deck_ids=_parse_deck_ids(member.deck_ids_json)
        )
        by_card: dict[str, list] = {}
        for item in shop.items:
            by_card[item.card_id.upper()] = item.alt_arts
            if member.user_id == viewer_user_id:
                viewer_need[item.card_id] = item.need
                viewer_wants[item.card_id] = {
                    a.product_id: a.wanted for a in item.alt_arts if a.wanted > 0
                }
                viewer_shop_alts[item.card_id] = item.alt_arts
        member_shop_alts[member.user_id] = by_card

    catalog, primary_ids, alts, printings = _catalog_bundle(
        db, card_ids, wanted=viewer_wants or None
    )

    member_totals: dict[int, list[int]] = {m.user_id: [0, 0.0] for m in group.members}
    lines_out: list[GroupBuyLineOut] = []
    merged_by_id = {line.card_id: line for line in merged}

    for card_id in sorted(card_ids):
        line = merged_by_id.get(card_id)
        members_list: list[MergedMemberQty] = list(line.members) if line else []
        if card_id in zero_customs and all(m.user_id != viewer_user_id for m in members_list):
            members_list.append(zero_customs[card_id])
            members_list.sort(key=lambda m: (m.display_name.lower(), m.user_id))
        members = tuple(members_list)

        total_qty = sum(m.qty for m in members)
        cat = catalog.get(card_id)
        preferred_product_id = primary_ids.get(card_id)
        preferred_market = None
        if preferred_product_id and preferred_product_id in printings:
            preferred_market = printings[preferred_product_id].market_price
        elif cat is not None:
            preferred_market = cat.market_price
        product_id = (
            product_overrides.get(card_id)
            or (line.suggested_product_id if line else None)
            or preferred_product_id
        )
        market = None
        image_url = cat.image_url if cat else ""
        tcgplayer_url = cat.tcgplayer_url if cat else ""
        if product_id and product_id in printings:
            printing = printings[product_id]
            market = printing.market_price
            image_url = printing.image_url or image_url
            tcgplayer_url = printing.tcgplayer_url or tcgplayer_url
        elif cat is not None:
            market = cat.market_price

        # Price by each member's alt wants (AA qty × AA price + remainder × preferred),
        # not total_qty × checkout printing — so wanting 1 AA does not price the whole line as AA.
        line_remaining = 0.0
        priced_ok = True
        any_buy = False
        for mem in members:
            if mem.qty <= 0:
                continue
            any_buy = True
            mem_alts = member_shop_alts.get(mem.user_id, {}).get(card_id, [])
            alt_inputs = [
                (a.product_id, a.wanted, a.market_price)
                for a in mem_alts
                if (a.wanted or 0) > 0
            ]
            buys = services.allocate_still_need_buys(
                mem.qty,
                alt_inputs,
                standard_product_id=preferred_product_id,
                standard_price=preferred_market,
            )
            cost = services.remaining_cost_for_buys(buys)
            bucket = member_totals.setdefault(mem.user_id, [0, 0.0])
            bucket[0] += mem.qty
            if cost is None:
                priced_ok = False
            else:
                line_remaining += cost
                bucket[1] += cost
        remaining = round(line_remaining, 2) if any_buy and priced_ok else (0.0 if not any_buy else None)

        mine = next((m for m in members if m.user_id == viewer_user_id), None)
        my_qty = mine.qty if mine else 0
        my_is_custom = mine.is_custom if mine else False
        lines_out.append(
            GroupBuyLineOut(
                card_id=card_id,
                name=cat.name if cat else "(not in catalog)",
                color=cat.color if cat else "",
                rarity=cat.rarity if cat else "",
                card_type=cat.card_type if cat else "",
                cost=cat.cost if cat else None,
                total_qty=total_qty,
                market_price=market,
                remaining_cost=remaining,
                product_id=product_id,
                preferred_product_id=preferred_product_id,
                preferred_market_price=preferred_market,
                tcgplayer_url=tcgplayer_url,
                image_url=image_url,
                members=[
                    GroupBuyMemberQtyOut(
                        user_id=m.user_id,
                        display_name=m.display_name,
                        qty=m.qty,
                        suggested_qty=m.suggested_qty,
                        is_custom=m.is_custom,
                    )
                    for m in members
                    if m.qty > 0 or m.user_id == viewer_user_id
                ],
                alt_arts=list(viewer_shop_alts.get(card_id) or alts.get(card_id, [])),
                my_qty=my_qty,
                my_suggested_qty=mine.suggested_qty if mine else 0,
                my_is_custom=my_is_custom,
                my_excluded=bool(my_is_custom and my_qty == 0),
                my_need=viewer_need.get(card_id, 0),
            )
        )

    member_stats = {
        uid: (counts[0], round(counts[1], 2)) for uid, counts in member_totals.items()
    }
    return lines_out, member_stats


def _summary_fields(
    group: GroupBuy,
    user: User,
    lines: list[GroupBuyLineOut],
) -> dict:
    cards_still = sum(line.total_qty for line in lines)
    remaining = round(
        sum(line.remaining_cost for line in lines if line.remaining_cost is not None),
        2,
    )
    return {
        "id": group.id,
        "title": group.title,
        "status": group.status,
        "invite_token": group.invite_token,
        "invite_path": f"/group-buy/join/{group.invite_token}",
        "host_user_id": group.host_user_id,
        "host_name": _display_name(group.host),
        "member_count": len(group.members),
        "is_host": group.host_user_id == user.id,
        "unique_cards": len(lines),
        "cards_still_needed": cards_still,
        "remaining_market": remaining,
        "created_at": group.created_at.isoformat() if group.created_at else "",
    }


def list_group_buys(db: Session, user: User) -> list[GroupBuySummary]:
    member_rows = db.scalars(
        select(GroupBuyMember).where(GroupBuyMember.user_id == user.id)
    ).all()
    if not member_rows:
        return []
    group_ids = [m.group_buy_id for m in member_rows]
    groups = db.scalars(
        select(GroupBuy)
        .where(GroupBuy.id.in_(group_ids))
        .options(
            selectinload(GroupBuy.members).selectinload(GroupBuyMember.user),
            selectinload(GroupBuy.host),
            selectinload(GroupBuy.snapshot_lines),
            selectinload(GroupBuy.line_overrides),
            selectinload(GroupBuy.qty_overrides),
        )
        .order_by(GroupBuy.id.desc())
    ).all()
    out: list[GroupBuySummary] = []
    for group in groups:
        lines, _ = _build_lines(db, group, viewer_user_id=user.id)
        out.append(GroupBuySummary(**_summary_fields(group, user, lines)))
    return out


def get_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_member(group, user)
    lines, member_stats = _build_lines(db, group, viewer_user_id=user.id)

    card_costs = {uid: float(stats[1]) for uid, stats in member_stats.items()}
    copies = {uid: int(stats[0]) for uid, stats in member_stats.items()}
    for member in group.members:
        card_costs.setdefault(member.user_id, 0.0)
        copies.setdefault(member.user_id, 0)
    settlements = {
        row.user_id: row
        for row in build_settlements(
            member_card_costs=card_costs,
            member_copies=copies,
            shipping_cost=float(group.shipping_cost or 0.0),
            shipping_split=group.shipping_split or "equal",
            tax_cost=float(group.tax_cost or 0.0),
        )
    }
    cards_subtotal = round_money(sum(card_costs.values()))
    shipping_cost = round_money(float(group.shipping_cost or 0.0))
    tax_cost = round_money(float(group.tax_cost or 0.0))

    members_out: list[GroupBuyMemberOut] = []
    for member in sorted(
        group.members,
        key=lambda m: (0 if m.role == "host" else 1, m.id),
    ):
        copies_n, market = member_stats.get(member.user_id, (0, 0.0))
        settle = settlements.get(member.user_id)
        members_out.append(
            GroupBuyMemberOut(
                user_id=member.user_id,
                display_name=_display_name(member.user),
                role=member.role,
                deck_ids=_parse_deck_ids(member.deck_ids_json),
                cards_still_needed=copies_n,
                remaining_market=market,
                card_cost=settle.card_cost if settle else 0.0,
                shipping_share=settle.shipping_share if settle else 0.0,
                tax_share=settle.tax_share if settle else 0.0,
                total_owed=settle.total_owed if settle else 0.0,
            )
        )
    return GroupBuyDetail(
        **_summary_fields(group, user, lines),
        members=members_out,
        lines=lines,
        locked_at=group.locked_at.isoformat() if group.locked_at else None,
        ordered_at=group.ordered_at.isoformat() if group.ordered_at else None,
        external_order_id=group.external_order_id or "",
        order_notes=group.order_notes or "",
        shipping_cost=shipping_cost,
        shipping_split=group.shipping_split or "equal",
        tax_cost=tax_cost,
        cards_subtotal=cards_subtotal,
        grand_total=round_money(cards_subtotal + shipping_cost + tax_cost),
        receipt_text=group.receipt_text or "",
        has_receipt=bool((group.receipt_text or "").strip()),
    )


def create_group_buy(
    db: Session,
    user: User,
    title: str,
    deck_ids: list[int] | None = None,
) -> GroupBuyDetail:
    title = (title or "Group buy").strip() or "Group buy"
    group = GroupBuy(
        host_user_id=user.id,
        title=title[:200],
        status="open",
        invite_token=secrets.token_urlsafe(18),
    )
    db.add(group)
    db.flush()
    db.add(
        GroupBuyMember(
            group_buy_id=group.id,
            user_id=user.id,
            role="host",
            deck_ids_json=_dump_deck_ids(deck_ids),
        )
    )
    db.commit()
    return get_group_buy(db, user, group.id)


def join_group_buy(db: Session, user: User, token: str) -> GroupBuyDetail:
    group = db.scalar(
        select(GroupBuy)
        .where(GroupBuy.invite_token == token)
        .options(
            selectinload(GroupBuy.members).selectinload(GroupBuyMember.user),
            selectinload(GroupBuy.host),
            selectinload(GroupBuy.snapshot_lines),
            selectinload(GroupBuy.line_overrides),
            selectinload(GroupBuy.qty_overrides),
        )
    )
    if group is None:
        raise LookupError("Invite link not found")
    if group.status in FROZEN_STATUSES:
        # Allow existing members to open; block new joins.
        try:
            _require_member(group, user)
            return get_group_buy(db, user, group.id)
        except PermissionError as exc:
            raise PermissionError(
                f"This group buy is {group.status}; new members cannot join"
            ) from exc

    existing = next((m for m in group.members if m.user_id == user.id), None)
    if existing is None:
        db.add(
            GroupBuyMember(
                group_buy_id=group.id,
                user_id=user.id,
                role="member",
                deck_ids_json=None,
            )
        )
        db.commit()
    return get_group_buy(db, user, group.id)


def invite_preview(db: Session, token: str) -> GroupBuyInvitePreview:
    group = db.scalar(
        select(GroupBuy)
        .where(GroupBuy.invite_token == token)
        .options(selectinload(GroupBuy.host), selectinload(GroupBuy.members))
    )
    if group is None:
        raise LookupError("Invite link not found")
    return GroupBuyInvitePreview(
        title=group.title,
        host_name=_display_name(group.host),
        member_count=len(group.members),
        status=group.status,
        invite_token=group.invite_token,
    )


def update_contribution(
    db: Session,
    user: User,
    group_id: int,
    deck_ids: list[int] | None,
) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    member = _require_member(group, user)
    if group.status != "open":
        raise PermissionError("Group buy is locked; contributions cannot change")
    member.deck_ids_json = _dump_deck_ids(deck_ids)
    db.commit()
    return get_group_buy(db, user, group_id)


def include_deck_in_open_group_buys(db: Session, user: User, deck_id: int) -> None:
    """Include a newly imported deck in every open group-buy contribution.

    ``deck_ids_json is None`` already means all decks (new decks count automatically).
    Explicit contribution lists get ``deck_id`` appended so imports are not left out.
    Locked / ordered / completed pools are left unchanged.
    """
    members = db.scalars(
        select(GroupBuyMember)
        .join(GroupBuy, GroupBuy.id == GroupBuyMember.group_buy_id)
        .where(
            GroupBuyMember.user_id == user.id,
            GroupBuy.status == "open",
        )
    ).all()
    changed = False
    for member in members:
        current = _parse_deck_ids(member.deck_ids_json)
        if current is None:
            continue
        if deck_id in current:
            continue
        member.deck_ids_json = _dump_deck_ids([*current, int(deck_id)])
        changed = True
    if changed:
        db.commit()


def set_member_qty(
    db: Session,
    user: User,
    group_id: int,
    card_id: str,
    qty: int,
) -> GroupBuyDetail:
    """Set how many copies the current user wants to buy for a card."""
    group = _get_group(db, group_id)
    member = _require_member(group, user)
    if group.status != "open":
        raise PermissionError("Group buy is locked; quantities cannot change")
    card_id = card_id.upper().strip()
    if not card_id:
        raise ValueError("card_id is required")
    qty = max(0, min(999, int(qty)))

    # Default (no override) is shopping still-need. If qty matches that, clear override.
    shopping = services.shopping_list(
        db, user, deck_ids=_parse_deck_ids(member.deck_ids_json)
    )
    suggested = next(
        (item.still_need for item in shopping.items if item.card_id.upper() == card_id),
        0,
    )
    existing = db.scalar(
        select(GroupBuyQtyOverride).where(
            GroupBuyQtyOverride.group_buy_id == group.id,
            GroupBuyQtyOverride.user_id == user.id,
            GroupBuyQtyOverride.card_id == card_id,
        )
    )
    # Matching a positive shopping still-need clears the override. Qty 0 always
    # persists as an explicit opt-out ("excluded") even when suggested is already 0.
    if qty == suggested and qty > 0:
        if existing is not None:
            db.delete(existing)
            db.commit()
        return get_group_buy(db, user, group_id)

    if existing is None:
        db.add(
            GroupBuyQtyOverride(
                group_buy_id=group.id,
                user_id=user.id,
                card_id=card_id,
                qty=qty,
            )
        )
    else:
        existing.qty = qty
    db.commit()
    return get_group_buy(db, user, group_id)


def clear_member_qty(
    db: Session,
    user: User,
    group_id: int,
    card_id: str,
) -> GroupBuyDetail:
    """Remove a qty override so the line follows shopping still-need again."""
    group = _get_group(db, group_id)
    _require_member(group, user)
    if group.status != "open":
        raise PermissionError("Group buy is locked; quantities cannot change")
    card_id = card_id.upper().strip()
    existing = db.scalar(
        select(GroupBuyQtyOverride).where(
            GroupBuyQtyOverride.group_buy_id == group.id,
            GroupBuyQtyOverride.user_id == user.id,
            GroupBuyQtyOverride.card_id == card_id,
        )
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
    return get_group_buy(db, user, group_id)


def sync_member_quantities(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    """Clear all of the current user's qty overrides (back to shopping still-need)."""
    group = _get_group(db, group_id)
    _require_member(group, user)
    if group.status != "open":
        raise PermissionError("Group buy is locked; quantities cannot change")
    db.execute(
        delete(GroupBuyQtyOverride).where(
            GroupBuyQtyOverride.group_buy_id == group.id,
            GroupBuyQtyOverride.user_id == user.id,
        )
    )
    db.commit()
    return get_group_buy(db, user, group_id)


def _freeze_snapshot(db: Session, group: GroupBuy) -> None:
    """Replace snapshot lines with current live (shopping + qty overrides) needs."""
    needs = _member_needs_live(db, group)
    db.execute(delete(GroupBuySnapshotLine).where(GroupBuySnapshotLine.group_buy_id == group.id))
    for need in needs:
        db.add(
            GroupBuySnapshotLine(
                group_buy_id=group.id,
                user_id=need.user_id,
                card_id=need.card_id.upper().strip(),
                qty=need.qty,
                product_id=need.product_id,
            )
        )


def _add_owned(db: Session, user_id: int, card_id: str, delta: int) -> None:
    if delta <= 0:
        return
    card_id = card_id.upper().strip()
    row = db.scalar(
        select(Owned).where(Owned.user_id == user_id, Owned.card_id == card_id)
    )
    if row is None:
        db.add(Owned(user_id=user_id, card_id=card_id, qty=delta))
    else:
        row.qty = int(row.qty) + delta


def _apply_order_fields(group: GroupBuy, body: GroupBuyOrderUpdate) -> None:
    if body.external_order_id is not None:
        group.external_order_id = body.external_order_id.strip()[:200]
    if body.order_notes is not None:
        group.order_notes = body.order_notes.strip()[:4000]
    if body.shipping_cost is not None:
        group.shipping_cost = max(0.0, float(body.shipping_cost))
    if body.shipping_split is not None:
        if body.shipping_split not in SHIPPING_SPLIT_MODES:
            raise ValueError("shipping_split must be equal, by_cost, or by_copies")
        group.shipping_split = body.shipping_split
    if body.tax_cost is not None:
        group.tax_cost = max(0.0, float(body.tax_cost))


def lock_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status in ("ordered", "completed"):
        raise PermissionError(f"Group buy is already {group.status}")
    if group.status == "locked":
        return get_group_buy(db, user, group_id)

    _freeze_snapshot(db, group)
    group.status = "locked"
    group.locked_at = datetime.now(timezone.utc)
    db.commit()
    return get_group_buy(db, user, group_id)


def unlock_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status in ("ordered", "completed"):
        raise PermissionError(f"{group.status.capitalize()} group buys cannot be unlocked")
    group.status = "open"
    group.locked_at = None
    db.execute(delete(GroupBuySnapshotLine).where(GroupBuySnapshotLine.group_buy_id == group.id))
    db.commit()
    return get_group_buy(db, user, group_id)


def mark_ordered(
    db: Session,
    user: User,
    group_id: int,
    body: GroupBuyOrderUpdate | None = None,
) -> GroupBuyDetail:
    """Record that the bulk order was placed (after lock). Does not change Owned."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "completed":
        raise PermissionError("Group buy is already completed")
    if group.status == "open":
        raise PermissionError("Lock for checkout before marking ordered")
    if group.status not in ("locked", "ordered"):
        raise PermissionError("Group buy cannot be marked ordered from this status")

    if body is not None:
        _apply_order_fields(group, body)
    group.status = "ordered"
    if group.ordered_at is None:
        group.ordered_at = datetime.now(timezone.utc)
    db.commit()
    return get_group_buy(db, user, group_id)


def update_order(
    db: Session,
    user: User,
    group_id: int,
    body: GroupBuyOrderUpdate,
) -> GroupBuyDetail:
    """Update order notes / shipping / split while locked, ordered, or completed."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "open":
        raise PermissionError("Lock or mark ordered before editing order details")
    _apply_order_fields(group, body)
    db.commit()
    return get_group_buy(db, user, group_id)


def complete_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    """Mark purchased without a receipt is no longer supported.

    Hosts must import a TCGPlayer receipt and apply matched lines via
    ``apply_receipt_to_group_buy`` (Mark purchased in the UI).
    """
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "completed":
        return get_group_buy(db, user, group_id)
    raise PermissionError(
        "Import a TCGPlayer receipt and Mark purchased for matched cards — "
        "completing without a receipt is not supported"
    )


def set_line_override(
    db: Session,
    user: User,
    group_id: int,
    card_id: str,
    product_id: int,
) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status in ("ordered", "completed"):
        raise PermissionError(f"{group.status.capitalize()} group buys cannot change printings")
    card_id = card_id.upper().strip()
    printing = db.scalar(
        select(CatalogPrinting).where(
            CatalogPrinting.card_id == card_id,
            CatalogPrinting.product_id == product_id,
        )
    )
    if printing is None:
        raise ValueError("Unknown printing for this card")

    preferred = services._primary_product_ids(db, {card_id}).get(card_id)
    existing = db.scalar(
        select(GroupBuyLineOverride).where(
            GroupBuyLineOverride.group_buy_id == group.id,
            GroupBuyLineOverride.card_id == card_id,
        )
    )
    # Selecting the catalog preferred printing clears any host override.
    if preferred is not None and product_id == preferred:
        if existing is not None:
            db.delete(existing)
            db.commit()
        return get_group_buy(db, user, group_id)

    if existing is None:
        db.add(
            GroupBuyLineOverride(
                group_buy_id=group.id,
                card_id=card_id,
                product_id=product_id,
            )
        )
    else:
        existing.product_id = product_id
    db.commit()
    return get_group_buy(db, user, group_id)


def export_tcgplayer(db: Session, user: User, group_id: int) -> GroupBuyExport:
    """Build TCGPlayer Mass Entry paste/URL for a group buy.

    Allocates each member's alt-art wants first (same as pricing), then the
    remainder at Preferred. Host printing overrides only apply when nobody on
    the line requested a specific alt — legacy "buy the whole line as this
    printing". Dumping total_qty onto one product_id was the disconnect that
    turned "1 AA + 3 base" into "4× checkout printing".
    """
    group = _get_group(db, group_id)
    _require_member(group, user)
    lines, _ = _build_lines(db, group, viewer_user_id=user.id)

    member_shop_alts: dict[int, dict[str, list]] = {}
    for member in group.members:
        shop = services.shopping_list(
            db, member.user, deck_ids=_parse_deck_ids(member.deck_ids_json)
        )
        # Uppercase keys — line.card_id is uppercased in merge; mismatched case
        # silently dropped AA wants and fell back to whole-line printing.
        member_shop_alts[member.user_id] = {
            item.card_id.upper(): item.alt_arts for item in shop.items
        }

    product_parts: list[str] = []
    fallback: list[str] = []
    copy_count = 0
    cards_with_product = 0
    cards_missing = 0

    for line in lines:
        if line.total_qty <= 0:
            continue
        copy_count += line.total_qty

        any_alt_wants = False
        for mem in line.members:
            if mem.qty <= 0:
                continue
            for alt in member_shop_alts.get(mem.user_id, {}).get(line.card_id, []):
                if (alt.wanted or 0) > 0:
                    any_alt_wants = True
                    break
            if any_alt_wants:
                break

        # Match pricing: AA wants → preferred remainder. Otherwise host override.
        standard_pid = (
            line.preferred_product_id
            if any_alt_wants
            else (line.product_id or line.preferred_product_id)
        )

        qty_by_product: dict[int, int] = {}
        fallback_qty = 0
        for mem in line.members:
            if mem.qty <= 0:
                continue
            mem_alts = member_shop_alts.get(mem.user_id, {}).get(line.card_id, [])
            alt_inputs = [
                (a.product_id, a.wanted, a.market_price)
                for a in mem_alts
                if (a.wanted or 0) > 0
            ]
            buys = services.allocate_still_need_buys(
                mem.qty,
                alt_inputs,
                standard_product_id=standard_pid,
                standard_price=None,
            )
            for pid, qty, _price in buys:
                if pid:
                    qty_by_product[pid] = qty_by_product.get(pid, 0) + qty
                else:
                    fallback_qty += qty

        if qty_by_product:
            cards_with_product += 1
            for pid, qty in sorted(qty_by_product.items()):
                product_parts.append(f"{qty}-{pid}")
        if fallback_qty > 0:
            cards_missing += 1
            fallback.append(f"{fallback_qty} {line.name} {line.card_id}".strip())

    paste_lines = product_parts + fallback
    paste_text = "\n".join(paste_lines)
    url = None
    if product_parts:
        params = urlencode(
            {
                "productline": TCGPLAYER_PRODUCT_LINE,
                "c": "||".join(product_parts),
            }
        )
        candidate = f"{TCGPLAYER_MASS_ENTRY_BASE}?{params}"
        if len(candidate) <= MASS_ENTRY_URL_MAX_LEN:
            url = candidate

    return GroupBuyExport(
        paste_text=paste_text,
        url=url,
        included_count=cards_with_product + cards_missing,
        copy_count=copy_count,
        with_product_id=cards_with_product,
        missing_product_id=cards_missing,
        status=group.status,
    )


def delete_group_buy(db: Session, user: User, group_id: int) -> None:
    group = _get_group(db, group_id)
    _require_host(group, user)
    db.delete(group)
    db.commit()


def _pool_qty_by_card_db(db: Session, group: GroupBuy) -> dict[str, int]:
    if group.status in FROZEN_STATUSES:
        needs = _member_needs_locked(group)
    else:
        needs = _member_needs_live(db, group)
    totals: dict[str, int] = {}
    for need in needs:
        cid = need.card_id.upper().strip()
        totals[cid] = totals.get(cid, 0) + int(need.qty)
    return totals

def _line_display_name(db: Session, card_id: str, fallback: str = "") -> str:
    card = db.get(CatalogCard, card_id)
    if card is not None and card.name:
        return card.name
    return fallback or card_id


def save_receipt_text(db: Session, user: User, group_id: int, receipt_text: str) -> None:
    """Persist the host's TCGPlayer receipt paste (survives refresh)."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status not in ("locked", "ordered"):
        raise PermissionError("Receipt can only be saved while locked or ordered")
    cleaned = (receipt_text or "").strip()[:200_000]
    if cleaned != (group.receipt_text or ""):
        group.receipt_text = cleaned
        db.commit()


def build_receipt_match_report(
    db: Session,
    user: User,
    group_id: int,
    receipt_text: str,
) -> GroupBuyReceiptMatchReport:
    """Parse a TCGPlayer receipt and compare it to the group-buy pool."""
    group = _get_group(db, group_id)
    _require_member(group, user)

    parsed = parse_tcgplayer_receipt(receipt_text)
    matched, unmatched_lines = aggregate_receipt_matches(db, parsed)
    pool = _pool_qty_by_card_db(db, group)
    receipt_by_card = {m.card_id.upper(): m for m in matched}

    lines_out: list[GroupBuyReceiptLineOut] = []
    counts = {
        "exact": 0,
        "surplus": 0,
        "short": 0,
        "extra": 0,
        "missing": 0,
        "unmatched": len(unmatched_lines),
        "receipt_copies": sum(p.qty for p in parsed),
        "needed_copies": sum(pool.values()),
        "staged_copies": 0,
    }

    # Pool cards first (stable by card_id)
    for card_id in sorted(pool.keys()):
        needed = pool[card_id]
        hit = receipt_by_card.pop(card_id, None)
        receipt_qty = hit.qty if hit else 0
        if hit is None:
            status = "missing"
            counts["missing"] += 1
            staged = 0
        elif receipt_qty == needed:
            status = "exact"
            counts["exact"] += 1
            staged = needed
        elif receipt_qty > needed:
            status = "surplus"
            counts["surplus"] += 1
            staged = needed
        else:
            status = "short"
            counts["short"] += 1
            staged = receipt_qty
        counts["staged_copies"] += staged
        lines_out.append(
            GroupBuyReceiptLineOut(
                card_id=card_id,
                name=_line_display_name(db, card_id, hit.name if hit else ""),
                group_name=hit.group_name if hit else "",
                needed_qty=needed,
                receipt_qty=receipt_qty,
                status=status,
                confidence=hit.confidence if hit else "",
                product_id=hit.product_id if hit else None,
                staged_qty=staged,
                descriptions=list(hit.descriptions) if hit else [],
            )
        )

    # Extra receipt cards not in the pool
    for card_id, hit in sorted(receipt_by_card.items()):
        counts["extra"] += 1
        lines_out.append(
            GroupBuyReceiptLineOut(
                card_id=card_id,
                name=hit.name or _line_display_name(db, card_id),
                group_name=hit.group_name,
                needed_qty=0,
                receipt_qty=hit.qty,
                status="extra",
                confidence=hit.confidence,
                product_id=hit.product_id,
                staged_qty=0,
                descriptions=list(hit.descriptions),
            )
        )

    unmatched_out = [
        GroupBuyReceiptUnmatchedOut(
            qty=line.qty,
            description=line.raw_description,
            set_name=line.set_name,
            card_name=line.card_name,
        )
        for line in unmatched_lines
    ]

    can_full = (
        counts["missing"] == 0
        and counts["short"] == 0
        and counts["needed_copies"] > 0
    )
    can_partial = counts["staged_copies"] > 0

    return GroupBuyReceiptMatchReport(
        lines=lines_out,
        unmatched=unmatched_out,
        summary=counts,
        can_apply_full=can_full,
        can_apply_partial=can_partial,
    )


def _allocate_across_snapshot(
    snapshot_rows: list[GroupBuySnapshotLine],
    apply_qty: int,
) -> list[tuple[GroupBuySnapshotLine, int]]:
    """Greedy allocation in snapshot row order (stable by id)."""
    remaining = apply_qty
    out: list[tuple[GroupBuySnapshotLine, int]] = []
    for row in sorted(snapshot_rows, key=lambda r: (r.id or 0)):
        if remaining <= 0:
            break
        take = min(int(row.qty), remaining)
        if take <= 0:
            continue
        out.append((row, take))
        remaining -= take
    return out


def apply_receipt_to_group_buy(
    db: Session,
    user: User,
    group_id: int,
    body: GroupBuyReceiptApplyRequest,
) -> GroupBuyDetail:
    """Stage receipt matches onto Owned (partial or full), then complete when empty.

    Host only. Group buy must be locked or ordered. Locked pools are marked ordered
    first. Snapshot lines are reduced by the applied amounts so a later Mark purchased
    (or another receipt apply) only covers what is still outstanding.
    """
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "completed":
        raise PermissionError("Group buy is already completed")
    if group.status == "open":
        raise PermissionError("Lock for checkout before applying a receipt")
    if group.status not in ("locked", "ordered"):
        raise PermissionError("Group buy cannot apply a receipt from this status")

    cleaned_receipt = (body.receipt_text or "").strip()[:200_000]
    group.receipt_text = cleaned_receipt

    report = build_receipt_match_report(db, user, group_id, cleaned_receipt)
    if not report.can_apply_partial:
        raise ValueError("No receipt lines matched cards in this group buy")

    selected: set[str] | None = None
    if body.card_ids is not None:
        selected = {c.upper().strip() for c in body.card_ids if c and c.strip()}
        if not selected:
            raise ValueError("No cards selected to stage")

    staged_lines = [
        line
        for line in report.lines
        if line.staged_qty > 0
        and line.status in ("exact", "surplus", "short")
        and (selected is None or line.card_id in selected)
    ]
    if not staged_lines:
        raise ValueError("No selected cards have receipt copies to apply")

    if not body.allow_partial:
        if not report.can_apply_full:
            raise ValueError(
                "Receipt does not fully cover the group buy — enable partial apply or fix shortages"
            )
        if selected is not None:
            pool_ids = {l.card_id for l in report.lines if l.needed_qty > 0}
            if selected != pool_ids:
                raise ValueError("Full apply requires staging every pool card")

    # Ensure ordered before mutating owned / snapshot
    if group.status == "locked":
        group.status = "ordered"
        if group.ordered_at is None:
            group.ordered_at = datetime.now(timezone.utc)

    snapshot_all = list(
        db.scalars(
            select(GroupBuySnapshotLine).where(GroupBuySnapshotLine.group_buy_id == group.id)
        ).all()
    )
    by_card: dict[str, list[GroupBuySnapshotLine]] = {}
    for row in snapshot_all:
        by_card.setdefault(row.card_id.upper(), []).append(row)

    applied_any = False
    for line in staged_lines:
        rows = by_card.get(line.card_id, [])
        allocations = _allocate_across_snapshot(rows, line.staged_qty)
        for snap, take in allocations:
            _add_owned(db, snap.user_id, snap.card_id, take)
            snap.qty = int(snap.qty) - take
            applied_any = True
            if snap.qty <= 0:
                # Remove via relationship so delete-orphan cascade actually drops the row
                # (session.delete alone can be resurrected while still on group.snapshot_lines).
                if snap in group.snapshot_lines:
                    group.snapshot_lines.remove(snap)
                else:
                    db.delete(snap)

    if not applied_any:
        raise ValueError("Nothing left to apply — snapshot may already be cleared")

    db.flush()
    remaining = any(int(row.qty) > 0 for row in group.snapshot_lines)
    if not remaining:
        group.status = "completed"

    db.commit()
    return get_group_buy(db, user, group_id)
