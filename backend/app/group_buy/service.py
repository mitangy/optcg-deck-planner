"""Group buy (collaborative shopping pool) service."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import Forbidden, Invalid, NotFound
from app.core.statuses import GroupBuyStatus, ReceiptLineStatus
from app.group_buy.merge import MemberNeed, MergedMemberQty, merge_member_needs
from app.group_buy.settlement import SHIPPING_SPLIT_MODES, build_settlements, round_money
from app.core.models import User
from app.group_buy.models import (
    GroupBuy,
    GroupBuyExtraSkip,
    GroupBuyMember,
    GroupBuyQtyOverride,
    GroupBuyReceiptApply,
    GroupBuyReceiptApplyLine,
    GroupBuySnapshotLine,
)
from app.planner.models import CatalogCard, CatalogPrinting, Owned
from app.group_buy.schemas import (
    GroupBuyDetail,
    GroupBuyExport,
    GroupBuyInvitePreview,
    GroupBuyLineOut,
    GroupBuyMemberOut,
    GroupBuyMemberQtyOut,
    GroupBuyMyExtraOut,
    GroupBuyOrderUpdate,
    GroupBuyReceiptApplyRequest,
    GroupBuyReceiptLineOut,
    GroupBuyReceiptMatchReport,
    GroupBuyReceiptUnmatchedOut,
    GroupBuySummary,
)
from app.planner.schemas import GroupBuyArtWantOut
from app.group_buy.receipt import aggregate_receipt_matches, parse_tcgplayer_receipt
from app.planner import shopping as shopping_svc
from app.planner import catalog_repo
from app.planner.printings import deck_alt_buy_inputs

FROZEN_STATUSES = frozenset({GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED})

TCGPLAYER_MASS_ENTRY_BASE = "https://www.tcgplayer.com/massentry"
TCGPLAYER_PRODUCT_LINE = "One Piece Card Game"
MASS_ENTRY_URL_MAX_LEN = 1800


def _display_name(user: User) -> str:
    """Duel username when set (#903), else the account name as before."""
    if user.username:
        return user.username
    return (user.name or user.email or f"User {user.id}").strip()


def _parse_deck_ids(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list):
        return None
    if not data:
        return []  # an explicit empty pick: no decks (#1208)
    out: list[int] = []
    for item in data:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out or None


def _dump_deck_ids(deck_ids: list[int] | None) -> str | None:
    """None = all decks; [] is kept as "[]" = no decks, only added cards / Extra copies (#1208)."""
    if deck_ids is None:
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
            selectinload(GroupBuy.qty_overrides),
            selectinload(GroupBuy.extra_skips),
            selectinload(GroupBuy.receipt_applies).selectinload(GroupBuyReceiptApply.lines),
        )
    )
    if group is None:
        raise NotFound("Group buy not found")
    return group


def _member_shopping(db: Session, member: GroupBuyMember):
    """The member's contribution: their Master Shopping list under their group settings (#1177)."""
    return shopping_svc.shopping_list(
        db,
        member.user,
        deck_ids=_parse_deck_ids(member.deck_ids_json),
        include_extras=bool(member.include_singles),
        # Keep the owned-alt reserve like Master Shopping; unticked only hides them (#1216).
        include_collector=True,
        show_collector=bool(member.include_extra_copies),
    )


# (user_id, card_id upper, product_id) -> Extra copies skipped in this group buy (#1269).
ExtraSkips = dict[tuple[int, str, int], int]


def _extra_skip_map(group: GroupBuy) -> ExtraSkips:
    return {
        (row.user_id, row.card_id.upper(), row.product_id): int(row.qty)
        for row in group.extra_skips
        if row.qty > 0
    }


def _effective_extras(item, skips: dict[int, int] | None = None) -> list[tuple[int, int, float | None]]:
    """(product_id, copies still wanted after this group buy's skips, price) per Extra copy."""
    skips = skips or {}
    out = []
    for c in item.collector_wants:
        left = max(0, c.still_need - skips.get(c.product_id, 0))
        if left > 0:
            out.append((c.product_id, left, c.market_price))
    return out


def _card_skips(skips: ExtraSkips | None, user_id: int, card_id: str) -> dict[int, int]:
    if not skips:
        return {}
    card_id = card_id.upper()
    return {pid: q for (uid, cid, pid), q in skips.items() if uid == user_id and cid == card_id}


