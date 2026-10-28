"""Friends' decks, collection and spares, plus your own sharing settings (#703)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import friend_view as fv
from app import services
from app.auth import get_current_user
from app.db import get_db
from app.domain import deck_size_counts, is_don_card, parse_cost
from app.friend_schemas import (
    FriendCollectionOut,
    FriendDeckCard,
    FriendDeckDetail,
    FriendDeckSummary,
    FriendOwnedItem,
    FriendProfileOut,
    FriendSparesOut,
    MySparesOut,
    MySpareItem,
    SharingIn,
    SharingOut,
    TradeKeepIn,
    TradeKeepOut,
)
from app.models import Deck, TradeKeep, User, UserSharing
from app.schemas import DeckDetail

router = APIRouter(prefix="/friends", tags=["friend-views"])
me_router = APIRouter(prefix="/me", tags=["friend-views"])


def _sharing_out(s: fv.Sharing) -> SharingOut:
    return SharingOut(
        decks=s.decks,  # type: ignore[arg-type]
        collection=s.collection,  # type: ignore[arg-type]
        trades_open=s.trades_open,
        show_values=s.show_values,
        prompted=s.prompted,
    )


@me_router.get("/sharing", response_model=SharingOut)
def get_my_sharing(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SharingOut:
    return _sharing_out(fv.get_sharing(db, user.id))


@me_router.put("/sharing", response_model=SharingOut)
def put_my_sharing(
    body: SharingIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SharingOut:
    row = db.get(UserSharing, user.id)
    if row is None:
        row = UserSharing(user_id=user.id)
        db.add(row)
    # Column defaults only apply on flush; fill them so a fresh row reads back right.
    row.decks = row.decks or "friends"
    row.collection = row.collection or "off"
    row.trades_open = bool(row.trades_open)
    row.show_values = bool(row.show_values)
    for field in ("decks", "collection", "trades_open", "show_values"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    if row.prompted_at is None:
        row.prompted_at = datetime.now(timezone.utc)
    db.commit()
    return _sharing_out(fv.get_sharing(db, user.id))


# --- friend views -----------------------------------------------------------


@router.get("/{friend_id}/profile", response_model=FriendProfileOut)
def friend_profile(
    friend_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FriendProfileOut:
    owner, sharing = fv.require_friend_view(db, user, friend_id, "profile")
    decks_shared = sharing.decks == "friends"
    collection_shared = sharing.collection == "friends"
    out = FriendProfileOut(
        user_id=owner.id,
        username=owner.username or "",
        decks_shared=decks_shared,
        collection_shared=collection_shared,
        trades_open=sharing.trades_open,
    )
    if decks_shared:
        out.deck_count = (
            db.scalar(
                select(func.count(Deck.id)).where(
                    Deck.user_id == owner.id, Deck.hidden_from_friends.is_(False)
                )
            )
            or 0
        )
    if collection_shared:
        coll = services.owned_collection(db, owner)
        out.unique_cards = coll.unique_cards
        out.total_copies = coll.total_copies
        if sharing.show_values:
            out.total_value = coll.total_value
    if sharing.trades_open:
        held, _ = fv.holdings(db, owner)
        out.spare_cards = len(fv.spare_card_ids(held))
    return out


def _visible_decks(db: Session, owner_id: int) -> list[Deck]:
    return list(
        db.scalars(
            select(Deck)
            .where(Deck.user_id == owner_id, Deck.hidden_from_friends.is_(False))
            .options(selectinload(Deck.cards))
            .order_by(Deck.sort_order, Deck.id)
        ).all()
    )


@router.get("/{friend_id}/decks", response_model=list[FriendDeckSummary])
def friend_decks(
    friend_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[FriendDeckSummary]:
    owner, _ = fv.require_friend_view(db, user, friend_id, "decks")
    decks = _visible_decks(db, owner.id)
    catalog = services._catalog_map(
        db, {c.card_id for d in decks for c in d.cards} | {d.leader_card_id for d in decks if d.leader_card_id}
    )
    out: list[FriendDeckSummary] = []
    for deck in decks:
        leader = catalog.get(deck.leader_card_id) if deck.leader_card_id else None
        main_cards, _don = deck_size_counts(services._deck_card_lines(deck), catalog)
        out.append(
            FriendDeckSummary(
                id=deck.id,
                name=deck.name,
                leader_card_id=deck.leader_card_id,
                leader_name=leader.name if leader else None,
                leader_image_url=leader.image_url if leader else "",
                total_cards=main_cards,
                main_cards=main_cards,
            )
        )
    return out


def _visible_deck(db: Session, owner_id: int, deck_id: int) -> Deck:
    deck = db.scalar(
        select(Deck)
        .where(
            Deck.id == deck_id,
            Deck.user_id == owner_id,
            Deck.hidden_from_friends.is_(False),
        )
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise fv.not_found()
    return deck


@router.get("/{friend_id}/decks/{deck_id}", response_model=FriendDeckDetail)
def friend_deck_detail(
    friend_id: int,
    deck_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FriendDeckDetail:
    owner, _ = fv.require_friend_view(db, user, friend_id, "decks")
    deck = _visible_deck(db, owner.id, deck_id)
    ids = {c.card_id for c in deck.cards}
    catalog = services._catalog_map(db, ids | ({deck.leader_card_id} if deck.leader_card_id else set()))
    mine = fv.total_owned(db, user.id)
    cards: list[FriendDeckCard] = []
    missing = 0
    cost = 0.0
    priced = True
    for dc in deck.cards:
        cat = catalog.get(dc.card_id)
        have = mine.get(dc.card_id, 0)
        still = max(0, dc.needed - have)
        if still > 0 and not is_don_card(cat):
            missing += still
            if cat is None or cat.market_price is None:
                priced = False
            else:
                cost += still * cat.market_price
        cards.append(
            FriendDeckCard(
                card_id=dc.card_id,
                name=cat.name if cat else "(not in catalog)",
                rarity=cat.rarity if cat else "",
                color=cat.color if cat else "",
                card_type=cat.card_type if cat else "",
                cost=parse_cost(cat.cost) if cat else None,
                needed=dc.needed,
                image_url=cat.image_url if cat else "",
                market_price=cat.market_price if cat else None,
                my_owned=have,
                my_still_need=still,
            )
        )
    leader = catalog.get(deck.leader_card_id) if deck.leader_card_id else None
    main_cards, _don = deck_size_counts(services._deck_card_lines(deck), catalog)
    return FriendDeckDetail(
        id=deck.id,
        name=deck.name,
        leader_card_id=deck.leader_card_id,
        leader_name=leader.name if leader else None,
        leader_image_url=leader.image_url if leader else "",
        main_cards=main_cards,
        cards=cards,
        my_missing_copies=missing,
        my_missing_cost=round(cost, 2) if priced else None,
    )


@router.post("/{friend_id}/decks/{deck_id}/copy", response_model=DeckDetail)
def copy_friend_deck(
    friend_id: int,
    deck_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DeckDetail:
    owner, _ = fv.require_friend_view(db, user, friend_id, "decks")
    deck = _visible_deck(db, owner.id, deck_id)
    try:
        new = services.clone_deck(db, user, deck, f"{deck.name} ({owner.username})")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return services.get_deck_detail(db, user, new.id)


@router.get("/{friend_id}/collection", response_model=FriendCollectionOut)
def friend_collection(
    friend_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FriendCollectionOut:
    owner, sharing = fv.require_friend_view(db, user, friend_id, "collection")
    coll = services.owned_collection(db, owner)
    spare: dict[str, int] = {}
    if sharing.trades_open:
        held, _ = fv.holdings(db, owner)
        spare = {c: h.spare for c, h in held.items()}
    items = [
        FriendOwnedItem(
            card_id=i.card_id,
            name=i.name,
            rarity=i.rarity,
            color=i.color,
            card_type=i.card_type,
            cost=i.cost,
            owned=i.owned,
            alts_owned=i.alts_owned,
            market_price=i.market_price,
            image_url=i.image_url,
            value=i.value if sharing.show_values else None,
            spare=spare.get(i.card_id, 0),
        )
        for i in coll.items
    ]
    return FriendCollectionOut(
        items=items,
        unique_cards=coll.unique_cards,
        total_copies=coll.total_copies,
        total_value=coll.total_value if sharing.show_values else None,
    )


@router.get("/{friend_id}/spares", response_model=FriendSparesOut)
def friend_spares(
    friend_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    deck_ids: Annotated[list[int] | None, Query()] = None,
) -> FriendSparesOut:
    """`deck_ids` (the viewer's Include decks filter, #799) narrows only what the viewer needs.
    Spare copies still reserve every deck, so unticking a deck never offers its cards for trade."""
    owner, _ = fv.require_friend_view(db, user, friend_id, "trades")
    theirs, their_cat = fv.holdings(db, owner)
    mine, my_cat = fv.holdings(db, user)
    my_want = fv.wants(db, user, deck_ids)
    their_want = fv.wants(db, owner)
    their_items = fv.spare_items(db, theirs, their_cat, my_want, fv.spare_card_ids(theirs))
    they_need_ids = [c for c in fv.spare_card_ids(mine) if their_want.get(c, 0) > 0]
    return FriendSparesOut(
        their_spares=their_items,
        you_need=[i for i in their_items if i.want > 0],
        they_need=fv.spare_items(db, mine, my_cat, their_want, they_need_ids),
    )


# --- my spares ----------------------------------------------------------------


@me_router.get("/spares", response_model=MySparesOut)
def my_spares(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MySparesOut:
    held, catalog = fv.holdings(db, user)
    ids = [c for c, h in held.items() if h.spare > 0 or h.keep > 0]
    items = fv.spare_items(db, held, catalog, {}, ids)
    return MySparesOut(
        items=[MySpareItem(**i.model_dump(), keep_qty=held[i.card_id].keep) for i in items]
    )


@me_router.put("/trade-keep/{card_id}", response_model=TradeKeepOut)
def put_trade_keep(
    card_id: str,
    body: TradeKeepIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeKeepOut:
    card_id = card_id.strip().upper()
    owned = fv.total_owned(db, user.id)
    if card_id not in owned and not services._catalog_map(db, {card_id}):
        raise HTTPException(status_code=404, detail="Card not found.")
    row = db.scalar(
        select(TradeKeep).where(TradeKeep.user_id == user.id, TradeKeep.card_id == card_id)
    )
    if body.keep_qty == 0:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(TradeKeep(user_id=user.id, card_id=card_id, keep_qty=body.keep_qty))
    else:
        row.keep_qty = body.keep_qty
    db.commit()
    held, _ = fv.holdings(db, user)
    h = held.get(card_id)
    return TradeKeepOut(card_id=card_id, keep_qty=body.keep_qty, spare=h.spare if h else 0)
