"""Business logic for decks, owned, and shopping views."""

from __future__ import annotations

import json
import secrets
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.domain import (
    DON_DECK_LIMIT,
    MAIN_DECK_LIMIT,
    ParsedCard,
    deck_size_counts,
    find_leader_id,
    is_don_card,
    parse_cost,
    parse_decklist,
)
from app.models import (
    CatalogCard,
    CatalogPrinting,
    Deck,
    DeckCard,
    DeckCardPrinting,
    Owned,
    ShareLink,
    User,
)
from app.schemas import (
    CardView,
    CatalogCardResult,
    DeckDetail,
    DeckSummary,
    PrintingView,
    PublicShoppingResponse,
    ShareInfo,
    ShoppingItem,
    ShoppingResponse,
)


class DeckOversizeError(Exception):
    """Raised when adding would push the main deck past MAIN_DECK_LIMIT without confirm."""

    def __init__(self, *, current: int, projected: int, limit: int = MAIN_DECK_LIMIT):
        self.current = current
        self.projected = projected
        self.limit = limit
        super().__init__(
            f"Deck would have {projected} cards (limit {limit}: 50 + 1 leader). Confirm to continue."
        )


def _catalog_map(db: Session, card_ids: set[str]) -> dict[str, CatalogCard]:
    if not card_ids:
        return {}
    rows = db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
    return {r.card_id: r for r in rows}


def _alt_arts_map(
    db: Session,
    card_ids: set[str],
    wanted: dict[str, dict[int, int]] | None = None,
) -> dict[str, list[PrintingView]]:
    """Special/alt printings for each card number (excludes the primary catalog row art)."""
    if not card_ids:
        return {}
    rows = db.scalars(
        select(CatalogPrinting).where(
            CatalogPrinting.card_id.in_(card_ids),
            CatalogPrinting.is_special == 1,
        )
    ).all()
    want = wanted or {}
    out: dict[str, list[PrintingView]] = defaultdict(list)
    for row in rows:
        out[row.card_id].append(
            PrintingView(
                product_id=row.product_id,
                name=row.name,
                market_price=row.market_price,
                low_price=row.low_price,
                image_url=row.image_url,
                tcgplayer_url=row.tcgplayer_url,
                group_name=row.group_name,
                is_special=True,
                wanted=int(want.get(row.card_id, {}).get(row.product_id, 0)),
            )
        )
    for card_id in out:
        out[card_id].sort(
            key=lambda p: (
                p.market_price is None,
                p.market_price if p.market_price is not None else 1e9,
                p.product_id,
            )
        )
    return out


def _printing_wants_for_decks(
    db: Session, deck_ids: list[int]
) -> dict[int, dict[str, dict[int, int]]]:
    """deck_id -> card_id -> product_id -> qty."""
    if not deck_ids:
        return {}
    rows = db.scalars(
        select(DeckCardPrinting).where(DeckCardPrinting.deck_id.in_(deck_ids))
    ).all()
    out: dict[int, dict[str, dict[int, int]]] = defaultdict(lambda: defaultdict(dict))
    for row in rows:
        if row.qty > 0:
            out[row.deck_id][row.card_id][row.product_id] = row.qty
    return out


def clamp_alt_want_map(wants: dict[int, int], limit: int) -> dict[int, int]:
    """Reduce alt wants so sum(qty) <= limit, cutting largest counts first."""
    if limit < 0:
        limit = 0
    total = sum(max(0, q) for q in wants.values())
    if total <= limit:
        return {pid: q for pid, q in wants.items() if q > 0}
    # Largest qty first; stable by product_id for determinism.
    items = sorted(wants.items(), key=lambda x: (-max(0, x[1]), x[0]))
    excess = total - limit
    result = {pid: max(0, q) for pid, q in wants.items()}
    for pid, qty in items:
        if excess <= 0:
            break
        reduce_by = min(qty, excess)
        result[pid] = qty - reduce_by
        excess -= reduce_by
    return {pid: q for pid, q in result.items() if q > 0}


