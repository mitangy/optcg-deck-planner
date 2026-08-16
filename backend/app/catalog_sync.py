"""TCGCSV catalog sync into Postgres."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain import is_don_product, is_special_printing, synthetic_don_card_id
from app.models import CatalogCard, CatalogMeta, CatalogPrinting

CATEGORY_ID = 68
USER_AGENT = "OPTCGWebTracker/1.0"
TCGCSV_BASE = f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}"
REQUEST_PAUSE_S = 0.12

# A full TCGCSV pull walks every set (many HTTP round-trips + throttle sleeps),
# so it must never run inside a request handler — on Render free that blocks the
# single instance and the HTTP client (Vercel proxy / GitHub Action curl) times
# out. It is launched as a background job instead; this guard keeps at most one
# sync running at a time and records the outcome for observability.
_sync_lock = threading.Lock()
_sync_state: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_result": None,
    "last_error": None,
}


def sync_in_progress() -> bool:
    return _sync_state["running"]


def sync_status() -> dict[str, Any]:
    return dict(_sync_state)


def _default_session_factory() -> Session:
    # Imported lazily so importing this module never triggers engine creation.
    from app.db import SessionLocal

    return SessionLocal()


def run_catalog_sync_job(
    session_factory: Callable[[], Session] | None = None,
) -> dict[str, Any] | None:
    """Run a full catalog sync in its own DB session (for background execution).

    Returns the sync result, or ``None`` if a sync was already running (the
    non-blocking lock keeps concurrent syncs from clobbering the catalog).
    """
    if not _sync_lock.acquire(blocking=False):
        return None
    factory = session_factory or _default_session_factory
    _sync_state.update(
        running=True,
        started_at=datetime.now(timezone.utc).isoformat(),
        finished_at=None,
        last_error=None,
    )
    db = factory()
    try:
        result = sync_catalog(db)
        _sync_state["last_result"] = result
        return result
    except Exception as exc:  # noqa: BLE001 — record and surface via status
        _sync_state["last_error"] = str(exc)
        raise
    finally:
        db.close()
        _sync_state["running"] = False
        _sync_state["finished_at"] = datetime.now(timezone.utc).isoformat()
        _sync_lock.release()


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


def resolve_catalog_card_id(product: dict[str, Any], ed: dict[str, str] | None = None) -> str | None:
    """Return catalog card_id for a TCGCSV product, or None if it should be skipped."""
    fields = ed if ed is not None else _extended_map(product)
    product_id = int(product["productId"])
    name = product.get("name") or ""
    rarity = fields.get("Rarity") or ""
    card_type = fields.get("CardType") or fields.get("Card Type") or ""
    number = (fields.get("Number") or "").strip().upper()
    if number:
        return number
    if is_don_product(name=name, card_type=card_type, rarity=rarity):
        return synthetic_don_card_id(product_id)
    return None


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


def _orm_printing_sort_key(row: CatalogPrinting) -> tuple:
    return (
        int(row.is_special or 0),
        row.market_price if row.market_price is not None else 1e9,
        int(row.product_id),
    )


def refresh_special_flags(db: Session) -> dict[str, int]:
    """Recompute is_special from stored names and re-pick preferred catalog rows.

    Lets deploys that only widen SPECIAL_NAME_MARKERS update alt-art visibility
    without waiting on a full TCGCSV pull.
    """
    printings = list(db.scalars(select(CatalogPrinting)).all())
    if not printings:
        return {"printings_updated": 0, "cards_updated": 0}

    printings_updated = 0
    by_card: dict[str, list[CatalogPrinting]] = defaultdict(list)
    for row in printings:
        flag = 1 if is_special_printing(row.name) else 0
        if int(row.is_special or 0) != flag:
            row.is_special = flag
            printings_updated += 1
        by_card[row.card_id].append(row)

    now = datetime.now(timezone.utc)
    cards_updated = 0
    for card_id, rows in by_card.items():
        best = sorted(rows, key=_orm_printing_sort_key)[0]
        card = db.get(CatalogCard, card_id)
        if card is None:
            continue
        payload = {
            "name": best.name,
            "market_price": best.market_price,
            "low_price": best.low_price,
            "image_url": best.image_url,
            "tcgplayer_url": best.tcgplayer_url,
            "group_name": best.group_name,
            "is_special": int(best.is_special or 0),
        }
        changed = False
        for key, value in payload.items():
            if getattr(card, key) != value:
                setattr(card, key, value)
                changed = True
        if changed:
            card.updated_at = now
            cards_updated += 1

    if printings_updated or cards_updated:
        db.commit()
    return {
        "printings_updated": printings_updated,
        "cards_updated": cards_updated,
    }


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
                card_id = resolve_catalog_card_id(product, ed)
                if not card_id:
                    continue
                product_id = int(product["productId"])
                price = _pick_price(prices_by_id.get(product_id, []))
                name = product.get("name") or card_id
                rarity = ed.get("Rarity") or ""
                card_type = ed.get("CardType") or ed.get("Card Type") or ""
                entry = {
                    "card_id": card_id,
                    "product_id": product_id,
                    "name": name,
                    "rarity": rarity,
                    "color": ed.get("Color") or "",
                    "card_type": card_type,
                    "cost": (ed.get("Cost") or "").strip() or None,
                    "market_price": price.get("marketPrice") if price else None,
                    "low_price": price.get("lowPrice") if price else None,
                    "image_url": product.get("imageUrl") or "",
                    "tcgplayer_url": product.get("url") or "",
                    "group_name": group_name,
                    "is_special": 1 if is_special_printing(name) else 0,
                }
                by_card[card_id].append(entry)

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