def _suggested_qty(item, skips: dict[int, int] | None = None) -> int:
    """Copies to buy for a card: deck/single still-need plus Extra copies still missing and not skipped."""
    return item.still_need + sum(q for _pid, q, _price in _effective_extras(item, skips))


def _funded_extras(
    item, skips: dict[int, int] | None = None, qty: int | None = None
) -> list[tuple[int, int, float | None]]:
    """Extra copies a buy of ``qty`` copies actually pays for: deck copies come first (#1269)."""
    extra = _effective_extras(item, skips)
    if qty is None:
        return extra
    budget = max(0, min(qty - item.still_need, sum(q for _p, q, _pr in extra)))
    capped = []
    for pid, q, price in extra:
        take = min(q, budget)
        if take > 0:
            capped.append((pid, take, price))
            budget -= take
    return capped


def _member_alt_inputs(
    item, skips: dict[int, int] | None = None, qty: int | None = None
) -> list[tuple[int, int, float | None]]:
    """Alt allocation order: Extra copies first (they are the alts the member asked for), then deck picks.

    With ``qty`` below the suggestion, Extra copies are the first to go: only what is left
    after the deck copies is spent on them (#1269).
    """
    extra = _funded_extras(item, skips, qty)
    # Owned copies a collector want does not claim already cover the deck (#1216).
    usable = {a.product_id: a.owned - min(a.owned, a.collector) for a in item.alt_arts}
    return extra + deck_alt_buy_inputs(item.alt_arts, usable)


def _alt_inputs_for(
    member_items: dict[int, dict[str, object]],
    skips: ExtraSkips,
    user_id: int,
    card_id: str,
    qty: int,
) -> list[tuple[int, int, float | None]]:
    item = member_items.get(user_id, {}).get(card_id.upper())
    if item is None:
        return []
    return _member_alt_inputs(item, _card_skips(skips, user_id, card_id), qty)


def _my_extras(item, skips: dict[int, int]) -> list[GroupBuyMyExtraOut]:
    names = {a.product_id: a.name for a in item.alt_arts}
    return [
        GroupBuyMyExtraOut(
            product_id=c.product_id,
            name=names.get(c.product_id) or c.label,
            market_price=c.market_price,
            wanted=c.still_need,
            skipped=min(c.still_need, skips.get(c.product_id, 0)),
        )
        for c in item.collector_wants
        if c.still_need > 0
    ]


def _require_member(group: GroupBuy, user: User) -> GroupBuyMember:
    for member in group.members:
        if member.user_id == user.id:
            return member
    raise Forbidden("Not a member of this group buy")


def _require_host(group: GroupBuy, user: User) -> None:
    if group.host_user_id != user.id:
        raise Forbidden("Only the host can do that")


def _qty_override_map(group: GroupBuy) -> dict[tuple[int, str], int]:
    return {
        (row.user_id, row.card_id.upper()): int(row.qty)
        for row in group.qty_overrides
    }


def _member_needs_live(db: Session, group: GroupBuy) -> list[MemberNeed]:
    """Shopping still-need as default, with per-member qty overrides applied."""
    overrides = _qty_override_map(group)
    skips = _extra_skip_map(group)
    needs: list[MemberNeed] = []
    for member in group.members:
        shopping = _member_shopping(db, member)
        name = _display_name(member.user)
        shop_by_id = {item.card_id.upper(): item for item in shopping.items}
        card_ids = set(shop_by_id) | {
            card_id for (uid, card_id) in overrides if uid == member.user_id
        }
        for card_id in sorted(card_ids):
            item = shop_by_id.get(card_id)
            suggested = (
                _suggested_qty(item, _card_skips(skips, member.user_id, card_id)) if item else 0
            )
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
    product_ids = catalog_repo.primary_product_ids(db, card_ids)
    alts = catalog_repo.alt_arts_map(db, card_ids, wanted=wanted)
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
    if group.status != GroupBuyStatus.OPEN:
        return {}
    member = next((m for m in group.members if m.user_id == viewer_user_id), None)
    if member is None:
        return {}
    shopping = _member_shopping(db, member)
    shop_by_id = {item.card_id.upper(): item for item in shopping.items}
    name = _display_name(member.user)
    skips = _extra_skip_map(group)
    out: dict[str, MergedMemberQty] = {}
    for (uid, card_id), qty in _qty_override_map(group).items():
        if uid != viewer_user_id or qty > 0:
            continue
        item = shop_by_id.get(card_id)
        out[card_id] = MergedMemberQty(
            user_id=viewer_user_id,
            display_name=name,
            qty=0,
            suggested_qty=(
                _suggested_qty(item, _card_skips(skips, viewer_user_id, card_id)) if item else 0
            ),
            is_custom=True,
        )
    return out


