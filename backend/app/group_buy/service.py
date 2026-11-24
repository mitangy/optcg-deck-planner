
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import urlencode

from sqlalchemy import case, delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import Conflict, Forbidden, Invalid, NotFound
from app.core.statuses import GroupBuyOrderStatus, GroupBuyStatus, HandoffStatus, ReceiptLineStatus
from app.group_buy.merge import MemberNeed, MergedMemberQty, merge_member_needs
from app.group_buy.settlement import SHIPPING_SPLIT_MODES, build_settlements, round_money
from app.core.models import User, is_placeholder_user
from app.group_buy.models import (
    GroupBuy,
    GroupBuyExtraSkip,
    GroupBuyHandoff,
    GroupBuyMember,
    GroupBuyOrder,
    GroupBuyOrderAllocation,
    GroupBuyOrderLine,
    GroupBuyQtyOverride,
    GroupBuyReceiptApply,
    GroupBuyReceiptApplyLine,
    GroupBuySnapshotLine,
)
from app.planner.models import CatalogCard, CatalogPrinting, Owned, OwnedPrinting
from app.group_buy.schemas import (
    GroupBuyBoughtArtOut,
    GroupBuyHandoffUpdate,
    GroupBuyDetail,
    GroupBuyExport,
    GroupBuyInvitePreview,
    GroupBuyLineOut,
    GroupBuyNotOrderedMemberOut,
    GroupBuyOfflineCardsResult,
    GroupBuyMemberOut,
    GroupBuyMemberQtyOut,
    GroupBuyMyExtraOut,
    GroupBuyArrivalUndo,
    GroupBuyArrivalUpdate,
    GroupBuyOrderAdded,
    GroupBuyOrderAllocationOut,
    GroupBuyHistoryOrderPreview,
    GroupBuyOrderCreate,
    GroupBuyOrderHistoryImported,
    GroupBuyOrderHistoryPreview,
    GroupBuyOrderLinesUpdate,
    GroupBuyOrderLineOut,
    GroupBuyOrderOut,
    GroupBuyOrderPatch,
    GroupBuyOrderPreview,
    GroupBuyOrderPreviewAllocation,
    GroupBuyOrderPreviewLine,
    GroupBuyOrderUpdate,
    GroupBuyReceiptApplyRequest,
    GroupBuyReceiptLineOut,
    GroupBuyReceiptMatchReport,
    GroupBuyReceiptUnmatchedOut,
    GroupBuySummary,
)
from app.planner.schemas import GroupBuyArtWantOut
from app.group_buy.receipt import (
    AggregatedReceiptCard,
    ParsedReceiptLine,
    aggregate_receipt_matches,
    parse_order_history,
    parse_tcgplayer_receipt,
    tracking_url_for,
)
from app.planner import shopping as shopping_svc
from app.planner.domain import parse_decklist
from app.planner import catalog_repo
from app.planner.owned import increment_owned
from app.planner.printings import deck_alt_buy_inputs

FROZEN_STATUSES = frozenset({GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED})

TCGPLAYER_MASS_ENTRY_BASE = "https://www.tcgplayer.com/massentry"
TCGPLAYER_PRODUCT_LINE = "One Piece Card Game"
MASS_ENTRY_URL_MAX_LEN = 1800


def _display_name(user: User) -> str:
    if user.username:
        return user.username
    return (user.name or user.email or f"User {user.id}").strip()


def _people_count(group: GroupBuy) -> int:
    """Members who can sign in; a "not on the app" name is not a person who joined (#1445)."""
    return sum(1 for m in group.members if not is_placeholder_user(m.user))


def _public_names(group: GroupBuy) -> dict[int, str]:
    """Names for pages anyone with the link can open: a username the person chose,
    else a neutral label. Google names and emails never leave the signed-in views."""
    names: dict[int, str] = {}
    guests = 0
    for member in sorted(group.members, key=lambda m: m.id):
        if member.user_id == group.host_user_id:
            fallback = "Host"
        else:
            guests += 1
            fallback = f"Member {guests}"
        names[member.user_id] = member.user.username or fallback
    names.setdefault(group.host_user_id, group.host.username or "Host")
    return names


def _anonymize_detail(detail: GroupBuyDetail, group: GroupBuy) -> GroupBuyDetail:
    names = _public_names(group)
    detail.host_name = names[group.host_user_id]
    for member in detail.members:
        member.display_name = names.get(member.user_id, "Member")
    for line in detail.lines:
        for member in line.members:
            member.display_name = names.get(member.user_id, "Member")
        for member in line.not_ordered_members:
            member.display_name = names.get(member.user_id, "Member")
    for order in detail.orders:
        for order_line in order.lines:
            for alloc in order_line.allocations:
                alloc.display_name = names.get(alloc.user_id, "Member")
    return detail


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
        return []
    out: list[int] = []
    for item in data:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out or None


def _dump_deck_ids(deck_ids: list[int] | None) -> str | None:
    if deck_ids is None:
        return None
    return json.dumps(sorted(set(int(x) for x in deck_ids)))


def _get_group(db: Session, group_id: int, *, lock: bool = False) -> GroupBuy:
    if lock:
        # Row lock first (Postgres; a no-op on SQLite), then re-read everything so a
        # second request waiting here sees what the first one committed.
        db.execute(select(GroupBuy.id).where(GroupBuy.id == group_id).with_for_update())
    group = db.scalar(
        select(GroupBuy)
        .where(GroupBuy.id == group_id)
        .execution_options(populate_existing=lock)
        .options(
            selectinload(GroupBuy.members).selectinload(GroupBuyMember.user),
            selectinload(GroupBuy.host),
            selectinload(GroupBuy.snapshot_lines),
            selectinload(GroupBuy.qty_overrides),
            selectinload(GroupBuy.extra_skips),
            selectinload(GroupBuy.receipt_applies).selectinload(GroupBuyReceiptApply.lines),
            selectinload(GroupBuy.handoffs),
            selectinload(GroupBuy.orders)
            .selectinload(GroupBuyOrder.lines)
            .selectinload(GroupBuyOrderLine.allocations),
        )
    )
    if group is None:
        raise NotFound("Group buy not found")
    return group


def _member_shopping(db: Session, member: GroupBuyMember, memo: dict | None = None):
    """A member's shopping list; ``memo`` (one per request) keeps one build per member."""
    if memo is not None and member.user_id in memo:
        return memo[member.user_id]
    result = _compute_member_shopping(db, member)
    if memo is not None:
        memo[member.user_id] = result
    return result


def _compute_member_shopping(db: Session, member: GroupBuyMember):
    return shopping_svc.shopping_list(
        db,
        member.user,
        deck_ids=_parse_deck_ids(member.deck_ids_json),
        include_extras=bool(member.include_singles),
        include_collector=True,
        show_collector=bool(member.include_extra_copies),
        exclude_group_buy_id=member.group_buy_id,
    )


ExtraSkips = dict[tuple[int, str, int], int]


def _extra_skip_map(group: GroupBuy) -> ExtraSkips:
    return {
        (row.user_id, row.card_id.upper(), row.product_id): int(row.qty)
        for row in group.extra_skips
        if row.qty > 0
    }


def _effective_extras(item, skips: dict[int, int] | None = None) -> list[tuple[int, int, float | None]]:
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
    return item.still_need + sum(q for _pid, q, _price in _effective_extras(item, skips))


def _funded_extras(
    item, skips: dict[int, int] | None = None, qty: int | None = None
) -> list[tuple[int, int, float | None]]:
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
    extra = _funded_extras(item, skips, qty)
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


def _member_needs_live(db: Session, group: GroupBuy, memo: dict | None = None) -> list[MemberNeed]:
    overrides = _qty_override_map(group)
    skips = _extra_skip_map(group)
    needs: list[MemberNeed] = []
    for member in group.members:
        shopping = _member_shopping(db, member, memo)
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


def _allocated_by_user_card(group: GroupBuy) -> dict[tuple[int, str], int]:
    out: dict[tuple[int, str], int] = {}
    for order in group.orders:
        for line in order.lines:
            for alloc in line.allocations:
                key = (alloc.user_id, line.card_id.upper())
                out[key] = out.get(key, 0) + int(alloc.qty)
    return out


def _allocation_stats(group: GroupBuy) -> dict[str, dict[int, tuple[int, int]]]:
    """card id -> user id -> (copies in an order, copies arrived)."""
    out: dict[str, dict[int, tuple[int, int]]] = {}
    for order in group.orders:
        for line in order.lines:
            per_user = out.setdefault(line.card_id.upper(), {})
            for alloc in line.allocations:
                qty, arrived = per_user.get(alloc.user_id, (0, 0))
                per_user[alloc.user_id] = (qty + int(alloc.qty), arrived + int(alloc.qty_arrived))
    return out


