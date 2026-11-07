"""Shopping list: what to buy for the selected decks, given owned and wanted copies."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.planner.domain import (
    parse_cost,
)
from app.models import (
    CatalogCard,
    CatalogPrinting,
    Deck,
    ShoppingExtra,
    ShoppingExtraPrinting,
    User,
)
from app.planner.catalog_repo import (
    alt_arts_map,
    alt_owned_map,
    catalog_map,
    owned_map,
    primary_product_ids,
)
from app.schemas import (
    CollectorLine,
    LeaderNeed,
    ShoppingItem,
    ShoppingResponse,
)
from app.planner.printings import (
    _alts_owned_total,
    _apply_alt_want_clamp_to_rows,
    _collector_map,
    _deck_alt_owned_map,
    _delete_zero_printing_rows,
    _display_choice_map,
    _leader_group_id,
    _printing_wants_for_decks,
    clamp_alt_want_map,
)


def allocate_still_need_buys(
    still_need: int,
    alt_wants: list[tuple[int, int, float | None]],
    *,
    standard_product_id: int | None,
    standard_price: float | None,
) -> list[tuple[int | None, int, float | None]]:
    """Allocate still_need copies: alt wants first (in list order), then standard.

    Each alt entry is (product_id, wanted_qty, market_price).
    Returns list of (product_id|None, qty, unit_price).
    """
    if still_need <= 0:
        return []
    remaining = still_need
    buys: list[tuple[int | None, int, float | None]] = []
    for product_id, wanted_qty, price in alt_wants:
        if remaining <= 0:
            break
        take = min(max(0, wanted_qty), remaining)
        if take > 0:
            buys.append((product_id, take, price))
            remaining -= take
    if remaining > 0:
        buys.append((standard_product_id, remaining, standard_price))
    return buys


def remaining_cost_for_buys(buys: list[tuple[int | None, int, float | None]]) -> float | None:
    """Sum qty * unit_price; None if any buy line is missing a price."""
    if not buys:
        return 0.0
    total = 0.0
    for _pid, qty, price in buys:
        if price is None:
            return None
        total += qty * price
    return round(total, 2)


def shopping_list(
    db: Session,
    user: User,
    deck_ids: list[int] | None = None,
    include_extras: bool = True,
    include_collector: bool = True,
) -> ShoppingResponse:
    """Master shopping list for a user.

    Need per card is the MAX copies required by any single selected deck
    (not the sum across decks). Owned is shared, so still_need = max(0, need − owned
    − alt copies owned).

    Cards added directly (ShoppingExtra) carry a target number of copies to own.
    They fold into Need by max with the deck Need, never summed, and are included
    whatever ``deck_ids`` selects unless ``include_extras`` is False.

    Collector copies (#1031) are alt printings wanted on top of the decks. They
    claim owned copies of that printing first (only the rest cover deck Need),
    never count toward Need, and add their own still-needed copies and cost to
    the totals. ``include_collector`` False ignores them entirely (public views).
    """
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    if deck_ids is not None:
        wanted = set(deck_ids)
        decks = [d for d in decks if d.id in wanted]
    sum_leaders = bool(getattr(user, "sum_across_leaders", False))
    # Max per (card, leader group); Need is the max or sum of those groups.
    need_by_group: dict[str, dict[str, int]] = defaultdict(dict)
    used_in: dict[str, list[str]] = defaultdict(list)
    card_deck_indexes: dict[str, list[int]] = defaultdict(list)
    for deck_idx, deck in enumerate(decks):
        group = _leader_group_id(deck)
        seen_in_deck: set[str] = set()
        for card in deck.cards:
            # Max within a leader — sharing a playset covers every list that uses it.
            by_group = need_by_group[card.card_id]
            by_group[group] = max(by_group.get(group, 0), card.needed)
            if deck.name not in used_in[card.card_id]:
                used_in[card.card_id].append(deck.name)
            if card.card_id not in seen_in_deck:
                card_deck_indexes[card.card_id].append(deck_idx)
                seen_in_deck.add(card.card_id)
    need: dict[str, int] = {
        card_id: sum(by_group.values()) if sum_leaders else max(by_group.values())
        for card_id, by_group in need_by_group.items()
    }
    deck_need = dict(need)
    extras: dict[str, int] = {}
    if include_extras:
        extras = {
            row.card_id: row.qty
            for row in db.scalars(
                select(ShoppingExtra).where(ShoppingExtra.user_id == user.id)
            ).all()
            if row.qty > 0
        }
        for card_id, qty in extras.items():
            need[card_id] = max(need.get(card_id, 0), qty)
    collector = _collector_map(db, user.id) if include_collector else {}
    for card_id in collector:
        # A card with only a collector want still needs a parent row (need 0).
        need.setdefault(card_id, 0)

    # Leader group order = earliest selected deck for that leader.
    leader_group_rank: dict[str, int] = {}
    leader_deck_indexes: dict[str, list[int]] = defaultdict(list)
    for deck_idx, deck in enumerate(decks):
        group = _leader_group_id(deck)
        if group not in leader_group_rank:
            leader_group_rank[group] = deck_idx
        leader_deck_indexes[group].append(deck_idx)

    owned = owned_map(db, user.id)
    alt_owned = alt_owned_map(db, user.id)
    deck_alt_owned = _deck_alt_owned_map(alt_owned, collector)
    display_choices = _display_choice_map(db, user.id)
    leader_ids = {d.leader_card_id for d in decks if d.leader_card_id}
    catalog = catalog_map(db, set(need) | leader_ids)
    collector_pids = {pid for by_pid in collector.values() for pid in by_pid}
    collector_printings = (
        {
            row.product_id: row
            for row in db.scalars(
                select(CatalogPrinting).where(CatalogPrinting.product_id.in_(collector_pids))
            ).all()
        }
        if collector_pids
        else {}
    )
    product_ids = primary_product_ids(db, set(need))

    group_labels: dict[str, str] = {}
    for deck in decks:
        group = _leader_group_id(deck)
        if group in group_labels:
            continue
        leader = catalog.get(deck.leader_card_id) if deck.leader_card_id else None
        group_labels[group] = leader.name if leader else deck.name

    # Max alt-want per product within each leader, combined across leaders the
    # same way as Need (max, or sum), then clamp sum to shopping need.
    wants_by_deck = _printing_wants_for_decks(db, [d.id for d in decks])
    group_wants: dict[str, dict[int, dict[str, int]]] = defaultdict(lambda: defaultdict(dict))
    for deck in decks:
        group = _leader_group_id(deck)
        for card_id, by_pid in wants_by_deck.get(deck.id, {}).items():
            for pid, qty in by_pid.items():
                by_group = group_wants[card_id][pid]
                by_group[group] = max(by_group.get(group, 0), qty)
    merged_wants: dict[str, dict[int, int]] = {
        card_id: {
            pid: sum(by_group.values()) if sum_leaders else max(by_group.values())
            for pid, by_group in by_pid.items()
        }
        for card_id, by_pid in group_wants.items()
    }
    if extras:
        extra_rows = db.scalars(
            select(ShoppingExtraPrinting).where(
                ShoppingExtraPrinting.user_id == user.id,
                ShoppingExtraPrinting.card_id.in_(list(extras)),
            )
        ).all()
        for row in extra_rows:
            if row.qty <= 0:
                continue
            by_pid = merged_wants.setdefault(row.card_id, {})
            by_pid[row.product_id] = max(by_pid.get(row.product_id, 0), row.qty)
    for card_id, by_pid in list(merged_wants.items()):
        merged_wants[card_id] = clamp_alt_want_map(by_pid, need.get(card_id, 0))

    alts = alt_arts_map(
        db, set(need), wanted=merged_wants, owned=alt_owned, collector=collector
    )
    items: list[ShoppingItem] = []
    cards_still = 0
    remaining = 0.0
    collector_copies = 0
    for card_id in sorted(need):
        qty_need = need[card_id]
        qty_owned = owned.get(card_id, 0)
        qty_alts = _alts_owned_total(deck_alt_owned, card_id)
        still = max(0, qty_need - qty_owned - qty_alts)
        cat = catalog.get(card_id)
        market = cat.market_price if cat else None
        card_alts = alts.get(card_id, [])
        # Alt arts the user picked to buy (#906) are priced at their own market
        # price, in list order; whatever is left of still_need is the standard art.
        # still_need already drops the alt copies the user owns, so those come off
        # the pick too (#908): an owned picked copy is not bought, nor priced, again.
        buys = allocate_still_need_buys(
            still,
            [
                (
                    a.product_id,
                    a.wanted - deck_alt_owned.get(card_id, {}).get(a.product_id, 0),
                    a.market_price,
                )
                for a in card_alts
                if a.wanted - deck_alt_owned.get(card_id, {}).get(a.product_id, 0) > 0
            ],
            standard_product_id=product_ids.get(card_id),
            standard_price=market,
        )
        line = remaining_cost_for_buys(buys)
        cards_still += still
        if line is not None:
            remaining += line

        collector_lines: list[CollectorLine] = []
        for pid, want in sorted(collector.get(card_id, {}).items()):
            printing = collector_printings.get(pid)
            price = printing.market_price if printing else None
            have = min(alt_owned.get(card_id, {}).get(pid, 0), want)
            line_still = want - have
            line_cost = (
                0.0
                if line_still == 0
                else (round(line_still * price, 2) if price is not None else None)
            )
            collector_copies += want
            cards_still += line_still
            if line_cost is not None:
                remaining += line_cost
            collector_lines.append(
                CollectorLine(
                    product_id=pid,
                    label=printing.name if printing else "Alt art",
                    image_url=(printing.image_url or None) if printing else None,
                    market_price=price,
                    want=want,
                    have=have,
                    still_need=line_still,
                    remaining_cost=line_cost,
                )
            )

        indexes = card_deck_indexes[card_id]
        primary_idx = indexes[0] if indexes else 9999
        primary_deck = decks[primary_idx] if indexes else None
        primary_group = _leader_group_id(primary_deck) if primary_deck else "__none"
        group_rank = leader_group_rank.get(primary_group, 9999)
        # Within a leader: cards from the first same-leader deck, then later additions.
        within_rank = 9999
        for wi, deck_idx in enumerate(leader_deck_indexes.get(primary_group, [])):
            if deck_idx in indexes:
                within_rank = wi
                break
        deck_sort_key = f"{group_rank:04d}-{within_rank:04d}-{primary_idx:04d}"
        if not indexes:
            # Added directly: after every deck card.
            deck_sort_key = "9999-9999-9999"

        card_leader_ids = {
            decks[i].leader_card_id
            for i in indexes
            if decks[i].leader_card_id
        }
        primary_leader_card_id = primary_deck.leader_card_id if primary_deck else None
        primary_leader_name = None
        if primary_leader_card_id and primary_leader_card_id in catalog:
            primary_leader_name = catalog[primary_leader_card_id].name

        items.append(
            ShoppingItem(
                card_id=card_id,
                name=cat.name if cat else "(not in catalog)",
                rarity=cat.rarity if cat else "",
                color=cat.color if cat else "",
                card_type=cat.card_type if cat else "",
                cost=parse_cost(cat.cost) if cat else None,
                need=qty_need,
                owned=qty_owned,
                alts_owned=qty_alts,
                still_need=still,
                market_price=market,
                low_price=cat.low_price if cat else None,
                remaining_cost=line,
                image_url=cat.image_url if cat else "",
                tcgplayer_url=cat.tcgplayer_url if cat else "",
                product_id=product_ids.get(card_id),
                used_in=used_in[card_id],
                alt_arts=card_alts,
                display_art=display_choices.get(card_id),
                deck_sort_key=deck_sort_key,
                primary_leader_card_id=primary_leader_card_id,
                primary_leader_name=primary_leader_name,
                leader_count=max(1, len(card_leader_ids)),
                need_by_leader=(
                    [
                        LeaderNeed(label=group_labels.get(g, g), need=n)
                        for g, n in need_by_group[card_id].items()
                    ]
                    if len(need_by_group[card_id]) > 1
                    else []
                ),
                need_summed=sum_leaders,
                extra_qty=extras.get(card_id, 0),
                deck_need=deck_need.get(card_id, 0),
                collector_wants=collector_lines,
            )
        )
    return ShoppingResponse(
        items=items,
        cards_still_needed=cards_still,
        remaining_market=round(remaining, 2),
        unique_cards=len(items),
        collector_copies=collector_copies,
    )


def set_shopping_extra(db: Session, user: User, card_id: str, qty: int) -> int:
    """Set the target copies to own for a card added directly to Master Shopping.

    qty 0 removes it. Unknown card ids are rejected so typos leave no junk rows.
    """
    card_id = card_id.upper().strip()
    row = db.scalar(
        select(ShoppingExtra).where(
            ShoppingExtra.user_id == user.id, ShoppingExtra.card_id == card_id
        )
    )
    if qty == 0:
        if row is not None:
            db.delete(row)
        for printing in db.scalars(
            select(ShoppingExtraPrinting).where(
                ShoppingExtraPrinting.user_id == user.id,
                ShoppingExtraPrinting.card_id == card_id,
            )
        ).all():
            db.delete(printing)
        db.commit()
        return 0
    if db.get(CatalogCard, card_id) is None:
        raise LookupError("Card not found in catalog")
    if row is None:
        db.add(ShoppingExtra(user_id=user.id, card_id=card_id, qty=qty))
    else:
        row.qty = qty
    # Trim saved alt picks to the new Want, like a deck does when Need drops.
    picks = db.scalars(
        select(ShoppingExtraPrinting).where(
            ShoppingExtraPrinting.user_id == user.id,
            ShoppingExtraPrinting.card_id == card_id,
        )
    ).all()
    if picks:
        _apply_alt_want_clamp_to_rows(picks, qty)
        _delete_zero_printing_rows(db, picks)
    db.commit()
    return qty
