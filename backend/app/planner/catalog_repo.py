"""Catalog and ownership lookups shared by planner services, group buy and the social views (refactor D-02).

Lived as private helpers in the former services module; other modules reached in with underscore imports.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.planner.domain import ParsedCard
from app.planner.models import CatalogCard, CatalogPrinting, Deck, Owned, OwnedPrinting
from app.planner.schemas import PrintingView


def catalog_map(db: Session, card_ids: set[str]) -> dict[str, CatalogCard]:
    if not card_ids:
        return {}
    rows = db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
    return {r.card_id: r for r in rows}


def alt_arts_map(
    db: Session,
    card_ids: set[str],
    wanted: dict[str, dict[int, int]] | None = None,
    owned: dict[str, dict[int, int]] | None = None,
    collector: dict[str, dict[int, int]] | None = None,
) -> dict[str, list[PrintingView]]:
    """Special printings with different art than the preferred catalog row.

    Excludes the primary product id and any special whose image_url matches the
    preferred face (plain reprints that reuse base art).
    """
    if not card_ids:
        return {}
    primary_ids = primary_product_ids(db, card_ids)
    preferred_image = {
        row.card_id: (row.image_url or "").strip()
        for row in db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(card_ids))).all()
    }
    rows = db.scalars(
        select(CatalogPrinting).where(
            CatalogPrinting.card_id.in_(card_ids),
            CatalogPrinting.is_special == 1,
        )
    ).all()
    want = wanted or {}
    have = owned or {}
    coll = collector or {}
    out: dict[str, list[PrintingView]] = defaultdict(list)
    for row in rows:
        if row.product_id == primary_ids.get(row.card_id):
            continue
        img = (row.image_url or "").strip()
        pref_img = preferred_image.get(row.card_id, "")
        if img and pref_img and img == pref_img:
            continue
        out[row.card_id].append(
            PrintingView(
                product_id=row.product_id,
                name=row.name,
                market_price=row.market_price,
                low_price=row.low_price,
                image_url=row.image_url,
                tcgplayer_url=row.tcgplayer_url,
                group_name=row.group_name,
                is_special=True,
                wanted=int(want.get(row.card_id, {}).get(row.product_id, 0)),
                owned=int(have.get(row.card_id, {}).get(row.product_id, 0)),
                collector=int(coll.get(row.card_id, {}).get(row.product_id, 0)),
            )
        )
    for card_id in out:
        out[card_id].sort(
            key=lambda p: (
                p.market_price is None,
                p.market_price if p.market_price is not None else 1e9,
                p.product_id,
            )
        )
    return out


def owned_map(db: Session, user_id: int) -> dict[str, int]:
    rows = db.scalars(select(Owned).where(Owned.user_id == user_id)).all()
    return {r.card_id: r.qty for r in rows}


def alt_owned_map(db: Session, user_id: int) -> dict[str, dict[int, int]]:
    """card_id -> product_id -> copies of that alt printing the user owns (qty > 0)."""
    rows = db.scalars(select(OwnedPrinting).where(OwnedPrinting.user_id == user_id)).all()
    out: dict[str, dict[int, int]] = defaultdict(dict)
    for row in rows:
        if row.qty > 0:
            out[row.card_id][row.product_id] = row.qty
    return dict(out)


def primary_product_ids(db: Session, card_ids: set[str]) -> dict[str, int]:
    """Preferred TCGPlayer product id per card number (standard printing, then cheapest)."""
    if not card_ids:
        return {}
    rows = db.scalars(select(CatalogPrinting).where(CatalogPrinting.card_id.in_(card_ids))).all()
    best: dict[str, tuple[tuple, int]] = {}
    for row in rows:
        key = (
            int(row.is_special or 0),
            row.market_price is None,
            row.market_price if row.market_price is not None else 1e9,
            row.product_id,
        )
        prev = best.get(row.card_id)
        if prev is None or key < prev[0]:
            best[row.card_id] = (key, row.product_id)
    return {card_id: pair[1] for card_id, pair in best.items()}


def deck_card_lines(deck: Deck) -> list[ParsedCard]:
    return [ParsedCard(card_id=c.card_id, needed=c.needed) for c in deck.cards]