def _apply_alt_want_clamp_to_rows(
    rows: list[DeckCardPrinting], limit: int
) -> None:
    """Mutate/delete ORM rows so their qty sum fits limit (largest first)."""
    wants = {r.product_id: r.qty for r in rows if r.qty > 0}
    clamped = clamp_alt_want_map(wants, limit)
    for row in rows:
        new_qty = clamped.get(row.product_id, 0)
        if new_qty <= 0:
            row.qty = 0
        elif row.qty != new_qty:
            row.qty = new_qty


def _delete_zero_printing_rows(db: Session, rows: list[DeckCardPrinting]) -> None:
    for row in rows:
        if row.qty <= 0:
            db.delete(row)


def _clear_deck_card_printings(db: Session, deck_id: int, card_id: str) -> None:
    rows = db.scalars(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id,
            DeckCardPrinting.card_id == card_id,
        )
    ).all()
    for row in rows:
        db.delete(row)


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


def _owned_map(db: Session, user_id: int) -> dict[str, int]:
    rows = db.scalars(select(Owned).where(Owned.user_id == user_id)).all()
    return {r.card_id: r.qty for r in rows}


def _primary_product_ids(db: Session, card_ids: set[str]) -> dict[str, int]:
    """Preferred TCGPlayer product id per card number (standard printing, then cheapest)."""
    if not card_ids:
        return {}
    rows = db.scalars(select(CatalogPrinting).where(CatalogPrinting.card_id.in_(card_ids))).all()
    best: dict[str, tuple[tuple, int]] = {}
    for row in rows:
        key = (
            int(row.is_special or 0),
            row.market_price is None,
            row.market_price if row.market_price is not None else 1e9,
            row.product_id,
        )
        prev = best.get(row.card_id)
        if prev is None or key < prev[0]:
            best[row.card_id] = (key, row.product_id)
    return {card_id: pair[1] for card_id, pair in best.items()}


def _card_view(
    card_id: str,
    needed: int,
    owned: int,
    cat: CatalogCard | None,
    section: str,
    alt_arts: list[PrintingView] | None = None,
    product_id: int | None = None,
) -> CardView:
    cost = parse_cost(cat.cost) if cat else None
    return CardView(
        card_id=card_id,
        name=cat.name if cat else "(not in catalog)",
        rarity=cat.rarity if cat else "",
        color=cat.color if cat else "",
        card_type=cat.card_type if cat else "",
        cost=cost,
        needed=needed,
        owned=owned,
        still_need=max(0, needed - owned),
        market_price=cat.market_price if cat else None,
        low_price=cat.low_price if cat else None,
        image_url=cat.image_url if cat else "",
        tcgplayer_url=cat.tcgplayer_url if cat else "",
        product_id=product_id,
        section=section,
        alt_arts=alt_arts or [],
    )


def _deck_card_lines(deck: Deck) -> list[ParsedCard]:
    return [ParsedCard(card_id=c.card_id, needed=c.needed) for c in deck.cards]


def _same_leader_decks(decks: list[Deck], leader_card_id: str | None) -> list[Deck]:
    if not leader_card_id:
        return []
    return [d for d in decks if d.leader_card_id == leader_card_id]


def _resolve_main_deck(decks: list[Deck], leader_card_id: str | None) -> Deck | None:
    """Pick the Main deck for a leader: explicit is_main, else earliest sort_order."""
    group = _same_leader_decks(decks, leader_card_id)
    if not group:
        return None
    marked = [d for d in group if d.is_main]
    if marked:
        # Prefer earliest marked if data ever has more than one.
        return min(marked, key=lambda d: (d.sort_order, d.id))
    return min(group, key=lambda d: (d.sort_order, d.id))


def _clear_main_flags(db: Session, user_id: int, leader_card_id: str, *, except_id: int | None = None) -> None:
    stmt = select(Deck).where(
        Deck.user_id == user_id,
        Deck.leader_card_id == leader_card_id,
        Deck.is_main.is_(True),
    )
    if except_id is not None:
        stmt = stmt.where(Deck.id != except_id)
    for deck in db.scalars(stmt).all():
        deck.is_main = False


