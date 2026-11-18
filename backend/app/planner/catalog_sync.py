
from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Callable

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.planner.domain import is_don_product, is_special_printing, synthetic_don_card_id
from app.planner.models import CatalogCard, CatalogGroup, CatalogMeta, CatalogPrinting

CATEGORY_ID = 68
USER_AGENT = "OPTCGWebTracker/1.0"
TCGCSV_BASE = f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}"
REQUEST_PAUSE_S = 0.12

log = logging.getLogger("uvicorn.error")

# A full TCGCSV pull walks every set (many HTTP round-trips + throttle sleeps),
# so it must never run inside a request handler — on Render free that blocks the
# single instance and the HTTP client (Vercel proxy / GitHub Action curl) times
# out. It is launched as a background job instead; this guard keeps at most one
# sync running at a time and records the outcome for observability.
_sync_lock = threading.Lock()
_sync_advisory = None
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


def try_claim_sync_slot() -> bool:
    """Acquire the sync lock and mark the job running.

    Call this from the HTTP handler *before* returning 202 so status polls do
    not briefly see a stale ``finished_at`` from a prior run.
    """
    if not _sync_lock.acquire(blocking=False):
        return False
    global _sync_advisory
    from app.core.db import CATALOG_SYNC_LOCK_KEY, try_advisory_lock

    try:
        _sync_advisory = try_advisory_lock(CATALOG_SYNC_LOCK_KEY)
    except BaseException:
        _sync_lock.release()
        raise
    if _sync_advisory is None:
        _sync_lock.release()
        return False
    _sync_state.update(
        running=True,
        started_at=datetime.now(timezone.utc).isoformat(),
        finished_at=None,
        last_error=None,
    )
    return True


def _default_session_factory() -> Session:
    from app.core.db import SessionLocal

    return SessionLocal()


def run_catalog_sync_job(
    session_factory: Callable[[], Session] | None = None,
    *,
    already_claimed: bool = False,
) -> dict[str, Any] | None:
    global _sync_advisory
    if not already_claimed and not try_claim_sync_slot():
        return None
    factory = session_factory or _default_session_factory
    db = factory()
    try:
        result = sync_catalog(db)
        _sync_state["last_result"] = result
        from app.planner.price_alerts import check_alerts_safely

        check_alerts_safely(db)
        return result
    except Exception as exc:  # noqa: BLE001 — record and surface via status
        _sync_state["last_error"] = str(exc)
        raise
    finally:
        db.close()
        _sync_state["running"] = False
        _sync_state["finished_at"] = datetime.now(timezone.utc).isoformat()
        if _sync_advisory is not None:
            _sync_advisory.release()
            _sync_advisory = None
        _sync_lock.release()


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status == 429 or status >= 500
    return isinstance(exc, httpx.TransportError)


_retry_wait = wait_exponential(multiplier=0.5, max=4)


@retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(3),
    wait=lambda state: _retry_wait(state),
    reraise=True,
)
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


def _special_flags(printings: list[tuple[int, str, float | None]]) -> dict[int, int]:
    marker = {pid: is_special_printing(name) for pid, name, _ in printings}
    primary = min(
        printings,
        key=lambda p: (
            marker[p[0]],
            p[2] if p[2] is not None else 1e9,
            is_special_printing(p[1], p[0]),
            p[0],
        ),
    )[0]
    return {
        pid: int(marker[pid] or (pid != primary and is_special_printing(name, pid)))
        for pid, name, _ in printings
    }


def refresh_special_flags(db: Session, card_ids: set[str] | None = None) -> dict[str, int]:
    query = select(CatalogPrinting)
    if card_ids is not None:
        if not card_ids:
            return {"printings_updated": 0, "cards_updated": 0}
        query = query.where(CatalogPrinting.card_id.in_(card_ids))
    printings = list(db.scalars(query).all())
    if not printings:
        return {"printings_updated": 0, "cards_updated": 0}

    printings_updated = 0
    by_card: dict[str, list[CatalogPrinting]] = defaultdict(list)
    for row in printings:
        by_card[row.card_id].append(row)
    for rows in by_card.values():
        flags = _special_flags([(r.product_id, r.name, r.market_price) for r in rows])
        for row in rows:
            if int(row.is_special or 0) != flags[row.product_id]:
                row.is_special = flags[row.product_id]
                printings_updated += 1

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


