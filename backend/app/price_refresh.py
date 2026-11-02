"""Hourly prices for new and upcoming sets, read from TCGPlayer's search API.

TCGCSV only refreshes once a day, so the full catalog sync is a day behind on a
set that just came out. For sets published in the last few days (and presales)
this reads the live prices directly and updates the rows the daily sync created.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import catalog_sync
from app.catalog_sync import TCGCSV_BASE, _get_json, refresh_special_flags
from app.models import CatalogPrinting

log = logging.getLogger("uvicorn.error")

SEARCH_URL = "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false"
PAGE_SIZE = 50
MAX_PAGES = 20
PAGE_PAUSE_S = 0.5
FIRST_RUN_DELAY_S = 120

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://www.tcgplayer.com",
    "Referer": "https://www.tcgplayer.com/",
}


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def recent_groups(groups: list[dict], now: datetime, days: int) -> list[dict]:
    """Groups published within `days` of now, plus upcoming ones. publishedOn is naive UTC."""
    cutoff = _utc(now) - timedelta(days=days)
    keep = []
    for group in groups:
        try:
            published = _utc(datetime.fromisoformat(str(group["publishedOn"]).replace("Z", "+00:00")))
        except (KeyError, ValueError):
            continue
        if published >= cutoff:
            keep.append(group)
    return keep


def _body(group_id: int, start: int) -> dict:
    return {
        "algorithm": "sales_dismax",
        "from": start,
        "size": PAGE_SIZE,
        "filters": {
            "term": {"productLineName": ["one-piece-card-game"], "setId": [group_id]},
            "range": {},
            "match": {},
        },
        "listingSearch": {
            "context": {"cart": {}},
            "filters": {
                "term": {"sellerStatus": "Live", "channelId": 0},
                "range": {"quantity": {"gte": 1}},
                "exclude": {"channelExclusion": 0},
            },
        },
        "context": {"cart": {}, "shippingCountry": "US"},
        "settings": {"useFuzzySearch": False, "didYouMean": {}},
        "sort": {},
    }


def _cents(value) -> float | None:
    # The search API sends unrounded market prices (12.4328); TCGCSV sends cents.
    return None if value is None else round(float(value), 2)


def fetch_group_prices(client: httpx.Client, group_id: int) -> dict[int, tuple[float | None, float | None]]:
    """product id -> (marketPrice, lowestPrice) for every product in one set."""
    prices: dict[int, tuple[float | None, float | None]] = {}
    start = 0
    for page in range(MAX_PAGES):
        if page:
            time.sleep(PAGE_PAUSE_S)
        resp = client.post(SEARCH_URL, headers=_HEADERS, json=_body(group_id, start), timeout=30.0)
        resp.raise_for_status()
        block = resp.json()["results"][0]
        rows = block.get("results") or []
        for row in rows:
            prices[int(row["productId"])] = (_cents(row.get("marketPrice")), _cents(row.get("lowestPrice")))
        start += PAGE_SIZE
        if not rows or start >= int(block.get("totalResults") or 0):
            break
    return prices


def apply_prices(db: Session, prices: dict[int, tuple], now: datetime) -> dict[str, int]:
    """Write changed prices onto known printings, then re-pick preferred rows for those cards."""
    if not prices:
        return {"printings_updated": 0, "cards_updated": 0}
    rows = db.scalars(select(CatalogPrinting).where(CatalogPrinting.product_id.in_(list(prices)))).all()
    printings_updated = 0
    card_ids: set[str] = set()
    for row in rows:
        market, low = prices[row.product_id]
        if row.market_price != market or row.low_price != low:
            row.market_price = market
            row.low_price = low
            row.updated_at = now
            printings_updated += 1
            card_ids.add(row.card_id)
    if not card_ids:
        return {"printings_updated": 0, "cards_updated": 0}
    db.flush()
    cards = refresh_special_flags(db, card_ids)
    db.commit()
    return {"printings_updated": printings_updated, "cards_updated": cards["cards_updated"]}


def refresh_new_release_prices(db: Session, client: httpx.Client, now: datetime, days: int) -> dict:
    started = time.monotonic()
    summary = {"groups": 0, "failed_groups": 0, "products_seen": 0, "printings_updated": 0, "cards_updated": 0}
    groups = recent_groups(_get_json(client, f"{TCGCSV_BASE}/groups")["results"], now, days)
    summary["groups"] = len(groups)
    prices: dict[int, tuple] = {}
    for group in groups:
        try:
            prices.update(fetch_group_prices(client, int(group["groupId"])))
        except (httpx.HTTPError, KeyError, ValueError, IndexError) as exc:
            summary["failed_groups"] += 1
            log.warning("price refresh: group %s failed: %s", group.get("groupId"), exc)
    summary["products_seen"] = len(prices)
    applied = apply_prices(db, prices, now)
    summary.update(applied)
    summary["seconds"] = round(time.monotonic() - started, 1)
    log.info(json.dumps({"event": "price_refresh", **summary}, separators=(",", ":")))
    return summary


def run_once(days: int) -> dict | None:
    """One refresh, or None while the full catalog sync (here or on another worker) runs."""
    from app.db import CATALOG_SYNC_LOCK_KEY, SessionLocal, try_advisory_lock

    if not catalog_sync._sync_lock.acquire(blocking=False):
        return None
    try:
        lock = try_advisory_lock(CATALOG_SYNC_LOCK_KEY)
        if lock is None:
            return None
        try:
            db = SessionLocal()
            client = httpx.Client()
            try:
                return refresh_new_release_prices(db, client, datetime.now(timezone.utc), days)
            finally:
                client.close()
                db.close()
        finally:
            lock.release()
    finally:
        catalog_sync._sync_lock.release()


def start_background(settings):
    """The hourly task when new-release prices are on (default in production only), else None."""
    if not settings.new_release_prices_enabled:
        return None
    from app.tournament_sync import sync_loop

    days = settings.new_release_price_days
    return asyncio.create_task(
        sync_loop(
            lambda: run_once(days),
            first_delay=FIRST_RUN_DELAY_S,
            interval=settings.new_release_price_interval_s,
        )
    )
