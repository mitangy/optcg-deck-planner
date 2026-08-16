"""Parse and match TCGPlayer order receipts to catalog / group-buy lines."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.domain import SPECIAL_NAME_MARKERS
from app.models import CatalogCard, CatalogPrinting

PRODUCT_LINE_PREFIXES = (
    "one piece card game - ",
    "one piece card game – ",  # en-dash
    "one piece card game — ",  # em-dash
)

CONDITIONS = (
    "near mint",
    "lightly played",
    "moderately played",
    "heavily played",
    "damaged",
    "unopened",
)

# Full OPTCG number inside parentheses, e.g. (OP15-113), (EB04-007), (ST21-003)
CARD_ID_IN_PARENS_RE = re.compile(
    r"\(([A-Za-z0-9]+-\d+[A-Za-z]?)\)",
    re.IGNORECASE,
)
# Standalone id after a dash: "Nami - OP01-016 (Luffy Deck)" / "Boa Hancock - OP14-112"
CARD_ID_AFTER_DASH_RE = re.compile(
    r"\s[-–—]\s*([A-Za-z0-9]+-\d+[A-Za-z]?)\b",
    re.IGNORECASE,
)
# Collector number only: (054), (112), (053)
COLLECTOR_NUM_RE = re.compile(r"\((\d{2,3})\)\s*$")

# Same markers as catalog sync so receipt lines prefer the matching printing.
SPECIAL_HINTS = SPECIAL_NAME_MARKERS

LINE_START_RE = re.compile(
    r"^\s*(\d+)\s*(?:[xX]\s+)?(?:\t+|\s{2,}|\s+)(.+?)\s*$"
)
QTY_ONLY_TAB_RE = re.compile(r"^\s*(\d+)\t+(.+?)\s*$")


@dataclass
class ParsedReceiptLine:
    qty: int
    raw_description: str
    set_name: str = ""
    card_name: str = ""
    condition: str = ""
    is_foil: bool = False
    card_id_hint: str | None = None
    collector_number: str | None = None
    wants_special: bool = False


@dataclass
class CatalogMatch:
    card_id: str
    product_id: int | None
    name: str
    group_name: str
    is_special: bool
    confidence: str  # exact_id | name_set | name_only


@dataclass
class AggregatedReceiptCard:
    card_id: str
    qty: int
    name: str
    group_name: str
    product_id: int | None
    confidence: str
    descriptions: list[str] = field(default_factory=list)
    is_special: bool = False


def _normalize_key(value: str) -> str:
    text = (value or "").lower().strip()
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _strip_condition(description: str) -> tuple[str, str, bool]:
    """Return (without_condition, condition, is_foil)."""
    text = description.strip()
    is_foil = False
    lower = text.lower()
    # Trailing "Foil" (with or without condition)
    if lower.endswith(" foil"):
        is_foil = True
        text = text[: -len(" foil")].rstrip()
        lower = text.lower()
    condition = ""
    for cond in CONDITIONS:
        if lower.endswith(cond):
            condition = cond
            text = text[: -len(cond)].rstrip(" -–—\t")
            break
    return text.strip(), condition, is_foil


def _split_set_and_name(body: str) -> tuple[str, str]:
    """Split '{set} - {card name}' after product-line prefix was removed."""
    text = body.strip()
    # Prefer " - " / en/em dashes as separators
    for sep in (" - ", " – ", " — "):
        if sep in text:
            set_name, card_name = text.split(sep, 1)
            return set_name.strip(), card_name.strip()
    return "", text


def _extract_hints(card_name: str) -> tuple[str, str | None, str | None, bool]:
    """Return cleaned name, card_id_hint, collector_number, wants_special."""
    name = card_name.strip()
    wants_special = any(h in name.lower() for h in SPECIAL_HINTS)

    card_id_hint: str | None = None
    id_match = CARD_ID_IN_PARENS_RE.search(name)
    if id_match:
        card_id_hint = id_match.group(1).upper()
    else:
        dash_match = CARD_ID_AFTER_DASH_RE.search(name)
        if dash_match:
            card_id_hint = dash_match.group(1).upper()

    collector: str | None = None
    # Only treat (NNN) as collector when it is not a card id / special marker.
    if not card_id_hint:
        coll = COLLECTOR_NUM_RE.search(name)
        if coll:
            collector = coll.group(1)

    return name, card_id_hint, collector, wants_special


def parse_receipt_line(raw: str) -> ParsedReceiptLine | None:
    line = raw.strip()
    if not line:
        return None
    lower = line.lower()
    if lower in {"qty\tdescription", "qty description", "quantity\tdescription"}:
        return None
    if lower.startswith("order ") or lower.startswith("order details"):
        return None

    match = QTY_ONLY_TAB_RE.match(line) or LINE_START_RE.match(line)
    if not match:
        return None
    qty = int(match.group(1))
    if qty <= 0:
        return None
    description = match.group(2).strip()
    if not description:
        return None

    desc_lower = description.lower()
    body = description
    for prefix in PRODUCT_LINE_PREFIXES:
        if desc_lower.startswith(prefix):
            body = description[len(prefix) :].strip()
            break

    without_cond, condition, is_foil = _strip_condition(body)
    set_name, card_name = _split_set_and_name(without_cond)
    cleaned_name, card_id_hint, collector, wants_special = _extract_hints(card_name)

    return ParsedReceiptLine(
        qty=qty,
        raw_description=description,
        set_name=set_name,
        card_name=cleaned_name,
        condition=condition,
        is_foil=is_foil,
        card_id_hint=card_id_hint,
        collector_number=collector,
        wants_special=wants_special,
    )


def parse_tcgplayer_receipt(text: str) -> list[ParsedReceiptLine]:
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        raise ValueError("Receipt is empty")
    lines: list[ParsedReceiptLine] = []
    for line in raw.split("\n"):
        parsed = parse_receipt_line(line)
        if parsed is not None:
            lines.append(parsed)
    if not lines:
        raise ValueError("No receipt line items found — paste Qty + Description rows from TCGPlayer")
    return lines


def _printing_to_match(row: CatalogPrinting, confidence: str) -> CatalogMatch:
    return CatalogMatch(
        card_id=row.card_id,
        product_id=row.product_id,
        name=row.name or "",
        group_name=row.group_name or "",
        is_special=bool(row.is_special),
        confidence=confidence,
    )


def _pick_best_printing(
    rows: list[CatalogPrinting],
    *,
    wants_special: bool,
    set_key: str,
) -> CatalogPrinting | None:
    if not rows:
        return None
    scored: list[tuple[int, CatalogPrinting]] = []
    for row in rows:
        score = 0
        row_set = _normalize_key(row.group_name or "")
        if set_key and row_set == set_key:
            score += 100
        elif set_key and set_key in row_set:
            score += 40
        if wants_special and row.is_special:
            score += 30
        elif not wants_special and not row.is_special:
            score += 20
        # Prefer cheaper / standard when tied
        price = row.market_price if row.market_price is not None else 9999.0
        scored.append((score * 10000 - int(price * 100), row))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def match_line_to_catalog(db: Session, line: ParsedReceiptLine) -> CatalogMatch | None:
    """Resolve a receipt line to a catalog card_id / printing."""
    set_key = _normalize_key(line.set_name)
    name_key = _normalize_key(line.card_name)

    # 1) Explicit card id in the description
    if line.card_id_hint:
        rows = list(
            db.scalars(
                select(CatalogPrinting).where(
                    CatalogPrinting.card_id == line.card_id_hint
                )
            ).all()
        )
        # Fallback: preferred CatalogCard face only
        if not rows:
            card = db.get(CatalogCard, line.card_id_hint)
            if card is not None:
                return CatalogMatch(
                    card_id=card.card_id,
                    product_id=None,
                    name=card.name or "",
                    group_name=card.group_name or "",
                    is_special=bool(card.is_special),
                    confidence="exact_id",
                )
        picked = _pick_best_printing(
            rows, wants_special=line.wants_special, set_key=set_key
        )
        if picked is not None:
            return _printing_to_match(picked, "exact_id")

    # 2) Name (+ set) against printings
    # Strip parenthetical suffixes for looser name compare, keep full string too.
    base_name = re.sub(r"\s*\([^)]*\)\s*", " ", line.card_name)
    base_name = re.sub(r"\s[-–—]\s*[A-Za-z0-9]+-\d+[A-Za-z]?\b", " ", base_name)
    base_key = _normalize_key(base_name)

    candidates = list(
        db.scalars(
            select(CatalogPrinting).where(
                or_(
                    func.lower(CatalogPrinting.name) == line.card_name.lower(),
                    func.lower(CatalogPrinting.name) == base_name.strip().lower(),
                )
            )
        ).all()
    )

    if not candidates and (name_key or base_key):
        # Broader contains match limited by set when possible
        like_term = f"%{(base_name or line.card_name).strip()[:80]}%"
        stmt = select(CatalogPrinting).where(CatalogPrinting.name.ilike(like_term))
        if line.set_name:
            stmt = stmt.where(CatalogPrinting.group_name.ilike(f"%{line.set_name[:80]}%"))
        candidates = list(db.scalars(stmt.limit(40)).all())

    # Filter by normalized name equality when we got fuzzy rows
    if candidates and (name_key or base_key):
        tight = [
            c
            for c in candidates
            if _normalize_key(c.name) in {name_key, base_key}
            or name_key.startswith(_normalize_key(c.name))
            or _normalize_key(c.name).startswith(base_key)
        ]
        if tight:
            candidates = tight

    # Collector number disambiguation: card_id ending
    if line.collector_number and candidates:
        suffix = f"-{line.collector_number.zfill(3)}" if len(line.collector_number) <= 2 else f"-{line.collector_number}"
        # Prefer ids ending with -054 / -053 etc.
        numbered = [
            c
            for c in candidates
            if c.card_id.upper().endswith(f"-{line.collector_number}")
            or c.card_id.upper().endswith(suffix.upper())
        ]
        if numbered:
            candidates = numbered

    if set_key and candidates:
        set_filtered = [
            c for c in candidates if _normalize_key(c.group_name or "") == set_key
        ]
        if set_filtered:
            candidates = set_filtered
            confidence = "name_set"
        else:
            confidence = "name_only"
    else:
        confidence = "name_set" if set_key else "name_only"

    picked = _pick_best_printing(
        candidates, wants_special=line.wants_special, set_key=set_key
    )
    if picked is None:
        return None
    return _printing_to_match(picked, confidence)


def aggregate_receipt_matches(
    db: Session, lines: list[ParsedReceiptLine]
) -> tuple[list[AggregatedReceiptCard], list[ParsedReceiptLine]]:
    """Match each line; aggregate qty by card_id. Return (matched, unmatched)."""
    by_card: dict[str, AggregatedReceiptCard] = {}
    unmatched: list[ParsedReceiptLine] = []
    for line in lines:
        hit = match_line_to_catalog(db, line)
        if hit is None:
            unmatched.append(line)
            continue
        existing = by_card.get(hit.card_id)
        if existing is None:
            by_card[hit.card_id] = AggregatedReceiptCard(
                card_id=hit.card_id,
                qty=line.qty,
                name=hit.name,
                group_name=hit.group_name,
                product_id=hit.product_id,
                confidence=hit.confidence,
                descriptions=[line.raw_description],
                is_special=hit.is_special,
            )
        else:
            existing.qty += line.qty
            existing.descriptions.append(line.raw_description)
            # Prefer higher-confidence / special product id when aggregating
            if hit.confidence == "exact_id" and existing.confidence != "exact_id":
                existing.confidence = hit.confidence
                existing.product_id = hit.product_id
                existing.name = hit.name
            if hit.is_special and not existing.is_special:
                existing.is_special = True
                existing.product_id = hit.product_id or existing.product_id
                existing.name = hit.name
    return list(by_card.values()), unmatched
