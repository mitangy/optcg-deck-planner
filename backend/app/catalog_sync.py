"""TCGCSV catalog sync into Postgres."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain import is_special_printing
from app.models import CatalogCard, CatalogMeta

CATEGORY_ID = 68
USER_AGENT = "OPTCGWebTracker/1.0"
TCGCSV_BASE = f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}"
REQUEST_PAUSE_S = 0.12


def _get_json(client: httpx.Client, url: str) -> dict[str, Any]:
    resp = client.get(url, headers={"User-Agent": USER_AGENT}, timeout=60.0)
    resp.raise_for_status()
    return resp.json()


def _extended_map(product: dict[str, Any]) -> dict[str, str]:
    return {
        item["name"]: item["value"]
        for item in (product.get("extendedData") or [])
        if "name" in item and "value" in item
    }


def _pick_price(price_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not price_rows:
        return None
    normals = [p for p in price_rows if (p.get("subTypeName") or "").lower() == "normal"]
    pool = normals or price_rows

    def key(p: dict[str, Any]) -> tuple:
        market = p.get("marketPrice")
        low = p.get("lowPrice")
        return (
            market is None,
            market if market is not None else 1e9,
            low if low is not None else 1e9,
        )

    return sorted(pool, key=key)[0]


def sync_catalog(db: Session) -> dict[str, Any]:
    """Full TCGCSV pull; keeps the cheapest non-special-preferring row per card_id."""
    best: dict[str, dict[str, Any]] = {}

    with httpx.Client() as client:
        groups = _get_json(client, f"{TCGCSV_BASE}/groups")["results"]
        for i, group in enumerate(groups, start=1):
            group_id = group["groupId"]
            group_name = group["name"]
            print(f"  [{i}/{len(groups)}] {group_name}", flush=True)
            try:
                products = _get_json(client, f"{TCGCSV_BASE}/{group_id}/products")["results"]
                time.sleep(REQUEST_PAUSE_S)
                prices_raw = _get_json(client, f"{TCGCSV_BASE}/{group_id}/prices")["results"]
                time.sleep(REQUEST_PAUSE_S)
            except httpx.HTTPError as exc:
                print(f"    skip ({exc})")
                continue

            prices_by_id: dict[int, list[dict[str, Any]]] = {}
            for row in prices_raw:
                prices_by_id.setdefault(row["productId"], []).append(row)

            for product in products:
                ed = _extended_map(product)
                number = (ed.get("Number") or "").strip().upper()
                if not number:
                    continue
                price = _pick_price(prices_by_id.get(product["productId"], []))
                name = product.get("name") or number
                entry = {
                    "card_id": number,
                    "name": name,
                    "rarity": ed.get("Rarity") or "",
                    "color": ed.get("Color") or "",
                    "card_type": ed.get("CardType") or "",
                    "cost": (ed.get("Cost") or "").strip() or None,
                    "market_price": price.get("marketPrice") if price else None,
                    "low_price": price.get("lowPrice") if price else None,
                    "image_url": product.get("imageUrl") or "",
                    "tcgplayer_url": product.get("url") or "",
                    "group_name": group_name,
                    "is_special": 1 if is_special_printing(name) else 0,
                    "product_id": product["productId"],
                }
                prev = best.get(number)
                if prev is None:
                    best[number] = entry
                    continue
                # Prefer standard printing, then cheapest market
                prev_key = (
                    prev["is_special"],
                    prev["market_price"] if prev["market_price"] is not None else 1e9,
                )
                new_key = (
                    entry["is_special"],
                    entry["market_price"] if entry["market_price"] is not None else 1e9,
                )
                if new_key < prev_key:
                    best[number] = entry

    now = datetime.now(timezone.utc)
    for card_id, entry in best.items():
        row = db.get(CatalogCard, card_id)
        payload = {k: v for k, v in entry.items() if k != "product_id"}
        payload["updated_at"] = now
        if row is None:
            db.add(CatalogCard(**payload))
        else:
            for key, value in payload.items():
                setattr(row, key, value)

    meta = db.scalar(select(CatalogMeta).limit(1))
    if meta is None:
        meta = CatalogMeta(card_count=len(best), last_synced_at=now, notes="TCGCSV sync")
        db.add(meta)
    else:
        meta.card_count = len(best)
        meta.last_synced_at = now
        meta.notes = "TCGCSV sync"

    db.commit()
    return {"card_count": len(best), "synced_at": now.isoformat()}
