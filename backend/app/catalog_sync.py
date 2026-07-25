"""TCGCSV catalog sync into Postgres."""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain import is_special_printing
from app.models import CatalogCard, CatalogMeta, CatalogPrinting

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


def _printing_sort_key(entry: dict[str, Any]) -> tuple:
    """Prefer standard (non-special) then cheapest market."""
    return (
        entry["is_special"],
        entry["market_price"] if entry["market_price"] is not None else 1e9,
    )


def sync_catalog(db: Session) -> dict[str, Any]:
    """Full TCGCSV pull; stores all printings and a preferred CatalogCard per number."""
    by_card: dict[str, list[dict[str, Any]]] = defaultdict(list)

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
                    "product_id": int(product["productId"]),
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
                }
                by_card[number].append(entry)

    now = datetime.now(timezone.utc)
    db.execute(delete(CatalogPrinting))

    printing_count = 0
    for card_id, entries in by_card.items():
        # Dedupe by product_id (same product shouldn't appear twice)
        unique: dict[int, dict[str, Any]] = {}
        for entry in entries:
            unique[entry["product_id"]] = entry
        entries = list(unique.values())
        printing_count += len(entries)

        best = sorted(entries, key=_printing_sort_key)[0]
        row = db.get(CatalogCard, card_id)
        payload = {
            "card_id": card_id,
            "name": best["name"],
            "rarity": best["rarity"],
            "color": best["color"],
            "card_type": best["card_type"],
            "cost": best["cost"],
            "market_price": best["market_price"],
            "low_price": best["low_price"],
            "image_url": best["image_url"],
            "tcgplayer_url": best["tcgplayer_url"],
            "group_name": best["group_name"],
            "is_special": best["is_special"],
            "updated_at": now,
        }
        if row is None:
            db.add(CatalogCard(**payload))
        else:
            for key, value in payload.items():
                setattr(row, key, value)

        for entry in entries:
            db.add(
                CatalogPrinting(
                    card_id=card_id,
                    product_id=entry["product_id"],
                    name=entry["name"],
                    market_price=entry["market_price"],
                    low_price=entry["low_price"],
                    image_url=entry["image_url"],
                    tcgplayer_url=entry["tcgplayer_url"],
                    group_name=entry["group_name"],
                    is_special=entry["is_special"],
                    updated_at=now,
                )
            )

    meta = db.scalar(select(CatalogMeta).limit(1))
    notes = f"TCGCSV sync ({printing_count} printings)"
    if meta is None:
        meta = CatalogMeta(card_count=len(by_card), last_synced_at=now, notes=notes)
        db.add(meta)
    else:
        meta.card_count = len(by_card)
        meta.last_synced_at = now
        meta.notes = notes

    db.commit()
    return {
        "card_count": len(by_card),
        "printing_count": printing_count,
        "synced_at": now.isoformat(),
    }
