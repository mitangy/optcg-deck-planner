
from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Invalid
from app.planner.domain import SPECIAL_NAME_MARKERS
from app.planner.models import CatalogCard, CatalogPrinting

PRODUCT_LINE_PREFIXES = (
    "one piece card game - ",
    "one piece card game – ",
    "one piece card game — ",
)

CONDITIONS = (
    "near mint",
    "lightly played",
    "moderately played",
    "heavily played",
    "damaged",
    "unopened",
)

CARD_ID_IN_PARENS_RE = re.compile(
    r"\(([A-Za-z0-9]+-\d+[A-Za-z]?)\)",
    re.IGNORECASE,
)
CARD_ID_AFTER_DASH_RE = re.compile(
    r"\s[-–—]\s*([A-Za-z0-9]+-\d+[A-Za-z]?)\b",
    re.IGNORECASE,
)
COLLECTOR_NUM_RE = re.compile(r"\((\d{2,3})\)\s*$")

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
    confidence: str


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
    # Copies of each alternate printing on the receipt, so the art survives the per-card total.
    alt_copies: dict[int, int] = field(default_factory=dict)


def _normalize_key(value: str) -> str:
    text = (value or "").lower().strip()
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _strip_condition(description: str) -> tuple[str, str, bool]:
    text = description.strip()
    is_foil = False
    lower = text.lower()
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
    text = body.strip()
    for sep in (" - ", " – ", " — "):
        if sep in text:
            set_name, card_name = text.split(sep, 1)
            return set_name.strip(), card_name.strip()
    return "", text


def _extract_hints(card_name: str) -> tuple[str, str | None, str | None, bool]:
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
    try:
        qty = int(match.group(1))
    except ValueError as exc:
        raise Invalid(str(exc)) from exc
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
        raise Invalid("Receipt is empty")
    lines: list[ParsedReceiptLine] = []
    for line in raw.split("\n"):
        parsed = parse_receipt_line(line)
        if parsed is not None:
            lines.append(parsed)
    if not lines:
        raise Invalid("No receipt line items found — paste Qty + Description rows from TCGPlayer")
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
        price = row.market_price if row.market_price is not None else 9999.0
        scored.append((score * 10000 - int(price * 100), row))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def match_line_to_catalog(db: Session, line: ParsedReceiptLine) -> CatalogMatch | None:
    set_key = _normalize_key(line.set_name)
    name_key = _normalize_key(line.card_name)

    if line.card_id_hint:
        rows = list(
            db.scalars(
                select(CatalogPrinting).where(
                    CatalogPrinting.card_id == line.card_id_hint
                )
            ).all()
        )
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
        like_term = f"%{(base_name or line.card_name).strip()[:80]}%"
        stmt = select(CatalogPrinting).where(CatalogPrinting.name.ilike(like_term))
        if line.set_name:
            stmt = stmt.where(CatalogPrinting.group_name.ilike(f"%{line.set_name[:80]}%"))
        candidates = list(db.scalars(stmt.limit(40)).all())

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

    if line.collector_number and candidates:
        suffix = f"-{line.collector_number.zfill(3)}" if len(line.collector_number) <= 2 else f"-{line.collector_number}"
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
            entry = by_card[hit.card_id]
        else:
            entry = existing
            existing.qty += line.qty
            existing.descriptions.append(line.raw_description)
            if hit.confidence == "exact_id" and existing.confidence != "exact_id":
                existing.confidence = hit.confidence
                existing.product_id = hit.product_id
                existing.name = hit.name
            if hit.is_special and not existing.is_special:
                existing.is_special = True
                existing.product_id = hit.product_id or existing.product_id
                existing.name = hit.name
        if hit.is_special and hit.product_id is not None:
            entry.alt_copies[hit.product_id] = entry.alt_copies.get(hit.product_id, 0) + line.qty
    return list(by_card.values()), unmatched


# ---------------------------------------------------------------------------
# TCGplayer Order History page (many orders in one paste or PDF), #1433
# ---------------------------------------------------------------------------