def _allocated_by_user_card_art(group: GroupBuy) -> dict[tuple[int, str], dict[int | None, int]]:
    """(user id, card id) -> art (None is the standard art) -> copies allocated in orders."""
    out: dict[tuple[int, str], dict[int | None, int]] = {}
    for order in group.orders:
        for line in order.lines:
            for alloc in line.allocations:
                arts = out.setdefault((alloc.user_id, line.card_id.upper()), {})
                arts[line.product_id] = arts.get(line.product_id, 0) + int(alloc.qty)
    return out


class _BoughtArt:
    """One art of a card across the seller orders: copies bought, and what the receipts say they cost."""

    __slots__ = ("qty", "paid_qty", "paid_total")

    def __init__(self) -> None:
        self.qty = 0
        self.paid_qty = 0
        self.paid_total = 0.0

    def unit_price(self, market: float | None) -> tuple[float | None, bool]:
        """(price per copy, whether it was paid): the paid average when every copy has one, else market."""
        if self.qty > 0 and self.paid_qty == self.qty:
            return round(self.paid_total / self.qty, 2), True
        return market, False


def _bought_by_card_art(group: GroupBuy) -> dict[str, dict[int | None, _BoughtArt]]:
    """card id -> art (None is the standard art) -> what the orders bought (#1443)."""
    out: dict[str, dict[int | None, _BoughtArt]] = {}
    for order in group.orders:
        for line in order.lines:
            qty = int(line.qty_ordered or 0)
            if qty <= 0:
                continue
            bought = out.setdefault(line.card_id.upper(), {}).setdefault(line.product_id, _BoughtArt())
            bought.qty += qty
            if line.unit_price is not None:
                bought.paid_qty += qty
                bought.paid_total += qty * float(line.unit_price)
    return out


def _art_key(art: int | None) -> tuple[bool, int]:
    return (art is not None, art or 0)


def _bought_shown_art(bought: dict[int | None, _BoughtArt]) -> int | None:
    """The art with the most bought copies (the standard art on a tie, then the lower product id)."""
    return min(bought, key=lambda art: (-bought[art].qty, art is not None, art or 0))


def _pinned_member_cost(
    placed: dict[int | None, int],
    art_price: dict[int | None, float | None],
    qty: int,
    live_cost,
) -> float | None:
    """A member's cost for ``qty`` copies: the copies in an order at what was bought, the rest the live way."""
    left = qty
    cost = 0.0
    for art in sorted(placed, key=_art_key):
        n = min(left, placed[art])
        if n <= 0:
            continue
        left -= n
        price = art_price.get(art)
        if price is None:
            return None
        cost += n * price
    if left > 0:
        rest = live_cost(left)
        if rest is None:
            return None
        cost += rest
    return round(cost, 2)


def _member_not_ordered(
    member: MergedMemberQty,
    wants: dict[int, int],
    placed: dict[int | None, int],
    *,
    in_order: int,
    unordered_only: bool,
) -> list[GroupBuyNotOrderedMemberOut]:
    """Per art, the copies this member has no order for: what they buy minus what orders hold.

    Alt arts they asked for come first (minus the copies of that art already placed); the rest is standard.
    """
    left = member.qty if unordered_only else max(0, member.qty - in_order)
    out: list[GroupBuyNotOrderedMemberOut] = []
    for pid, want in sorted(wants.items()):
        missing = min(left, want if unordered_only else max(0, want - placed.get(pid, 0)))
        if missing > 0:
            out.append(
                GroupBuyNotOrderedMemberOut(
                    user_id=member.user_id, display_name=member.display_name, qty=missing, product_id=pid
                )
            )
            left -= missing
    if left > 0:
        out.append(
            GroupBuyNotOrderedMemberOut(
                user_id=member.user_id, display_name=member.display_name, qty=left, product_id=None
            )
        )
    return out


def _member_needs_locked(group: GroupBuy, *, unordered_only: bool = False) -> list[MemberNeed]:
    """Frozen needs. By default the whole snapshot (what each member is buying in this group buy,
    which money is settled on); ``unordered_only`` takes off copies already in a seller order."""
    users = {m.user_id: m.user for m in group.members}
    in_orders = _allocated_by_user_card(group) if unordered_only else {}
    needs: list[MemberNeed] = []
    for line in group.snapshot_lines:
        qty = int(line.qty) - in_orders.get((line.user_id, line.card_id.upper()), 0)
        if qty <= 0:
            continue
        user = users.get(line.user_id)
        name = _display_name(user) if user else f"User {line.user_id}"
        needs.append(
            MemberNeed(
                user_id=line.user_id,
                display_name=name,
                card_id=line.card_id,
                qty=qty,
                product_id=line.product_id,
                suggested_qty=qty,
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
    alts = catalog_repo.alt_arts_map(
        db, card_ids, wanted=wanted, catalog=catalog, primary_ids=product_ids
    )
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
    memo: dict | None = None,
) -> dict[str, MergedMemberQty]:
    if group.status != GroupBuyStatus.OPEN:
        return {}
    member = next((m for m in group.members if m.user_id == viewer_user_id), None)
    if member is None:
        return {}
    shopping = _member_shopping(db, member, memo)
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
    memo: dict | None = None,
    unordered_only: bool = False,
) -> tuple[list[GroupBuyLineOut], dict[int, tuple[int, float]]]:
    if memo is None:
        memo = {}
    needs = (
        _member_needs_locked(group, unordered_only=unordered_only)
        if group.status in FROZEN_STATUSES
        else _member_needs_live(db, group, memo)
    )
    zero_customs = (
        _viewer_zero_customs(db, group, viewer_user_id, memo) if viewer_user_id is not None else {}
    )
    merged = merge_member_needs(needs)
    card_ids = {line.card_id for line in merged} | set(zero_customs)
    order_stats = _allocation_stats(group)
    order_arts = _allocated_by_user_card_art(group)
    bought_map = {} if unordered_only else _bought_by_card_art(group)

    viewer_wants: dict[str, dict[int, int]] = {}
    viewer_need: dict[str, int] = {}
    viewer_shop_alts: dict[str, list] = {}
    viewer_display: dict[str, int | None] = {}
    viewer_used_in: dict[str, list[str]] = {}
    member_shop_alts: dict[int, dict[str, list]] = {}
    member_items: dict[int, dict[str, object]] = {}
    skips = _extra_skip_map(group)
    viewer_items: dict[str, object] = {}
    member_display: dict[int, dict[str, int]] = {}
    for member in group.members:
        shop = _member_shopping(db, member, memo)
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

        line_remaining = 0.0
        priced_ok = True
        any_buy = False
        art_wants: list[GroupBuyArtWantOut] = []
        not_ordered_members: list[GroupBuyNotOrderedMemberOut] = []
        per_user = order_stats.get(card_id.upper(), {})
        # Copies already in a seller order are pinned to what was bought, whatever Shopping picks say now (#1443).
        bought = bought_map.get(card_id.upper())
        art_price: dict[int | None, float | None] = {}
        art_paid: dict[int | None, bool] = {}
        for art, b in (bought or {}).items():
            art_market = preferred_market if art is None else (
                printings[art].market_price if art in printings else None
            )
            art_price[art], art_paid[art] = b.unit_price(art_market)
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
            if group.orders or unordered_only:
                not_ordered_members.extend(
                    _member_not_ordered(
                        mem,
                        {pid: qty for pid, qty, _price in buys if pid and qty > 0 and pid != preferred_product_id},
                        order_arts.get((mem.user_id, card_id.upper()), {}),
                        in_order=per_user.get(mem.user_id, (0, 0))[0],
                        unordered_only=unordered_only,
                    )
                )
            if bought:

                def live_cost(n: int, _uid: int = mem.user_id, _cid: str = card_id) -> float | None:
                    left_buys = shopping_svc.allocate_still_need_buys(
                        n,
                        _alt_inputs_for(member_items, skips, _uid, _cid, n),
                        standard_product_id=preferred_product_id,
                        standard_price=preferred_market,
                    )
                    return shopping_svc.remaining_cost_for_buys(left_buys)

                cost = _pinned_member_cost(
                    order_arts.get((mem.user_id, card_id.upper()), {}), art_price, mem.qty, live_cost
                )
            else:
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
            group_pick = _group_shown_pick(card_id, member_display, group.host_user_id)
            if group_pick is None:
                group_pick = _group_wanted_alt(card_id, member_shop_alts)
            if group_pick is not None:
                line_display_art = group_pick
                if group_pick > 0 and all(a.product_id != group_pick for a in line_alt_arts):
                    line_alt_arts.extend(a for a in alts.get(card_id, []) if a.product_id == group_pick)

        bought_out: list[GroupBuyBoughtArtOut] = []
        bought_each: float | None = None
        if bought:
            line_display_art = _bought_shown_art(bought) or 0
            mine_by_art = order_arts.get((viewer_user_id, card_id.upper()), {})
            for art in sorted(bought, key=_art_key):
                if art is not None and all(a.product_id != art for a in line_alt_arts):
                    line_alt_arts.extend(a for a in alts.get(card_id, []) if a.product_id == art)
                bought_out.append(
                    GroupBuyBoughtArtOut(
                        product_id=art,
                        name=(
                            (cat.name if cat else "")
                            if art is None
                            else (printings[art].name if art in printings else "")
                        ),
                        qty=bought[art].qty,
                        my_qty=mine_by_art.get(art, 0),
                        unit_price=art_price[art],
                        paid=art_paid[art],
                    )
                )
            if all(b.unit_price is not None for b in bought_out):
                bought_each = round(
                    sum(b.qty * (b.unit_price or 0.0) for b in bought_out) / sum(b.qty for b in bought_out), 2
                )

        mine = next((m for m in members if m.user_id == viewer_user_id), None)
        my_qty = mine.qty if mine else 0
        my_is_custom = mine.is_custom if mine else False
        my_item = viewer_items.get(card_id)
        in_order = sum(q for q, _ in per_user.values())
        my_in_order, my_arrived = per_user.get(viewer_user_id, (0, 0))
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
                bought_arts=bought_out,
                bought_each=bought_each,
                my_qty=my_qty,
                my_suggested_qty=mine.suggested_qty if mine else 0,
                my_is_custom=my_is_custom,
                my_excluded=bool(my_is_custom and my_qty == 0),
                my_need=viewer_need.get(card_id, 0),
                my_used_in=viewer_used_in.get(card_id, []),
                my_deck_qty=my_item.still_need if my_item else 0,
                my_extras=my_extras,
                in_order=in_order,
                arrived=sum(a for _, a in per_user.values()),
                not_ordered=total_qty if unordered_only else max(0, total_qty - in_order),
                my_in_order=my_in_order,
                my_arrived=my_arrived,
                my_not_ordered=my_qty if unordered_only else max(0, my_qty - my_in_order),
                not_ordered_members=not_ordered_members,
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
        "member_count": _people_count(group),
        "is_host": bool(user is not None and group.host_user_id == user.id),
        "is_public": is_public,
        "public_path": f"/group-buy/view/{group.invite_token}" if is_public else None,
        "unique_cards": len(lines),
        "cards_still_needed": cards_still,
        "remaining_market": remaining,
        "created_at": group.created_at.isoformat() if group.created_at else "",
    }


