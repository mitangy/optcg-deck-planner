"""Trade offers between friends (#703)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import trades as tr
from app.auth import get_current_user
from app.db import get_db
from app.friend_schemas import CounterIn, TradeIn, TradeOut, TradesOut, TradeSummaryOut
from app.models import TradeOffer, User
from app.rate_limit import RateLimiter

router = APIRouter(prefix="/trades", tags=["trades"])

_send_rate = RateLimiter(max_calls=20, period_s=60, name="trades_send_rate")

HISTORY_LIMIT = 50


def _involving(user_id: int):
    return or_(TradeOffer.from_user_id == user_id, TradeOffer.to_user_id == user_id)


def _out(db: Session, offer: TradeOffer, user: User) -> TradeOut:
    return tr.build_out(db, [offer], user)[0]


def _throttle(user: User) -> None:
    if not _send_rate.allow(f"trade-send:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many trade offers. Try again in a minute.")


@router.post("", response_model=TradeOut, status_code=201)
def send_offer(
    body: TradeIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    _throttle(user)
    recipient = tr.load_recipient(db, user, body.to_user_id)
    merged = tr.merge_lines(body.lines)
    tr.check_offer_cap(db, user, recipient)
    tr.validate_offer(db, user, user, recipient, merged, require_open=True)
    offer = tr.create_offer(db, user, recipient, body.message, merged)
    db.commit()
    return _out(db, offer, user)


@router.get("", response_model=TradesOut)
def list_trades(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradesOut:
    tr.expire_stale(db, user.id)
    base = select(TradeOffer).where(_involving(user.id))
    pending = db.scalars(base.where(TradeOffer.status == "pending").order_by(TradeOffer.id.desc())).all()
    accepted = db.scalars(base.where(TradeOffer.status == "accepted").order_by(TradeOffer.id.desc())).all()
    completed = db.scalars(base.where(TradeOffer.status == "completed").order_by(TradeOffer.id.desc())).all()
    applied = tr.active_applies(db, user.id, [o.id for o in completed])
    other = db.scalars(
        base.where(TradeOffer.status.in_(("countered", "declined", "cancelled", "expired")))
        .order_by(TradeOffer.id.desc())
        .limit(HISTORY_LIMIT)
    ).all()
    history = sorted(
        [*other, *(o for o in completed if o.id in applied)], key=lambda o: o.id, reverse=True
    )[:HISTORY_LIMIT]
    active = sorted(
        [*accepted, *(o for o in completed if o.id not in applied)], key=lambda o: o.id, reverse=True
    )
    return TradesOut(
        incoming=tr.build_out(db, [o for o in pending if o.to_user_id == user.id], user),
        outgoing=tr.build_out(db, [o for o in pending if o.from_user_id == user.id], user),
        active=tr.build_out(db, active, user),
        history=tr.build_out(db, history, user),
    )


@router.get("/summary", response_model=TradeSummaryOut)
def trade_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeSummaryOut:
    tr.expire_stale(db, user.id)
    incoming = db.scalar(
        select(func.count(TradeOffer.id)).where(
            TradeOffer.to_user_id == user.id, TradeOffer.status == "pending"
        )
    )
    accepted = db.scalar(
        select(func.count(TradeOffer.id)).where(
            _involving(user.id), TradeOffer.status == "accepted"
        )
    )
    completed_ids = db.scalars(
        select(TradeOffer.id).where(_involving(user.id), TradeOffer.status == "completed")
    ).all()
    unapplied = len(completed_ids) - len(tr.active_applies(db, user.id, list(completed_ids)))
    return TradeSummaryOut(incoming_pending=incoming or 0, active=(accepted or 0) + unapplied)


def _require_status(offer: TradeOffer, *allowed: str) -> None:
    if offer.status not in allowed:
        raise HTTPException(status_code=409, detail=f"This offer is already {offer.status}.")


@router.post("/{offer_id}/accept", response_model=TradeOut)
def accept_offer(
    offer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    offer = tr.load_offer(db, user, offer_id)
    if offer.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the person it was sent to can accept.")
    _require_status(offer, "pending")
    sender = db.get(User, offer.from_user_id)
    if sender is None or not tr.fv.are_friends(db, user.id, sender.id):
        raise HTTPException(status_code=404, detail="Not found.")
    merged = {(ln.side, ln.card_id, ln.product_id): ln.qty for ln in offer.lines}
    tr.validate_offer(db, user, sender, user, merged, require_open=False)
    offer.status = "accepted"
    offer.responded_at = tr.utcnow()
    db.commit()
    return _out(db, offer, user)


@router.post("/{offer_id}/decline", response_model=TradeOut)
def decline_offer(
    offer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    offer = tr.load_offer(db, user, offer_id)
    if offer.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the person it was sent to can decline.")
    _require_status(offer, "pending")
    offer.status = "declined"
    offer.responded_at = tr.utcnow()
    db.commit()
    return _out(db, offer, user)


@router.post("/{offer_id}/cancel", response_model=TradeOut)
def cancel_offer(
    offer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    offer = tr.load_offer(db, user, offer_id)
    _require_status(offer, "pending", "accepted")
    if offer.status == "pending" and offer.from_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the sender can cancel; decline it instead.")
    offer.status = "cancelled"
    offer.responded_at = tr.utcnow()
    db.commit()
    return _out(db, offer, user)


@router.post("/{offer_id}/counter", response_model=TradeOut)
def counter_offer(
    offer_id: int,
    body: CounterIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    _throttle(user)
    offer = tr.load_offer(db, user, offer_id)
    if offer.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the person it was sent to can counter.")
    _require_status(offer, "pending")
    other = tr.load_recipient(db, user, offer.from_user_id)
    merged = tr.merge_lines(body.lines)
    tr.check_offer_cap(db, user, other)
    tr.validate_offer(db, user, user, other, merged, require_open=True)
    offer.status = "countered"
    offer.responded_at = tr.utcnow()
    new = tr.create_offer(db, user, other, body.message, merged, parent_id=offer.id)
    db.commit()
    return _out(db, new, user)


@router.post("/{offer_id}/complete", response_model=TradeOut)
def complete_offer(
    offer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    offer = tr.load_offer(db, user, offer_id)
    _require_status(offer, "accepted")
    offer.status = "completed"
    offer.completed_at = tr.utcnow()
    db.commit()
    return _out(db, offer, user)


@router.post("/{offer_id}/apply", response_model=TradeOut)
def apply_offer(
    offer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    offer = tr.load_offer(db, user, offer_id)
    if offer.status != "completed":
        raise HTTPException(status_code=409, detail="Mark the trade as traded first.")
    tr.apply_trade(db, offer, user)
    return _out(db, offer, user)


@router.delete("/{offer_id}/apply", response_model=TradeOut)
def undo_offer_apply(
    offer_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TradeOut:
    offer = tr.load_offer(db, user, offer_id)
    tr.undo_apply(db, offer, user)
    return _out(db, offer, user)
