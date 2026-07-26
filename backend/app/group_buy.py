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
    GroupBuySummary,
)
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


def _catalog_bundle(db: Session, card_ids: set[str]):
    catalog = {}
    if card_ids:
        rows = db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
        catalog = {r.card_id: r for r in rows}
    product_ids = services._primary_product_ids(db, card_ids)
    alts = services._alt_arts_map(db, card_ids)
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
    catalog, primary_ids, alts, printings = _catalog_bundle(db, card_ids)

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
        product_id = (
            product_overrides.get(card_id)
            or (line.suggested_product_id if line else None)
            or primary_ids.get(card_id)
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
        remaining = round(total_qty * market, 2) if market is not None else None
        for mem in members:
            if mem.qty <= 0:
                continue
            bucket = member_totals.setdefault(mem.user_id, [0, 0.0])
            bucket[0] += mem.qty
            if market is not None:
                bucket[1] += mem.qty * market

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
                alt_arts=alts.get(card_id, []),
                my_qty=my_qty,
                my_suggested_qty=mine.suggested_qty if mine else 0,
                my_is_custom=my_is_custom,
                my_excluded=bool(my_is_custom and my_qty == 0),
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
        )
    }
    cards_subtotal = round_money(sum(card_costs.values()))
    shipping_cost = round_money(float(group.shipping_cost or 0.0))

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
        cards_subtotal=cards_subtotal,
        grand_total=round_money(cards_subtotal + shipping_cost),
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
    """Freeze quantities (if needed) and record that the bulk order was placed."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "completed":
        raise PermissionError("Group buy is already completed")
    if group.status == "open":
        _freeze_snapshot(db, group)
        group.locked_at = datetime.now(timezone.utc)
        db.flush()
    elif group.status not in ("locked", "ordered"):
        raise PermissionError("Group buy cannot be marked ordered from this status")

    if body is not None:
        _apply_order_fields(group, body)
    group.status = "ordered"
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
    """End the group buy and add each member's buy qtys to their Owned counts."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "completed":
        return get_group_buy(db, user, group_id)

    if group.status == "open":
        _freeze_snapshot(db, group)
        group.locked_at = datetime.now(timezone.utc)
        db.flush()
    elif group.status not in ("locked", "ordered"):
        raise PermissionError("Group buy cannot be completed from this status")

    if group.ordered_at is None and group.status != "ordered":
        # Completing without an explicit order step is fine; leave ordered_at null.
        pass

    snapshot = db.scalars(
        select(GroupBuySnapshotLine).where(GroupBuySnapshotLine.group_buy_id == group.id)
    ).all()
    for line in snapshot:
        _add_owned(db, line.user_id, line.card_id, line.qty)

    group.status = "completed"
    db.commit()
    return get_group_buy(db, user, group_id)


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
    existing = db.scalar(
        select(GroupBuyLineOverride).where(
            GroupBuyLineOverride.group_buy_id == group.id,
            GroupBuyLineOverride.card_id == card_id,
        )
    )
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
    detail = get_group_buy(db, user, group_id)
    product_parts: list[str] = []
    fallback: list[str] = []
    copy_count = 0
    for line in detail.lines:
        if line.total_qty <= 0:
            continue
        copy_count += line.total_qty
        if line.product_id:
            product_parts.append(f"{line.total_qty}-{line.product_id}")
        else:
            fallback.append(f"{line.total_qty} {line.name} {line.card_id}".strip())

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
        included_count=len(paste_lines),
        copy_count=copy_count,
        with_product_id=len(product_parts),
        missing_product_id=len(fallback),
        status=detail.status,
    )


def delete_group_buy(db: Session, user: User, group_id: int) -> None:
    group = _get_group(db, group_id)
    _require_host(group, user)
    db.delete(group)
    db.commit()