def _group_shown_pick(
    card_id: str, member_display: dict[int, dict[str, int]], host_id: int
) -> int | None:
    """Art most members picked with Show (0 = base); ties go to the host's pick, then lowest id."""
    counts: dict[int, int] = {}
    for by_card in member_display.values():
        pick = by_card.get(card_id)
        if pick is not None:
            counts[pick] = counts.get(pick, 0) + 1
    if not counts:
        return None
    host_pick = member_display.get(host_id, {}).get(card_id)
    return min(counts, key=lambda pid: (-counts[pid], pid != host_pick, pid))


def _group_wanted_alt(card_id: str, member_shop_alts: dict[int, dict[str, list]]) -> int | None:
    """Product id of the alt with the most wanted copies across all members (ties: lowest id)."""
    totals: dict[int, int] = {}
    for by_card in member_shop_alts.values():
        for a in by_card.get(card_id, []):
            if (a.wanted or 0) > 0:
                totals[a.product_id] = totals.get(a.product_id, 0) + a.wanted
    if not totals:
        return None
    return min(totals, key=lambda pid: (-totals[pid], pid))


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
    card_ids = {line.card_id for line in merged} | set(zero_customs)

    viewer_wants: dict[str, dict[int, int]] = {}
    viewer_need: dict[str, int] = {}
    viewer_shop_alts: dict[str, list] = {}
    viewer_display: dict[str, int | None] = {}
    viewer_used_in: dict[str, list[str]] = {}
    # Per-member alt wants for pricing (allocate AA qty, rest at preferred).
    member_shop_alts: dict[int, dict[str, list]] = {}
    # Each member's shopping items by card: allocation inputs are built per qty (#1177, #1269).
    member_items: dict[int, dict[str, object]] = {}
    skips = _extra_skip_map(group)
    viewer_items: dict[str, object] = {}
    # Each member's explicit Show pick per card (#893).
    member_display: dict[int, dict[str, int]] = {}
    for member in group.members:
        shop = _member_shopping(db, member)
        by_card: dict[str, list] = {}
        by_card_items: dict[str, object] = {}
        for item in shop.items:
            by_card[item.card_id.upper()] = item.alt_arts
            by_card_items[item.card_id.upper()] = item
            if item.display_art is not None:
                member_display.setdefault(member.user_id, {})[item.card_id.upper()] = item.display_art
            if member.user_id == viewer_user_id:
                viewer_need[item.card_id] = item.need
                viewer_wants[item.card_id] = {
                    a.product_id: a.wanted for a in item.alt_arts if a.wanted > 0
                }
                viewer_shop_alts[item.card_id] = item.alt_arts
                viewer_display[item.card_id] = item.display_art
                viewer_used_in[item.card_id] = list(item.used_in)
                viewer_items[item.card_id.upper()] = item
        member_shop_alts[member.user_id] = by_card
        member_items[member.user_id] = by_card_items

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
        base_image_url = cat.image_url if cat else ""
        if preferred_product_id and preferred_product_id in printings:
            base_image_url = printings[preferred_product_id].image_url or base_image_url
        product_id = (
            line.suggested_product_id if line else None
        ) or preferred_product_id
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
        art_wants: list[GroupBuyArtWantOut] = []
        for mem in members:
            if mem.qty <= 0:
                continue
            any_buy = True
            alt_inputs = _alt_inputs_for(member_items, skips, mem.user_id, card_id, mem.qty)
            buys = shopping_svc.allocate_still_need_buys(
                mem.qty,
                alt_inputs,
                standard_product_id=preferred_product_id,
                standard_price=preferred_market,
            )
            art_wants.extend(
                GroupBuyArtWantOut(product_id=pid, user_id=mem.user_id, qty=qty)
                for pid, qty, _price in buys
                if pid and qty > 0
            )
            cost = shopping_svc.remaining_cost_for_buys(buys)
            bucket = member_totals.setdefault(mem.user_id, [0, 0.0])
            bucket[0] += mem.qty
            if cost is None:
                priced_ok = False
            else:
                line_remaining += cost
                bucket[1] += cost
        remaining = round(line_remaining, 2) if any_buy and priced_ok else (0.0 if not any_buy else None)

        line_alt_arts = list(viewer_shop_alts.get(card_id) or alts.get(card_id, []))
        line_display_art = viewer_display.get(card_id)
        if line_display_art is None and not viewer_wants.get(card_id):
            # Viewer has no art preference of their own: show the art members picked with
            # Show (#893), else the alt the group wants most (#882).
            group_pick = _group_shown_pick(card_id, member_display, group.host_user_id)
            if group_pick is None:
                group_pick = _group_wanted_alt(card_id, member_shop_alts)
            if group_pick is not None:
                line_display_art = group_pick
                if group_pick > 0 and all(a.product_id != group_pick for a in line_alt_arts):
                    line_alt_arts.extend(a for a in alts.get(card_id, []) if a.product_id == group_pick)

        mine = next((m for m in members if m.user_id == viewer_user_id), None)
        my_qty = mine.qty if mine else 0
        my_is_custom = mine.is_custom if mine else False
        my_item = viewer_items.get(card_id)
        my_extras = (
            _my_extras(my_item, _card_skips(skips, viewer_user_id, card_id)) if my_item else []
        )
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
                base_image_url=base_image_url,
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
                alt_arts=line_alt_arts,
                art_wants=art_wants,
                display_art=line_display_art,
                my_qty=my_qty,
                my_suggested_qty=mine.suggested_qty if mine else 0,
                my_is_custom=my_is_custom,
                my_excluded=bool(my_is_custom and my_qty == 0),
                my_need=viewer_need.get(card_id, 0),
                my_used_in=viewer_used_in.get(card_id, []),
                my_deck_qty=my_item.still_need if my_item else 0,
                my_extras=my_extras,
            )
        )

    member_stats = {
        uid: (counts[0], round(counts[1], 2)) for uid, counts in member_totals.items()
    }
    return lines_out, member_stats