ORDER_NUMBER_RE = re.compile(r"\b[0-9A-F]{8}-[0-9A-F]{6}-[0-9A-F]{5}\b", re.IGNORECASE)
_ORDER_DATE_RE = re.compile(r"^([A-Z][a-z]+ \d{1,2}, \d{4})$")
_TRACKING_RE = re.compile(r"^(?=.*\d)[0-9A-Z]{10,35}$")
_PRICE_RE = re.compile(r"^\$\s*([\d,]+(?:\.\d{1,2})?)$")
_PRICE_QTY_RE = re.compile(r"^\$\s*([\d,]+(?:\.\d{1,2})?)\s+(\d{1,4})$")
_COND_TAIL_RE = re.compile(r"\s+\$\s*([\d,]+(?:\.\d{1,2})?)(?:\s+(\d{1,4}))?\s*$")
_QTY_RE = re.compile(r"^\d{1,4}$")
_ITEMS_HEADER_WORDS = {"ITEMS", "DETAILS", "PRICE", "QUANTITY", "ITEMS DETAILS PRICE QUANTITY"}
_HEADER_SPLIT_RE = re.compile(
    r"^(SHIPPED WITH TRACKING:?|SHIPPED AND SOLD BY|ORDER DATE|ORDER NUMBER|CHANNEL)\s+(\S.*)$",
    re.IGNORECASE,
)
_JUNK_RES = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^contact seller\b",
        r"^rate transaction\b",
        r"^enter an order number\b",
        r"^search$",
        r"^orders placed in\b",
        r"^last \d+ days$",
        r"^viewing \d+",
        r"^store credit\b",
        r"^first\b.*\blast$",
        r"^order history$",
        r"^(rate|transaction)$",
        r"^(order number|channel|order summary|ship to|bill to)$",
        r"^page \d+( of \d+)?$",
    )
)
TRACKING_URL_UPS = "https://www.ups.com/track?tracknum="
TRACKING_URL_USPS = "https://tools.usps.com/go/TrackConfirmAction?tLabels="


@dataclass
class ParsedHistoryOrder:
    order_number: str
    order_date: str = ""
    seller_name: str = ""
    tracking_number: str = ""
    lines: list[ParsedReceiptLine] = field(default_factory=list)


def _history_tokens(text: str) -> list[str]:
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    tokens: list[str] = []
    for piece in re.split(r"[\n\t]", raw):
        tok = re.sub(r" {2,}", " ", piece.strip())
        if not tok:
            continue
        split = _HEADER_SPLIT_RE.match(tok)
        if split:
            tokens.extend([split.group(1).strip(), split.group(2).strip()])
        else:
            tokens.append(tok)
    return [t for t in tokens if not any(p.search(t) for p in _JUNK_RES)]


def looks_like_order_history(text: str) -> bool:
    """A TCGplayer Order History page: an order number plus item markers."""
    body = text or ""
    if not ORDER_NUMBER_RE.search(body):
        return False
    return "rarity:" in body.lower() or bool(re.search(r"\bitems\b.*\bdetails\b", body, re.IGNORECASE))


def tracking_url_for(number: str) -> str:
    num = (number or "").strip()
    if not num:
        return ""
    if num.upper().startswith("1Z"):
        return TRACKING_URL_UPS + num
    if num.isdigit():
        return TRACKING_URL_USPS + num
    return ""


def _split_orders(tokens: list[str]) -> list[list[str]]:
    starts = [i for i, t in enumerate(tokens) if t.upper() == "ORDER DATE"]
    if not starts:
        starts = [i for i, t in enumerate(tokens) if ORDER_NUMBER_RE.fullmatch(t)]
    return [tokens[a:b] for a, b in zip(starts, starts[1:] + [len(tokens)])]


class _Item:
    def __init__(self, name: str) -> None:
        self.name = name
        self.set_parts: list[str] = []
        self.condition = ""
        self.price: str | None = None
        self.qty: int | None = None

    @property
    def started_details(self) -> bool:
        return self.price is not None or self.qty is not None or bool(self.condition)