def _published_date(value: Any) -> date | None:
    """TCGCSV publishedOn is a naive-UTC ISO timestamp ("2024-12-06T00:00:00")."""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def store_groups(db: Session, groups: list[dict[str, Any]]) -> None:
    existing = {g.group_id: g for g in db.scalars(select(CatalogGroup)).all()}
    for group in groups:
        group_id = int(group["groupId"])
        fields = {
            "name": group.get("name") or "",
            "abbreviation": group.get("abbreviation") or "",
            "published_on": _published_date(group.get("publishedOn")),
        }
        row = existing.get(group_id)
        if row is None:
            db.add(CatalogGroup(group_id=group_id, **fields))
        else:
            for key, value in fields.items():
                setattr(row, key, value)


def sync_catalog(db: Session) -> dict[str, Any]:
    by_card: dict[str, list[dict[str, Any]]] = defaultdict(list)
    skipped_groups: set[str] = set()

    with httpx.Client() as client:
        groups = _get_json(client, f"{TCGCSV_BASE}/groups")["results"]
        for i, group in enumerate(groups, start=1):
            group_id = group["groupId"]
            group_name = group["name"]
            log.info("catalog sync [%d/%d] %s", i, len(groups), group_name)
            try:
                products = _get_json(client, f"{TCGCSV_BASE}/{group_id}/products")["results"]
                time.sleep(REQUEST_PAUSE_S)
                prices_raw = _get_json(client, f"{TCGCSV_BASE}/{group_id}/prices")["results"]
                time.sleep(REQUEST_PAUSE_S)
            except httpx.HTTPError as exc:
                log.warning("catalog sync: skipping group %s (%s): %s", group_id, group_name, exc)
                skipped_groups.add(group_name)
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
                    "is_special": 0,
                }
                by_card[card_id].append(entry)

    now = datetime.now(timezone.utc)

    existing_printings = {
        (row.card_id, row.product_id): row for row in db.scalars(select(CatalogPrinting)).all()
    }
    seen_keys: set[tuple[str, int]] = set()

    printing_count = 0
    for card_id, entries in by_card.items():
        unique: dict[int, dict[str, Any]] = {}
        for entry in entries:
            unique[entry["product_id"]] = entry
        entries = list(unique.values())
        flags = _special_flags([(e["product_id"], e["name"], e["market_price"]) for e in entries])
        for entry in entries:
            entry["is_special"] = flags[entry["product_id"]]
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
            printing_key = (card_id, entry["product_id"])
            seen_keys.add(printing_key)
            printing_payload = {
                "name": entry["name"],
                "market_price": entry["market_price"],
                "low_price": entry["low_price"],
                "image_url": entry["image_url"],
                "tcgplayer_url": entry["tcgplayer_url"],
                "group_name": entry["group_name"],
                "is_special": entry["is_special"],
                "updated_at": now,
            }
            printing_row = existing_printings.get(printing_key)
            if printing_row is None:
                db.add(
                    CatalogPrinting(
                        card_id=card_id,
                        product_id=entry["product_id"],
                        **printing_payload,
                    )
                )
            else:
                for key, value in printing_payload.items():
                    setattr(printing_row, key, value)

    stale_keys = {
        key
        for key in set(existing_printings) - seen_keys
        if existing_printings[key].group_name not in skipped_groups
    }
    if stale_keys:
        stale_ids = [existing_printings[k].id for k in stale_keys]
        db.execute(delete(CatalogPrinting).where(CatalogPrinting.id.in_(stale_ids)))

    meta = db.scalar(select(CatalogMeta).limit(1))
    notes = f"TCGCSV sync ({printing_count} printings)"
    if meta is None:
        meta = CatalogMeta(card_count=len(by_card), last_synced_at=now, notes=notes)
        db.add(meta)
    else:
        meta.card_count = len(by_card)
        meta.last_synced_at = now
        meta.notes = notes

    store_groups(db, groups)
    db.commit()

    from app.planner.price_history import record_prices_safely

    record_prices_safely(
        db,
        now.date(),
        {e["product_id"]: e["market_price"] for entries in by_card.values() for e in entries},
    )
    return {
        "card_count": len(by_card),
        "printing_count": printing_count,
        "synced_at": now.isoformat(),
    }
