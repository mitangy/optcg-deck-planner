"""Business logic for decks, owned, and shopping views."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domain import find_leader_id, parse_cost, parse_decklist
from app.models import CatalogCard, Deck, DeckCard, Owned, User
from app.schemas import CardView, DeckDetail, DeckSummary, ShoppingItem, ShoppingResponse


def _catalog_map(db: Session, card_ids: set[str]) -> dict[str, CatalogCard]:
    if not card_ids:
        return {}
    rows = db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
    return {r.card_id: r for r in rows}


def _owned_map(db: Session, user_id: int) -> dict[str, int]:
    rows = db.scalars(select(Owned).where(Owned.user_id == user_id)).all()
    return {r.card_id: r.qty for r in rows}


def _card_view(
    card_id: str,
    needed: int,
    owned: int,
    cat: CatalogCard | None,
    section: str,
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


def shopping_list(db: Session, user: User) -> ShoppingResponse:
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    need: dict[str, int] = {}
    used_in: dict[str, list[str]] = defaultdict(list)
    for deck in decks:
        for card in deck.cards:
            need[card.card_id] = max(need.get(card.card_id, 0), card.needed)
            if deck.name not in used_in[card.card_id]:
                used_in[card.card_id].append(deck.name)

    owned = _owned_map(db, user.id)
    catalog = _catalog_map(db, set(need))
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
