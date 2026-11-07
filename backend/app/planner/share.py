"""Public share links for decks and shopping lists."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.models import User
from app.planner.models import Deck, ShareLink
from app.planner.catalog_repo import (
    alt_arts_map,
    alt_owned_map,
    owned_map,
)
from app.planner.schemas import PublicShoppingResponse, ShareInfo, ShoppingItem
from app.planner.decks import (
    clone_deck,
    get_deck_detail,
)
from app.planner.printings import (
    _alts_owned_total,
    _display_choice_map,
)
from app.planner.shopping import (
    shopping_list,
)


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
        include_extras=link.include_extras,
        path=f"/share/{link.token}",
    )


def create_or_update_share(
    db: Session,
    user: User,
    kind: str,
    deck_id: int | None = None,
    deck_ids: list[int] | None = None,
    include_extras: bool | None = None,
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
        if include_extras is not None:
            existing.include_extras = include_extras
        db.commit()
        db.refresh(existing)
        return _share_info(existing)

    link = ShareLink(
        user_id=user.id,
        token=secrets.token_urlsafe(18),
        kind="shopping",
        deck_id=None,
        deck_ids_json=deck_ids_json,
        include_extras=True if include_extras is None else include_extras,
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


def _active_share_link(db: Session, token: str) -> ShareLink:
    link = db.scalar(
        select(ShareLink).where(ShareLink.token == token, ShareLink.revoked_at.is_(None))
    )
    if link is None:
        raise LookupError("Share link not found")
    return link


def public_share_view(
    db: Session, token: str, viewer: User | None = None
) -> PublicShoppingResponse:
    link = _active_share_link(db, token)
    owner = db.get(User, link.user_id)
    if owner is None:
        raise LookupError("Share link not found")
    # Duel username when set (#903), else the account name as before.
    owner_name = owner.username or (owner.name or owner.email.split("@")[0] or "Collector").strip()
    viewer_signed_in = viewer is not None
    viewer_is_owner = viewer is not None and viewer.id == owner.id

    if link.kind == "deck":
        if link.deck_id is None:
            raise LookupError("Share link not found")
        # The owner's deck gives the card list and catalog info; owned counts
        # come from whoever opened the link (#741).
        detail = get_deck_detail(db, owner, link.deck_id)
        if viewer is not None:
            viewer_owned = owned_map(db, viewer.id)
            viewer_alt_owned = alt_owned_map(db, viewer.id)
            viewer_display = _display_choice_map(db, viewer.id)
        else:
            viewer_owned = {}
            viewer_alt_owned = {}
            viewer_display = {}
        viewer_alts = alt_arts_map(
            db, {c.card_id for c in detail.cards}, wanted={}, owned=viewer_alt_owned
        )
        items: list[ShoppingItem] = []
        cards_still = 0
        remaining = 0.0
        for card in detail.cards:
            owned_n = viewer_owned.get(card.card_id, 0)
            alts_owned_n = _alts_owned_total(viewer_alt_owned, card.card_id)
            still_need = max(0, card.needed - (owned_n + alts_owned_n))
            line = (
                (still_need * card.market_price) if card.market_price is not None else None
            )
            cards_still += still_need
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
                    owned=owned_n,
                    alts_owned=alts_owned_n,
                    still_need=still_need,
                    market_price=card.market_price,
                    low_price=card.low_price,
                    remaining_cost=line,
                    image_url=card.image_url,
                    tcgplayer_url=card.tcgplayer_url,
                    product_id=card.product_id,
                    used_in=[detail.name],
                    alt_arts=viewer_alts.get(card.card_id, []),
                    display_art=viewer_display.get(card.card_id),
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
            viewer_signed_in=viewer_signed_in,
            viewer_is_owner=viewer_is_owner,
        )

    shopping = shopping_list(
        db,
        owner,
        deck_ids=_share_deck_ids(link),
        include_extras=link.include_extras,
        include_collector=False,
    )
    return PublicShoppingResponse(
        items=shopping.items,
        cards_still_needed=shopping.cards_still_needed,
        remaining_market=shopping.remaining_market,
        unique_cards=shopping.unique_cards,
        owner_name=owner_name,
        kind="shopping",
        deck_name=None,
        viewer_signed_in=viewer_signed_in,
        viewer_is_owner=viewer_is_owner,
    )


def copy_shared_deck(db: Session, viewer: User, token: str) -> Deck:
    """Copy the deck behind a public deck share link into the viewer's decks (#741)."""
    link = _active_share_link(db, token)
    if link.kind != "deck":
        raise ValueError("Only shared decks can be copied")
    deck = db.scalar(
        select(Deck)
        .where(Deck.id == link.deck_id, Deck.user_id == link.user_id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise LookupError("Share link not found")
    name = f"{deck.name} (copy)" if deck.user_id == viewer.id else deck.name
    return clone_deck(db, viewer, deck, name)
