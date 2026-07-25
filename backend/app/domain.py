"""Decklist parsing, printing selection, and leader-variant helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

DECK_LINE_RE = re.compile(
    r"^\s*(?:(\d+)\s*[xX]\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)\s*$"
)

SPECIAL_NAME_MARKERS = (
    "alternate art",
    "parallel",
    "manga",
    "(sp)",
    " special rare",
    "winner",
    "tournament",
)


@dataclass
class ParsedCard:
    card_id: str
    needed: int


def parse_decklist(text: str) -> list[ParsedCard]:
    cards: dict[str, int] = {}
    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        match = DECK_LINE_RE.match(line)
        if not match:
            raise ValueError(f"Line {line_no}: unrecognized format: {raw!r}")
        qty = int(match.group(1) or "1")
        card_id = match.group(2).upper()
        cards[card_id] = cards.get(card_id, 0) + qty
    if not cards:
        raise ValueError("No cards found in decklist")
    return [ParsedCard(card_id=cid, needed=qty) for cid, qty in cards.items()]


def is_special_printing(name: str) -> bool:
    lower = name.lower()
    return any(marker in lower for marker in SPECIAL_NAME_MARKERS)


def parse_cost(raw: str | None) -> int | str | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return value


def choose_best_printing(
    printings: list[dict[str, Any]],
    prefer_cheapest: bool = False,
) -> dict[str, Any]:
    def sort_key(p: dict[str, Any]) -> tuple:
        special = 1 if p.get("is_special") else 0
        market = p.get("market_price")
        low = p.get("low_price")
        price = market if market is not None else 1e9
        low_v = low if low is not None else 1e9
        if prefer_cheapest:
            return (price, special, p.get("product_id") or 0)
        return (special, price, low_v, p.get("product_id") or 0)

    return sorted(printings, key=sort_key)[0]


def find_leader_id(cards: list[ParsedCard], catalog_by_id: dict[str, Any]) -> str | None:
    for card in cards:
        row = catalog_by_id.get(card.card_id)
        if not row:
            continue
        card_type = (getattr(row, "card_type", None) or "").lower()
        rarity = (getattr(row, "rarity", None) or "").upper()
        if card_type == "leader" or rarity == "L":
            return card.card_id
    return None
