"""What a friend may see of your decks and collection, and the spares math (#703)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import services
from app.domain import is_don_card, parse_cost
from app.friend_schemas import SparePrinting, SpareItem
from app.models import CatalogCard, CatalogPrinting, Friendship, TradeKeep, User, UserSharing
from app.roles import is_banned

Scope = Literal["profile", "decks", "collection", "trades"]


def not_found() -> HTTPException:
    # One answer for every failure so nobody can probe who exists or what they share.
    return HTTPException(status_code=404, detail="Not found.")


@dataclass(frozen=True)
class Sharing:
    decks: str = "friends"
    collection: str = "off"
    trades_open: bool = False
    show_values: bool = False
    prompted: bool = False


def get_sharing(db: Session, user_id: int) -> Sharing:
    row = db.get(UserSharing, user_id)
    if row is None:
        return Sharing()
    return Sharing(
        decks=row.decks,
        collection=row.collection,
        trades_open=bool(row.trades_open),
        show_values=bool(row.show_values),
        prompted=row.prompted_at is not None,
    )


def are_friends(db: Session, a: int, b: int) -> bool:
    low, high = (a, b) if a < b else (b, a)
    f = db.scalar(
        select(Friendship).where(Friendship.user_low_id == low, Friendship.user_high_id == high)
    )
    return f is not None and f.status == "accepted"


def require_friend_view(db: Session, viewer: User, owner_id: int, scope: Scope) -> tuple[User, Sharing]:
    """The owner and their sharing, or 404 when ``viewer`` may not look at ``scope``."""
    if owner_id == viewer.id:
        raise not_found()
    owner = db.get(User, owner_id)
    if owner is None or not owner.username or is_banned(owner):
        raise not_found()
    if not are_friends(db, viewer.id, owner.id):
        raise not_found()
    sharing = get_sharing(db, owner.id)
    if scope == "decks" and sharing.decks != "friends":
        raise not_found()
    if scope == "collection" and sharing.collection != "friends":
        raise not_found()
    if scope == "trades" and not sharing.trades_open:
        raise not_found()
    return owner, sharing


def unix(dt: datetime | None) -> int | None:
    if dt is None:
        return None
    return int((dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).timestamp())


def _is_don(card_id: str, cat: CatalogCard | None) -> bool:
    return card_id.upper().startswith("DON") or is_don_card(cat)


@dataclass
class Holdings:
    """One user's stock of a card against what their decks reserve."""

    owned_total: int
    reserved: int
    keep: int
    spare: int
    alts: dict[int, int]

    @property
    def base_owned(self) -> int:
        """Copies of the standard printing (total minus alt-printing copies)."""
        return max(0, self.owned_total - sum(self.alts.values()))


def total_owned(db: Session, user_id: int) -> dict[str, int]:
    """card_id -> base copies + alt-printing copies."""
    base = services._owned_map(db, user_id)
    alts = services._alt_owned_map(db, user_id)
    out = {card_id: qty for card_id, qty in base.items() if qty > 0}
    for card_id, by_pid in alts.items():
        out[card_id] = out.get(card_id, 0) + sum(by_pid.values())
    return out


def wants(db: Session, user: User) -> dict[str, int]:
    """card_id -> copies still to buy on the user's shopping list."""
    return {i.card_id: i.still_need for i in services.shopping_list(db, user).items if i.still_need > 0}


def holdings(db: Session, user: User) -> tuple[dict[str, Holdings], dict[str, CatalogCard]]:
    """Per-card holdings for every card the user owns or keeps (DON!! excluded)."""
    owned = total_owned(db, user.id)
    alts = services._alt_owned_map(db, user.id)
    reserved = {i.card_id: i.need for i in services.shopping_list(db, user).items}
    keeps = {
        k.card_id: k.keep_qty
        for k in db.scalars(select(TradeKeep).where(TradeKeep.user_id == user.id)).all()
        if k.keep_qty > 0
    }
    card_ids = set(owned) | set(keeps)
    catalog = services._catalog_map(db, card_ids)
    out: dict[str, Holdings] = {}
    for card_id in card_ids:
        if _is_don(card_id, catalog.get(card_id)):
            continue
        total = owned.get(card_id, 0)
        need = reserved.get(card_id, 0)
        keep = keeps.get(card_id, 0)
        out[card_id] = Holdings(
            owned_total=total,
            reserved=need,
            keep=keep,
            spare=max(0, total - need - keep),
            alts=dict(alts.get(card_id, {})),
        )
    return out, catalog


def spare_items(
    db: Session,
    held: dict[str, Holdings],
    catalog: dict[str, CatalogCard],
    want: dict[str, int],
    card_ids: list[str],
) -> list[SpareItem]:
    """SpareItem rows (sorted by name) for ``card_ids`` out of ``held``."""
    pids = {pid for c in card_ids for pid in held[c].alts}
    printings: dict[int, CatalogPrinting] = {}
    if pids:
        printings = {
            p.product_id: p
            for p in db.scalars(select(CatalogPrinting).where(CatalogPrinting.product_id.in_(pids)))
        }
    items: list[SpareItem] = []
    for card_id in card_ids:
        h = held[card_id]
        cat = catalog.get(card_id)
        items.append(
            SpareItem(
                card_id=card_id,
                name=cat.name if cat else "(not in catalog)",
                rarity=cat.rarity if cat else "",
                color=cat.color if cat else "",
                card_type=cat.card_type if cat else "",
                cost=parse_cost(cat.cost) if cat else None,
                image_url=cat.image_url if cat else "",
                market_price=cat.market_price if cat else None,
                spare=h.spare,
                base_owned=h.base_owned,
                want=want.get(card_id, 0),
                printings=[
                    SparePrinting(
                        product_id=pid,
                        label=printings[pid].name if pid in printings else "",
                        image_url=printings[pid].image_url if pid in printings else "",
                        owned=qty,
                    )
                    for pid, qty in sorted(h.alts.items())
                ],
            )
        )
    items.sort(key=lambda i: (i.name.casefold(), i.card_id))
    return items


def spare_card_ids(held: dict[str, Holdings]) -> list[str]:
    return [c for c, h in held.items() if h.spare > 0]

