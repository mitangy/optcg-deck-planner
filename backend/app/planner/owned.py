"""Owned collection, alt-art owned counts and per-user printing choices."""

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
    DeckCard,
    Owned,
    CardDisplayChoice,
    CollectorWant,
    OwnedPrinting,
    ShoppingExtra,
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
    DeckDetail,
    OwnedCardItem,
    OwnedCollectionResponse,
)
from app.planner.decks import (
    get_deck_detail,
)
from app.planner.printings import (
    _alts_owned_total,
    _assert_special_printing,
    _collector_map,
    _display_choice_map,
    _leader_group_id,
    _write_deck_printing_qty,
    _write_extra_printing_qty,
)
from app.planner.shopping import (
    shopping_list,
)


def set_user_card_printing(
    db: Session,
    user: User,
    card_id: str,
    product_id: int,
    qty: int,
    deck_ids: list[int] | None = None,
) -> tuple[int, int]:
    """Set a shopping-level alt-art want across the matching decks.

    Default (max across decks): every deck gets ``qty`` clamped to its own Need,
    so the shopping max equals what was asked for (or the most any deck fits).

    With ``user.sum_across_leaders`` shopping adds leaders together, so writing
    ``qty`` to every deck would double-count. Instead ``qty`` is split across
    leader groups in deck order (fill the first leader up to what it fits, then
    the next); decks sharing a leader get the same value, and leftover groups
    are cleared.

    Returns (qty as shopping will now show it, decks_updated). Used by shopping /
    group buy so all views stay synced.
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

    # Leader groups in deck order, each holding the decks that use this card.
    groups: dict[str, list[tuple[Deck, DeckCard]]] = {}
    for deck in decks:
        deck_card = next((c for c in deck.cards if c.card_id == card_id), None)
        if deck_card is not None:
            groups.setdefault(_leader_group_id(deck), []).append((deck, deck_card))
    extra = db.scalar(
        select(ShoppingExtra).where(
            ShoppingExtra.user_id == user.id,
            ShoppingExtra.card_id == card_id,
            ShoppingExtra.qty > 0,
        )
    )
    if not groups and extra is None:
        raise LookupError("Card not in any selected deck")

    sum_leaders = bool(getattr(user, "sum_across_leaders", False))
    remaining = qty
    shown = 0
    updated = 0
    for members in groups.values():
        target = remaining if sum_leaders else qty
        group_stored = 0
        for deck, deck_card in members:
            stored = _write_deck_printing_qty(
                db,
                deck_id=deck.id,
                card_id=card_id,
                product_id=product_id,
                qty=target,
                needed=deck_card.needed,
                strict=False,
            )
            group_stored = max(group_stored, stored)
            updated += 1
        if sum_leaders:
            remaining -= group_stored
            shown += group_stored
        else:
            shown = max(shown, group_stored)

    if extra is not None:
        stored = _write_extra_printing_qty(db, user.id, card_id, product_id, qty, extra.qty)
        shown = max(shown, stored)

    db.commit()
    return shown, updated


def owned_collection(
    db: Session, user: User, deck_ids: list[int] | None = None
) -> OwnedCollectionResponse:
    """Every card the user owns (qty > 0) with its estimated market value.

    Base copies are tracked per card number and valued at the standard
    printing's market price (the same price the shopping list shows). Alt-art
    copies are tracked per printing: each is valued at its own market price, and
    a card owned only through alts is listed too. ``owned`` is base copies;
    ``alts_owned`` is alt copies; total_copies counts both.
    """
    base = {card_id: qty for card_id, qty in owned_map(db, user.id).items() if qty > 0}
    alt_owned = alt_owned_map(db, user.id)
    card_ids = set(base) | set(alt_owned)
    # Every alt printing of these cards (owned or not) with the user's count, and the art they chose to show.
    alts = alt_arts_map(db, card_ids, owned=alt_owned, collector=_collector_map(db, user.id))
    display_choices = _display_choice_map(db, user.id)
    # Still-to-buy copies on the list for the ticked decks (+ directly added cards).
    buying = {
        item.card_id: item.still_need
        for item in shopping_list(db, user, deck_ids=deck_ids).items
        if item.still_need > 0
    }
    catalog = catalog_map(db, card_ids)
    product_ids = primary_product_ids(db, card_ids)
    alt_prices: dict[int, float | None] = {}
    if alt_owned:
        pids = {pid for by_pid in alt_owned.values() for pid in by_pid}
        for row in db.scalars(
            select(CatalogPrinting).where(CatalogPrinting.product_id.in_(pids))
        ).all():
            alt_prices[row.product_id] = row.market_price
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    used_in: dict[str, list[str]] = defaultdict(list)
    for deck in decks:
        for card in deck.cards:
            if card.card_id in card_ids and deck.name not in used_in[card.card_id]:
                used_in[card.card_id].append(deck.name)

    items: list[OwnedCardItem] = []
    total_value = 0.0
    unpriced = 0
    for card_id in sorted(card_ids):
        qty = base.get(card_id, 0)
        alt_qty = _alts_owned_total(alt_owned, card_id)
        cat = catalog.get(card_id)
        market = cat.market_price if cat else None
        value: float | None = 0.0
        if qty > 0:
            value = round(qty * market, 2) if market is not None else None
        for pid, n in alt_owned.get(card_id, {}).items():
            price = alt_prices.get(pid)
            if value is None or price is None:
                value = None
            else:
                value = round(value + n * price, 2)
        if value is None:
            unpriced += 1
        else:
            total_value += value
        items.append(
            OwnedCardItem(
                card_id=card_id,
                name=cat.name if cat else "(not in catalog)",
                rarity=cat.rarity if cat else "",
                color=cat.color if cat else "",
                card_type=cat.card_type if cat else "",
                cost=parse_cost(cat.cost) if cat else None,
                owned=qty,
                alts_owned=alt_qty,
                market_price=market,
                low_price=cat.low_price if cat else None,
                value=value,
                image_url=cat.image_url if cat else "",
                tcgplayer_url=cat.tcgplayer_url if cat else "",
                product_id=product_ids.get(card_id),
                used_in=used_in.get(card_id, []),
                buying=buying.get(card_id, 0),
                alt_arts=alts.get(card_id, []),
                display_art=display_choices.get(card_id),
            )
        )
    return OwnedCollectionResponse(
        items=items,
        unique_cards=len(items),
        total_copies=sum(i.owned + i.alts_owned for i in items),
        total_value=round(total_value, 2),
        unpriced_cards=unpriced,
    )


def set_alt_owned(db: Session, user: User, card_id: str, product_id: int, qty: int) -> int:
    """Set how many copies of one alt printing the user owns (0 removes the row)."""
    card_id = card_id.upper().strip()
    _assert_special_printing(db, card_id, product_id)
    row = db.scalar(
        select(OwnedPrinting).where(
            OwnedPrinting.user_id == user.id,
            OwnedPrinting.card_id == card_id,
            OwnedPrinting.product_id == product_id,
        )
    )
    if qty <= 0:
        if row is not None:
            db.delete(row)
            db.commit()
        return 0
    if row is None:
        db.add(OwnedPrinting(user_id=user.id, card_id=card_id, product_id=product_id, qty=qty))
    else:
        row.qty = qty
    db.commit()
    return qty


def set_collector_want(db: Session, user: User, card_id: str, product_id: int, qty: int) -> int:
    """Set how many collector copies of one alt printing the user wants (0 removes the row)."""
    card_id = card_id.upper().strip()
    _assert_special_printing(db, card_id, product_id)
    row = db.scalar(
        select(CollectorWant).where(
            CollectorWant.user_id == user.id,
            CollectorWant.card_id == card_id,
            CollectorWant.product_id == product_id,
        )
    )
    if qty <= 0:
        if row is not None:
            db.delete(row)
            db.commit()
        return 0
    if row is None:
        db.add(CollectorWant(user_id=user.id, card_id=card_id, product_id=product_id, qty=qty))
    else:
        row.qty = qty
    db.commit()
    return qty


def set_display_art(
    db: Session, user: User, card_id: str, product_id: int | None
) -> int | None:
    """Choose which art a card shows (None = automatic, 0 = base, >0 = printing)."""
    card_id = card_id.upper().strip()
    row = db.scalar(
        select(CardDisplayChoice).where(
            CardDisplayChoice.user_id == user.id,
            CardDisplayChoice.card_id == card_id,
        )
    )
    if product_id is None:
        if row is not None:
            db.delete(row)
            db.commit()
        return None
    if product_id < 0:
        raise ValueError("Invalid display art")
    if product_id > 0:
        printing = db.scalar(
            select(CatalogPrinting).where(
                CatalogPrinting.card_id == card_id,
                CatalogPrinting.product_id == product_id,
            )
        )
        if printing is None:
            raise ValueError("Unknown printing for this card")
    if row is None:
        db.add(CardDisplayChoice(user_id=user.id, card_id=card_id, product_id=product_id))
    else:
        row.product_id = product_id
    db.commit()
    return product_id


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


def add_owned(db: Session, user: User, items: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """Add copies to Owned for several cards in one commit.

    Repeated ids are summed. Unknown card ids reject the whole batch (LookupError)
    so a typo never leaves a partial add.
    """
    wanted: dict[str, int] = {}
    for card_id, add in items:
        key = card_id.upper().strip()
        wanted[key] = wanted.get(key, 0) + add
    for key in wanted:
        if db.get(CatalogCard, key) is None:
            raise LookupError(f"Card not found in catalog: {key}")
    rows = {
        r.card_id: r
        for r in db.scalars(
            select(Owned).where(Owned.user_id == user.id, Owned.card_id.in_(wanted))
        )
    }
    out: list[tuple[str, int]] = []
    for key, add in wanted.items():
        row = rows.get(key)
        if row is None:
            row = Owned(user_id=user.id, card_id=key, qty=add)
            db.add(row)
        else:
            row.qty += add
        out.append((key, row.qty))
    db.commit()
    return out


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
        # Alt copies count as owned too, so "I own none of these" clears them.
        for alt_row in db.scalars(
            select(OwnedPrinting).where(
                OwnedPrinting.user_id == user.id, OwnedPrinting.card_id.in_(card_ids)
            )
        ).all():
            if alt_row.qty != 0:
                alt_row.qty = 0
                reset_count += 1
        if reset_count:
            db.commit()

    detail = get_deck_detail(db, user, deck_id)
    return reset_count, detail