def list_decks(db: Session, user: User) -> list[DeckSummary]:
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    all_ids = {c.card_id for d in decks for c in d.cards}
    leader_ids = {d.leader_card_id for d in decks if d.leader_card_id}
    catalog = _catalog_map(db, all_ids | leader_ids)
    main_by_leader: dict[str, int] = {}
    for leader_id in leader_ids:
        main = _resolve_main_deck(decks, leader_id)
        if main is not None:
            main_by_leader[leader_id] = main.id
    out: list[DeckSummary] = []
    for deck in decks:
        leader = catalog.get(deck.leader_card_id) if deck.leader_card_id else None
        main_cards, don_cards = deck_size_counts(_deck_card_lines(deck), catalog)
        is_main = bool(
            deck.leader_card_id and main_by_leader.get(deck.leader_card_id) == deck.id
        )
        out.append(
            DeckSummary(
                id=deck.id,
                name=deck.name,
                leader_card_id=deck.leader_card_id,
                leader_name=leader.name if leader else None,
                leader_image_url=leader.image_url if leader else "",
                card_count=len(deck.cards),
                total_cards=main_cards,
                main_cards=main_cards,
                don_cards=don_cards,
                sort_order=deck.sort_order,
                is_main=is_main,
            )
        )
    return out


def create_deck(db: Session, user: User, name: str, decklist: str) -> Deck:
    parsed = parse_decklist(decklist)
    catalog = _catalog_map(db, {c.card_id for c in parsed})
    leader_id = find_leader_id(parsed, catalog)

    max_order = db.scalar(
        select(Deck.sort_order).where(Deck.user_id == user.id).order_by(Deck.sort_order.desc())
    )
    # First deck for this leader becomes Main so Additional Cards works immediately.
    is_main = False
    if leader_id:
        existing_same = db.scalar(
            select(Deck.id).where(
                Deck.user_id == user.id,
                Deck.leader_card_id == leader_id,
            )
        )
        is_main = existing_same is None
    deck = Deck(
        user_id=user.id,
        name=name.strip(),
        leader_card_id=leader_id,
        is_main=is_main,
        sort_order=(max_order or 0) + 1,
    )
    db.add(deck)
    db.flush()
    for card in parsed:
        db.add(DeckCard(deck_id=deck.id, card_id=card.card_id, needed=card.needed))
    db.commit()
    db.refresh(deck)
    # Open group buys with an explicit deck filter should pick up new imports.
    # (Null contribution already means "all decks".)
    from app import group_buy

    group_buy.include_deck_in_open_group_buys(db, user, deck.id)
    return deck


def delete_deck(db: Session, user: User, deck_id: int) -> None:
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise LookupError("Deck not found")
    leader_id = deck.leader_card_id
    was_main = bool(deck.is_main)
    db.delete(deck)
    db.flush()
    if was_main and leader_id:
        remaining = db.scalars(
            select(Deck)
            .where(Deck.user_id == user.id, Deck.leader_card_id == leader_id)
            .order_by(Deck.sort_order, Deck.id)
        ).all()
        if remaining:
            remaining[0].is_main = True
    db.commit()


def set_deck_as_main(db: Session, user: User, deck_id: int) -> DeckDetail:
    """Mark this deck as Main for its leader; other same-leader decks compare against it."""
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise LookupError("Deck not found")
    if not deck.leader_card_id:
        raise ValueError("Deck has no leader — cannot set as Main")
    _clear_main_flags(db, user.id, deck.leader_card_id, except_id=deck.id)
    deck.is_main = True
    db.commit()
    return get_deck_detail(db, user, deck_id)


