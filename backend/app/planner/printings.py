"""Printing-row helpers shared by the deck, owned and shopping services."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.planner.models import (
    CardDisplayChoice,
    CatalogPrinting,
    CollectorWant,
    Deck,
    DeckCardPrinting,
    ShoppingExtraPrinting,
)


def _printing_wants_for_decks(
    db: Session, deck_ids: list[int]
) -> dict[int, dict[str, dict[int, int]]]:
    """deck_id -> card_id -> product_id -> qty."""
    if not deck_ids:
        return {}
    rows = db.scalars(
        select(DeckCardPrinting).where(DeckCardPrinting.deck_id.in_(deck_ids))
    ).all()
    out: dict[int, dict[str, dict[int, int]]] = defaultdict(lambda: defaultdict(dict))
    for row in rows:
        if row.qty > 0:
            out[row.deck_id][row.card_id][row.product_id] = row.qty
    return out


def clamp_alt_want_map(wants: dict[int, int], limit: int) -> dict[int, int]:
    """Reduce alt wants so sum(qty) <= limit, cutting largest counts first."""
    if limit < 0:
        limit = 0
    total = sum(max(0, q) for q in wants.values())
    if total <= limit:
        return {pid: q for pid, q in wants.items() if q > 0}
    # Largest qty first; stable by product_id for determinism.
    items = sorted(wants.items(), key=lambda x: (-max(0, x[1]), x[0]))
    excess = total - limit
    result = {pid: max(0, q) for pid, q in wants.items()}
    for pid, qty in items:
        if excess <= 0:
            break
        reduce_by = min(qty, excess)
        result[pid] = qty - reduce_by
        excess -= reduce_by
    return {pid: q for pid, q in result.items() if q > 0}


def _apply_alt_want_clamp_to_rows(
    rows: list[DeckCardPrinting], limit: int
) -> None:
    """Mutate/delete ORM rows so their qty sum fits limit (largest first)."""
    wants = {r.product_id: r.qty for r in rows if r.qty > 0}
    clamped = clamp_alt_want_map(wants, limit)
    for row in rows:
        new_qty = clamped.get(row.product_id, 0)
        if new_qty <= 0:
            row.qty = 0
        elif row.qty != new_qty:
            row.qty = new_qty


def _delete_zero_printing_rows(db: Session, rows: list[DeckCardPrinting]) -> None:
    for row in rows:
        if row.qty <= 0:
            db.delete(row)


def _clear_deck_card_printings(db: Session, deck_id: int, card_id: str) -> None:
    rows = db.scalars(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id,
            DeckCardPrinting.card_id == card_id,
        )
    ).all()
    for row in rows:
        db.delete(row)


def _collector_map(db: Session, user_id: int) -> dict[str, dict[int, int]]:
    """card_id -> product_id -> collector copies the user wants on top of their decks (qty > 0)."""
    rows = db.scalars(select(CollectorWant).where(CollectorWant.user_id == user_id)).all()
    out: dict[str, dict[int, int]] = defaultdict(dict)
    for row in rows:
        if row.qty > 0:
            out[row.card_id][row.product_id] = row.qty
    return dict(out)


def _deck_alt_owned_map(
    alt_owned: dict[str, dict[int, int]], collector: dict[str, dict[int, int]]
) -> dict[str, dict[int, int]]:
    """Alt copies that count toward decks: owned minus the copies a collector want claims first.

    Owning 2 of a printing with a collector want of 1 leaves 1 for decks (#1031).
    """
    if not collector:
        return alt_owned
    out: dict[str, dict[int, int]] = {}
    for card_id, by_pid in alt_owned.items():
        reserved = collector.get(card_id, {})
        kept = {
            pid: n - min(n, reserved.get(pid, 0))
            for pid, n in by_pid.items()
            if n - min(n, reserved.get(pid, 0)) > 0
        }
        if kept:
            out[card_id] = kept
    return out


def _display_choice_map(db: Session, user_id: int) -> dict[str, int]:
    """card_id -> chosen display art (0 = base, >0 = product id)."""
    rows = db.scalars(
        select(CardDisplayChoice).where(CardDisplayChoice.user_id == user_id)
    ).all()
    return {r.card_id: r.product_id for r in rows}


def _alts_owned_total(alt_owned: dict[str, dict[int, int]], card_id: str) -> int:
    return sum(alt_owned.get(card_id, {}).values())


def _write_extra_printing_qty(
    db: Session, user_id: int, card_id: str, product_id: int, qty: int, extra_qty: int
) -> int:
    """Write the alt want of a Master Shopping card, clamped to the extra's qty. Returns qty stored."""
    others = db.scalars(
        select(ShoppingExtraPrinting).where(
            ShoppingExtraPrinting.user_id == user_id,
            ShoppingExtraPrinting.card_id == card_id,
            ShoppingExtraPrinting.product_id != product_id,
        )
    ).all()
    qty = max(0, min(qty, extra_qty - sum(r.qty for r in others)))
    row = db.scalar(
        select(ShoppingExtraPrinting).where(
            ShoppingExtraPrinting.user_id == user_id,
            ShoppingExtraPrinting.card_id == card_id,
            ShoppingExtraPrinting.product_id == product_id,
        )
    )
    if qty <= 0:
        if row is not None:
            db.delete(row)
        return 0
    if row is None:
        db.add(
            ShoppingExtraPrinting(
                user_id=user_id, card_id=card_id, product_id=product_id, qty=qty
            )
        )
    else:
        row.qty = qty
    return qty


def _assert_special_printing(db: Session, card_id: str, product_id: int) -> None:
    printing = db.scalar(
        select(CatalogPrinting).where(
            CatalogPrinting.card_id == card_id,
            CatalogPrinting.product_id == product_id,
            CatalogPrinting.is_special == 1,
        )
    )
    if printing is None:
        raise ValueError("Unknown alt printing for this card")


def _write_deck_printing_qty(
    db: Session,
    *,
    deck_id: int,
    card_id: str,
    product_id: int,
    qty: int,
    needed: int,
    strict: bool,
) -> int:
    """Write one deck's alt want. Returns qty stored (may be clamped when not strict)."""
    others = db.scalars(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id,
            DeckCardPrinting.card_id == card_id,
            DeckCardPrinting.product_id != product_id,
        )
    ).all()
    others_sum = sum(r.qty for r in others)
    if others_sum + qty > needed:
        if strict:
            raise ValueError(
                f"Alt art wants cannot exceed Need ({needed}): "
                f"{others_sum} other + {qty} would be {others_sum + qty}"
            )
        qty = max(0, needed - others_sum)

    row = db.scalar(
        select(DeckCardPrinting).where(
            DeckCardPrinting.deck_id == deck_id,
            DeckCardPrinting.card_id == card_id,
            DeckCardPrinting.product_id == product_id,
        )
    )
    if qty <= 0:
        if row is not None:
            db.delete(row)
        return 0
    if row is None:
        db.add(
            DeckCardPrinting(
                deck_id=deck_id,
                card_id=card_id,
                product_id=product_id,
                qty=qty,
            )
        )
    else:
        row.qty = qty
    return qty


def _leader_group_id(deck: Deck) -> str:
    """Group decks that share a leader; each leaderless deck is its own group."""
    if deck.leader_card_id:
        return deck.leader_card_id
    return f"__deck_{deck.id}"
