"""Tests for TCGPlayer receipt parsing and catalog matching."""

from __future__ import annotations

import pytest

from app.models import CatalogCard, CatalogPrinting
from app.tcgplayer_receipt import (
    aggregate_receipt_matches,
    parse_receipt_line,
    parse_tcgplayer_receipt,
)


SAMPLE_RECEIPT = """
Order Details
Qty	Description
2	One Piece Card Game - 500 Years in the Future - Perfume Femur - Near Mint Foil
2	One Piece Card Game - A Fist of Divine Speed - Nami (054) - Near Mint Foil
4	One Piece Card Game - A Fist of Divine Speed - Zeus - Near Mint Foil
1	One Piece Card Game - Adventure on Kami's Island - And No One Else Can Have It! It's Our Memento of Him - Near Mint
2	One Piece Card Game - Adventure on Kami's Island - And No One Else Can Have It! It's Our Memento of Him - Near Mint
1	One Piece Card Game - Adventure on Kami's Island - Roronoa Zoro (EB04-007) - Near Mint Foil
1	One Piece Card Game - Adventure on Kami's Island - Roronoa Zoro (OP15-113) - Near Mint Foil
1	One Piece Card Game - Carrying On His Will - Lilith (Alternate Art) - Near Mint Foil
3	One Piece Card Game - Learn Together Deck Set - Nami - OP01-016 (Luffy Deck) - Near Mint
1	One Piece Card Game - Premium Booster -The Best- - Belo Betty (OP05-015) (Reprint) - Near Mint Foil
1	One Piece Card Game - One Piece Promotion Cards - DON!! Card (Ace) (Special DON!! Set Vol. 2) - Near Mint Foil
""".strip()


def test_parse_receipt_line_basic():
    line = parse_receipt_line(
        "2\tOne Piece Card Game - 500 Years in the Future - Perfume Femur - Near Mint Foil"
    )
    assert line is not None
    assert line.qty == 2
    assert line.set_name == "500 Years in the Future"
    assert line.card_name == "Perfume Femur"
    assert line.condition == "near mint"
    assert line.is_foil is True


def test_parse_receipt_line_with_card_id_and_alt():
    zoro = parse_receipt_line(
        "1\tOne Piece Card Game - Adventure on Kami's Island - Roronoa Zoro (EB04-007) - Near Mint Foil"
    )
    assert zoro is not None
    assert zoro.card_id_hint == "EB04-007"
    assert zoro.set_name == "Adventure on Kami's Island"

    alt = parse_receipt_line(
        "1\tOne Piece Card Game - Carrying On His Will - Lilith (Alternate Art) - Near Mint Foil"
    )
    assert alt is not None
    assert alt.wants_special is True
    assert "Lilith" in alt.card_name

    learn = parse_receipt_line(
        "3\tOne Piece Card Game - Learn Together Deck Set - Nami - OP01-016 (Luffy Deck) - Near Mint"
    )
    assert learn is not None
    assert learn.card_id_hint == "OP01-016"
    assert learn.is_foil is False


def test_parse_tcgplayer_receipt_aggregates_header_and_rows():
    lines = parse_tcgplayer_receipt(SAMPLE_RECEIPT)
    assert len(lines) == 11
    assert sum(l.qty for l in lines) == 19


def test_parse_empty_raises():
    with pytest.raises(ValueError, match="empty"):
        parse_tcgplayer_receipt("   ")
    with pytest.raises(ValueError, match="No receipt"):
        parse_tcgplayer_receipt("Order Details\nQty\tDescription\n")


def _add_printing(
    db,
    card_id: str,
    *,
    name: str,
    product_id: int,
    group_name: str,
    special: bool = False,
    market: float = 1.0,
):
    existing = db.get(CatalogCard, card_id)
    if existing is None or not special:
        db.merge(
            CatalogCard(
                card_id=card_id,
                name=name,
                market_price=market,
                group_name=group_name,
                is_special=1 if special else 0,
            )
        )
    db.add(
        CatalogPrinting(
            card_id=card_id,
            product_id=product_id,
            name=name,
            market_price=market,
            group_name=group_name,
            is_special=1 if special else 0,
        )
    )
    db.commit()


def test_match_by_card_id_and_name(db):
    _add_printing(
        db,
        "EB04-007",
        name="Roronoa Zoro",
        product_id=5001,
        group_name="Adventure on Kami's Island",
    )
    _add_printing(
        db,
        "OP15-113",
        name="Roronoa Zoro",
        product_id=5002,
        group_name="Adventure on Kami's Island",
    )
    _add_printing(
        db,
        "OP09-051",
        name="Lilith",
        product_id=5003,
        group_name="Carrying On His Will",
    )
    _add_printing(
        db,
        "OP09-051",
        name="Lilith (Alternate Art)",
        product_id=5004,
        group_name="Carrying On His Will",
        special=True,
        market=12.0,
    )
    _add_printing(
        db,
        "OP07-019",
        name="Perfume Femur",
        product_id=5005,
        group_name="500 Years in the Future",
    )

    lines = parse_tcgplayer_receipt(SAMPLE_RECEIPT)
    matched, unmatched = aggregate_receipt_matches(db, lines)
    by_id = {m.card_id: m for m in matched}

    assert "EB04-007" in by_id
    assert by_id["EB04-007"].qty == 1
    assert by_id["EB04-007"].confidence == "exact_id"

    assert "OP15-113" in by_id
    assert by_id["OP15-113"].qty == 1

    assert "OP09-051" in by_id
    assert by_id["OP09-051"].is_special is True
    assert by_id["OP09-051"].product_id == 5004

    assert "OP07-019" in by_id
    assert by_id["OP07-019"].qty == 2
    assert by_id["OP07-019"].confidence in {"name_set", "name_only"}

    # Duplicate memento lines should aggregate when catalog has the name
    _add_printing(
        db,
        "OP15-076",
        name="And No One Else Can Have It! It's Our Memento of Him",
        product_id=5006,
        group_name="Adventure on Kami's Island",
    )
    matched2, _ = aggregate_receipt_matches(db, lines)
    memento = next(m for m in matched2 if m.card_id == "OP15-076")
    assert memento.qty == 3  # 1 + 2 from receipt
