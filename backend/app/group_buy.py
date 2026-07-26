"""Group buy (collaborative shopping pool) service."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.group_buy_merge import MemberNeed, merge_member_needs
from app.models import (
    CatalogCard,
    CatalogPrinting,
    GroupBuy,
    GroupBuyLineOverride,
    GroupBuyMember,
    GroupBuySnapshotLine,
    User,
)
from app.schemas import (
    GroupBuyDetail,
    GroupBuyExport,
    GroupBuyInvitePreview,
    GroupBuyLineOut,
    GroupBuyMemberOut,
    GroupBuyMemberQtyOut,
    GroupBuySummary,
)
from app import services

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


def _member_needs_live(db: Session, group: GroupBuy) -> list[MemberNeed]:
    needs: list[MemberNeed] = []
    for member in group.members:
        shopping = services.shopping_list(
            db, member.user, deck_ids=_parse_deck_ids(member.deck_ids_json)
        )
        name = _display_name(member.user)
        for item in shopping.items:
            if item.still_need <= 0:
                continue
            needs.append(
                MemberNeed(
                    user_id=member.user_id,
                    display_name=name,
                    card_id=item.card_id,
                    qty=item.still_need,
                    product_id=item.product_id,
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


def _build_lines(db: Session, group: GroupBuy) -> tuple[list[GroupBuyLineOut], dict[int, tuple[int, float]]]:
    needs = (
        _member_needs_locked(group)
        if group.status == "locked"
        else _member_needs_live(db, group)
    )
    merged = merge_member_needs(needs)
    overrides = {o.card_id.upper(): o.product_id for o in group.line_overrides}
    card_ids = {line.card_id for line in merged}
    catalog, primary_ids, alts, printings = _catalog_bundle(db, card_ids)

    member_totals: dict[int, list[int]] = {m.user_id: [0, 0.0] for m in group.members}
    lines_out: list[GroupBuyLineOut] = []

    for line in merged:
        cat = catalog.get(line.card_id)
        product_id = overrides.get(line.card_id) or line.suggested_product_id or primary_ids.get(
            line.card_id
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
        remaining = (
            round(line.total_qty * market, 2) if market is not None else None
        )
        for mem in line.members:
            bucket = member_totals.setdefault(mem.user_id, [0, 0.0])
            bucket[0] += mem.qty
            if market is not None:
                bucket[1] += mem.qty * market

        lines_out.append(
            GroupBuyLineOut(
                card_id=line.card_id,
                name=cat.name if cat else "(not in catalog)",
                total_qty=line.total_qty,
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
                    )
                    for m in line.members
                ],
                alt_arts=alts.get(line.card_id, []),
            )
        )

    # Convert member market totals to rounded floats
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
        )
        .order_by(GroupBuy.id.desc())
    ).all()
    out: list[GroupBuySummary] = []
    for group in groups:
        lines, _ = _build_lines(db, group)
        out.append(GroupBuySummary(**_summary_fields(group, user, lines)))
    return out


def get_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_member(group, user)
    lines, member_stats = _build_lines(db, group)
    members_out: list[GroupBuyMemberOut] = []
    for member in sorted(
        group.members,
        key=lambda m: (0 if m.role == "host" else 1, m.id),
    ):
        copies, market = member_stats.get(member.user_id, (0, 0.0))
        members_out.append(
            GroupBuyMemberOut(
                user_id=member.user_id,
                display_name=_display_name(member.user),
                role=member.role,
                deck_ids=_parse_deck_ids(member.deck_ids_json),
                cards_still_needed=copies,
                remaining_market=market,
            )
        )
    return GroupBuyDetail(
        **_summary_fields(group, user, lines),
        members=members_out,
        lines=lines,
        locked_at=group.locked_at.isoformat() if group.locked_at else None,
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
        )
    )
    if group is None:
        raise LookupError("Invite link not found")
    if group.status == "locked":
        # Allow existing members to open; block new joins.
        try:
            _require_member(group, user)
            return get_group_buy(db, user, group.id)
        except PermissionError as exc:
            raise PermissionError("This group buy is locked; new members cannot join") from exc

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


def lock_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    if group.status == "locked":
        return get_group_buy(db, user, group_id)

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
    group.status = "locked"
    group.locked_at = datetime.now(timezone.utc)
    db.commit()
    return get_group_buy(db, user, group_id)


def unlock_group_buy(db: Session, user: User, group_id: int) -> GroupBuyDetail:
    group = _get_group(db, group_id)
    _require_host(group, user)
    group.status = "open"
    group.locked_at = None
    db.execute(delete(GroupBuySnapshotLine).where(GroupBuySnapshotLine.group_buy_id == group.id))
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
