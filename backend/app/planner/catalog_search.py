"""Catalog search (fuzzy name matching, filters, ranking) and printings lookup."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import fuzzy
from app.domain import (
    parse_cost,
)
from app.models import (
    CatalogCard,
    CatalogMeta,
    CatalogPrinting,
)
from app.planner.catalog_repo import (
    alt_arts_map,
    alt_owned_map,
)
from app.schemas import (
    CatalogCardResult,
    PrintingView,
)


def card_printings(db: Session, card_id: str) -> list[PrintingView]:
    """Every catalog printing of one card number, cheapest plain first.

    The scanner needs this to price what the user is physically holding: a
    single card number can span a base printing and far pricier alternate-art
    or manga treatments, which the card face distinguishes only by a small
    star above the rarity badge.
    """
    rows = db.scalars(
        select(CatalogPrinting).where(CatalogPrinting.card_id == card_id)
    ).all()
    views = [
        PrintingView(
            product_id=row.product_id,
            name=row.name,
            market_price=row.market_price,
            low_price=row.low_price,
            image_url=row.image_url,
            tcgplayer_url=row.tcgplayer_url,
            group_name=row.group_name,
            is_special=bool(row.is_special),
        )
        for row in rows
    ]
    views.sort(
        key=lambda p: (
            p.is_special,
            p.market_price is None,
            p.market_price if p.market_price is not None else 1e9,
            p.product_id,
        )
    )
    return views


_FUZZY_INDEX: dict[tuple, list[tuple[str, list[tuple[str, ...]]]]] = {}


def _fuzzy_index(db: Session) -> list[tuple[str, list[tuple[str, ...]]]]:
    """(card_id, searchable texts) per card, cached until the catalog's size or sync time changes."""
    meta = db.scalar(select(CatalogMeta.last_synced_at).order_by(CatalogMeta.id.desc()).limit(1))
    key = (
        id(db.get_bind()),
        db.scalar(select(func.count()).select_from(CatalogCard)),
        db.scalar(select(func.count()).select_from(CatalogPrinting)),
        meta,
    )
    hit = _FUZZY_INDEX.get(key)
    if hit is not None:
        return hit
    texts: dict[str, list[str]] = defaultdict(list)
    for cid, name, group in db.execute(
        select(CatalogCard.card_id, CatalogCard.name, CatalogCard.group_name)
    ):
        texts[cid].append(f"{name or ''} {group or ''}")
    for cid, name, group in db.execute(
        select(CatalogPrinting.card_id, CatalogPrinting.name, CatalogPrinting.group_name)
    ):
        texts[cid].append(f"{name or ''} {group or ''}")
    built = [
        (cid, list(dict.fromkeys(tuple(fuzzy.tokens(t)) for t in ts))) for cid, ts in texts.items()
    ]
    _FUZZY_INDEX.clear()
    _FUZZY_INDEX[key] = built
    return built


def _fuzzy_card_costs(db: Session, matcher: fuzzy.QueryMatcher) -> dict[str, int]:
    """card_id -> best total edit distance over the card's name/set texts (cards that fuzzy-match only)."""
    out: dict[str, int] = {}
    for cid, texts in _fuzzy_index(db):
        costs = [c for c in (matcher.cost_words(t) for t in texts) if c is not None]
        if costs:
            out[cid] = min(costs)
    return out