def _arrived_by_user(group: GroupBuy) -> dict[int, int]:
    out: dict[int, int] = {}
    for order in group.orders:
        for line in order.lines:
            for alloc in line.allocations:
                out[alloc.user_id] = out.get(alloc.user_id, 0) + int(alloc.qty_arrived)
    return out


def _handoff_fields(
    group: GroupBuy,
    member: GroupBuyMember,
    row: GroupBuyHandoff | None,
    arrived: int,
    viewer: User | None,
    read_only: bool,
) -> dict:
    """The host already holds their own cards, so their hand-off is always received."""
    if read_only or viewer is None:
        return {}
    if viewer.id != group.host_user_id and viewer.id != member.user_id:
        return {}
    if member.user_id == group.host_user_id:
        return {"handoff_status": HandoffStatus.RECEIVED, "paid": True}
    handed = int(row.qty_handed) if row else 0
    return {
        "handoff_status": row.status if row else HandoffStatus.WAITING,
        "handoff_tracking_url": row.tracking_url if row else "",
        "handoff_note": row.note if row else "",
        "qty_handed": handed,
        "ready_to_hand_over": max(0, arrived - handed),
        "paid": bool(row.paid) if row else False,
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

    arrived_by_user = _arrived_by_user(group)
    handoffs = {h.user_id: h for h in group.handoffs}
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
                is_offline=is_placeholder_user(member.user),
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
                **_handoff_fields(
                    group,
                    member,
                    handoffs.get(member.user_id),
                    arrived_by_user.get(member.user_id, 0),
                    user,
                    read_only,
                ),
            )
        )
    # Members need the order id and payment notes to pay the host; the invite-link view is open to anyone.
    receipt_text = "" if read_only else (group.receipt_text or "")
    return GroupBuyDetail(
        **_summary_fields(group, user, lines),
        members=members_out,
        lines=lines,
        locked_at=group.locked_at.isoformat() if group.locked_at else None,
        ordered_at=group.ordered_at.isoformat() if group.ordered_at else None,
        external_order_id="" if read_only else (group.external_order_id or ""),
        order_notes="" if read_only else (group.order_notes or ""),
        shipping_cost=shipping_cost,
        shipping_split=group.shipping_split or "equal",
        tax_cost=tax_cost,
        cards_subtotal=cards_subtotal,
        grand_total=round_money(cards_subtotal + shipping_cost + tax_cost),
        receipt_text=receipt_text,
        has_receipt=bool(receipt_text.strip()) if not read_only else False,
        can_undo_purchase=False if read_only else bool(group.receipt_applies),
        read_only=read_only,
        orders=_orders_out(
            db, group, show_private=bool(user is not None and user.id == group.host_user_id)
        ),
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
        .options(selectinload(GroupBuy.host), selectinload(GroupBuy.members).selectinload(GroupBuyMember.user))
    )
    if group is None:
        raise NotFound("Invite link not found")
    return GroupBuyInvitePreview(
        title=group.title,
        host_name=_public_names(group)[group.host_user_id],
        member_count=_people_count(group),
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
    group = _get_group(db, group_id)
    _require_host(group, user)
    group.is_public = bool(is_public)
    db.commit()
    return get_group_buy(db, user, group_id)


def reset_invite(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    group.invite_token = secrets.token_urlsafe(18)
    db.commit()
    return get_group_buy(db, user, group_id)


def set_title(
    db: Session,
    user: User,
    group_id: int,
    title: str,
) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    cleaned = (title or "").strip()
    if not cleaned:
        raise Invalid("Group buy name cannot be empty")
    group.title = cleaned[:200]
    db.commit()
    return get_group_buy(db, user, group_id)


def public_group_buy_view(db: Session, token: str) -> GroupBuyDetail:
    group = db.scalar(
        select(GroupBuy)
        .where(GroupBuy.invite_token == token)
        .options(
            selectinload(GroupBuy.members).selectinload(GroupBuyMember.user),
            selectinload(GroupBuy.host),
            selectinload(GroupBuy.snapshot_lines),
            selectinload(GroupBuy.qty_overrides),
            selectinload(GroupBuy.receipt_applies).selectinload(GroupBuyReceiptApply.lines),
            selectinload(GroupBuy.handoffs),
            selectinload(GroupBuy.orders)
            .selectinload(GroupBuyOrder.lines)
            .selectinload(GroupBuyOrderLine.allocations),
        )
    )
    if group is None:
        raise NotFound("Group buy not found")
    return _anonymize_detail(_detail_from_group(db, group, user=None, read_only=True), group)


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
            continue
        if current is None:
            continue
        if deck_id in current:
            continue
        member.deck_ids_json = _dump_deck_ids([*current, int(deck_id)])
        changed = True
    if changed:
        db.commit()


def _offline_member(group: GroupBuy, user: User, member_id: int) -> GroupBuyMember:
    """A "not on the app" member of this group buy, for its host only (#1445)."""
    _require_host(group, user)
    for member in group.members:
        if member.user_id == member_id and member.user.placeholder_group_buy_id == group.id:
            return member
    raise NotFound("That member is not an offline member of this group buy")


def _require_open(group: GroupBuy) -> None:
    if group.status != GroupBuyStatus.OPEN:
        raise Forbidden("Group buy is locked; quantities cannot change")


def set_member_qty(
    db: Session,
    user: User,
    group_id: int,
    card_id: str,
    qty: int,
    target_user_id: int | None = None,
) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    member = _require_member(group, user)
    if target_user_id is not None and target_user_id != user.id:
        member = _offline_member(group, user, target_user_id)
    _require_open(group)
    card_id = card_id.upper().strip()
    if not card_id:
        raise Invalid("card_id is required")
    qty = max(0, min(999, int(qty)))
    _write_member_qty(db, group, member, card_id, qty)
    db.commit()
    return get_group_buy(db, user, group_id)


def _write_member_qty(
    db: Session, group: GroupBuy, member: GroupBuyMember, card_id: str, qty: int
) -> None:
    """Set one member's override for a card; the caller commits."""
    offline = is_placeholder_user(member.user)
    suggested = 0
    if not offline:
        shopping = _member_shopping(db, member)
        my_skips = _card_skips(_extra_skip_map(group), member.user_id, card_id)
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
            GroupBuyQtyOverride.user_id == member.user_id,
            GroupBuyQtyOverride.card_id == card_id,
        )
    )
    # An offline member has no shopping list to fall back on, so zero means "not buying it".
    if (qty == suggested and qty > 0) or (offline and qty == 0):
        if existing is not None:
            db.delete(existing)
        return
    if existing is None:
        db.add(
            GroupBuyQtyOverride(
                group_buy_id=group.id,
                user_id=member.user_id,
                card_id=card_id,
                qty=qty,
            )
        )
    else:
        existing.qty = qty


