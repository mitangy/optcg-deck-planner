"""Fetch recent TCGPlayer sold prices for a product."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.schemas import RecentSale

TCGPLAYER_SALES_URL = "https://mpapi.tcgplayer.com/v2/product/{product_id}/latestsales"
CACHE_TTL_S = 30 * 60
_CACHE: dict[int, tuple[float, list[RecentSale]]] = {}

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


def _parse_sale(row: dict[str, Any]) -> RecentSale | None:
    price = row.get("purchasePrice")
    if price is None:
        return None
    try:
        purchase = float(price)
    except (TypeError, ValueError):
        return None
    shipping_raw = row.get("shippingPrice")
    try:
        shipping = float(shipping_raw) if shipping_raw is not None else 0.0
    except (TypeError, ValueError):
        shipping = 0.0
    return RecentSale(
        price=purchase,
        shipping=shipping,
        condition=str(row.get("condition") or ""),
        variant=str(row.get("variant") or ""),
        language=str(row.get("language") or ""),
        quantity=int(row.get("quantity") or 1),
        order_date=str(row.get("orderDate") or ""),
    )


def fetch_recent_sales(product_id: int, limit: int = 3) -> list[RecentSale]:
    """Return up to `limit` most recent marketplace sales for a TCGPlayer product."""
    if product_id <= 0:
        raise ValueError("Invalid product id")
    limit = max(1, min(limit, 10))

    now = time.time()
    cached = _CACHE.get(product_id)
    if cached and now - cached[0] < CACHE_TTL_S:
        return cached[1][:limit]

    url = TCGPLAYER_SALES_URL.format(product_id=product_id)
    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            url,
            headers=_HEADERS,
            json={"conditions": [1], "languages": [1], "listingType": "All"},
            params={"limit": limit},
        )
        resp.raise_for_status()
        payload = resp.json()

    rows = payload.get("data") or []
    sales: list[RecentSale] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        sale = _parse_sale(row)
        if sale is not None:
            sales.append(sale)
        if len(sales) >= 10:
            break

    _CACHE[product_id] = (now, sales)
    return sales[:limit]
