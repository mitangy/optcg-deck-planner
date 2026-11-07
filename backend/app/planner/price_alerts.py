"""Card price alerts (#855): check watched prices after each price update, notify on a crossing."""

from __future__ import annotations

import html
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.planner import mailer
from app.core.config import get_settings
from app.models import CatalogCard, CatalogPrinting, Notification, PriceAlert, User

log = logging.getLogger("uvicorn.error")

MAX_NOTIFICATIONS_PER_USER = 100
ALERTS_LINK = "/alerts"


def condition_met(direction: str, price: float | None, target: float) -> bool:
    """Below fires at or under the target, above at or over it. No price never counts."""
    if price is None:
        return False
    if direction == "above":
        return price >= target
    return price <= target


def current_prices(db: Session, pairs: set[tuple[str, int]]) -> dict[tuple[str, int], float | None]:
    """(card_id, product_id) -> market price; product 0 is the card's base art."""
    out: dict[tuple[str, int], float | None] = {}
    base_ids = {c for c, p in pairs if p == 0}
    alt_ids = {c for c, p in pairs if p != 0}
    if base_ids:
        for card in db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(base_ids))):
            out[(card.card_id, 0)] = card.market_price
    if alt_ids:
        for row in db.scalars(select(CatalogPrinting).where(CatalogPrinting.card_id.in_(alt_ids))):
            if (row.card_id, row.product_id) in pairs:
                out[(row.card_id, row.product_id)] = row.market_price
    return {pair: out.get(pair) for pair in pairs}


def current_price(db: Session, card_id: str, product_id: int) -> float | None:
    return current_prices(db, {(card_id, product_id)})[(card_id, product_id)]


def _label(card_name: str, art_name: str) -> str:
    """Base art shows the card name; an alt's printing name already includes it."""
    return card_name if art_name == "Base" else art_name


def _money(value: float) -> str:
    return f"${value:,.2f}"


@dataclass
class Fired:
    alert_id: int
    card_id: str
    product_id: int
    card_name: str
    art_name: str
    price: float
    target: float
    direction: str
    url: str


def _names(db: Session, pairs: set[tuple[str, int]]) -> dict[tuple[str, int], tuple[str, str, str]]:
    """(card_id, product_id) -> (card name, art name, TCGPlayer url)."""
    cards = {
        c.card_id: c
        for c in db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_({c for c, _ in pairs})))
    }
    printings = {
        (r.card_id, r.product_id): r
        for r in db.scalars(
            select(CatalogPrinting).where(CatalogPrinting.card_id.in_({c for c, p in pairs if p != 0}))
        )
    } if any(p for _, p in pairs) else {}
    out = {}
    for card_id, product_id in pairs:
        card = cards.get(card_id)
        name = card.name if card else card_id
        if product_id:
            row = printings.get((card_id, product_id))
            out[(card_id, product_id)] = (name, row.name if row else "Alt art", row.tcgplayer_url if row else "")
        else:
            out[(card_id, product_id)] = (name, "Base", card.tcgplayer_url if card else "")
    return out


def _prune(db: Session, user_id: int) -> None:
    keep = db.scalars(
        select(Notification.id)
        .where(Notification.user_id == user_id)
        .order_by(Notification.id.desc())
        .limit(MAX_NOTIFICATIONS_PER_USER)
    ).all()
    if len(keep) == MAX_NOTIFICATIONS_PER_USER:
        db.execute(
            delete(Notification).where(Notification.user_id == user_id, Notification.id < min(keep))
        )


def _email_content(fired: list[Fired], link: str) -> tuple[str, str, str]:
    if len(fired) == 1:
        f = fired[0]
        subject = f"Price alert: {f.card_name} is now {_money(f.price)}"
    else:
        subject = f"{len(fired)} price alerts"
    footer = (
        "You get this because you set a price alert on OPTCG Planner. "
        f"Manage or turn off alerts: {link}"
    )
    text_lines, html_lines = [], []
    for f in fired:
        word = "at or below" if f.direction == "below" else "at or above"
        label = _label(f.card_name, f.art_name)
        text_lines.append(
            f"{label}: {_money(f.price)} (you asked for {word} {_money(f.target)})"
            + (f"\n  {f.url}" if f.url else "")
        )
        shown = html.escape(label)
        if f.url:
            shown = f'<a href="{html.escape(f.url, quote=True)}">{shown}</a>'
        html_lines.append(
            f"<li>{shown}: <strong>{_money(f.price)}</strong> "
            f"(you asked for {word} {_money(f.target)})</li>"
        )
    text = "\n".join(text_lines) + "\n\n" + footer
    body = (
        f"<ul>{''.join(html_lines)}</ul>"
        f'<p style="color:#666;font-size:12px">You get this because you set a price alert on OPTCG Planner. '
        f'<a href="{html.escape(link, quote=True)}">Manage or turn off alerts</a></p>'
    )
    return subject, body, text


def check_alerts(db: Session, now: datetime | None = None) -> dict:
    """Compare every live alert with its current price; fire on a crossing, re-arm on the way back."""
    now = now or datetime.now(timezone.utc)
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.paused.is_(False))).all()
    summary = {"checked": len(alerts), "fired": 0, "emails_sent": 0, "email_failures": 0}
    if not alerts:
        return summary
    pairs = {(a.card_id, a.product_id) for a in alerts}
    prices = current_prices(db, pairs)
    names = _names(db, pairs)
    link = f"{get_settings().frontend_origin.rstrip('/')}{ALERTS_LINK}"
    emails: dict[int, list[Fired]] = defaultdict(list)
    for alert in alerts:
        price = prices[(alert.card_id, alert.product_id)]
        alert.last_price = price
        if price is None:
            continue
        met = condition_met(alert.direction, price, alert.target_price)
        if met and alert.armed:
            alert.armed = False
            alert.triggered_at = now
            alert.triggered_price = price
            summary["fired"] += 1
            card_name, art_name, url = names[(alert.card_id, alert.product_id)]
            fired = Fired(
                alert.id, alert.card_id, alert.product_id, card_name, art_name, price,
                alert.target_price, alert.direction, url,
            )
            if alert.notify_app:
                word = "under" if alert.direction == "below" else "over"
                label = _label(card_name, art_name)
                db.add(
                    Notification(
                        user_id=alert.user_id,
                        kind="price_alert",
                        title=f"{label} is now {_money(price)}",
                        body=f"Your target was {word} {_money(alert.target_price)}.",
                        card_id=alert.card_id,
                        product_id=alert.product_id,
                        price=price,
                        link=ALERTS_LINK,
                        created_at=now,
                    )
                )
                db.flush()
                _prune(db, alert.user_id)
            if alert.notify_email:
                emails[alert.user_id].append(fired)
        elif not met and not alert.armed:
            alert.armed = True
    db.commit()

    if emails and mailer.email_enabled():
        for user_id, fired_list in emails.items():
            user = db.get(User, user_id)
            if user is None or not user.email:
                continue
            subject, body, text = _email_content(fired_list, link)
            try:
                ok = mailer.send_email(user.email, subject, body, text)
            except Exception as exc:  # noqa: BLE001
                log.warning("price alert email failed: %s", type(exc).__name__)
                ok = False
            summary["emails_sent" if ok else "email_failures"] += 1
    log.info(json.dumps({"event": "price_alerts", **summary}, separators=(",", ":")))
    return summary


def check_alerts_safely(db: Session) -> dict | None:
    """check_alerts for the sync/refresh hooks: a failure here must never fail a price update."""
    try:
        return check_alerts(db)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.warning("price alerts check failed: %s", type(exc).__name__)
        return None