def get_deck_detail(db: Session, user: User, deck_id: int) -> DeckDetail:
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    target = next((d for d in decks if d.id == deck_id), None)
    if target is None:
        raise LookupError("Deck not found")

    owned = _owned_map(db, user.id)
    all_ids = {c.card_id for d in decks for c in d.cards}
    catalog = _catalog_map(db, all_ids)
    deck_wants = _printing_wants_for_decks(db, [target.id]).get(target.id, {})
    alts = _alt_arts_map(db, all_ids, wanted=deck_wants)
    product_ids = _primary_product_ids(db, all_ids)

    baseline = _resolve_main_deck(decks, target.leader_card_id)
    is_main = baseline is not None and baseline.id == target.id
    prior_ids: set[str] = set()
    prior_names: list[str] = []
    if baseline is not None and not is_main:
        prior_names = [baseline.name]
        prior_ids = {c.card_id for c in baseline.cards}

    cards: list[CardView] = []
    for card in target.cards:
        cat = catalog.get(card.card_id)
        if is_don_card(cat):
            section = "don"
        elif not prior_ids:
            section = "main"
        elif card.card_id not in prior_ids:
            section = "additional"
        else:
            section = "main"
        cards.append(
            _card_view(
                card.card_id,
                card.needed,
                owned.get(card.card_id, 0),
                cat,
                section,
                alts.get(card.card_id, []),
                product_ids.get(card.card_id),
            )
        )

    leader_name = None
    if target.leader_card_id and target.leader_card_id in catalog:
        leader_name = catalog[target.leader_card_id].name

    main_cards, don_cards = deck_size_counts(_deck_card_lines(target), catalog)

    return DeckDetail(
        id=target.id,
        name=target.name,
        leader_card_id=target.leader_card_id,
        leader_name=leader_name,
        prior_decks=prior_names,
        is_main=is_main,
        cards=cards,
        main_cards=main_cards,
        don_cards=don_cards,
    )


def search_catalog(
    db: Session,
    *,
    q: str = "",
    color: str = "",
    card_type: str = "",
    limit: int = 40,
) -> list[CatalogCardResult]:
    """Search preferred catalog printings by name, id, color, type, rarity, or set."""
    limit = max(1, min(limit, 100))
    stmt = select(CatalogCard)
    filters = []
    query = (q or "").strip()
    if query:
        like = f"%{query}%"
        filters.append(
            or_(
                CatalogCard.card_id.ilike(like),
                CatalogCard.name.ilike(like),
                CatalogCard.color.ilike(like),
                CatalogCard.card_type.ilike(like),
                CatalogCard.rarity.ilike(like),
                CatalogCard.group_name.ilike(like),
            )
        )
    color_q = (color or "").strip()
    if color_q:
        filters.append(CatalogCard.color.ilike(f"%{color_q}%"))
    type_q = (card_type or "").strip()
    if type_q:
        filters.append(CatalogCard.card_type.ilike(f"%{type_q}%"))
    if filters:
        stmt = stmt.where(*filters)
    # Prefer exact id matches, then cheaper market price, then name.
    q_upper = query.upper()
    order = [
        CatalogCard.market_price.is_(None),
        CatalogCard.market_price.asc(),
        CatalogCard.name.asc(),
        CatalogCard.card_id.asc(),
    ]
    if query:
        order.insert(0, (func.upper(CatalogCard.card_id) == q_upper).desc())
    stmt = stmt.order_by(*order).limit(limit)
    rows = db.scalars(stmt).all()
    return [
        CatalogCardResult(
            card_id=row.card_id,
            name=row.name,
            rarity=row.rarity or "",
            color=row.color or "",
            card_type=row.card_type or "",
            cost=parse_cost(row.cost),
            market_price=row.market_price,
            low_price=row.low_price,
            image_url=row.image_url or "",
            tcgplayer_url=row.tcgplayer_url or "",
            group_name=row.group_name or "",
        )
        for row in rows
    ]


