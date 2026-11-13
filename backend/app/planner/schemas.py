"""Planner request/response models: decks, owned cards, shopping, sharing, price alerts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # Bound payload size to avoid oversized parse/DB write DoS.
    decklist: str = Field(min_length=1, max_length=100_000)


class DeckListReplace(BaseModel):
    """PUT /decks/{id}/decklist: overwrite a deck's cards with a pasted code (#1016)."""

    decklist: str = Field(min_length=1, max_length=100_000)


class DeckRename(BaseModel):
    """PATCH /decks/{id}: rename, hide from friends, or both (#703)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    hidden_from_friends: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Deck name cannot be blank")
        return value


class DeckCardUpsert(BaseModel):
    """Set absolute copy count for a card in a deck. needed=0 removes the line."""

    needed: int = Field(ge=0, le=99)
    # Soft confirm when projected main+leader copies would exceed MAIN_DECK_LIMIT (51).
    confirm_oversize: bool = False


class DeckSummary(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
    leader_image_url: str = ""
    card_count: int
    total_cards: int
    main_cards: int = 0
    don_cards: int = 0
    # Non-DON copies covered by the user's Owned counts (min(owned, needed) per
    # card) — same math as the deck page progress bar; out of main_cards.
    owned_copies: int = 0
    sort_order: int
    # Effective main for this leader (explicit flag or earliest same-leader fallback).
    is_main: bool = False
    hidden_from_friends: bool = False


class CatalogCardResult(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    group_name: str = ""
    # Set on alt-art rows (search with alts=true); None = the base card row.
    alt_product_id: int | None = None
    # Viewer's owned copies of that alt printing (alt rows only).
    owned: int = 0


class PrintingView(BaseModel):
    product_id: int
    name: str
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    group_name: str = ""
    is_special: bool = True
    # Per-deck (or shopping max-across-decks) alt want for play; 0 when unset.
    wanted: int = 0
    # Copies of this alt the user owns (per user, not per deck).
    owned: int = 0
    # Collector copies the user wants of this printing on top of their decks (#1031).
    collector: int = 0


class DisplayArtUpdate(BaseModel):
    # None = automatic, 0 = base art, >0 = a special printing's product id.
    product_id: int | None = Field(default=None, ge=0)


class DisplayArtResult(BaseModel):
    card_id: str
    product_id: int | None = None


class OwnedPrintingUpdate(BaseModel):
    """Set how many copies of an alt printing the user owns."""

    qty: int = Field(ge=0, le=99)


class OwnedPrintingResult(BaseModel):
    card_id: str
    product_id: int
    qty: int


class CollectorWantUpdate(BaseModel):
    """Set how many collector copies of an alt printing the user wants (0 removes)."""

    qty: int = Field(ge=0, le=9)


class CollectorWantResult(BaseModel):
    card_id: str
    product_id: int
    qty: int


class DeckCardPrintingUpdate(BaseModel):
    """Set how many copies of an alt printing are wanted in a deck (≤ card Need)."""

    qty: int = Field(ge=0, le=99)


class CardPrintingUpdate(BaseModel):
    """Set alt-art want across the user's decks that include the card (synced)."""

    qty: int = Field(ge=0, le=99)
    deck_ids: list[int] | None = None


class CardArtSpreadUpdate(BaseModel):
    """"One of each art" across the user's decks that include the card (#1292)."""

    deck_ids: list[int] | None = None


class CardArtSpreadResult(BaseModel):
    card_id: str
    decks_updated: int


class CardPrintingResult(BaseModel):
    card_id: str
    product_id: int
    """Max qty stored after per-deck clamps."""
    qty: int
    decks_updated: int


class RecentSale(BaseModel):
    price: float
    shipping: float = 0.0
    condition: str = ""
    variant: str = ""
    language: str = ""
    quantity: int = 1
    order_date: str = ""


class RecentSalesResponse(BaseModel):
    product_id: int
    sales: list[RecentSale]


class PriceHistoryResponse(BaseModel):
    card_id: str
    product_id: int
    name: str
    group_name: str = ""
    released: str | None = None
    # The card's rarity (SR, SEC, L...): a base SR/SEC/Leader follows its own price curve.
    rarity: str | None = None
    current: float | None = None
    points: list[tuple[str, float]]


class PriceHistoryImport(BaseModel):
    day: date
    prices: dict[int, float | None]


class PriceHistoryImportResult(BaseModel):
    day: str
    stored: int