def _summary_fields(
    group: GroupBuy,
    user: User | None,
    lines: list[GroupBuyLineOut],
) -> dict:
    cards_still = sum(line.total_qty for line in lines)
    remaining = round(
        sum(line.remaining_cost for line in lines if line.remaining_cost is not None),
        2,
    )
    is_public = bool(getattr(group, "is_public", False))
    return {
        "id": group.id,
        "title": group.title,
        "status": group.status,
        "invite_token": group.invite_token,
        "invite_path": f"/group-buy/join/{group.invite_token}",
        "host_user_id": group.host_user_id,
        "host_name": _display_name(group.host),
        "member_count": len(group.members),
        "is_host": bool(user is not None and group.host_user_id == user.id),
        "is_public": is_public,
        "public_path": f"/group-buy/view/{group.invite_token}" if is_public else None,
        "unique_cards": len(lines),
        "cards_still_needed": cards_still,
        "remaining_market": remaining,
        "created_at": group.created_at.isoformat() if group.created_at else "",
    }


def _detail_from_group(
    db: Session,
    group: GroupBuy,
    user: User | None,
    *,
    read_only: bool = False,
) -> GroupBuyDetail:
    viewer_id = user.id if user is not None else 0
    lines, member_stats = _build_lines(db, group, viewer_user_id=viewer_id)

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
                deck_ids=_parse_deck_ids(member.deck_ids_json) if not read_only else None,
                include_singles=bool(member.include_singles),
                include_extra_copies=bool(member.include_extra_copies),
                sum_across_leaders=(
                    None
                    if group.status in FROZEN_STATUSES
                    else bool(getattr(member.user, "sum_across_leaders", False))
                ),
                cards_still_needed=copies_n,
                remaining_market=market,
                card_cost=settle.card_cost if settle else 0.0,
                shipping_share=settle.shipping_share if settle else 0.0,
                tax_share=settle.tax_share if settle else 0.0,
                total_owed=settle.total_owed if settle else 0.0,
            )
        )
    # Public viewers must not see host receipt paste or undo affordances.
    receipt_text = "" if read_only else (group.receipt_text or "")
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
        receipt_text=receipt_text,
        has_receipt=bool(receipt_text.strip()) if not read_only else False,
        can_undo_purchase=False if read_only else bool(group.receipt_applies),
        read_only=read_only,
    )


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
    return _detail_from_group(db, group, user, read_only=False)


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
        status=GroupBuyStatus.OPEN,
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
            selectinload(GroupBuy.qty_overrides),
        )
    )
    if group is None:
        raise NotFound("Invite link not found")
    if group.status in FROZEN_STATUSES:
        # Allow existing members to open; block new joins.
        try:
            _require_member(group, user)
            return get_group_buy(db, user, group.id)
        except PermissionError as exc:
            raise Forbidden(
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
        raise NotFound("Invite link not found")
    return GroupBuyInvitePreview(
        title=group.title,
        host_name=_display_name(group.host),
        member_count=len(group.members),
        status=group.status,
        invite_token=group.invite_token,
        is_public=bool(getattr(group, "is_public", False)),
        public_path=f"/group-buy/view/{group.invite_token}",
    )


def set_public(
    db: Session,
    user: User,
    group_id: int,
    is_public: bool,
) -> GroupBuyDetail:
    """Host toggles whether anyone with the link can view this pool read-only."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    group.is_public = bool(is_public)
    db.commit()
    return get_group_buy(db, user, group_id)


def set_title(
    db: Session,
    user: User,
    group_id: int,
    title: str,
) -> GroupBuyDetail:
    """Host renames the group buy. Allowed in any status (open, locked, ordered)."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    cleaned = (title or "").strip()
    if not cleaned:
        raise Invalid("Group buy name cannot be empty")
    group.title = cleaned[:200]
    db.commit()
    return get_group_buy(db, user, group_id)


def public_group_buy_view(db: Session, token: str) -> GroupBuyDetail:
    """Unauthenticated read-only detail for anyone holding the invite token (#880)."""
    group = db.scalar(
        select(GroupBuy)
        .where(GroupBuy.invite_token == token)
        .options(
            selectinload(GroupBuy.members).selectinload(GroupBuyMember.user),
            selectinload(GroupBuy.host),
            selectinload(GroupBuy.snapshot_lines),
            selectinload(GroupBuy.qty_overrides),
            selectinload(GroupBuy.receipt_applies).selectinload(GroupBuyReceiptApply.lines),
        )
    )
    if group is None:
        raise NotFound("Group buy not found")
    return _detail_from_group(db, group, user=None, read_only=True)


def update_contribution(
    db: Session,
    user: User,
    group_id: int,
    deck_ids: list[int] | None,
    include_singles: bool | None = None,
    include_extra_copies: bool | None = None,
) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    member = _require_member(group, user)
    if group.status != GroupBuyStatus.OPEN:
        raise Forbidden("Group buy is locked; contributions cannot change")
    member.deck_ids_json = _dump_deck_ids(deck_ids)
    if include_singles is not None:
        member.include_singles = include_singles
    if include_extra_copies is not None:
        member.include_extra_copies = include_extra_copies
    db.commit()
    return get_group_buy(db, user, group_id)


def include_deck_in_open_group_buys(db: Session, user: User, deck_id: int) -> None:
    """Include a newly imported deck in every open group-buy contribution.

    ``deck_ids_json is None`` already means all decks (new decks count automatically).
    Explicit contribution lists get ``deck_id`` appended so imports are not left out,
    except an explicit empty pick (no decks, #1208), which stays empty.
    Locked / ordered / completed pools are left unchanged.
    """
    members = db.scalars(
        select(GroupBuyMember)
        .join(GroupBuy, GroupBuy.id == GroupBuyMember.group_buy_id)
        .where(
            GroupBuyMember.user_id == user.id,
            GroupBuy.status == GroupBuyStatus.OPEN,
        )
    ).all()
    changed = False
    for member in members:
        current = _parse_deck_ids(member.deck_ids_json)
        if current == []:
            continue  # an explicit empty pick stays empty (#1208)
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
    if group.status != GroupBuyStatus.OPEN:
        raise Forbidden("Group buy is locked; quantities cannot change")
    card_id = card_id.upper().strip()
    if not card_id:
        raise Invalid("card_id is required")
    qty = max(0, min(999, int(qty)))

    # Default (no override) is shopping still-need. If qty matches that, clear override.
    shopping = _member_shopping(db, member)
    my_skips = _card_skips(_extra_skip_map(group), user.id, card_id)
    suggested = next(
        (
            _suggested_qty(item, my_skips)
            for item in shopping.items
            if item.card_id.upper() == card_id
        ),
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


def set_extra_skip(
    db: Session,
    user: User,
    group_id: int,
    card_id: str,
    product_id: int,
    skip: int,
) -> GroupBuyDetail:
    """Leave Extra copies of one alt out of this group buy (#1269). Shopping is untouched."""
    group = _get_group(db, group_id)
    member = _require_member(group, user)
    if group.status != GroupBuyStatus.OPEN:
        raise Forbidden("Group buy is locked; quantities cannot change")
    card_id = card_id.upper().strip()
    shopping = _member_shopping(db, member)
    item = next((i for i in shopping.items if i.card_id.upper() == card_id), None)
    extra = next(
        (c for c in (item.collector_wants if item else []) if c.product_id == product_id), None
    )
    if item is None or extra is None or extra.still_need <= 0:
        raise Invalid("No Extra copy of that printing on this card")
    new_skip = max(0, min(int(skip), extra.still_need))

    row = next(
        (
            r
            for r in group.extra_skips
            if r.user_id == user.id and r.card_id.upper() == card_id and r.product_id == product_id
        ),
        None,
    )
    old_skip = min(row.qty, extra.still_need) if row is not None else 0
    if new_skip == old_skip:
        return get_group_buy(db, user, group_id)
    if new_skip == 0:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(
            GroupBuyExtraSkip(
                group_buy_id=group.id,
                user_id=user.id,
                card_id=card_id,
                product_id=product_id,
                qty=new_skip,
            )
        )
    else:
        row.qty = new_skip

    # A custom qty follows the change: skipping one copy lowers it by one (an excluded line stays out).
    override = next(
        (
            r
            for r in group.qty_overrides
            if r.user_id == user.id and r.card_id.upper() == card_id
        ),
        None,
    )
    if override is not None and override.qty > 0:
        skips = _card_skips(_extra_skip_map(group), user.id, card_id)
        skips[product_id] = new_skip
        new_suggested = _suggested_qty(item, skips)
        # Unticking only frees the copies of this Extra the custom qty actually paid for; a qty at or
        # below the deck copies never had it, so no deck copy goes with it.
        if new_skip > old_skip:
            before = dict(skips)
            before[product_id] = old_skip
            funded = sum(
                q for pid, q, _pr in _funded_extras(item, before, override.qty) if pid == product_id
            )
            freed = min(new_skip - old_skip, funded)
        else:
            freed = new_skip - old_skip
        shifted = max(0, override.qty - freed)
        if shifted == new_suggested and shifted > 0:
            db.delete(override)
        else:
            override.qty = shifted
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
    if group.status != GroupBuyStatus.OPEN:
        raise Forbidden("Group buy is locked; quantities cannot change")
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
    if group.status != GroupBuyStatus.OPEN:
        raise Forbidden("Group buy is locked; quantities cannot change")
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


def _subtract_owned(db: Session, user_id: int, card_id: str, delta: int) -> None:
    """Remove Owned copies added by a purchase apply (never goes below 0)."""
    if delta <= 0:
        return
    card_id = card_id.upper().strip()
    row = db.scalar(
        select(Owned).where(Owned.user_id == user_id, Owned.card_id == card_id)
    )
    if row is None:
        return
    row.qty = max(0, int(row.qty) - delta)


def _apply_order_fields(group: GroupBuy, body: GroupBuyOrderUpdate) -> None:
    if body.external_order_id is not None:
        group.external_order_id = body.external_order_id.strip()[:200]
    if body.order_notes is not None:
        group.order_notes = body.order_notes.strip()[:4000]
    if body.shipping_cost is not None:
        group.shipping_cost = max(0.0, float(body.shipping_cost))
    if body.shipping_split is not None:
        if body.shipping_split not in SHIPPING_SPLIT_MODES:
            raise Invalid("shipping_split must be equal, by_cost, or by_copies")
        group.shipping_split = body.shipping_split
    if body.tax_cost is not None:
        group.tax_cost = max(0.0, float(body.tax_cost))


def lock_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED):
        raise Forbidden(f"Group buy is already {group.status}")
    if group.status == GroupBuyStatus.LOCKED:
        return get_group_buy(db, user, group_id)

    _freeze_snapshot(db, group)
    group.status = GroupBuyStatus.LOCKED
    group.locked_at = datetime.now(timezone.utc)
    db.commit()
    return get_group_buy(db, user, group_id)


def unlock_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED):
        raise Forbidden(f"{group.status.capitalize()} group buys cannot be unlocked")
    group.status = GroupBuyStatus.OPEN
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
    if group.status == GroupBuyStatus.COMPLETED:
        raise Forbidden("Group buy is already completed")
    if group.status == GroupBuyStatus.OPEN:
        raise Forbidden("Lock for checkout before marking ordered")
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Group buy cannot be marked ordered from this status")

    if body is not None:
        _apply_order_fields(group, body)
    group.status = GroupBuyStatus.ORDERED
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
    if group.status == GroupBuyStatus.OPEN:
        raise Forbidden("Lock or mark ordered before editing order details")
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
    if group.status == GroupBuyStatus.COMPLETED:
        return get_group_buy(db, user, group_id)
    raise Forbidden(
        "Import a TCGPlayer receipt and Mark purchased for matched cards — "
        "completing without a receipt is not supported"
    )


