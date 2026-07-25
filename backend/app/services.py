"""Business logic for decks, owned, and shopping views."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domain import find_leader_id, parse_cost, parse_decklist
from app.models import CatalogCard, CatalogPrinting, Deck, DeckCard, Owned, User
from app.schemas import (
    CardView,
    DeckDetail,
    DeckSummary,
    PrintingView,
    ShoppingItem,
    ShoppingResponse,
)


def _catalog_map(db: Session, card_ids: set[str]) -> dict[str, CatalogCard]:
    if not card_ids:
        return {}
    rows = db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
    return {r.card_id: r for r in rows}


def _alt_arts_map(db: Session, card_ids: set[str]) -> dict[str, list[PrintingView]]:
    """Special/alt printings for each card number (excludes the primary catalog row art)."""
    if not card_ids:
        return {}
    rows = db.scalars(
        select(CatalogPrinting).where(
            CatalogPrinting.card_id.in_(card_ids),
            CatalogPrinting.is_special == 1,
        )
    ).all()
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


def _owned_map(db: Session, user_id: int) -> dict[str, int]:
    rows = db.scalars(select(Owned).where(Owned.user_id == user_id)).all()
    return {r.card_id: r.qty for r in rows}


def _card_view(
    card_id: str,
    needed: int,
    owned: int,
    cat: CatalogCard | None,
    section: str,
    alt_arts: list[PrintingView] | None = None,
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
        section=section,
        alt_arts=alt_arts or [],
    )


def list_decks(db: Session, user: User) -> list[DeckSummary]:
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    out: list[DeckSummary] = []
    for deck in decks:
        out.append(
            DeckSummary(
                id=deck.id,
                name=deck.name,
                leader_card_id=deck.leader_card_id,
                card_count=len(deck.cards),
                total_cards=sum(c.needed for c in deck.cards),
                sort_order=deck.sort_order,
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
    deck = Deck(
        user_id=user.id,
        name=name.strip(),
        leader_card_id=leader_id,
        sort_order=(max_order or 0) + 1,
    )
    db.add(deck)
    db.flush()
    for card in parsed:
        db.add(DeckCard(deck_id=deck.id, card_id=card.card_id, needed=card.needed))
    db.commit()
    db.refresh(deck)
    return deck


def update_deck(
    db: Session,
    user: User,
    deck_id: int,
    name: str | None,
    decklist: str | None,
) -> Deck:
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise LookupError("Deck not found")
    if name is not None:
        deck.name = name.strip()
    if decklist is not None:
        parsed = parse_decklist(decklist)
        catalog = _catalog_map(db, {c.card_id for c in parsed})
        deck.leader_card_id = find_leader_id(parsed, catalog)
        deck.cards.clear()
        db.flush()
        for card in parsed:
            db.add(DeckCard(deck_id=deck.id, card_id=card.card_id, needed=card.needed))
    db.commit()
    db.refresh(deck)
    return deck


def delete_deck(db: Session, user: User, deck_id: int) -> None:
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise LookupError("Deck not found")
    db.delete(deck)
    db.commit()


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
    alts = _alt_arts_map(db, all_ids)

    prior_ids: set[str] = set()
    prior_names: list[str] = []
    if target.leader_card_id:
        for deck in decks:
            if deck.id == target.id:
                break
            if deck.leader_card_id == target.leader_card_id:
                prior_names.append(deck.name)
                prior_ids.update(c.card_id for c in deck.cards)

    cards: list[CardView] = []
    for card in target.cards:
        section = "additional" if prior_ids and card.card_id not in prior_ids else "main"
        # If this is the first deck for the leader, everything is main
        if not prior_ids:
            section = "main"
        cards.append(
            _card_view(
                card.card_id,
                card.needed,
                owned.get(card.card_id, 0),
                catalog.get(card.card_id),
                section,
                alts.get(card.card_id, []),
            )
        )

    leader_name = None
    if target.leader_card_id and target.leader_card_id in catalog:
        leader_name = catalog[target.leader_card_id].name

    return DeckDetail(
        id=target.id,
        name=target.name,
        leader_card_id=target.leader_card_id,
        leader_name=leader_name,
        prior_decks=prior_names,
        cards=cards,
    )


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
    alts = _alt_arts_map(db, set(need))
    items: list[ShoppingItem] = []
    cards_still = 0
    remaining = 0.0
    for card_id in sorted(need):
        qty_need = need[card_id]
        qty_owned = owned.get(card_id, 0)
        still = max(0, qty_need - qty_owned)
        cat = catalog.get(card_id)
        market = cat.market_price if cat else None
        line = (still * market) if market is not None else None
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
                used_in=used_in[card_id],
                alt_arts=alts.get(card_id, []),
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