MAX_OFFLINE_MEMBERS = 20


def add_offline_member(db: Session, user: User, group_id: int, name: str) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    _require_open(group)
    if sum(1 for m in group.members if is_placeholder_user(m.user)) >= MAX_OFFLINE_MEMBERS:
        raise Invalid(f"A group buy can have up to {MAX_OFFLINE_MEMBERS} people who are not on the app")
    clean = (name or "").strip()
    if not clean or len(clean) > 40:
        raise Invalid("Name must be 1 to 40 characters")
    token = uuid.uuid4()
    # Both columns are NOT NULL UNIQUE; these can never be a Google email or subject id.
    placeholder = User(
        email=f"placeholder-{token}@placeholder.invalid",
        google_sub=f"placeholder:{token}",
        name=clean,
        placeholder_group_buy_id=group.id,
    )
    db.add(placeholder)
    db.flush()
    db.add(GroupBuyMember(group_buy_id=group.id, user_id=placeholder.id, role="member"))
    db.commit()
    return get_group_buy(db, user, group_id)


def rename_offline_member(
    db: Session, user: User, group_id: int, member_id: int, name: str
) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    member = _offline_member(group, user, member_id)
    _require_open(group)
    clean = (name or "").strip()
    if not clean or len(clean) > 40:
        raise Invalid("Name must be 1 to 40 characters")
    member.user.name = clean
    db.commit()
    return get_group_buy(db, user, group_id)