def upsert_deck_card(
    db: Session,
    user: User,
    deck_id: int,
    card_id: str,
    needed: int,
    *,
    confirm_oversize: bool = False,
) -> DeckDetail:
    """Set absolute needed count for a card in a deck (0 removes)."""
    card_id = card_id.strip().upper()
    if not card_id:
        raise ValueError("card_id is required")
    if needed < 0:
        raise ValueError("needed must be >= 0")

    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise LookupError("Deck not found")

    existing = next((c for c in deck.cards if c.card_id == card_id), None)
    catalog_ids = {c.card_id for c in deck.cards} | {card_id}
    catalog = _catalog_map(db, catalog_ids)

    projected: dict[str, int] = {c.card_id: c.needed for c in deck.cards}
    if needed <= 0:
        projected.pop(card_id, None)
    else:
        projected[card_id] = needed
    projected_lines = [ParsedCard(card_id=cid, needed=qty) for cid, qty in projected.items()]

    main_now, _don_now = deck_size_counts(_deck_card_lines(deck), catalog)
    main_projected, don_projected = deck_size_counts(projected_lines, catalog)

    if don_projected > DON_DECK_LIMIT:
        raise ValueError(
            f"DON!! deck would have {don_projected} cards (maximum {DON_DECK_LIMIT})"
        )

    # Only prompt when crossing the 51-card limit. Once the deck is already over
    # size (user confirmed), further adds do not re-prompt until it drops to 51
    # or below again.
    if (
        main_projected > MAIN_DECK_LIMIT
        and main_now <= MAIN_DECK_LIMIT
        and not confirm_oversize
    ):
        raise DeckOversizeError(current=main_now, projected=main_projected)

    if needed <= 0:
        if existing is not None:
            db.delete(existing)
        _clear_deck_card_printings(db, deck.id, card_id)
    elif existing is None:
        db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=needed))
    else:
        existing.needed = needed
        # Auto-clamp alt wants when Need drops below their sum.
        printing_rows = db.scalars(
            select(DeckCardPrinting).where(
                DeckCardPrinting.deck_id == deck.id,
                DeckCardPrinting.card_id == card_id,
            )
        ).all()
        if printing_rows:
            _apply_alt_want_clamp_to_rows(printing_rows, needed)
            _delete_zero_printing_rows(db, printing_rows)

    prev_leader = deck.leader_card_id
    was_main = bool(deck.is_main)
    new_leader = find_leader_id(projected_lines, catalog)
    deck.leader_card_id = new_leader
    if prev_leader != new_leader:
        deck.is_main = False
        db.flush()
        if was_main and prev_leader:
            remaining = db.scalars(
                select(Deck)
                .where(
                    Deck.user_id == user.id,
                    Deck.leader_card_id == prev_leader,
                    Deck.id != deck.id,
                )
                .order_by(Deck.sort_order, Deck.id)
            ).all()
            if remaining and not any(d.is_main for d in remaining):
                remaining[0].is_main = True
        if new_leader:
            peers = db.scalars(
                select(Deck).where(
                    Deck.user_id == user.id,
                    Deck.leader_card_id == new_leader,
                    Deck.id != deck.id,
                )
            ).all()
            if not peers:
                deck.is_main = True
    elif not new_leader:
        deck.is_main = False
    db.commit()
    return get_deck_detail(db, user, deck_id)


def set_deck_card_printing(
    db: Session,
    user: User,
    deck_id: int,
    card_id: str,
    product_id: int,
    qty: int,
) -> DeckDetail:
    """Set alt-art want qty for a card in a deck. Sum of alts cannot exceed needed."""
    card_id = card_id.strip().upper()
    if not card_id:
        raise ValueError("card_id is required")
    if qty < 0:
        raise ValueError("qty must be >= 0")
    if product_id <= 0:
        raise ValueError("product_id must be positive")

    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise LookupError("Deck not found")

    deck_card = next((c for c in deck.cards if c.card_id == card_id), None)
    if deck_card is None:
        raise LookupError("Card not in deck")

    _assert_special_printing(db, card_id, product_id)
    _write_deck_printing_qty(
        db,
        deck_id=deck.id,
        card_id=card_id,
        product_id=product_id,
        qty=qty,
        needed=deck_card.needed,
        strict=True,
    )
    db.commit()
    return get_deck_detail(db, user, deck_id)


def set_user_card_printing(
    db: Session,
    user: User,
    card_id: str,
    product_id: int,
    qty: int,
    deck_ids: list[int] | None = None,
) -> tuple[int, int]:
    """Set alt-art want on every matching deck (clamped per deck Need).

    Returns (max_qty_stored, decks_updated). Used by shopping / group buy so all
    views stay synced.
    """
    card_id = card_id.strip().upper()
    if not card_id:
        raise ValueError("card_id is required")
    if qty < 0:
        raise ValueError("qty must be >= 0")
    if product_id <= 0:
        raise ValueError("product_id must be positive")

    _assert_special_printing(db, card_id, product_id)

    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    if deck_ids is not None:
        wanted = set(deck_ids)
        decks = [d for d in decks if d.id in wanted]

    max_stored = 0
    updated = 0
    for deck in decks:
        deck_card = next((c for c in deck.cards if c.card_id == card_id), None)
        if deck_card is None:
            continue
        stored = _write_deck_printing_qty(
            db,
            deck_id=deck.id,
            card_id=card_id,
            product_id=product_id,
            qty=qty,
            needed=deck_card.needed,
            strict=False,
        )
        max_stored = max(max_stored, stored)
        updated += 1

    if updated == 0:
        raise LookupError("Card not in any selected deck")

    db.commit()
    return max_stored, updated