class CardView(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    needed: int
    # Total owned (shared across every deck — what the Owned stepper edits).
    owned: int
    # Copies owned across this card's alt printings; they count toward still_need.
    alts_owned: int = 0
    still_need: int
    # "Separate per leader": copies that leaders earlier in deck order need
    # first. still_need = needed − (owned − earlier_leaders_need), floored at 0.
    # Always 0 when copies are shared between leaders.
    earlier_leaders_need: int = 0
    earlier_leaders: list[str] = []
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    section: str = "main"  # main | additional | don
    alt_arts: list[PrintingView] = []
    # Every member's qty split across arts (alts first, rest on the preferred printing).
    art_wants: list[GroupBuyArtWantOut] = []
    # Viewer's chosen display art: None = automatic, 0 = base, >0 = product id.
    display_art: int | None = None
    # Collector copies the user wants of this card's alt printings, on top of the deck (#1031).
    collector_want: int = 0


class DeckDetail(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
    # Name of the Main deck this list is compared against (empty when this is Main).
    prior_decks: list[str] = []
    is_main: bool = False
    hidden_from_friends: bool = False
    cards: list[CardView]
    main_cards: int = 0
    don_cards: int = 0


class LeaderNeed(BaseModel):
    label: str
    need: int


class CollectorLine(BaseModel):
    """One alt printing the user wants a collector copy of, on top of their decks (#1031)."""

    product_id: int
    label: str
    image_url: str | None = None
    market_price: float | None = None
    want: int
    # min(owned copies of this printing, want); still_need = want - have.
    have: int
    still_need: int
    remaining_cost: float | None = None


class ShoppingItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    need: int
    owned: int
    # Copies owned across this card's alt printings; they count toward still_need.
    alts_owned: int = 0
    still_need: int
    market_price: float | None = None
    low_price: float | None = None
    remaining_cost: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    used_in: list[str]
    alt_arts: list[PrintingView] = []
    # Viewer's chosen display art: None = automatic, 0 = base, >0 = product id.
    display_art: int | None = None
    # Deck sort: group by earliest leader, then first same-leader deck that uses the card.
    # Multi-leader cards use the earliest deck's leader as primary.
    deck_sort_key: str = ""
    primary_leader_card_id: str | None = None
    primary_leader_name: str | None = None
    leader_count: int = 1
    # Per-leader Need (max within each leader), in deck order. Explains how
    # ``need`` was combined; only set when more than one leader uses the card.
    need_by_leader: list[LeaderNeed] = Field(default_factory=list)
    # Whether ``need`` sums need_by_leader (True) or takes its max (False).
    need_summed: bool = False
    # Target copies added directly to Master Shopping (no deck); 0 when none.
    extra_qty: int = 0
    # Need from selected decks alone (``need`` also folds in ``extra_qty`` by max).
    deck_need: int = 0
    # Collector copies wanted on top of the decks, one line per alt printing (#1031).
    collector_wants: list[CollectorLine] = []


class ShoppingResponse(BaseModel):
    items: list[ShoppingItem]
    cards_still_needed: int
    remaining_market: float
    unique_cards: int
    # Sum of collector wants across all lines (#1031).
    collector_copies: int = 0


class OwnedCardItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    owned: int
    # Copies owned across alt printings (on top of ``owned``).
    alts_owned: int = 0
    market_price: float | None = None
    low_price: float | None = None
    # owned × standard market + each alt's qty × its own market price; None when
    # any owned copy has no price.
    value: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    used_in: list[str] = []
    # Copies still to buy for this card on the full shopping list (all decks + added directly).
    buying: int = 0
    # Every alt printing of the card (owned or not), each with the user's owned count.
    alt_arts: list[PrintingView] = []
    # The user's chosen art: None = automatic, 0 = base, >0 = a printing's product id.
    display_art: int | None = None


class OwnedCollectionResponse(BaseModel):
    items: list[OwnedCardItem]
    unique_cards: int
    total_copies: int
    total_value: float
    # Owned cards with no market price (left out of total_value).
    unpriced_cards: int


class OwnedUpdate(BaseModel):
    qty: int = Field(ge=0, le=10_000)


class OwnedAddItem(BaseModel):
    card_id: str = Field(min_length=1, max_length=32)
    add: int = Field(ge=1, le=99)


class OwnedAddRequest(BaseModel):
    """Copies to add on top of what the user already owns (a scanned photo's cards)."""

    items: list[OwnedAddItem] = Field(min_length=1, max_length=200)


class OwnedAddResult(BaseModel):
    card_id: str
    owned: int


class OwnedAddResponse(BaseModel):
    items: list[OwnedAddResult]


class ShoppingExtraUpdate(BaseModel):
    """Target copies to own for a card added straight to Master Shopping."""

    qty: int = Field(ge=0, le=10_000)


class DeckOwnedResetResult(BaseModel):
    """Result of zeroing Owned for every card that appears in a deck."""

    deck_id: int
    reset_count: int
    deck: DeckDetail


class CatalogStatus(BaseModel):
    card_count: int
    last_synced_at: str | None
    notes: str = ""


class ShareCreate(BaseModel):
    kind: str = Field(default="shopping", pattern="^(shopping|deck)$")
    deck_id: int | None = None
    deck_ids: list[int] | None = None
    # Shopping shares: None keeps the link's current choice (new links include them).
    include_extras: bool | None = None


class ShareInfo(BaseModel):
    token: str
    kind: str
    deck_id: int | None = None
    deck_ids: list[int] | None = None
    include_extras: bool = True
    path: str


class PublicShoppingResponse(ShoppingResponse):
    owner_name: str = ""
    kind: str = "shopping"
    deck_name: str | None = None
    viewer_signed_in: bool = False
    viewer_is_owner: bool = False


class GroupBuyArtWantOut(BaseModel):
    product_id: int
    user_id: int
    qty: int


AlertDirection = Literal["below", "above"]


class PriceAlertCreate(BaseModel):
    card_id: str = Field(min_length=1, max_length=32)
    product_id: int = Field(default=0, ge=0)
    target_price: float = Field(gt=0, le=100_000)
    direction: AlertDirection = "below"
    notify_email: bool = True
    notify_app: bool = True


class PriceAlertUpdate(BaseModel):
    target_price: float | None = Field(default=None, gt=0, le=100_000)
    direction: AlertDirection | None = None
    notify_email: bool | None = None
    notify_app: bool | None = None
    paused: bool | None = None


class PriceAlertOut(BaseModel):
    id: int
    card_id: str
    product_id: int
    card_name: str
    art_name: str
    image_url: str
    tcgplayer_url: str
    is_alt: bool
    current_price: float | None
    target_price: float
    direction: AlertDirection
    notify_email: bool
    notify_app: bool
    paused: bool
    armed: bool
    met_now: bool
    triggered_at: datetime | None = None
    triggered_price: float | None = None
    created_at: datetime | None = None


class PriceAlertList(BaseModel):
    alerts: list[PriceAlertOut]
    email_enabled: bool


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    card_id: str | None = None
    product_id: int | None = None
    price: float | None = None
    link: str | None = None
    created_at: datetime | None = None
    read_at: datetime | None = None

    model_config = {"from_attributes": True}


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


class NotificationsRead(BaseModel):
    ids: list[int] | None = Field(default=None, max_length=500)


# ---------------------------------------------------------------- scan samples (refactor 2.1c)

class ScanSamplesSaved(BaseModel):
    saved: int


class ScanSamplesCount(BaseModel):
    count: int


class ScanSamplesDeleted(BaseModel):
    deleted: int


class ScanSampleExportItem(BaseModel):
    id: int
    split: str
    final_id: str
    predicted_id: str | None
    confidence: str
    label: str
    image_b64: str


class ScanSamplesExport(BaseModel):
    items: list[ScanSampleExportItem]
    next_after_id: int


# ---------------------------------------------------------------- public meta deck browser (refactor 2.1c)
# Field order follows planner/meta_decks.py, so the JSON is unchanged.

class MetaRecord(BaseModel):
    wins: int
    losses: int
    ties: int


class MetaLeader(BaseModel):
    leader_id: str
    name: str
    color: str
    image_url: str
    decks: int
    share: float
    top8: int
    wins: int
    losses: int
    ties: int
    win_rate: float | None


class MetaLeaders(BaseModel):
    days: int
    min_players: int
    events: int
    total_decks: int
    source: str
    source_url: str
    leaders: list[MetaLeader]


class MetaDeckCard(BaseModel):
    card_id: str
    count: int
    name: str
    cost: str
    card_type: str
    image_url: str


class MetaDeck(BaseModel):
    id: int
    event_id: str
    event: str
    event_url: str
    set_label: str | None
    date: str
    players: int
    placing: int | None
    record: MetaRecord
    cards: list[MetaDeckCard]
    card_count: int
    text: str


class MetaDecks(BaseModel):
    leader_id: str
    name: str
    image_url: str
    decks: list[MetaDeck]


class MetaCard(BaseModel):
    card_id: str
    name: str
    rarity: str
    color: str
    card_type: str
    cost: str | None
    group_name: str
    image_url: str
    tcgplayer_url: str
    market_price: float | None


class MetaPrinting(BaseModel):
    product_id: int
    name: str
    market_price: float | None
    image_url: str
    tcgplayer_url: str
    group_name: str
    is_special: bool


class MetaCardLeader(BaseModel):
    leader_id: str
    name: str
    color: str
    image_url: str
    leader_decks: int
    decks_with_card: int
    rate: float
    average_copies: float


class MetaCardTopDeck(BaseModel):
    id: int
    event: str
    event_url: str
    date: str
    players: int
    placing: int | None
    record: MetaRecord
    leader_id: str
    leader_name: str
    leader_image_url: str
    copies: int


class MetaCardUsage(BaseModel):
    days: int
    min_players: int
    events: int
    total_decks: int
    is_leader: bool
    decks_with_card: int
    rate: float
    average_copies: float | None
    leaders: list[MetaCardLeader]
    top_decks: list[MetaCardTopDeck]
    source: str
    source_url: str


class MetaCardDetail(BaseModel):
    card: MetaCard
    printings: list[MetaPrinting]
    usage: MetaCardUsage