def remove_offline_member(db: Session, user: User, group_id: int, member_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    member = _offline_member(group, user, member_id)
    for order in group.orders:
        for line in order.lines:
            if any(a.user_id == member_id and int(a.qty) > 0 for a in line.allocations):
                raise Conflict("They have cards in a seller order, so they cannot be removed")
    _require_open(group)
    for model in (GroupBuyQtyOverride, GroupBuyExtraSkip, GroupBuySnapshotLine, GroupBuyHandoff):
        db.execute(
            delete(model).where(model.group_buy_id == group.id, model.user_id == member_id)
        )
    db.delete(member)
    db.flush()
    db.execute(delete(User).where(User.id == member_id, User.placeholder_group_buy_id == group.id))
    db.commit()
    return get_group_buy(db, user, group_id)


def set_offline_member_cards(
    db: Session, user: User, group_id: int, member_id: int, text: str
) -> GroupBuyOfflineCardsResult:
    """Replace an offline member's cards with the ones in a pasted list (4xOP01-001, 4 OP01-001...)."""
    group = _get_group(db, group_id)
    member = _offline_member(group, user, member_id)
    _require_open(group)
    wanted: dict[str, int] = {}
    unmatched: list[str] = []
    lines = [ln.strip() for ln in (text or "").replace("\r", "\n").split("\n")]
    parsed_lines: list[tuple[str, list]] = []
    for line in lines:
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        try:
            parsed_lines.append((line, parse_decklist(line)))
        except Invalid:
            unmatched.append(line)
    known = catalog_repo.catalog_map(
        db, {c.card_id.upper() for _, cards in parsed_lines for c in cards}
    )
    for line, cards in parsed_lines:
        if not cards or any(c.card_id.upper() not in known for c in cards):
            unmatched.append(line)
            continue
        for card in cards:
            key = card.card_id.upper()
            wanted[key] = min(999, wanted.get(key, 0) + int(card.needed))
    db.execute(
        delete(GroupBuyQtyOverride).where(
            GroupBuyQtyOverride.group_buy_id == group.id,
            GroupBuyQtyOverride.user_id == member_id,
        )
    )
    db.flush()
    for card_id, qty in wanted.items():
        db.add(
            GroupBuyQtyOverride(
                group_buy_id=group.id, user_id=member_id, card_id=card_id, qty=qty
            )
        )
    db.commit()
    return GroupBuyOfflineCardsResult(
        detail=get_group_buy(db, user, group_id), applied=len(wanted), unmatched=unmatched
    )


def set_extra_skip(
    db: Session,
    user: User,
    group_id: int,
    card_id: str,
    product_id: int,
    skip: int,
) -> GroupBuyDetail:
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
    increment_owned(db, user_id, card_id.upper().strip(), delta)


def _subtract_owned(db: Session, user_id: int, card_id: str, delta: int) -> None:
    if delta <= 0:
        return
    db.execute(
        update(Owned)
        .where(Owned.user_id == user_id, Owned.card_id == card_id.upper().strip())
        .values(qty=case((Owned.qty > delta, Owned.qty - delta), else_=0))
        .execution_options(synchronize_session="fetch")
    )


def _add_alt_owned(db: Session, user_id: int, card_id: str, product_id: int, delta: int) -> None:
    """Credit copies of one alternate printing (``OwnedPrinting`` holds alts apart from ``Owned``)."""
    if delta <= 0:
        return
    key = (OwnedPrinting.user_id == user_id, OwnedPrinting.card_id == card_id,
           OwnedPrinting.product_id == product_id)
    bump = (
        update(OwnedPrinting)
        .where(*key)
        .values(qty=OwnedPrinting.qty + delta)
        .execution_options(synchronize_session="fetch")
    )
    if db.execute(bump).rowcount:
        return
    try:
        with db.begin_nested():
            db.add(OwnedPrinting(user_id=user_id, card_id=card_id, product_id=product_id, qty=delta))
    except IntegrityError:
        db.execute(bump)


def _subtract_alt_owned(db: Session, user_id: int, card_id: str, product_id: int, delta: int) -> None:
    if delta <= 0:
        return
    key = (OwnedPrinting.user_id == user_id, OwnedPrinting.card_id == card_id,
           OwnedPrinting.product_id == product_id)
    db.execute(
        update(OwnedPrinting)
        .where(*key)
        .values(qty=case((OwnedPrinting.qty > delta, OwnedPrinting.qty - delta), else_=0))
        .execution_options(synchronize_session="fetch")
    )
    # A zero row is the same as no row (set_alt_owned deletes at 0).
    db.execute(delete(OwnedPrinting).where(*key, OwnedPrinting.qty <= 0))


def _is_alt_printing(db: Session, card_id: str, product_id: int | None) -> bool:
    if product_id is None:
        return False
    return (
        db.scalar(
            select(CatalogPrinting.id).where(
                CatalogPrinting.card_id == card_id,
                CatalogPrinting.product_id == product_id,
                CatalogPrinting.is_special == 1,
            )
        )
        is not None
    )


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
    if group.orders:
        raise Forbidden("Delete the seller orders before unlocking")
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
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == GroupBuyStatus.OPEN:
        raise Forbidden("Lock or mark ordered before editing order details")
    _apply_order_fields(group, body)
    db.commit()
    return get_group_buy(db, user, group_id)


def complete_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == GroupBuyStatus.COMPLETED:
        return get_group_buy(db, user, group_id)
    raise Forbidden(
        "Import a TCGPlayer receipt and Mark purchased for matched cards — "
        "completing without a receipt is not supported"
    )


def export_tcgplayer(db: Session, user: User, group_id: int) -> GroupBuyExport:
    group = _get_group(db, group_id)
    _require_member(group, user)
    memo: dict = {}
    # Mass Entry is for what still has to be bought: copies already in an order are left out.
    lines, _ = _build_lines(db, group, viewer_user_id=user.id, memo=memo, unordered_only=True)

    skips = _extra_skip_map(group)
    member_items: dict[int, dict[str, object]] = {}
    for member in group.members:
        shop = _member_shopping(db, member, memo)
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
    offline_ids = [m.user_id for m in group.members if is_placeholder_user(m.user)]
    db.delete(group)
    db.flush()
    if offline_ids:
        db.execute(delete(User).where(User.id.in_(offline_ids), User.placeholder_group_buy_id == group_id))
    db.commit()


def _pool_qty_by_card_db(db: Session, group: GroupBuy) -> dict[str, int]:
    if group.status in FROZEN_STATUSES:
        needs = _member_needs_locked(group, unordered_only=True)
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
    group = _get_group(db, group_id)
    _require_member(group, user)
    return _match_report(db, group, receipt_text)[0]


def _match_report(
    db: Session, group: GroupBuy, receipt_text: str
) -> tuple[GroupBuyReceiptMatchReport, list[AggregatedReceiptCard]]:
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

    report = GroupBuyReceiptMatchReport(
        lines=lines_out,
        unmatched=unmatched_out,
        summary=counts,
        can_apply_full=can_full,
        can_apply_partial=can_partial,
    )
    return report, matched


def _split_alt_copies(
    db: Session,
    group: GroupBuy,
    rows: list[GroupBuySnapshotLine],
    staged_qty: int,
    alt_copies: dict[int, int],
    memo: dict,
    placed_alts: dict[int, dict[int, int]] | None = None,
) -> dict[int, tuple[dict[int, int], int]]:
    """Per snapshot row id: (alt copies by product id, standard copies) out of ``staged_qty``.

    Alt copies go first to members whose current alt wants include that art, then to
    the rest in snapshot order; standard copies fill what is left, also in snapshot order.
    """
    ordered = sorted(rows, key=lambda r: (r.id or 0))
    room = {r.id: int(r.qty) for r in ordered}
    alts: dict[int, dict[int, int]] = {r.id: {} for r in ordered}
    wants: dict[int, dict[int, int]] = {}
    if alt_copies:
        skips = _extra_skip_map(group)
        members = {m.user_id: m for m in group.members}
        for r in ordered:
            member = members.get(r.user_id)
            shop = _member_shopping(db, member, memo) if member is not None else None
            item = next(
                (i for i in (shop.items if shop else []) if i.card_id.upper() == r.card_id.upper()),
                None,
            )
            inputs = (
                _member_alt_inputs(item, _card_skips(skips, r.user_id, r.card_id), int(r.qty))
                if item is not None
                else []
            )
            # Arts already ordered for this member in earlier orders are not wanted again.
            done = (placed_alts or {}).get(r.id, {})
            wants[r.id] = {pid: max(0, left - done.get(pid, 0)) for pid, left, _price in inputs}
    left_to_place = staged_qty
    for pid, qty in sorted(alt_copies.items()):
        n = min(qty, left_to_place)
        for wanters_only in (True, False):
            for r in ordered:
                if n <= 0:
                    break
                cap = room[r.id]
                if wanters_only:
                    cap = min(cap, wants[r.id].get(pid, 0))
                take = min(cap, n)
                if take <= 0:
                    continue
                alts[r.id][pid] = alts[r.id].get(pid, 0) + take
                room[r.id] -= take
                wants[r.id][pid] = wants[r.id].get(pid, 0) - take
                n -= take
                left_to_place -= take
    std_left = left_to_place
    out: dict[int, tuple[dict[int, int], int]] = {}
    for r in ordered:
        std = min(room[r.id], std_left)
        std_left -= std
        out[r.id] = (alts[r.id], std)
    return out




# --- Seller orders (packages), #1418 ---------------------------------------------------------

Copies = dict[str, dict[int | None, int]]
# Price paid per copy, by card and art; an art with no entry has no known price.
Prices = dict[str, dict[int | None, float]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _order_totals(order: GroupBuyOrder) -> tuple[int, int, int]:
    """(copies ordered, copies allocated to members, copies arrived)."""
    ordered = sum(int(line.qty_ordered) for line in order.lines)
    allocated = sum(int(a.qty) for line in order.lines for a in line.allocations)
    arrived = sum(int(a.qty_arrived) for line in order.lines for a in line.allocations)
    return ordered, allocated, arrived


def _order_status(allocated: int, arrived: int) -> str:
    if allocated <= 0 or arrived <= 0:
        return GroupBuyOrderStatus.ON_THE_WAY
    if arrived < allocated:
        return GroupBuyOrderStatus.PARTIAL
    return GroupBuyOrderStatus.ARRIVED


def _unordered_total(group: GroupBuy) -> int:
    in_orders = _allocated_by_user_card(group)
    return sum(
        max(0, int(row.qty) - in_orders.get((row.user_id, row.card_id.upper()), 0))
        for row in group.snapshot_lines
    )


def _everything_arrived(group: GroupBuy) -> bool:
    allocations = [a for o in group.orders for line in o.lines for a in line.allocations]
    if not any(a.qty > 0 for a in allocations):
        return False
    return all(a.qty_arrived >= a.qty for a in allocations) and _unordered_total(group) == 0


def _refresh_status(group: GroupBuy) -> None:
    if group.status not in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED) or not group.orders:
        return
    group.status = (
        GroupBuyStatus.COMPLETED if _everything_arrived(group) else GroupBuyStatus.ORDERED
    )


def _clean_tracking_url(raw: str | None) -> str:
    url = (raw or "").strip()
    if url and not url.lower().startswith("https://"):
        raise Invalid("Tracking link must start with https://")
    return url


def _check_order_number(group: GroupBuy, number: str, *, ignore_id: int | None = None) -> None:
    if number and any(o.order_number == number and o.id != ignore_id for o in group.orders):
        raise Conflict("That order number is already on this group buy")


def _orders_out(db: Session, group: GroupBuy, *, show_private: bool) -> list[GroupBuyOrderOut]:
    if not group.orders:
        return []
    names = {m.user_id: _display_name(m.user) for m in group.members}
    card_ids = {line.card_id for o in group.orders for line in o.lines}
    card_names = (
        {
            c.card_id: c.name
            for c in db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids)))
        }
        if card_ids
        else {}
    )
    out: list[GroupBuyOrderOut] = []
    for order in group.orders:
        ordered, allocated, arrived = _order_totals(order)
        lines = []
        for line in order.lines:
            line_alloc = sum(int(a.qty) for a in line.allocations)
            lines.append(
                GroupBuyOrderLineOut(
                    id=line.id,
                    card_id=line.card_id,
                    name=card_names.get(line.card_id, ""),
                    product_id=line.product_id,
                    qty_ordered=int(line.qty_ordered),
                    qty_arrived=sum(int(a.qty_arrived) for a in line.allocations),
                    qty_extra=max(0, int(line.qty_ordered) - line_alloc),
                    unit_price=line.unit_price,
                    allocations=[
                        GroupBuyOrderAllocationOut(
                            user_id=a.user_id,
                            display_name=names.get(a.user_id, f"User {a.user_id}"),
                            qty=int(a.qty),
                            qty_arrived=int(a.qty_arrived),
                        )
                        for a in line.allocations
                    ],
                )
            )
        out.append(
            GroupBuyOrderOut(
                id=order.id,
                seller_name=order.seller_name or "",
                status=_order_status(allocated, arrived),
                qty_ordered=ordered,
                qty_allocated=allocated,
                qty_arrived=arrived,
                qty_extra=max(0, ordered - allocated),
                arrived_at=order.arrived_at.isoformat() if order.arrived_at else None,
                created_at=order.created_at.isoformat() if order.created_at else "",
                version=int(order.version or 1),
                order_number=(order.order_number or "") if show_private else "",
                tracking_url=(order.tracking_url or "") if show_private else "",
                receipt_text=(order.receipt_text or "") if show_private else "",
                lines=lines,
            )
        )
    return out


def _get_order(group: GroupBuy, order_id: int) -> GroupBuyOrder:
    for order in group.orders:
        if order.id == order_id:
            return order
    raise NotFound("Order not found")


def _check_version(order: GroupBuyOrder, expected: int | None) -> None:
    if expected is not None and int(order.version or 1) != expected:
        raise Conflict("This order changed since you loaded it. Refresh and try again.")


def _touch(order: GroupBuyOrder) -> None:
    order.version = int(order.version or 1) + 1
    order.updated_at = _now()


def _add_copies(copies: Copies, card_id: str, art: int | None, qty: int) -> None:
    if qty <= 0:
        return
    per_art = copies.setdefault(card_id.upper().strip(), {})
    per_art[art] = per_art.get(art, 0) + qty


def _copies_from_receipt(
    db: Session, receipt_text: str
) -> tuple[Copies, list[GroupBuyReceiptUnmatchedOut]]:
    return _copies_from_parsed(db, parse_tcgplayer_receipt(receipt_text))


def _copies_from_parsed(
    db: Session, parsed: list[ParsedReceiptLine]
) -> tuple[Copies, list[GroupBuyReceiptUnmatchedOut]]:
    copies, _, unmatched = _copies_and_prices_from_parsed(db, parsed)
    return copies, unmatched


