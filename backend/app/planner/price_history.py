"""Daily market-price history per TCGPlayer product (#946).

Stored one row per product and month, with the days as a 31-entry JSON array,
so ~7.4k products over ~33 months stay a few hundred thousand small rows.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.planner.catalog_sync import _orm_printing_sort_key
from app.planner.models import CatalogGroup, CatalogPrinting, PriceHistoryMonth

log = logging.getLogger("uvicorn.error")

DAYS_PER_ROW = 31
# SQLite caps bound parameters per statement; Postgres has no such limit but the same chunk is fine.
_CHUNK = 500


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _load(raw: str) -> list[float | None]:
    try:
        values = json.loads(raw)
    except ValueError:
        values = []
    if not isinstance(values, list):
        values = []
    values = values[:DAYS_PER_ROW]
    return values + [None] * (DAYS_PER_ROW - len(values))


def record_prices(db: Session, day: date, prices: dict[int, float | None]) -> int:
    """Store each product's market price for `day`; the same day is overwritten.

    Products with no price (None) are skipped. Returns how many were stored.
    The caller commits.
    """
    wanted = {int(pid): float(v) for pid, v in prices.items() if v is not None}
    if not wanted:
        return 0
    month = _month_start(day)
    pids = list(wanted)
    existing: dict[int, PriceHistoryMonth] = {}
    for i in range(0, len(pids), _CHUNK):
        chunk = pids[i : i + _CHUNK]
        rows = db.scalars(
            select(PriceHistoryMonth).where(
                PriceHistoryMonth.month == month, PriceHistoryMonth.product_id.in_(chunk)
            )
        ).all()
        existing.update({r.product_id: r for r in rows})
    for pid, value in wanted.items():
        row = existing.get(pid)
        values = _load(row.market) if row is not None else [None] * DAYS_PER_ROW
        values[day.day - 1] = round(value, 2)
        payload = json.dumps(values, separators=(",", ":"))
        if row is None:
            db.add(PriceHistoryMonth(product_id=pid, month=month, market=payload))
        else:
            row.market = payload
    db.flush()
    return len(wanted)


def record_prices_safely(db: Session, day: date, prices: dict[int, float | None]) -> None:
    """record_prices that logs instead of raising: history must never break a price sync."""
    try:
        record_prices(db, day, prices)
        db.commit()
    except Exception:  # noqa: BLE001 - best effort
        db.rollback()
        log.exception("price history: could not record %s", day.isoformat())


def history_points(db: Session, product_id: int) -> list[tuple[str, float]]:
    """(YYYY-MM-DD, price) for every recorded day, oldest first."""
    rows = db.scalars(
        select(PriceHistoryMonth)
        .where(PriceHistoryMonth.product_id == product_id)
        .order_by(PriceHistoryMonth.month)
    ).all()
    points: list[tuple[str, float]] = []
    for row in rows:
        for index, value in enumerate(_load(row.market)):
            if value is None:
                continue
            try:
                day = row.month.replace(day=index + 1)
            except ValueError:  # day 31 of a 30-day month
                continue
            points.append((day.isoformat(), float(value)))
    return points


def resolve_printing(db: Session, card_id: str, product_id: int) -> CatalogPrinting | None:
    """The printing to chart: `product_id`, or (0) the card's base art, the one the catalog shows."""
    rows = list(db.scalars(select(CatalogPrinting).where(CatalogPrinting.card_id == card_id)).all())
    if not rows:
        return None
    if product_id == 0:
        return sorted(rows, key=_orm_printing_sort_key)[0]
    return next((r for r in rows if r.product_id == product_id), None)


def release_date(db: Session, group_name: str) -> date | None:
    """When the set named `group_name` was published (printings only carry the name)."""
    return db.scalar(
        select(CatalogGroup.published_on)
        .where(CatalogGroup.name == group_name, CatalogGroup.published_on.is_not(None))
        .order_by(CatalogGroup.published_on)
        .limit(1)
    )


_ART_MARK = re.compile(r"\([^)]*\)")


def later_reprints(db: Session, printing: CatalogPrinting, released: date | None) -> list[str]:
    """Sorted distinct release dates of later plain reprints of this printing's card (#1311).

    A reprint is another printing of the same card number with no "(...)" art mark in its
    name, in a set that released after `released` (so never the printing's own set). Older printings have
    usually dropped about 10% in the two months after one.
    """
    if released is None:
        return []
    others = db.scalars(
        select(CatalogPrinting).where(CatalogPrinting.card_id == printing.card_id)
    ).all()
    names = {o.group_name for o in others if not _ART_MARK.search(o.name or "")}
    if not names:
        return []
    rows = db.execute(
        select(CatalogGroup.name, func.min(CatalogGroup.published_on))
        .where(CatalogGroup.name.in_(names), CatalogGroup.published_on.is_not(None))
        .group_by(CatalogGroup.name)
    ).all()
    return sorted({day.isoformat() for _, day in rows if day is not None and day > released})


def known_product_ids(db: Session, product_ids: list[int]) -> set[int]:
    """The ids among `product_ids` that are catalog printings (sealed product is not)."""
    found: set[int] = set()
    for i in range(0, len(product_ids), _CHUNK):
        chunk = product_ids[i : i + _CHUNK]
        found.update(db.scalars(select(CatalogPrinting.product_id).where(CatalogPrinting.product_id.in_(chunk))))
    return found