def _assert_special_printing(db: Session, card_id: str, product_id: int) -> None:
    printing = db.scalar(
        select(CatalogPrinting).where(
            CatalogPrinting.card_id == card_id,
            CatalogPrinting.product_id == product_id,
            CatalogPrinting.is_special == 1,
        )
    )
    if printing is None:
        raise ValueError("Unknown alt printing for this card")


def _write_deck_printing_qty(
    db: Session,
    *,
    deck_id: int,
    card_id: str,
    product_id: int,
    qty: int,
    needed: int,
    strict: bool,
) -> int:
    """Write one deck's alt want. Returns qty stored (may be clamped when not strict)."""
    others = db.scalars(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id,
            DeckCardPrinting.card_id == card_id,
            DeckCardPrinting.product_id != product_id,
        )
    ).all()
    others_sum = sum(r.qty for r in others)
    if others_sum + qty > needed:
        if strict:
            raise ValueError(
                f"Alt art wants cannot exceed Need ({needed}): "
                f"{others_sum} other + {qty} would be {others_sum + qty}"
            )
        qty = max(0, needed - others_sum)

    row = db.scalar(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id,
            DeckCardPrinting.card_id == card_id,
            DeckCardPrinting.product_id == product_id,
        )
    )
    if qty <= 0:
        if row is not None:
            db.delete(row)
        return 0
    if row is None:
        db.add(
            DeckCardPrinting(
                deck_id=deck_id,
                card_id=card_id,
                product_id=product_id,
                qty=qty,
            )
        )
    else:
        row.qty = qty
    return qty


def _leader_group_id(deck: Deck) -> str:
    """Group decks that share a leader; each leaderless deck is its own group."""
    if deck.leader_card_id:
        return deck.leader_card_id
    return f"__deck_{deck.id}"