def _copies_and_prices_from_parsed(
    db: Session, parsed: list[ParsedReceiptLine]
) -> tuple[Copies, Prices, list[GroupBuyReceiptUnmatchedOut]]:
    """Copies per card and art, and the price paid per copy of each (the average when lines merge).

    A price is kept only when every copy of that art had one on the page."""
    matched, unmatched = aggregate_receipt_matches(db, parsed)
    copies: Copies = {}
    prices: Prices = {}
    for hit in matched:
        alts = {pid: n for pid, n in hit.alt_copies.items() if n > 0}
        for pid, n in alts.items():
            _add_copies(copies, hit.card_id, pid, n)
        _add_copies(copies, hit.card_id, None, hit.qty - sum(alts.values()))
        for art, (total, priced, all_qty) in hit.art_spend.items():
            if priced > 0 and priced == all_qty:
                prices.setdefault(hit.card_id.upper().strip(), {})[art] = round(total / priced, 2)
    return copies, prices, [
        GroupBuyReceiptUnmatchedOut(
            qty=line.qty,
            description=line.raw_description,
            set_name=line.set_name,
            card_name=line.card_name,
        )
        for line in unmatched
    ]


def _copies_from_lines(db: Session, lines) -> Copies:
    copies: Copies = {}
    for line in lines:
        card_id = line.card_id.upper().strip()
        if db.get(CatalogCard, card_id) is None:
            raise Invalid(f"Unknown card {card_id}")
        art = line.product_id if _is_alt_printing(db, card_id, line.product_id) else None
        _add_copies(copies, card_id, art, int(line.qty))
    return copies


def _art_order(item: tuple[int | None, int]) -> tuple[bool, int]:
    return (item[0] is not None, item[0] or 0)


def _plan_allocation(
    db: Session, group: GroupBuy, copies: Copies
) -> dict[str, dict[int | None, list[tuple[int, int]]]]:
    """Per card and art, (user id, copies): who each ordered copy is for.

    Members whose snapshot still has room get copies; room is the snapshot qty minus copies
    already allocated in earlier orders. Alt arts go to members who want that art first.
    """
    taken = _allocated_by_user_card(group)
    placed: dict[tuple[int, str], dict[int, int]] = {}
    for order in group.orders:
        for line in order.lines:
            if line.product_id is None:
                continue
            for alloc in line.allocations:
                bucket = placed.setdefault((alloc.user_id, line.card_id.upper()), {})
                bucket[line.product_id] = bucket.get(line.product_id, 0) + int(alloc.qty)
    memo: dict = {}
    plan: dict[str, dict[int | None, list[tuple[int, int]]]] = {}
    for card_id, arts in sorted(copies.items()):
        rows = []
        for snap in sorted(group.snapshot_lines, key=lambda r: r.id or 0):
            if snap.card_id.upper() != card_id:
                continue
            room = int(snap.qty) - taken.get((snap.user_id, card_id), 0)
            if room > 0:
                rows.append(
                    SimpleNamespace(id=snap.id, user_id=snap.user_id, card_id=card_id, qty=room)
                )
        per_art: dict[int | None, list[tuple[int, int]]] = {}
        plan[card_id] = per_art
        if not rows:
            continue
        staged = min(sum(arts.values()), sum(r.qty for r in rows))
        alt_copies = {pid: n for pid, n in arts.items() if pid is not None}
        split = _split_alt_copies(
            db,
            group,
            rows,
            staged,
            alt_copies,
            memo,
            {r.id: placed.get((r.user_id, card_id), {}) for r in rows},
        )
        for row in rows:
            alts, std = split[row.id]
            for pid, n in sorted(alts.items()):
                if n > 0:
                    per_art.setdefault(pid, []).append((row.user_id, n))
            if std > 0:
                per_art.setdefault(None, []).append((row.user_id, std))
    return plan


def _preview_lines(
    db: Session, group, copies: Copies, plan, names: dict[int, str]
) -> list[GroupBuyOrderPreviewLine]:
    lines: list[GroupBuyOrderPreviewLine] = []
    for card_id, arts in sorted(copies.items()):
        for art, qty in sorted(arts.items(), key=_art_order):
            alloc = plan.get(card_id, {}).get(art, [])
            lines.append(
                GroupBuyOrderPreviewLine(
                    card_id=card_id,
                    name=_line_display_name(db, card_id),
                    product_id=art,
                    qty=qty,
                    allocations=[
                        GroupBuyOrderPreviewAllocation(
                            user_id=uid, display_name=names.get(uid, ""), qty=n
                        )
                        for uid, n in alloc
                    ],
                    qty_extra=max(0, qty - sum(n for _, n in alloc)),
                )
            )
    return lines


def preview_order(
    db: Session, user: User, group_id: int, receipt_text: str
) -> GroupBuyOrderPreview:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Lock for checkout before adding orders")
    copies, unmatched = _copies_from_receipt(db, receipt_text)
    plan = _plan_allocation(db, group, copies)
    names = {m.user_id: _display_name(m.user) for m in group.members}
    return GroupBuyOrderPreview(lines=_preview_lines(db, group, copies, plan, names), unmatched=unmatched)


def _create_order(
    db: Session,
    group: GroupBuy,
    user: User,
    *,
    number: str,
    seller: str,
    tracking: str,
    receipt_text: str,
    copies: Copies,
    from_receipt_apply: bool = False,
    prices: Prices | None = None,
) -> tuple[GroupBuyOrder, str, bool]:
    """Add the order and its allocations; the first one moves locked -> ordered."""
    plan = _plan_allocation(db, group, copies)
    status_before = str(group.status)
    set_ordered_at = False
    if group.status == GroupBuyStatus.LOCKED:
        group.status = GroupBuyStatus.ORDERED
        if group.ordered_at is None:
            group.ordered_at = _now()
            set_ordered_at = True
    order = GroupBuyOrder(
        from_receipt_apply=from_receipt_apply,
        order_number=number,
        seller_name=seller,
        tracking_url=tracking,
        receipt_text=receipt_text,
        created_by_user_id=user.id,
        version=1,
    )
    group.orders.append(order)
    _fill_order_lines(order, copies, plan, prices)
    db.flush()
    return order, status_before, set_ordered_at


def _fill_order_lines(
    order: GroupBuyOrder, copies: Copies, plan, prices: Prices | None = None
) -> None:
    for card_id, arts in sorted(copies.items()):
        for art, qty in sorted(arts.items(), key=_art_order):
            line = GroupBuyOrderLine(
                card_id=card_id,
                product_id=art,
                qty_ordered=qty,
                unit_price=(prices or {}).get(card_id, {}).get(art),
            )
            order.lines.append(line)
            for uid, n in plan.get(card_id, {}).get(art, []):
                line.allocations.append(GroupBuyOrderAllocation(user_id=uid, qty=n, qty_arrived=0))


def add_order(
    db: Session, user: User, group_id: int, body: GroupBuyOrderCreate
) -> GroupBuyOrderAdded:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    if group.status == GroupBuyStatus.COMPLETED:
        raise Forbidden("Group buy is already completed")
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Lock for checkout before adding orders")
    number = body.order_number.strip()
    tracking = _clean_tracking_url(body.tracking_url)
    _check_order_number(group, number)
    receipt_text = body.receipt_text.strip()
    unmatched: list[GroupBuyReceiptUnmatchedOut] = []
    if body.lines:
        copies = _copies_from_lines(db, body.lines)
    elif receipt_text:
        copies, unmatched = _copies_from_receipt(db, receipt_text)
    else:
        copies = {}
    order, status_before, set_ordered_at = _create_order(
        db,
        group,
        user,
        number=number,
        seller=body.seller_name.strip(),
        tracking=tracking,
        receipt_text=receipt_text,
        copies=copies,
    )
    if body.mark_arrived:
        _set_arrival(db, group, order, user, None, status_before, set_ordered_at)
    _refresh_status(group)
    db.commit()
    return GroupBuyOrderAdded(
        order_id=order.id, unmatched=unmatched, detail=get_group_buy(db, user, group_id)
    )


class _SimulatedGroup:
    """The group buy with extra, unsaved orders on top, so a preview can plan them one after another."""

    def __init__(self, group: GroupBuy, orders: list) -> None:
        self._group = group
        self.orders = orders

    def __getattr__(self, name: str):
        return getattr(self._group, name)


def _history_orders(text: str):
    orders = parse_order_history(text)
    if not orders:
        raise Invalid("No TCGplayer orders found. Paste the whole Order History page.")
    return orders


def _history_receipt_text(lines: list[ParsedReceiptLine]) -> str:
    """Only the order's items, as qty and description. Never the page text: it holds addresses."""
    return "\n".join(f"{line.qty}\t{line.raw_description}" for line in lines)


