"""Price alerts and the in-app notification inbox (#855)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.planner import mailer
from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.models import User
from app.planner.models import CatalogCard, CatalogPrinting, Notification, PriceAlert
from app.planner.price_alerts import condition_met, current_price, current_prices
from app.core.rate_limit import RateLimiter
from app.planner.schemas import (
    NotificationList,
    NotificationOut,
    NotificationsRead,
    PriceAlertCreate,
    PriceAlertList,
    PriceAlertOut,
    PriceAlertUpdate,
)

router = APIRouter(tags=["price-alerts"])

MAX_ALERTS_PER_USER = 200
# Per signed-in user; writes only (reads are cheap).
_write_limiter = RateLimiter(max_calls=60, period_s=60, name="price_alert_write_limiter")

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


def _limit_writes(user: User) -> None:
    if not _write_limiter.allow(f"user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many alert changes; try again in a minute.")


def _serialize(db: Session, alerts: list[PriceAlert]) -> list[PriceAlertOut]:
    if not alerts:
        return []
    pairs = {(a.card_id, a.product_id) for a in alerts}
    prices = current_prices(db, pairs)
    cards = {
        c.card_id: c
        for c in db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_({a.card_id for a in alerts})))
    }
    alt_cards = {a.card_id for a in alerts if a.product_id}
    printings = (
        {
            (r.card_id, r.product_id): r
            for r in db.scalars(select(CatalogPrinting).where(CatalogPrinting.card_id.in_(alt_cards)))
        }
        if alt_cards
        else {}
    )
    out = []
    for a in alerts:
        card = cards.get(a.card_id)
        printing = printings.get((a.card_id, a.product_id)) if a.product_id else None
        price = prices[(a.card_id, a.product_id)]
        if a.product_id:
            art_name = printing.name if printing else "Alt art"
            image = printing.image_url if printing else ""
            url = printing.tcgplayer_url if printing else ""
        else:
            art_name = "Base"
            image = card.image_url if card else ""
            url = card.tcgplayer_url if card else ""
        out.append(
            PriceAlertOut(
                id=a.id,
                card_id=a.card_id,
                product_id=a.product_id,
                card_name=card.name if card else a.card_id,
                art_name=art_name,
                image_url=image or "",
                tcgplayer_url=url or "",
                is_alt=a.product_id > 0,
                current_price=price,
                target_price=a.target_price,
                direction=a.direction,
                notify_email=a.notify_email,
                notify_app=a.notify_app,
                paused=a.paused,
                armed=a.armed,
                met_now=condition_met(a.direction, price, a.target_price),
                triggered_at=a.triggered_at,
                triggered_price=a.triggered_price,
                created_at=a.created_at,
            )
        )
    return out


def _user_alerts(db: Session, user: User) -> list[PriceAlert]:
    return list(
        db.scalars(
            select(PriceAlert).where(PriceAlert.user_id == user.id).order_by(PriceAlert.created_at.desc(), PriceAlert.id.desc())
        )
    )


def _own_alert(db: Session, user: User, alert_id: int) -> PriceAlert:
    alert = db.scalar(select(PriceAlert).where(PriceAlert.id == alert_id, PriceAlert.user_id == user.id))
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.get("/price-alerts", response_model=PriceAlertList)
def list_price_alerts(user: CurrentUser, db: DB):
    return PriceAlertList(alerts=_serialize(db, _user_alerts(db, user)), email_enabled=mailer.email_enabled())


@router.get("/price-alerts/card/{card_id}", response_model=PriceAlertList)
def list_card_price_alerts(card_id: str, user: CurrentUser, db: DB):
    cid = card_id.upper().strip()
    alerts = [a for a in _user_alerts(db, user) if a.card_id == cid]
    return PriceAlertList(alerts=_serialize(db, alerts), email_enabled=mailer.email_enabled())


@router.post("/price-alerts", response_model=PriceAlertOut)
def upsert_price_alert(body: PriceAlertCreate, user: CurrentUser, db: DB):
    _limit_writes(user)
    card_id = body.card_id.upper().strip()
    if db.get(CatalogCard, card_id) is None:
        raise HTTPException(status_code=404, detail="Card not found")
    if body.product_id:
        owns = db.scalar(
            select(CatalogPrinting.id).where(
                CatalogPrinting.card_id == card_id, CatalogPrinting.product_id == body.product_id
            )
        )
        if owns is None:
            raise HTTPException(status_code=404, detail="That art does not belong to this card")
    alert = db.scalar(
        select(PriceAlert).where(
            PriceAlert.user_id == user.id, PriceAlert.card_id == card_id, PriceAlert.product_id == body.product_id
        )
    )
    if alert is None:
        count = db.scalar(select(func.count()).select_from(PriceAlert).where(PriceAlert.user_id == user.id)) or 0
        if count >= MAX_ALERTS_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=f"You can watch up to {MAX_ALERTS_PER_USER} arts. Remove one to add another.",
            )
        alert = PriceAlert(user_id=user.id, card_id=card_id, product_id=body.product_id)
        db.add(alert)
    alert.target_price = body.target_price
    alert.direction = body.direction
    alert.notify_email = body.notify_email
    alert.notify_app = body.notify_app
    alert.paused = False
    price = current_price(db, card_id, body.product_id)
    alert.last_price = price
    # Already past the target when it is set: wait for the next real crossing instead of firing now.
    alert.armed = not condition_met(alert.direction, price, alert.target_price)
    db.commit()
    db.refresh(alert)
    return _serialize(db, [alert])[0]


@router.patch("/price-alerts/{alert_id}", response_model=PriceAlertOut)
def patch_price_alert(alert_id: int, body: PriceAlertUpdate, user: CurrentUser, db: DB):
    _limit_writes(user)
    alert = _own_alert(db, user, alert_id)
    rearm = False
    if body.target_price is not None and body.target_price != alert.target_price:
        alert.target_price = body.target_price
        rearm = True
    if body.direction is not None and body.direction != alert.direction:
        alert.direction = body.direction
        rearm = True
    if body.notify_email is not None:
        alert.notify_email = body.notify_email
    if body.notify_app is not None:
        alert.notify_app = body.notify_app
    if body.paused is not None:
        if alert.paused and not body.paused:
            rearm = True  # prices moved while paused; judge it fresh instead of firing on resume
        alert.paused = body.paused
    if rearm:
        price = current_price(db, alert.card_id, alert.product_id)
        alert.last_price = price
        alert.armed = not condition_met(alert.direction, price, alert.target_price)
    db.commit()
    db.refresh(alert)
    return _serialize(db, [alert])[0]


@router.delete("/price-alerts/{alert_id}", status_code=204)
def delete_price_alert(alert_id: int, user: CurrentUser, db: DB) -> Response:
    _limit_writes(user)
    alert = _own_alert(db, user, alert_id)
    db.delete(alert)
    db.commit()
    return Response(status_code=204)


def _unread(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == user.id, Notification.read_at.is_(None)
            )
        )
        or 0
    )


@router.get("/notifications", response_model=NotificationList)
def list_notifications(user: CurrentUser, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 30):
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    ).all()
    return NotificationList(items=[NotificationOut.model_validate(r) for r in rows], unread=_unread(db, user))


@router.post("/notifications/read")
def mark_notifications_read(user: CurrentUser, db: DB, body: NotificationsRead | None = None):
    """Mark the given ids (or everything, when no ids are sent) as read. Only your own rows change."""
    stmt = (
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    if body is not None and body.ids is not None:
        stmt = stmt.where(Notification.id.in_(body.ids))
    db.execute(stmt)
    db.commit()
    return {"unread": _unread(db, user)}
