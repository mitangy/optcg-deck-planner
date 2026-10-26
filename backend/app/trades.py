"""Friend-to-friend trade offers: validation, state changes, and applying one to a collection (#703)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from app import friend_view as fv
from app import services
from app.friend_schemas import TradeLineIn, TradeLineOut, TradeOut
from app.models import (
    CatalogCard,
    CatalogPrinting,
    Owned,
    OwnedPrinting,
    TradeApply,
    TradeApplyLine,
    TradeOffer,
    TradeOfferLine,
    User,
)
from app.roles import is_banned

OFFER_TTL = timedelta(days=14)
MAX_OPEN_OFFERS_PER_PAIR = 5

Key = tuple[str, str, int | None]  # (side, card_id, product_id)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def merge_lines(lines: list[TradeLineIn]) -> dict[Key, int]:
    """Duplicate (side, card, printing) lines add up to one."""
    merged: dict[Key, int] = defaultdict(int)
    for line in lines:
        merged[(line.side, line.card_id, line.product_id)] += line.qty
    return dict(merged)


def load_recipient(db: Session, sender: User, recipient_id: int) -> User:
    """The friend to trade with, or 404 for anyone else."""
    other = db.get(User, recipient_id)
    if (
        other is None
        or other.id == sender.id
        or not other.username
        or is_banned(other)
        or not fv.are_friends(db, sender.id, other.id)
    ):
        raise HTTPException(status_code=404, detail="Not found.")
    return other


def validate_offer(
    db: Session,
    actor: User,
    sender: User,
    recipient: User,
    merged: dict[Key, int],
    *,
    require_open: bool,
) -> None:
    """409 unless both sides can cover their half right now.

    Used at send, counter and accept, so a stale offer fails with a readable reason.
    ``require_open`` is off at accept: accepting is the recipient's own consent.
    """
    if require_open and not fv.get_sharing(db, recipient.id).trades_open:
        raise HTTPException(status_code=409, detail=f"{recipient.username} isn't open to trades.")

    held_sender, cat_sender = fv.holdings(db, sender)
    held_recipient, cat_recipient = fv.holdings(db, recipient)
    # give = sender's cards, get = recipient's cards.
    parties = {
        "give": (sender, held_sender, cat_sender),
        "get": (recipient, held_recipient, cat_recipient),
    }

    def who(party: User) -> str:
        return "You" if party.id == actor.id else party.username or "They"

    totals: dict[tuple[str, str], int] = defaultdict(int)
    for (side, card_id, _pid), qty in merged.items():
        totals[(side, card_id)] += qty
    for (side, card_id), qty in sorted(totals.items()):
        party, held, catalog = parties[side]
        h = held.get(card_id)
        if h is None or h.spare < qty:
            cat = catalog.get(card_id) or services._catalog_map(db, {card_id}).get(card_id)
            name = cat.name if cat else card_id
            if party.id == actor.id:
                detail = f"You don't have {qty} spare {name} ({card_id})."
            else:
                detail = f"{who(party)} no longer has {qty} spare {name} ({card_id})."
            raise HTTPException(status_code=409, detail=detail)

    alts_by_party = {
        "give": services._alt_owned_map(db, sender.id),
        "get": services._alt_owned_map(db, recipient.id),
    }
    for (side, card_id, pid), qty in sorted(merged.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2] or 0)):
        if pid is None:
            # The standard printing is limited by base copies, not by the card's total spare (#705).
            h = parties[side][1].get(card_id)
            have = h.base_owned if h else 0
        else:
            have = alts_by_party[side].get(card_id, {}).get(pid, 0)
        if have < qty:
            party = parties[side][0]
            subject = "You don't" if party.id == actor.id else f"{who(party)} doesn't"
            what = "of that printing" if pid is not None else "of the standard printing"
            raise HTTPException(
                status_code=409,
                detail=f"{subject} own {qty} {what} of {card_id}.",
            )


def open_offer_count(db: Session, sender_id: int, recipient_id: int) -> int:
    return len(
        db.scalars(
            select(TradeOffer.id).where(
                TradeOffer.from_user_id == sender_id,
                TradeOffer.to_user_id == recipient_id,
                TradeOffer.status == "pending",
            )
        ).all()
    )


def check_offer_cap(db: Session, sender: User, recipient: User) -> None:
    if open_offer_count(db, sender.id, recipient.id) >= MAX_OPEN_OFFERS_PER_PAIR:
        raise HTTPException(
            status_code=429,
            detail=f"You already have {MAX_OPEN_OFFERS_PER_PAIR} open offers with {recipient.username}.",
        )


def create_offer(
    db: Session,
    sender: User,
    recipient: User,
    message: str,
    merged: dict[Key, int],
    parent_id: int | None = None,
) -> TradeOffer:
    card_ids = {card_id for (_s, card_id, _p) in merged}
    cards = services._catalog_map(db, card_ids)
    pids = {pid for (_s, _c, pid) in merged if pid is not None}
    prices: dict[int, float | None] = {}
    if pids:
        prices = {
            p.product_id: p.market_price
            for p in db.scalars(select(CatalogPrinting).where(CatalogPrinting.product_id.in_(pids)))
        }
    now = utcnow()
    offer = TradeOffer(
        from_user_id=sender.id,
        to_user_id=recipient.id,
        status="pending",
        message=message.strip(),
        parent_offer_id=parent_id,
        created_at=now,
        expires_at=now + OFFER_TTL,
    )
    db.add(offer)
    db.flush()
    for (side, card_id, pid), qty in sorted(merged.items(), key=lambda kv: (kv[0][0] != "give", kv[0][1], kv[0][2] or 0)):
        cat = cards.get(card_id)
        price = prices.get(pid) if pid is not None else (cat.market_price if cat else None)
        db.add(
            TradeOfferLine(
                offer_id=offer.id,
                side=side,
                card_id=card_id,
                product_id=pid,
                qty=qty,
                market_price=price,
            )
        )
    return offer


def expire_stale(db: Session, user_id: int) -> None:
    """Pending offers past their deadline become expired."""
    db.execute(
        update(TradeOffer)
        .where(
            TradeOffer.status == "pending",
            TradeOffer.expires_at <= utcnow(),
            or_(TradeOffer.from_user_id == user_id, TradeOffer.to_user_id == user_id),
        )
        .values(status="expired")
    )
    db.commit()


def cancel_between(db: Session, a: int, b: int) -> None:
    """Unfriending ends every open or accepted offer between the pair (caller commits)."""
    db.execute(
        update(TradeOffer)
        .where(
            TradeOffer.status.in_(("pending", "accepted")),
            or_(
                and_(TradeOffer.from_user_id == a, TradeOffer.to_user_id == b),
                and_(TradeOffer.from_user_id == b, TradeOffer.to_user_id == a),
            ),
        )
        .values(status="cancelled", responded_at=utcnow())
    )


def active_applies(db: Session, user_id: int, offer_ids: list[int]) -> set[int]:
    """Offers (of ``offer_ids``) whose collection update this user has applied and not undone."""
    if not offer_ids:
        return set()
    return set(
        db.scalars(
            select(TradeApply.offer_id).where(
                TradeApply.user_id == user_id,
                TradeApply.offer_id.in_(offer_ids),
                TradeApply.undone_at.is_(None),
            )
        ).all()
    )


def build_out(db: Session, offers: list[TradeOffer], me: User) -> list[TradeOut]:
    if not offers:
        return []
    user_ids = {o.from_user_id for o in offers} | {o.to_user_id for o in offers}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))}
    card_ids = {line.card_id for o in offers for line in o.lines}
    cards: dict[str, CatalogCard] = services._catalog_map(db, card_ids)
    pids = {line.product_id for o in offers for line in o.lines if line.product_id is not None}
    printings: dict[int, CatalogPrinting] = {}
    if pids:
        printings = {
            p.product_id: p
            for p in db.scalars(select(CatalogPrinting).where(CatalogPrinting.product_id.in_(pids)))
        }
    offer_ids = [o.id for o in offers]
    applied = {
        (a.offer_id, a.user_id)
        for a in db.scalars(
            select(TradeApply).where(TradeApply.offer_id.in_(offer_ids), TradeApply.undone_at.is_(None))
        )
    }
    out: list[TradeOut] = []
    for o in offers:
        lines: list[TradeLineOut] = []
        values: dict[str, float | None] = {"give": 0.0, "get": 0.0}
        for line in o.lines:
            cat = cards.get(line.card_id)
            printing = printings.get(line.product_id) if line.product_id is not None else None
            lines.append(
                TradeLineOut(
                    side=line.side,  # type: ignore[arg-type]
                    card_id=line.card_id,
                    product_id=line.product_id,
                    qty=line.qty,
                    name=cat.name if cat else line.card_id,
                    image_url=(printing.image_url if printing and printing.image_url else (cat.image_url if cat else "")),
                    market_price=line.market_price,
                    printing_label=printing.name if printing else None,
                )
            )
            if line.market_price is None:
                values[line.side] = None
            elif values[line.side] is not None:
                values[line.side] = (values[line.side] or 0.0) + line.qty * line.market_price
        i_am_sender = o.from_user_id == me.id
        other_id = o.to_user_id if i_am_sender else o.from_user_id
        give, get = values["give"], values["get"]
        out.append(
            TradeOut(
                id=o.id,
                from_user_id=o.from_user_id,
                from_username=users[o.from_user_id].username or "Player",
                to_user_id=o.to_user_id,
                to_username=users[o.to_user_id].username or "Player",
                status=o.status,
                message=o.message or "",
                parent_offer_id=o.parent_offer_id,
                created_at=fv.unix(o.created_at) or 0,
                responded_at=fv.unix(o.responded_at),
                completed_at=fv.unix(o.completed_at),
                expires_at=fv.unix(o.expires_at) or 0,
                lines=lines,
                give_value=round(give, 2) if give is not None else None,
                get_value=round(get, 2) if get is not None else None,
                i_am_sender=i_am_sender,
                my_applied=(o.id, me.id) in applied,
                other_applied=(o.id, other_id) in applied,
            )
        )
    return out


def load_offer(db: Session, user: User, offer_id: int) -> TradeOffer:
    """The offer if ``user`` is a party to it (else 404); a stale pending one is expired first."""
    offer = db.get(TradeOffer, offer_id)
    if offer is None or user.id not in (offer.from_user_id, offer.to_user_id):
        raise HTTPException(status_code=404, detail="Not found.")
    if offer.status == "pending" and _utc(offer.expires_at) <= utcnow():
        offer.status = "expired"
        db.commit()
    return offer


# --- applying a finished trade to the caller's own collection -----------------


def _row(db: Session, cache: dict, user_id: int, card_id: str, pid: int | None):
    key = (card_id, pid)
    if key in cache:
        return cache[key]
    if pid is None:
        row = db.scalar(select(Owned).where(Owned.user_id == user_id, Owned.card_id == card_id))
    else:
        row = db.scalar(
            select(OwnedPrinting).where(
                OwnedPrinting.user_id == user_id,
                OwnedPrinting.card_id == card_id,
                OwnedPrinting.product_id == pid,
            )
        )
    cache[key] = row
    return row


def _set_qty(db: Session, cache: dict, user_id: int, card_id: str, pid: int | None, qty: int) -> None:
    row = _row(db, cache, user_id, card_id, pid)
    if row is None:
        if qty <= 0:
            return
        row = (
            Owned(user_id=user_id, card_id=card_id, qty=qty)
            if pid is None
            else OwnedPrinting(user_id=user_id, card_id=card_id, product_id=pid, qty=qty)
        )
        db.add(row)
        cache[(card_id, pid)] = row
    elif qty <= 0 and pid is not None:
        db.delete(row)
        cache[(card_id, pid)] = None
    else:
        row.qty = max(0, qty)


def _qty(db: Session, cache: dict, user_id: int, card_id: str, pid: int | None) -> int:
    row = _row(db, cache, user_id, card_id, pid)
    return row.qty if row is not None else 0


def apply_trade(db: Session, offer: TradeOffer, user: User) -> None:
    """Fold the user's half of a completed trade into the user's own collection."""
    record = db.scalar(
        select(TradeApply).where(TradeApply.offer_id == offer.id, TradeApply.user_id == user.id)
    )
    if record is not None and record.undone_at is None:
        raise HTTPException(status_code=409, detail="You already updated your collection for this trade.")
    if record is None:
        record = TradeApply(offer_id=offer.id, user_id=user.id, created_at=utcnow())
        db.add(record)
    else:
        record.lines.clear()
        record.undone_at = None
        record.created_at = utcnow()
    db.flush()

    is_sender = offer.from_user_id == user.id
    giving = [ln for ln in offer.lines if (ln.side == "give") == is_sender]
    receiving = [ln for ln in offer.lines if (ln.side == "give") != is_sender]
    cache: dict = {}
    for ln in giving:
        before = _qty(db, cache, user.id, ln.card_id, ln.product_id)
        taken = min(ln.qty, before)
        _set_qty(db, cache, user.id, ln.card_id, ln.product_id, before - taken)
        db.add(
            TradeApplyLine(
                apply_id=record.id,
                card_id=ln.card_id,
                product_id=ln.product_id,
                delta=-taken,
                qty_before=before,
            )
        )
    for ln in receiving:
        before = _qty(db, cache, user.id, ln.card_id, ln.product_id)
        _set_qty(db, cache, user.id, ln.card_id, ln.product_id, before + ln.qty)
        db.add(
            TradeApplyLine(
                apply_id=record.id,
                card_id=ln.card_id,
                product_id=ln.product_id,
                delta=ln.qty,
                qty_before=before,
            )
        )
    db.commit()


def undo_apply(db: Session, offer: TradeOffer, user: User) -> None:
    record = db.scalar(
        select(TradeApply).where(TradeApply.offer_id == offer.id, TradeApply.user_id == user.id)
    )
    if record is None or record.undone_at is not None:
        raise HTTPException(status_code=409, detail="There is nothing to undo.")
    cache: dict = {}
    for ln in reversed(record.lines):
        current = _qty(db, cache, user.id, ln.card_id, ln.product_id)
        _set_qty(db, cache, user.id, ln.card_id, ln.product_id, max(0, current - ln.delta))
    record.undone_at = utcnow()
    db.commit()
