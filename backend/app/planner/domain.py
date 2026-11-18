
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from dataclasses import dataclass
from typing import Any
from app.core.errors import Invalid

DECK_LINE_RE = re.compile(r"^\s*(?:(\d+)\s*[xX]\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)\s*(.*)?$")
DECK_TOKEN_RE = re.compile(
    r"(?:(\d+)\s*[xX]?\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)",
    re.IGNORECASE,
)

SPECIAL_NAME_MARKERS = (
    "alternate art",
    "parallel",
    "manga",
    "(sp)",
    "special rare",
    "full art",
    "(tr)",
    "box topper",
    "dash pack",
    "pirate foil",
    "jolly roger foil",
    "winner",
    "tournament",
    "championship",
    "champion card",
    "regional",
    "regionals",
    "finalist",
    "participant",
    "participation",
    "release event",
    "pre-release",
    "prerelease",
    "super pre-release",
    "treasure cup",
    "stamped",
    "illustration box",
    "premium card collection",
    "best selection",
)


@dataclass
class ParsedCard:
    card_id: str
    needed: int


def _qty(digits: str, line_no: int, line: str) -> int:
    try:
        qty = int(digits)
    except ValueError as exc:
        raise Invalid(str(exc)) from exc
    if qty < 1:
        raise Invalid(f"Line {line_no}: bad quantity {digits} in {line!r}")
    return qty


def parse_decklist(text: str) -> list[ParsedCard]:
    cards: dict[str, int] = {}
    raw = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        raise Invalid("No cards found in decklist")

    lines = [ln.strip() for ln in raw.split("\n")]
    expanded: list[str] = []
    for line in lines:
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        # Keep intact if it looks like a single entry; otherwise split tokens
        if DECK_LINE_RE.match(line) and line.count("-") <= 1:
            expanded.append(line)
            continue
        parts = re.split(r"[,;]+|\s{2,}", line)
        if len(parts) == 1 and " " in line and not DECK_LINE_RE.match(line):
            expanded.append(line)
        else:
            expanded.extend(p.strip() for p in parts if p.strip())

    trailing_qty_re = re.compile(r"^[xX]\s*(\d+)$|^(\d+)$")

    for line_no, line in enumerate(expanded, start=1):
        match = DECK_LINE_RE.match(line)
        if match:
            rest = (match.group(3) or "").strip()
            card_id = match.group(2).upper()
            leading_qty = match.group(1)
            trailing = trailing_qty_re.match(rest) if rest and not leading_qty else None
            if trailing:
                qty = _qty(trailing.group(1) or trailing.group(2), line_no, line)
                cards[card_id] = cards.get(card_id, 0) + qty
                continue
            if not rest or not DECK_TOKEN_RE.search(rest):
                qty = _qty(leading_qty or "1", line_no, line)
                cards[card_id] = cards.get(card_id, 0) + qty
                continue
        found = list(DECK_TOKEN_RE.finditer(line))
        if not found:
            raise Invalid(f"Line {line_no}: unrecognized format: {line!r}")
        for token in found:
            qty = _qty(token.group(1) or "1", line_no, line)
            card_id = token.group(2).upper()
            cards[card_id] = cards.get(card_id, 0) + qty

    if not cards:
        raise Invalid("No cards found in decklist")
    return [ParsedCard(card_id=cid, needed=qty) for cid, qty in cards.items()]


ALT_ART_PRODUCTS_PATH = Path(__file__).resolve().parent.parent / "data" / "alt_art_products.json"


@lru_cache(maxsize=1)
def alt_art_product_ids() -> frozenset[int]:
    try:
        return frozenset(int(p) for p in json.loads(ALT_ART_PRODUCTS_PATH.read_text("utf-8")))
    except (OSError, ValueError, TypeError):
        return frozenset()


def is_special_printing(name: str, product_id: int | None = None) -> bool:
    if product_id is not None and product_id in alt_art_product_ids():
        return True
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


MAIN_DECK_LIMIT = 51
DON_DECK_LIMIT = 10


def normalize_card_type(card_type: str | None) -> str:
    return (card_type or "").strip().lower()


def is_don_type(card_type: str | None) -> bool:
    normalized = normalize_card_type(card_type)
    if not normalized:
        return False
    return normalized.startswith("don") or "don!!" in normalized


def is_don_product(
    *,
    name: str | None = None,
    card_type: str | None = None,
    rarity: str | None = None,
) -> bool:
    if is_don_type(card_type) or is_don_type(rarity):
        return True
    return (name or "").strip().upper().startswith("DON!!")


def synthetic_don_card_id(product_id: int) -> str:
    return f"DON-{int(product_id)}"


def is_leader_type(card_type: str | None, rarity: str | None = None) -> bool:
    normalized = normalize_card_type(card_type)
    rarity_u = (rarity or "").strip().upper()
    return normalized == "leader" or rarity_u == "L"


def is_don_card(row: Any | None) -> bool:
    if row is None:
        return False
    if is_don_product(
        name=getattr(row, "name", None),
        card_type=getattr(row, "card_type", None),
        rarity=getattr(row, "rarity", None),
    ):
        return True
    card_id = (getattr(row, "card_id", None) or "").strip().upper()
    return card_id.startswith("DON-")


def is_leader_card(row: Any | None) -> bool:
    if row is None:
        return False
    return is_leader_type(getattr(row, "card_type", None), getattr(row, "rarity", None))


def find_leader_id(cards: list[ParsedCard], catalog_by_id: dict[str, Any]) -> str | None:
    for card in cards:
        row = catalog_by_id.get(card.card_id)
        if is_leader_card(row):
            return card.card_id
    return None


def deck_size_counts(
    cards: list[ParsedCard] | list[tuple[str, int]],
    catalog_by_id: dict[str, Any],
) -> tuple[int, int]:
    main = 0
    don = 0
    for entry in cards:
        if isinstance(entry, ParsedCard):
            card_id, needed = entry.card_id, entry.needed
        else:
            card_id, needed = entry
        if needed <= 0:
            continue
        if is_don_card(catalog_by_id.get(card_id)):
            don += needed
        else:
            main += needed
    return main, don
