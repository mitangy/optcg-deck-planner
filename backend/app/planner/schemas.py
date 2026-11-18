
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
    confirm_oversize: bool = False


class DeckSummaryCard(BaseModel):
    card_id: str
    name: str
    qty: int


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
    owned_copies: int = 0
    # Dollars left to finish the deck (what the deck page shows as "left"); null when not computed.
    remaining_cost: float | None = None
    sort_order: int
    is_main: bool = False
    hidden_from_friends: bool = False
    cards: list[DeckSummaryCard] = []


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
    alt_product_id: int | None = None
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
    wanted: int = 0
    owned: int = 0
    collector: int = 0


class DisplayArtUpdate(BaseModel):
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
    rarity: str | None = None
    current: float | None = None
    points: list[tuple[str, float]]
    reprints: list[str] = []


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
    owned: int
    alts_owned: int = 0
    still_need: int
    earlier_leaders_need: int = 0
    earlier_leaders: list[str] = []
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    section: str = "main"
    alt_arts: list[PrintingView] = []
    art_wants: list[GroupBuyArtWantOut] = []
    display_art: int | None = None
    collector_want: int = 0


class DeckDetail(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
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
    display_art: int | None = None
    deck_sort_key: str = ""
    primary_leader_card_id: str | None = None
    primary_leader_name: str | None = None
    leader_count: int = 1
    need_by_leader: list[LeaderNeed] = Field(default_factory=list)
    need_summed: bool = False
    extra_qty: int = 0
    deck_need: int = 0
    collector_wants: list[CollectorLine] = []


class ShoppingResponse(BaseModel):
    items: list[ShoppingItem]
    cards_still_needed: int
    remaining_market: float
    unique_cards: int
    collector_copies: int = 0


class OwnedCardItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    owned: int
    alts_owned: int = 0
    market_price: float | None = None
    low_price: float | None = None
    value: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    used_in: list[str] = []
    buying: int = 0
    alt_arts: list[PrintingView] = []
    display_art: int | None = None


class OwnedCollectionResponse(BaseModel):
    items: list[OwnedCardItem]
    unique_cards: int
    total_copies: int
    total_value: float
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