def _walk_items(tokens: list[str]) -> list[_Item]:
    items: list[_Item] = []
    cur: _Item | None = None
    for tok in tokens:
        if tok.upper() in _ITEMS_HEADER_WORDS:
            continue
        if re.match(r"^rarity:", tok, re.IGNORECASE):
            continue
        cond = re.match(r"^condition:\s*(.*)$", tok, re.IGNORECASE)
        if cond is not None and cur is not None:
            rest = cond.group(1)
            tail = _COND_TAIL_RE.search(rest)
            if tail:
                rest = rest[: tail.start()]
                cur.price = tail.group(1)
                if tail.group(2):
                    cur.qty = int(tail.group(2))
            cur.condition = rest.strip() or "-"
            continue
        both = _PRICE_QTY_RE.match(tok)
        if both and cur is not None:
            cur.price, cur.qty = both.group(1), int(both.group(2))
            continue
        price = _PRICE_RE.match(tok)
        if price and cur is not None:
            cur.price = price.group(1)
            continue
        if _QTY_RE.match(tok):
            # A bare number is the quantity only while the item still lacks one (a page number must not become it).
            if cur is not None and cur.qty is None and cur.started_details:
                cur.qty = int(tok)
            continue
        if cur is None or cur.started_details:
            cur = _Item(tok)
            items.append(cur)
        else:
            cur.set_parts.append(tok)
    return items


def _item_to_line(item: _Item) -> ParsedReceiptLine | None:
    if item.qty is None or item.qty <= 0:
        return None
    name, card_id_hint, _, wants_special = _extract_hints(item.name)
    collector = None
    if not card_id_hint:
        coll = re.search(r"\((\d{2,3})\)", name)
        collector = coll.group(1) if coll else None
    cond_text = "" if item.condition == "-" else item.condition
    _, condition, is_foil = _strip_condition(cond_text)
    set_name = " ".join(item.set_parts).strip()
    raw = " - ".join(p for p in (set_name, name, cond_text) if p)
    return ParsedReceiptLine(
        qty=item.qty,
        raw_description=raw,
        set_name=set_name,
        card_name=name,
        condition=condition,
        is_foil=is_foil,
        card_id_hint=card_id_hint,
        collector_number=collector,
        wants_special=wants_special,
    )


def _parse_order_block(tokens: list[str]) -> ParsedHistoryOrder | None:
    number = next((t.upper() for t in tokens if ORDER_NUMBER_RE.fullmatch(t)), "")
    if not number:
        return None
    items_at = next((i for i, t in enumerate(tokens) if t.upper() in _ITEMS_HEADER_WORDS), len(tokens))
    head, body = tokens[:items_at], tokens[items_at:]
    order = ParsedHistoryOrder(order_number=number)
    order.order_date = next((t for t in head if _ORDER_DATE_RE.match(t)), "")
    for i, tok in enumerate(head):
        upper = tok.upper().rstrip(":")
        if upper == "SHIPPED AND SOLD BY" and i + 1 < len(head):
            nxt = head[i + 1]
            if not nxt.upper().startswith("SHIPPED"):
                order.seller_name = nxt
        elif upper == "SHIPPED WITH TRACKING" and i + 1 < len(head):
            cand = head[i + 1].replace(" ", "").upper()
            if _TRACKING_RE.match(cand):
                order.tracking_number = cand
    order.lines = [ln for it in _walk_items(body) if (ln := _item_to_line(it)) is not None]
    return order


def parse_order_history(text: str) -> list[ParsedHistoryOrder]:
    """One entry per TCGplayer order number on a pasted (or PDF-extracted) Order History page, in page order."""
    orders: list[ParsedHistoryOrder] = []
    seen: set[str] = set()
    for block in _split_orders(_history_tokens(text)):
        order = _parse_order_block(block)
        if order is None or order.order_number in seen:
            continue
        seen.add(order.order_number)
        orders.append(order)
    return orders