def export_tcgplayer(db: Session, user: User, group_id: int) -> GroupBuyExport:
    """Build TCGPlayer Mass Entry paste/URL for a group buy.

    Allocates each member's alt-art wants first (same as pricing), then the
    remainder at Preferred. Checkout follows only what members picked on the
    art tiles; there is no host printing override. Dumping total_qty onto one
    product_id was the disconnect that turned "1 AA + 3 base" into "4× checkout
    printing".
    """
    group = _get_group(db, group_id)
    _require_member(group, user)
    lines, _ = _build_lines(db, group, viewer_user_id=user.id)

    skips = _extra_skip_map(group)
    member_items: dict[int, dict[str, object]] = {}
    for member in group.members:
        shop = _member_shopping(db, member)
        # Uppercase keys — line.card_id is uppercased in merge; mismatched case
        # silently dropped AA wants and fell back to whole-line printing.
        member_items[member.user_id] = {item.card_id.upper(): item for item in shop.items}

    product_parts: list[str] = []
    fallback: list[str] = []
    copy_count = 0
    cards_with_product = 0
    cards_missing = 0

    for line in lines:
        if line.total_qty <= 0:
            continue
        copy_count += line.total_qty

        # Match pricing: AA wants first, remainder at Preferred.
        standard_pid = line.preferred_product_id or line.product_id

        qty_by_product: dict[int, int] = {}
        fallback_qty = 0
        for mem in line.members:
            if mem.qty <= 0:
                continue
            alt_inputs = _alt_inputs_for(member_items, skips, mem.user_id, line.card_id, mem.qty)
            buys = shopping_svc.allocate_still_need_buys(
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


def leave_group_buy(db: Session, user: User, group_id: int) -> None:
    """A non-host member leaves an open group buy; their per-group rows go with them (#881)."""
    group = _get_group(db, group_id)
    member = _require_member(group, user)
    if group.host_user_id == user.id:
        raise Invalid("Host can't leave; delete the group buy instead")
    if group.status != GroupBuyStatus.OPEN:
        raise Invalid("Ask the host to unlock first")
    for row in list(group.qty_overrides):
        if row.user_id == user.id:
            db.delete(row)
    for skip_row in list(group.extra_skips):
        if skip_row.user_id == user.id:
            db.delete(skip_row)
    db.delete(member)
    db.commit()


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
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Receipt can only be saved while locked or ordered")
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
            status = ReceiptLineStatus.MISSING
            counts["missing"] += 1
            staged = 0
        elif receipt_qty == needed:
            status = ReceiptLineStatus.EXACT
            counts["exact"] += 1
            staged = needed
        elif receipt_qty > needed:
            status = ReceiptLineStatus.SURPLUS
            counts["surplus"] += 1
            staged = needed
        else:
            status = ReceiptLineStatus.SHORT
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
                status=ReceiptLineStatus.EXTRA,
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
    if group.status == GroupBuyStatus.COMPLETED:
        raise Forbidden("Group buy is already completed")
    if group.status == GroupBuyStatus.OPEN:
        raise Forbidden("Lock for checkout before applying a receipt")
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Group buy cannot apply a receipt from this status")

    cleaned_receipt = (body.receipt_text or "").strip()[:200_000]
    group.receipt_text = cleaned_receipt

    report = build_receipt_match_report(db, user, group_id, cleaned_receipt)
    if not report.can_apply_partial:
        raise Invalid("No receipt lines matched cards in this group buy")

    selected: set[str] | None = None
    if body.card_ids is not None:
        selected = {c.upper().strip() for c in body.card_ids if c and c.strip()}
        if not selected:
            raise Invalid("No cards selected to stage")

    staged_lines = [
        line
        for line in report.lines
        if line.staged_qty > 0
        and line.status in (ReceiptLineStatus.EXACT, ReceiptLineStatus.SURPLUS, ReceiptLineStatus.SHORT)
        and (selected is None or line.card_id in selected)
    ]
    if not staged_lines:
        raise Invalid("No selected cards have receipt copies to apply")

    if not body.allow_partial:
        if not report.can_apply_full:
            raise Invalid(
                "Receipt does not fully cover the group buy — enable partial apply or fix shortages"
            )
        if selected is not None:
            pool_ids = {l.card_id for l in report.lines if l.needed_qty > 0}
            if selected != pool_ids:
                raise Invalid("Full apply requires staging every pool card")

    # Ensure ordered before mutating owned / snapshot
    status_before = group.status
    set_ordered_at = False
    if group.status == GroupBuyStatus.LOCKED:
        group.status = GroupBuyStatus.ORDERED
        if group.ordered_at is None:
            group.ordered_at = datetime.now(timezone.utc)
            set_ordered_at = True

    apply_event = GroupBuyReceiptApply(
        group_buy_id=group.id,
        applied_by_user_id=user.id,
        status_before=status_before,
        set_ordered_at=1 if set_ordered_at else 0,
    )
    db.add(apply_event)
    db.flush()

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
            db.add(
                GroupBuyReceiptApplyLine(
                    apply_id=apply_event.id,
                    user_id=snap.user_id,
                    card_id=snap.card_id.upper().strip(),
                    product_id=snap.product_id,
                    qty=take,
                )
            )
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
        raise Invalid("Nothing left to apply — snapshot may already be cleared")

    db.flush()
    remaining = any(int(row.qty) > 0 for row in group.snapshot_lines)
    if not remaining:
        group.status = GroupBuyStatus.COMPLETED

    db.commit()
    return get_group_buy(db, user, group_id)


def undo_last_receipt_apply(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    """Reverse the most recent Mark purchased (Owned + snapshot + status).

    Host only. Restores frozen pool quantities and subtracts the Owned copies that
    apply added. Receipt paste and order settlement fields are left intact.
    """
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status not in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED):
        raise Forbidden("Nothing to undo in this status")

    applies = sorted(
        group.receipt_applies,
        key=lambda a: (a.applied_at or datetime.min.replace(tzinfo=timezone.utc), a.id or 0),
    )
    if not applies:
        raise Invalid(
            "Nothing to undo — this purchase was not recorded (apply before undo was available)"
        )
    apply_event = applies[-1]

    for line in apply_event.lines:
        card_id = line.card_id.upper().strip()
        qty = int(line.qty)
        if qty <= 0:
            continue
        _subtract_owned(db, line.user_id, card_id, qty)
        existing = next(
            (
                row
                for row in group.snapshot_lines
                if row.user_id == line.user_id and row.card_id.upper() == card_id
            ),
            None,
        )
        if existing is not None:
            existing.qty = int(existing.qty) + qty
            if existing.product_id is None and line.product_id is not None:
                existing.product_id = line.product_id
        else:
            group.snapshot_lines.append(
                GroupBuySnapshotLine(
                    group_buy_id=group.id,
                    user_id=line.user_id,
                    card_id=card_id,
                    qty=qty,
                    product_id=line.product_id,
                )
            )

    status_before = (apply_event.status_before or GroupBuyStatus.ORDERED).strip()
    if status_before not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        status_before = GroupBuyStatus.ORDERED
    group.status = status_before
    if int(apply_event.set_ordered_at or 0):
        group.ordered_at = None

    if apply_event in group.receipt_applies:
        group.receipt_applies.remove(apply_event)
    else:
        db.delete(apply_event)

    db.commit()
    return get_group_buy(db, user, group_id)
