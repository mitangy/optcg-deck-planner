"""Decklist parsing, printing selection, and leader-variant helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

DECK_LINE_RE = re.compile(
    r"^\s*(?:(\d+)\s*[xX]\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)\s*(.*)?$"
)
# Egman / Limitless-style: "4 OP01-016 Nami" or "4x OP01-016"
DECK_TOKEN_RE = re.compile(
    r"(?:(\d+)\s*[xX]?\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)",
    re.IGNORECASE,
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
    """Parse OPTCGSim deck code / clipboard text into card counts.

    Accepts:
      4xOP15-053
      4x OP15-053
      4 OP15-053 Nami
      multiline or single-blob pastes
    """
    cards: dict[str, int] = {}
    raw = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        raise ValueError("No cards found in decklist")

    lines = [ln.strip() for ln in raw.split("\n")]
    # If paste is one long line of many cards, also split on common separators
    expanded: list[str] = []
    for line in lines:
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        # Keep intact if it looks like a single entry; otherwise split tokens
        if DECK_LINE_RE.match(line) and line.count("-") <= 1:
            expanded.append(line)
            continue
        # Split on commas / semicolons / multiple spaces while preserving "4xOP15-053"
        parts = re.split(r"[,;]+|\s{2,}", line)
        if len(parts) == 1 and " " in line and not DECK_LINE_RE.match(line):
            # egman line or several codes separated by single spaces
            expanded.append(line)
        else:
            expanded.extend(p.strip() for p in parts if p.strip())

    for line_no, line in enumerate(expanded, start=1):
        match = DECK_LINE_RE.match(line)
        if match:
            rest = (match.group(3) or "").strip()
            # One entry (optional card name) vs multiple codes on one line
            if not rest or not DECK_TOKEN_RE.search(rest):
                qty = int(match.group(1) or "1")
                card_id = match.group(2).upper()
                cards[card_id] = cards.get(card_id, 0) + qty
                continue
        # Fall back: find all qty+id tokens in the line
        found = list(DECK_TOKEN_RE.finditer(line))
        if not found:
            raise ValueError(f"Line {line_no}: unrecognized format: {line!r}")
        for token in found:
            qty = int(token.group(1) or "1")
            card_id = token.group(2).upper()
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


# Official constructed size: 50 main-deck cards + 1 leader. DON!! is separate (max 10).
MAIN_DECK_LIMIT = 51
DON_DECK_LIMIT = 10


def normalize_card_type(card_type: str | None) -> str:
    return (card_type or "").strip().lower()


def is_don_type(card_type: str | None) -> bool:
    """True for DON!! catalog rows (TCGPlayer CardType is typically 'DON!!')."""
    normalized = normalize_card_type(card_type)
    if not normalized:
        return False
    return normalized.startswith("don") or "don!!" in normalized


def is_leader_type(card_type: str | None, rarity: str | None = None) -> bool:
    normalized = normalize_card_type(card_type)
    rarity_u = (rarity or "").strip().upper()
    return normalized == "leader" or rarity_u == "L"


def is_don_card(row: Any | None) -> bool:
    if row is None:
        return False
    return is_don_type(getattr(row, "card_type", None))


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
    """Return (main_or_leader_copies, don_copies) for a deck's card lines."""
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