def preview_order_history(
    db: Session, user: User, group_id: int, text: str
) -> GroupBuyOrderHistoryPreview:
    """Every order on a pasted Order History page, matched to this group buy; saves nothing."""
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Lock for checkout before adding orders")
    parsed = _history_orders(text)
    names = {m.user_id: _display_name(m.user) for m in group.members}
    wanted = {row.card_id.upper() for row in group.snapshot_lines}
    existing = {o.order_number for o in group.orders if o.order_number}
    # Later orders see the copies earlier ones would take, like the real import does.
    sim_orders = list(group.orders)
    sim = _SimulatedGroup(group, sim_orders)
    out: list[GroupBuyHistoryOrderPreview] = []
    for item in parsed:
        copies, unmatched = _copies_from_parsed(db, item.lines)
        already = item.order_number in existing
        plan = _plan_allocation(db, sim, copies)
        if not already:
            sim_orders.append(
                SimpleNamespace(
                    lines=[
                        SimpleNamespace(
                            card_id=card_id,
                            product_id=art,
                            allocations=[
                                SimpleNamespace(user_id=uid, qty=n)
                                for uid, n in plan.get(card_id, {}).get(art, [])
                            ],
                        )
                        for card_id, arts in copies.items()
                        for art in arts
                    ]
                )
            )
        out.append(
            GroupBuyHistoryOrderPreview(
                order_number=item.order_number,
                order_date=item.order_date,
                seller_name=item.seller_name,
                tracking_number=item.tracking_number,
                tracking_url=tracking_url_for(item.tracking_number),
                already_added=already,
                in_group_buy=any(card_id in wanted for card_id in copies),
                lines=_preview_lines(db, sim, copies, plan, names),
                unmatched=unmatched,
            )
        )
    return GroupBuyOrderHistoryPreview(orders=out)


def import_order_history(
    db: Session, user: User, group_id: int, text: str, order_numbers: list[str]
) -> GroupBuyOrderHistoryImported:
    """Add the chosen orders from an Order History page in one go, in page order."""
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    if group.status == GroupBuyStatus.COMPLETED:
        raise Forbidden("Group buy is already completed")
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Lock for checkout before adding orders")
    parsed = _history_orders(text)
    on_page = {p.order_number for p in parsed}
    wanted = {n.strip().upper() for n in order_numbers if n.strip()}
    missing = sorted(wanted - on_page)
    if missing:
        raise Invalid(f"Order {missing[0]} is not on that page")
    unmatched: list[GroupBuyReceiptUnmatchedOut] = []
    created: list[int] = []
    for item in parsed:
        if item.order_number not in wanted:
            continue
        if any(o.order_number == item.order_number for o in group.orders):
            continue
        copies, prices, miss = _copies_and_prices_from_parsed(db, item.lines)
        unmatched.extend(miss)
        order, _, _ = _create_order(
            db,
            group,
            user,
            number=item.order_number,
            seller=item.seller_name,
            tracking=tracking_url_for(item.tracking_number),
            receipt_text=_history_receipt_text(item.lines),
            copies=copies,
            prices=prices,
        )
        created.append(order.id)
    _refresh_status(group)
    db.commit()
    return GroupBuyOrderHistoryImported(
        order_ids=created, unmatched=unmatched, detail=get_group_buy(db, user, group_id)
    )


def set_order_lines(
    db: Session, user: User, group_id: int, order_id: int, body: GroupBuyOrderLinesUpdate
) -> GroupBuyOrderAdded:
    """Replace what an order holds. Only while nothing in it arrived, so no Owned credit has to move."""
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    order = _get_order(group, order_id)
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("This group buy was closed")
    _check_version(order, body.expected_version)
    if _order_totals(order)[2] > 0 or any(a.order_id == order.id for a in group.receipt_applies):
        raise Conflict("Undo this order's arrivals before changing its items")
    receipt_text = body.receipt_text.strip()
    unmatched: list[GroupBuyReceiptUnmatchedOut] = []
    if body.lines:
        copies = _copies_from_lines(db, body.lines)
    elif receipt_text:
        copies, unmatched = _copies_from_receipt(db, receipt_text)
    else:
        raise Invalid("Paste the order or pick cards")
    # Drop this order's own lines first so its copies count as not ordered while allocation reruns.
    kept_prices: Prices = {}
    for old in order.lines:
        if old.unit_price is not None:
            kept_prices.setdefault(old.card_id.upper(), {})[old.product_id] = float(old.unit_price)
    order.lines.clear()
    db.flush()
    _fill_order_lines(order, copies, _plan_allocation(db, group, copies), kept_prices)
    if receipt_text and not body.lines:
        order.receipt_text = receipt_text
    _touch(order)
    _refresh_status(group)
    db.commit()
    return GroupBuyOrderAdded(
        order_id=order.id, unmatched=unmatched, detail=get_group_buy(db, user, group_id)
    )


def update_order_details(
    db: Session, user: User, group_id: int, order_id: int, body: GroupBuyOrderPatch
) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    order = _get_order(group, order_id)
    _check_version(order, body.expected_version)
    if body.order_number is not None:
        number = body.order_number.strip()
        _check_order_number(group, number, ignore_id=order.id)
        order.order_number = number
    if body.seller_name is not None:
        order.seller_name = body.seller_name.strip()
    if body.tracking_url is not None:
        order.tracking_url = _clean_tracking_url(body.tracking_url)
    _touch(order)
    db.commit()
    return get_group_buy(db, user, group_id)


def delete_order(db: Session, user: User, group_id: int, order_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    order = _get_order(group, order_id)
    if _order_totals(order)[2] > 0:
        raise Conflict("Undo this order's arrivals before deleting it")
    for apply_event in [a for a in group.receipt_applies if a.order_id == order.id]:
        group.receipt_applies.remove(apply_event)
    db.flush()
    group.orders.remove(order)
    _refresh_status(group)
    db.commit()
    return get_group_buy(db, user, group_id)


def _credit(db: Session, user_id: int, card_id: str, art: int | None, delta: int) -> None:
    # A "not on the app" member has no collection to credit (#1445).
    if db.scalar(select(User.placeholder_group_buy_id).where(User.id == user_id)) is not None:
        return
    if art is None:
        (_add_owned if delta > 0 else _subtract_owned)(db, user_id, card_id, abs(delta))
    elif delta > 0:
        _add_alt_owned(db, user_id, card_id, art, delta)
    else:
        _subtract_alt_owned(db, user_id, card_id, art, -delta)


def _line_capacity(line: GroupBuyOrderLine) -> int:
    return sum(int(a.qty) for a in line.allocations)


def _arrival_would_change(order: GroupBuyOrder, targets: dict[int, int] | None) -> bool:
    for line in order.lines:
        capacity = _line_capacity(line)
        target = capacity if targets is None else targets.get(line.id)
        if target is not None and min(int(target), capacity) != sum(
            int(a.qty_arrived) for a in line.allocations
        ):
            return True
    return False


def _set_arrival(
    db: Session,
    group: GroupBuy,
    order: GroupBuyOrder,
    user: User,
    targets: dict[int, int] | None,
    status_before: str | None = None,
    set_ordered_at: bool = False,
) -> bool:
    """Move arrived counts to ``targets`` (line id -> copies; None = all) and credit Owned.

    Each line's target is split across its allocations in allocation order, so the result is
    the same however many times it is applied. Owned and OwnedPrinting move by the change only.
    """
    deltas: dict[tuple[int, str, int | None], int] = {}
    for line in order.lines:
        capacity = _line_capacity(line)
        target = capacity if targets is None else targets.get(line.id)
        if target is None:
            continue
        left = min(int(target), capacity)
        for alloc in line.allocations:
            new = min(int(alloc.qty), left)
            left -= new
            change = new - int(alloc.qty_arrived)
            if change:
                key = (alloc.user_id, line.card_id.upper(), line.product_id)
                deltas[key] = deltas.get(key, 0) + change
                alloc.qty_arrived = new
    deltas = {k: v for k, v in deltas.items() if v}
    if not deltas:
        return False
    apply_event = GroupBuyReceiptApply(
        group_buy_id=group.id,
        applied_by_user_id=user.id,
        status_before=status_before or str(group.status),
        set_ordered_at=1 if set_ordered_at else 0,
        order_id=order.id,
    )
    group.receipt_applies.append(apply_event)
    db.flush()
    for (uid, card_id, art), delta in deltas.items():
        _credit(db, uid, card_id, art, delta)
        db.add(
            GroupBuyReceiptApplyLine(
                apply_id=apply_event.id, user_id=uid, card_id=card_id, product_id=art, qty=delta
            )
        )
    _, allocated, arrived = _order_totals(order)
    order.arrived_at = _now() if allocated > 0 and arrived >= allocated else None
    _touch(order)
    return True


def _require_arrival_editable(group: GroupBuy) -> None:
    if group.status not in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED):
        raise Forbidden("Add an order first")
    if group.status == GroupBuyStatus.COMPLETED and not _everything_arrived(group):
        raise Forbidden("This group buy was closed")