def search_catalog(
    db: Session,
    *,
    q: str = "",
    color: str = "",
    card_type: str = "",
    limit: int = 40,
    alts: bool = False,
    user_id: int | None = None,
) -> list[CatalogCardResult]:
    """Search cards by name, id, color, type, rarity, or set.

    With ``alts`` each matched card is followed by its alt-art printings as their
    own rows (``alt_product_id`` set), capped at ``limit`` rows in total.

    Text also matches any printing's name or set, so a card reprinted in another
    set is found there (one row per card, shown as its preferred printing).
    """
    limit = max(1, min(limit, 100))
    stmt = select(CatalogCard)
    filters = []
    query = (q or "").strip()
    if query:
        like = f"%{query}%"
        filters.append(
            or_(
                CatalogCard.card_id.ilike(like),
                CatalogCard.name.ilike(like),
                CatalogCard.color.ilike(like),
                CatalogCard.card_type.ilike(like),
                CatalogCard.rarity.ilike(like),
                CatalogCard.group_name.ilike(like),
                CatalogCard.card_id.in_(
                    select(CatalogPrinting.card_id).where(
                        or_(
                            CatalogPrinting.name.ilike(like),
                            CatalogPrinting.group_name.ilike(like),
                        )
                    )
                ),
            )
        )
    other_filters = []
    color_q = (color or "").strip()
    if color_q:
        other_filters.append(CatalogCard.color.ilike(f"%{color_q}%"))
    type_q = (card_type or "").strip()
    if type_q:
        other_filters.append(CatalogCard.card_type.ilike(f"%{type_q}%"))
    filters.extend(other_filters)
    if filters:
        stmt = stmt.where(*filters)
    # Prefer exact id matches, then cheaper market price, then name.
    q_upper = query.upper()
    order = [
        CatalogCard.market_price.is_(None),
        CatalogCard.market_price.asc(),
        CatalogCard.name.asc(),
        CatalogCard.card_id.asc(),
    ]
    if query:
        order.insert(0, (func.upper(CatalogCard.card_id) == q_upper).desc())
    stmt = stmt.order_by(*order).limit(limit)
    rows = list(db.scalars(stmt).all())
    qtokens = fuzzy.tokens(query)
    matcher = fuzzy.QueryMatcher(qtokens)
    if qtokens and len(rows) < limit:
        # Typo-tolerant pass: cards the substring search missed, closest first.
        seen = {r.card_id for r in rows}
        costs = _fuzzy_card_costs(db, matcher)
        costs = {cid: c for cid, c in costs.items() if cid not in seen}
        if len(costs) > 500:
            costs = dict(sorted(costs.items(), key=lambda kv: kv[1])[:500])
        if costs:
            extra_stmt = select(CatalogCard).where(CatalogCard.card_id.in_(costs), *other_filters)
            extra = list(db.scalars(extra_stmt).all())
            extra.sort(
                key=lambda r: (
                    costs[r.card_id],
                    r.market_price is None,
                    r.market_price if r.market_price is not None else 1e9,
                    r.name,
                    r.card_id,
                )
            )
            rows.extend(extra[: limit - len(rows)])

    def base_result(row: CatalogCard) -> CatalogCardResult:
        return CatalogCardResult(
            card_id=row.card_id,
            name=row.name,
            rarity=row.rarity or "",
            color=row.color or "",
            card_type=row.card_type or "",
            cost=parse_cost(row.cost),
            market_price=row.market_price,
            low_price=row.low_price,
            image_url=row.image_url or "",
            tcgplayer_url=row.tcgplayer_url or "",
            group_name=row.group_name or "",
        )

    if not alts:
        return [base_result(row) for row in rows]

    ids = {row.card_id for row in rows}
    alt_map = alt_arts_map(db, ids)
    alt_owned = alt_owned_map(db, user_id) if user_id is not None else {}
    needle = query.lower()
    plain_text_hit: set[str] = set()

    def text_hit(*texts: str | None) -> bool:
        return any(needle in (t or "").lower() for t in texts) or (
            matcher.cost(" ".join(t or "" for t in texts)) is not None
        )

    if needle and ids:
        for pr in db.scalars(
            select(CatalogPrinting).where(CatalogPrinting.card_id.in_(ids))
        ).all():
            if pr.is_special != 1 and text_hit(pr.name, pr.group_name):
                plain_text_hit.add(pr.card_id)
    out: list[CatalogCardResult] = []
    for row in rows:
        if len(out) >= limit:
            break
        card_hit = not needle or any(
            needle in (v or "").lower()
            for v in (
                row.card_id,
                row.name,
                row.color,
                row.card_type,
                row.rarity,
                row.group_name,
            )
        ) or text_hit(row.name, row.group_name)
        if card_hit or row.card_id in plain_text_hit:
            out.append(base_result(row))
        for alt in alt_map.get(row.card_id, []):
            if len(out) >= limit:
                break
            if not card_hit and not text_hit(alt.name, alt.group_name):
                continue
            base = base_result(row)
            out.append(
                base.model_copy(
                    update={
                        "name": alt.name,
                        "market_price": alt.market_price,
                        "low_price": alt.low_price,
                        "image_url": alt.image_url or "",
                        "tcgplayer_url": alt.tcgplayer_url or "",
                        "group_name": alt.group_name or "",
                        "alt_product_id": alt.product_id,
                        "owned": int(alt_owned.get(row.card_id, {}).get(alt.product_id, 0)),
                    }
                )
            )
    return out