def shopping_list(
    db: Session,
    user: User,
    deck_ids: list[int] | None = None,
) -> ShoppingResponse:
    """Master shopping list for a user.

    Need per card is the MAX copies required by any single selected deck
    (not the sum across decks). Owned is shared, so still_need = max(0, need − owned).
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
    need: dict[str, int] = {}
    used_in: dict[str, list[str]] = defaultdict(list)
    card_deck_indexes: dict[str, list[int]] = defaultdict(list)
    for deck_idx, deck in enumerate(decks):
        seen_in_deck: set[str] = set()
        for card in deck.cards:
            # Max across decks — sharing a playset covers every list that uses it.
            need[card.card_id] = max(need.get(card.card_id, 0), card.needed)
            if deck.name not in used_in[card.card_id]:
                used_in[card.card_id].append(deck.name)
            if card.card_id not in seen_in_deck:
                card_deck_indexes[card.card_id].append(deck_idx)
                seen_in_deck.add(card.card_id)

    # Leader group order = earliest selected deck for that leader.
    leader_group_rank: dict[str, int] = {}
    leader_deck_indexes: dict[str, list[int]] = defaultdict(list)
    for deck_idx, deck in enumerate(decks):
        group = _leader_group_id(deck)
        if group not in leader_group_rank:
            leader_group_rank[group] = deck_idx
        leader_deck_indexes[group].append(deck_idx)

    owned = _owned_map(db, user.id)
    catalog = _catalog_map(db, set(need))
    product_ids = _primary_product_ids(db, set(need))

    # Max alt-want per product across selected decks, then clamp sum to shopping need.
    wants_by_deck = _printing_wants_for_decks(db, [d.id for d in decks])
    merged_wants: dict[str, dict[int, int]] = defaultdict(dict)
    for deck in decks:
        for card_id, by_pid in wants_by_deck.get(deck.id, {}).items():
            for pid, qty in by_pid.items():
                prev = merged_wants[card_id].get(pid, 0)
                if qty > prev:
                    merged_wants[card_id][pid] = qty
    for card_id, by_pid in list(merged_wants.items()):
        merged_wants[card_id] = clamp_alt_want_map(by_pid, need.get(card_id, 0))

    alts = _alt_arts_map(db, set(need), wanted=merged_wants)
    items: list[ShoppingItem] = []
    cards_still = 0
    remaining = 0.0
    for card_id in sorted(need):
        qty_need = need[card_id]
        qty_owned = owned.get(card_id, 0)
        still = max(0, qty_need - qty_owned)
        cat = catalog.get(card_id)
        market = cat.market_price if cat else None
        card_alts = alts.get(card_id, [])
        alt_buy_inputs = [
            (a.product_id, a.wanted, a.market_price) for a in card_alts if a.wanted > 0
        ]
        buys = allocate_still_need_buys(
            still,
            alt_buy_inputs,
            standard_product_id=product_ids.get(card_id),
            standard_price=market,
        )
        line = remaining_cost_for_buys(buys)
        cards_still += still
        if line is not None:
            remaining += line

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

        leader_ids = {
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
                still_need=still,
                market_price=market,
                low_price=cat.low_price if cat else None,
                remaining_cost=line,
                image_url=cat.image_url if cat else "",
                tcgplayer_url=cat.tcgplayer_url if cat else "",
                product_id=product_ids.get(card_id),
                used_in=used_in[card_id],
                alt_arts=card_alts,
                deck_sort_key=deck_sort_key,
                primary_leader_card_id=primary_leader_card_id,
                primary_leader_name=primary_leader_name,
                leader_count=max(1, len(leader_ids)),
            )
        )
    return ShoppingResponse(
        items=items,
        cards_still_needed=cards_still,
        remaining_market=round(remaining, 2),
        unique_cards=len(items),
    )


def set_owned(db: Session, user: User, card_id: str, qty: int) -> int:
    card_id = card_id.upper().strip()
    row = db.scalar(
        select(Owned).where(Owned.user_id == user.id, Owned.card_id == card_id)
    )
    if row is None:
        row = Owned(user_id=user.id, card_id=card_id, qty=qty)
        db.add(row)
    else:
        row.qty = qty
    db.commit()
    return row.qty


def reset_deck_owned(db: Session, user: User, deck_id: int) -> tuple[int, DeckDetail]:
    """Set Owned qty to 0 for every card_id present in the deck.

    Owned is shared across decks, so this also clears those cards elsewhere.
    """
    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise LookupError("Deck not found")

    card_ids = {c.card_id for c in deck.cards}
    reset_count = 0
    if card_ids:
        rows = db.scalars(
            select(Owned).where(Owned.user_id == user.id, Owned.card_id.in_(card_ids))
        ).all()
        for row in rows:
            if row.qty != 0:
                row.qty = 0
                reset_count += 1
        if reset_count:
            db.commit()

    detail = get_deck_detail(db, user, deck_id)
    return reset_count, detail


def _share_deck_ids(link: ShareLink) -> list[int] | None:
    if not link.deck_ids_json:
        return None
    try:
        parsed = json.loads(link.deck_ids_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    out: list[int] = []
    for x in parsed:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out or None


def _share_info(link: ShareLink) -> ShareInfo:
    return ShareInfo(
        token=link.token,
        kind=link.kind,
        deck_id=link.deck_id,
        deck_ids=_share_deck_ids(link),
        path=f"/share/{link.token}",
    )


def create_or_update_share(
    db: Session,
    user: User,
    kind: str,
    deck_id: int | None = None,
    deck_ids: list[int] | None = None,
) -> ShareInfo:
    kind = (kind or "shopping").strip().lower()
    if kind not in {"shopping", "deck"}:
        raise ValueError("kind must be shopping or deck")

    if kind == "deck":
        if deck_id is None:
            raise ValueError("deck_id is required for deck shares")
        deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
        if deck is None:
            raise LookupError("Deck not found")
        existing = db.scalar(
            select(ShareLink).where(
                ShareLink.user_id == user.id,
                ShareLink.kind == "deck",
                ShareLink.deck_id == deck_id,
                ShareLink.revoked_at.is_(None),
            )
        )
        if existing:
            return _share_info(existing)
        link = ShareLink(
            user_id=user.id,
            token=secrets.token_urlsafe(18),
            kind="deck",
            deck_id=deck_id,
            deck_ids_json=None,
        )
        db.add(link)
        db.commit()
        db.refresh(link)
        return _share_info(link)

    # shopping — reuse one active link per user; refresh deck filter if provided
    existing = db.scalar(
        select(ShareLink).where(
            ShareLink.user_id == user.id,
            ShareLink.kind == "shopping",
            ShareLink.revoked_at.is_(None),
        )
    )
    deck_ids_json = json.dumps(sorted(set(deck_ids))) if deck_ids else None
    if existing:
        existing.deck_ids_json = deck_ids_json
        db.commit()
        db.refresh(existing)
        return _share_info(existing)

    link = ShareLink(
        user_id=user.id,
        token=secrets.token_urlsafe(18),
        kind="shopping",
        deck_id=None,
        deck_ids_json=deck_ids_json,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _share_info(link)


def revoke_share(db: Session, user: User, token: str) -> None:
    link = db.scalar(
        select(ShareLink).where(ShareLink.token == token, ShareLink.user_id == user.id)
    )
    if link is None:
        raise LookupError("Share link not found")
    if link.revoked_at is None:
        link.revoked_at = datetime.now(timezone.utc)
        db.commit()


def get_active_shopping_share(db: Session, user: User) -> ShareInfo | None:
    link = db.scalar(
        select(ShareLink).where(
            ShareLink.user_id == user.id,
            ShareLink.kind == "shopping",
            ShareLink.revoked_at.is_(None),
        )
    )
    return _share_info(link) if link else None


def public_share_view(db: Session, token: str) -> PublicShoppingResponse:
    link = db.scalar(
        select(ShareLink).where(ShareLink.token == token, ShareLink.revoked_at.is_(None))
    )
    if link is None:
        raise LookupError("Share link not found")
    owner = db.get(User, link.user_id)
    if owner is None:
        raise LookupError("Share link not found")
    owner_name = (owner.name or owner.email.split("@")[0] or "Collector").strip()

    if link.kind == "deck":
        if link.deck_id is None:
            raise LookupError("Share link not found")
        detail = get_deck_detail(db, owner, link.deck_id)
        items: list[ShoppingItem] = []
        cards_still = 0
        remaining = 0.0
        for card in detail.cards:
            line = (
                (card.still_need * card.market_price)
                if card.market_price is not None
                else None
            )
            cards_still += card.still_need
            if line is not None:
                remaining += line
            items.append(
                ShoppingItem(
                    card_id=card.card_id,
                    name=card.name,
                    rarity=card.rarity,
                    color=card.color,
                    card_type=card.card_type,
                    cost=card.cost,
                    need=card.needed,
                    owned=card.owned,
                    still_need=card.still_need,
                    market_price=card.market_price,
                    low_price=card.low_price,
                    remaining_cost=line,
                    image_url=card.image_url,
                    tcgplayer_url=card.tcgplayer_url,
                    product_id=card.product_id,
                    used_in=[detail.name],
                    alt_arts=card.alt_arts,
                    primary_leader_card_id=detail.leader_card_id,
                    primary_leader_name=detail.leader_name,
                    leader_count=1,
                )
            )
        return PublicShoppingResponse(
            items=items,
            cards_still_needed=cards_still,
            remaining_market=round(remaining, 2),
            unique_cards=len(items),
            owner_name=owner_name,
            kind="deck",
            deck_name=detail.name,
        )

    shopping = shopping_list(db, owner, deck_ids=_share_deck_ids(link))
    return PublicShoppingResponse(
        items=shopping.items,
        cards_still_needed=shopping.cards_still_needed,
        remaining_market=shopping.remaining_market,
        unique_cards=shopping.unique_cards,
        owner_name=owner_name,
        kind="shopping",
        deck_name=None,
    )