def set_order_arrival(
    db: Session, user: User, group_id: int, order_id: int, body: GroupBuyArrivalUpdate
) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    order = _get_order(group, order_id)
    _require_arrival_editable(group)
    targets: dict[int, int] | None = None
    if not body.all:
        by_id = {line.id: line for line in order.lines}
        targets = {}
        for item in body.lines or []:
            line = by_id.get(item.line_id)
            if line is None:
                raise NotFound("Order line not found")
            if item.qty_arrived > int(line.qty_ordered):
                raise Invalid("More copies arrived than were ordered")
            targets[line.id] = item.qty_arrived
        if not targets:
            raise Invalid("Say which lines arrived, or mark the whole order arrived")
    # A repeat of the same targets is a no-op even when the page is a version behind.
    if _arrival_would_change(order, targets):
        _check_version(order, body.expected_version)
        _set_arrival(db, group, order, user, targets)
        _refresh_status(group)
        db.commit()
    return get_group_buy(db, user, group_id)


def _reverse_arrivals(db: Session, group: GroupBuy, order: GroupBuyOrder) -> None:
    """Take back everything the ledger credited for this order and clear its arrived counts."""
    applies = [a for a in group.receipt_applies if a.order_id == order.id]
    net: dict[tuple[int, str, int | None], int] = {}
    for apply_event in applies:
        for line in apply_event.lines:
            card_id = line.card_id.upper().strip()
            # Rows from before orders existed store the standard product id on standard credits.
            art = line.product_id if _is_alt_printing(db, card_id, line.product_id) else None
            key = (line.user_id, card_id, art)
            net[key] = net.get(key, 0) + int(line.qty)
    for (uid, card_id, art), qty in net.items():
        if qty > 0:
            _credit(db, uid, card_id, art, -qty)
    for apply_event in applies:
        group.receipt_applies.remove(apply_event)
    for line in order.lines:
        for alloc in line.allocations:
            alloc.qty_arrived = 0
    order.arrived_at = None
    db.flush()


def undo_order_arrival(
    db: Session, user: User, group_id: int, order_id: int, body: GroupBuyArrivalUndo
) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    order = _get_order(group, order_id)
    _require_arrival_editable(group)
    if _order_totals(order)[2] > 0 or any(a.order_id == order.id for a in group.receipt_applies):
        _check_version(order, body.expected_version)
        _reverse_arrivals(db, group, order)
        _touch(order)
        _refresh_status(group)
        db.commit()
    return get_group_buy(db, user, group_id)


def close_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    """Finish the buy. Copies that never arrived stay on members' Shopping; Owned is untouched."""
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    if group.status == GroupBuyStatus.COMPLETED:
        return get_group_buy(db, user, group_id)
    if group.status != GroupBuyStatus.ORDERED:
        raise Forbidden("Add an order before closing the group buy")
    group.status = GroupBuyStatus.COMPLETED
    db.commit()
    return get_group_buy(db, user, group_id)


# --- Hand-off: getting each member's arrived cards to them (#1418) ---------------------------


def _handoff_row(db: Session, group: GroupBuy, user_id: int) -> GroupBuyHandoff:
    for row in group.handoffs:
        if row.user_id == user_id:
            return row
    row = GroupBuyHandoff(group_buy_id=group.id, user_id=user_id)
    row.status, row.tracking_url, row.note, row.qty_handed, row.paid = (
        HandoffStatus.WAITING,
        "",
        "",
        0,
        False,
    )
    db.add(row)
    group.handoffs.append(row)
    return row


def _require_handoff_phase(group: GroupBuy) -> None:
    if group.status not in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED):
        raise Invalid("Hand-off starts once the group buy is ordered")


def set_handoff(
    db: Session, user: User, group_id: int, member_id: int, body: GroupBuyHandoffUpdate
) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    _require_handoff_phase(group)
    if member_id == group.host_user_id:
        raise Invalid("The host already has their own cards")
    if not any(m.user_id == member_id for m in group.members):
        raise NotFound("Member not found")
    # Validate before the row exists: a refused request must not leave a pending one in the session.
    tracking = None if body.tracking_url is None else _clean_tracking_url(body.tracking_url)
    row = _handoff_row(db, group, member_id)
    if body.status is not None:
        row.status = body.status
        if body.status == HandoffStatus.WAITING:
            row.qty_handed = 0
            row.tracking_url = ""
        elif body.qty_handed is None:
            row.qty_handed = _arrived_by_user(group).get(member_id, 0)
    if body.qty_handed is not None:
        row.qty_handed = body.qty_handed
    if tracking is not None:
        row.tracking_url = tracking
    if body.note is not None:
        row.note = body.note.strip()
    if body.paid is not None:
        row.paid = body.paid
    row.updated_at = _now()
    row.updated_by_user_id = user.id
    db.commit()
    return get_group_buy(db, user, group_id)


def confirm_handoff_received(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_member(group, user)
    _require_handoff_phase(group)
    row = next((h for h in group.handoffs if h.user_id == user.id), None)
    if row is None or row.status not in (HandoffStatus.SHIPPED, HandoffStatus.HANDED_OVER):
        raise Invalid("Nothing has been shipped or handed over to you yet")
    row.status = HandoffStatus.RECEIVED
    row.updated_at = _now()
    row.updated_by_user_id = user.id
    db.commit()
    return get_group_buy(db, user, group_id)


# --- Mark purchased: one order, all arrived ----------------------------------------------------


def apply_receipt_to_group_buy(
    db: Session,
    user: User,
    group_id: int,
    body: GroupBuyReceiptApplyRequest,
) -> GroupBuyDetail:
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    if group.status == GroupBuyStatus.COMPLETED:
        raise Forbidden("Group buy is already completed")
    if group.status == GroupBuyStatus.OPEN:
        raise Forbidden("Lock for checkout before applying a receipt")
    if group.status not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
        raise Forbidden("Group buy cannot apply a receipt from this status")

    cleaned_receipt = (body.receipt_text or "").strip()[:200_000]
    group.receipt_text = cleaned_receipt

    report, matched = _match_report(db, group, cleaned_receipt)
    alt_copies = {m.card_id.upper(): m.alt_copies for m in matched}
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

    copies: Copies = {}
    for line in staged_lines:
        room = line.staged_qty
        for pid, n in sorted(alt_copies.get(line.card_id, {}).items()):
            take = min(n, room)
            _add_copies(copies, line.card_id, pid, take)
            room -= take
        _add_copies(copies, line.card_id, None, room)
    order, status_before, set_ordered_at = _create_order(
        db,
        group,
        user,
        number="",
        seller="",
        tracking="",
        receipt_text=cleaned_receipt,
        copies=copies,
        from_receipt_apply=True,
    )
    if not _set_arrival(db, group, order, user, None, status_before, set_ordered_at):
        raise Invalid("Nothing left to apply — snapshot may already be cleared")
    _refresh_status(group)
    db.commit()
    return get_group_buy(db, user, group_id)


def undo_last_receipt_apply(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    """Undo the most recent arrival. An order made by Mark purchased is dropped, restoring the
    pre-purchase state; an order added through the orders endpoint keeps existing."""
    group = _get_group(db, group_id, lock=True)
    _require_host(group, user)
    if group.status not in (GroupBuyStatus.ORDERED, GroupBuyStatus.COMPLETED):
        raise Forbidden("Nothing to undo in this status")

    applies = sorted(
        (a for a in group.receipt_applies if a.order_id is not None),
        key=lambda a: (a.applied_at or datetime.min.replace(tzinfo=timezone.utc), a.id or 0),
    )
    if not applies:
        raise Invalid(
            "Nothing to undo — this purchase was not recorded (apply before undo was available)"
        )
    apply_event = applies[-1]
    order = _get_order(group, apply_event.order_id)
    _reverse_arrivals(db, group, order)
    if not order.from_receipt_apply:
        # An order the host added on purpose stays; only its arrivals are taken back.
        _touch(order)
        _refresh_status(group)
        db.commit()
        return get_group_buy(db, user, group_id)
    group.orders.remove(order)
    if group.orders:
        _refresh_status(group)
    else:
        status_before = (apply_event.status_before or GroupBuyStatus.ORDERED).strip()
        if status_before not in (GroupBuyStatus.LOCKED, GroupBuyStatus.ORDERED):
            status_before = GroupBuyStatus.ORDERED
        group.status = status_before
        if int(apply_event.set_ordered_at or 0):
            group.ordered_at = None
    db.commit()
    return get_group_buy(db, user, group_id)
