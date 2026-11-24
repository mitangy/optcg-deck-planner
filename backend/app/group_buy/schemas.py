
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.group_buy.order_history_pdf import MAX_TEXT_CHARS
from app.planner.schemas import GroupBuyArtWantOut, PrintingView


class GroupBuyCreate(BaseModel):
    title: str = Field(default="Group buy", min_length=1, max_length=200)
    deck_ids: list[int] | None = None


class GroupBuyContributionUpdate(BaseModel):
    deck_ids: list[int] | None = None
    include_singles: bool | None = None
    include_extra_copies: bool | None = None


class GroupBuyQtyUpdate(BaseModel):
    qty: int = Field(ge=0, le=999)
    # Host only: edit this "not on the app" member's quantity instead of their own (#1445).
    user_id: int | None = None


OfflineMemberName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class GroupBuyOfflineMemberBody(BaseModel):
    name: OfflineMemberName


class GroupBuyOfflineCardsPaste(BaseModel):
    text: str = Field(max_length=20000)


class GroupBuyOrderUpdate(BaseModel):
    external_order_id: str | None = Field(default=None, max_length=200)
    order_notes: str | None = Field(default=None, max_length=4000)
    shipping_cost: float | None = Field(default=None, ge=0, le=100000)
    shipping_split: str | None = Field(default=None, pattern="^(equal|by_cost|by_copies)$")
    tax_cost: float | None = Field(default=None, ge=0, le=100000)


class GroupBuyPublicUpdate(BaseModel):
    is_public: bool


class GroupBuyTitleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class GroupBuyMemberOut(BaseModel):
    user_id: int
    display_name: str
    role: str
    deck_ids: list[int] | None = None
    include_singles: bool = True
    include_extra_copies: bool = False
    sum_across_leaders: bool | None = None
    cards_still_needed: int = 0
    remaining_market: float = 0.0
    card_cost: float = 0.0
    shipping_share: float = 0.0
    tax_share: float = 0.0
    total_owed: float = 0.0
    # A name the host typed for someone who is not on the app (#1445).
    is_offline: bool = False
    # Hand-off (#1418): host and the member themselves only; blank for everyone else and the invite view.
    handoff_status: str = ""
    handoff_tracking_url: str = ""
    handoff_note: str = ""
    qty_handed: int = 0
    # This member's arrived copies minus the ones already handed over or shipped.
    ready_to_hand_over: int = 0
    paid: bool = False


class GroupBuyHandoffUpdate(BaseModel):
    status: Literal["waiting", "shipped", "handed_over"] | None = None
    tracking_url: str | None = Field(default=None, max_length=1000)
    note: str | None = Field(default=None, max_length=300)
    qty_handed: int | None = Field(default=None, ge=0, le=9999)
    paid: bool | None = None


class GroupBuyMemberQtyOut(BaseModel):
    user_id: int
    display_name: str
    qty: int
    suggested_qty: int = 0
    is_custom: bool = False


class GroupBuyMemberArtOut(BaseModel):
    """How many copies of one art of a card a member has in this group buy (#1451); host view only."""

    user_id: int
    product_id: int | None = None
    qty: int
    qty_arrived: int = 0


class GroupBuyMoveCopies(BaseModel):
    card_id: str = Field(min_length=1, max_length=32)
    product_id: int | None = None
    from_user_id: int
    to_user_id: int
    qty: int = Field(ge=1, le=999)


class GroupBuyExtraSkipUpdate(BaseModel):
    skip: int = Field(ge=0, le=999)


class GroupBuyMyExtraOut(BaseModel):
    """One of the viewer's Extra copies on a card, and how many they leave out of this buy (#1269)."""

    product_id: int
    name: str = ""
    market_price: float | None = None
    wanted: int = 0
    skipped: int = 0


class GroupBuyNotOrderedMemberOut(BaseModel):
    """Copies of one card a member still has no seller order for (#1439)."""

    user_id: int
    display_name: str
    qty: int
    # The alt art these copies are, or None for the standard art.
    product_id: int | None = None


class GroupBuyBoughtArtOut(BaseModel):
    """One art of a card that is in a seller order (#1443). ``product_id`` None is the base art."""

    product_id: int | None = None
    name: str = ""
    qty: int
    my_qty: int = 0
    # Per copy: the price paid when ``paid``, otherwise that art's market price.
    unit_price: float | None = None
    paid: bool = False


class GroupBuyLineOut(BaseModel):
    card_id: str
    name: str
    color: str = ""
    rarity: str = ""
    card_type: str = ""
    cost: str | None = None
    total_qty: int
    market_price: float | None = None
    remaining_cost: float | None = None
    product_id: int | None = None
    preferred_product_id: int | None = None
    preferred_market_price: float | None = None
    tcgplayer_url: str = ""
    image_url: str = ""
    base_image_url: str = ""
    members: list[GroupBuyMemberQtyOut]
    alt_arts: list[PrintingView] = []
    art_wants: list[GroupBuyArtWantOut] = []
    display_art: int | None = None
    # Arts already in a seller order; empty until the card has copies in one (#1443).
    bought_arts: list[GroupBuyBoughtArtOut] = []
    # Price per bought copy (copy-weighted over bought_arts); None while any is unpriced.
    bought_each: float | None = None
    my_qty: int = 0
    my_suggested_qty: int = 0
    my_is_custom: bool = False
    my_excluded: bool = False
    my_need: int = 0
    my_used_in: list[str] = []
    my_deck_qty: int = 0
    my_extras: list[GroupBuyMyExtraOut] = []
    # Copies of this card already in a seller order / arrived / not in any order yet (#1418).
    in_order: int = 0
    arrived: int = 0
    not_ordered: int = 0
    my_in_order: int = 0
    my_arrived: int = 0
    my_not_ordered: int = 0
    # Who the not-ordered copies are for; empty until the group buy has an order (#1439).
    not_ordered_members: list[GroupBuyNotOrderedMemberOut] = []
    # Per member and art, for the host once locked or ordered (#1451).
    member_arts: list[GroupBuyMemberArtOut] = []


class GroupBuyOrderAllocationOut(BaseModel):
    user_id: int
    display_name: str
    qty: int
    qty_arrived: int


class GroupBuyOrderLineOut(BaseModel):
    id: int
    card_id: str
    name: str = ""
    product_id: int | None = None
    qty_ordered: int
    qty_arrived: int
    # Ordered copies nobody's snapshot still needed; they cannot be tracked per member.
    qty_extra: int = 0
    # Price paid per copy, when the import had one (#1443).
    unit_price: float | None = None
    allocations: list[GroupBuyOrderAllocationOut] = []


class GroupBuyOrderOut(BaseModel):
    id: int
    seller_name: str = ""
    status: str
    qty_ordered: int
    qty_allocated: int
    qty_arrived: int
    qty_extra: int
    arrived_at: str | None = None
    created_at: str
    version: int
    # Host only: members and the invite-link view get blanks.
    order_number: str = ""
    tracking_url: str = ""
    receipt_text: str = ""
    lines: list[GroupBuyOrderLineOut] = []


class GroupBuySummary(BaseModel):
    id: int
    title: str
    status: str
    invite_token: str
    invite_path: str
    host_user_id: int
    host_name: str
    member_count: int
    is_host: bool
    is_public: bool = False
    public_path: str | None = None
    unique_cards: int
    cards_still_needed: int
    remaining_market: float
    created_at: str


class GroupBuyDetail(GroupBuySummary):
    members: list[GroupBuyMemberOut]
    lines: list[GroupBuyLineOut]
    locked_at: str | None = None
    ordered_at: str | None = None
    external_order_id: str = ""
    order_notes: str = ""
    shipping_cost: float = 0.0
    shipping_split: str = "equal"
    tax_cost: float = 0.0
    cards_subtotal: float = 0.0
    grand_total: float = 0.0
    receipt_text: str = ""
    has_receipt: bool = False
    can_undo_purchase: bool = False
    read_only: bool = False
    orders: list[GroupBuyOrderOut] = []



class GroupBuyOfflineCardsResult(BaseModel):
    detail: GroupBuyDetail
    applied: int = 0
    unmatched: list[str] = []


class GroupBuyInvitePreview(BaseModel):
    title: str
    host_name: str
    member_count: int
    status: str
    invite_token: str
    is_public: bool = False
    public_path: str | None = None


class GroupBuyExport(BaseModel):
    paste_text: str
    url: str | None = None
    included_count: int
    copy_count: int
    with_product_id: int
    missing_product_id: int
    status: str


class GroupBuyReceiptMatchRequest(BaseModel):
    receipt_text: str = Field(min_length=1, max_length=200_000)


class GroupBuyReceiptApplyRequest(BaseModel):
    receipt_text: str = Field(min_length=1, max_length=200_000)
    card_ids: list[str] | None = None
    allow_partial: bool = True


class GroupBuyReceiptUnmatchedOut(BaseModel):
    qty: int
    description: str
    set_name: str = ""
    card_name: str = ""


class GroupBuyReceiptLineOut(BaseModel):
    card_id: str
    name: str
    group_name: str = ""
    needed_qty: int
    receipt_qty: int
    status: str
    confidence: str = ""
    product_id: int | None = None
    staged_qty: int = 0
    descriptions: list[str] = []


class GroupBuyReceiptMatchReport(BaseModel):
    lines: list[GroupBuyReceiptLineOut]
    unmatched: list[GroupBuyReceiptUnmatchedOut]
    summary: dict[str, int]
    can_apply_full: bool
    can_apply_partial: bool


class GroupBuyOrderLineIn(BaseModel):
    card_id: str = Field(min_length=1, max_length=32)
    product_id: int | None = None
    qty: int = Field(ge=1, le=999)


class GroupBuyOrderCreate(BaseModel):
    order_number: str = Field(default="", max_length=200)
    seller_name: str = Field(default="", max_length=200)
    tracking_url: str = Field(default="", max_length=1000)
    receipt_text: str = Field(default="", max_length=200_000)
    lines: list[GroupBuyOrderLineIn] | None = None
    mark_arrived: bool = False


class GroupBuyOrderPatch(BaseModel):
    order_number: str | None = Field(default=None, max_length=200)
    seller_name: str | None = Field(default=None, max_length=200)
    tracking_url: str | None = Field(default=None, max_length=1000)
    expected_version: int | None = None


class GroupBuyOrderLinesUpdate(BaseModel):
    expected_version: int | None = None
    receipt_text: str = Field(default="", max_length=200_000)
    lines: list[GroupBuyOrderLineIn] | None = None


class GroupBuyOrderPreviewRequest(BaseModel):
    receipt_text: str = Field(min_length=1, max_length=200_000)


class GroupBuyArrivalLineIn(BaseModel):
    line_id: int
    qty_arrived: int = Field(ge=0, le=999)


class GroupBuyArrivalUpdate(BaseModel):
    expected_version: int
    all: bool = False
    lines: list[GroupBuyArrivalLineIn] | None = None


class GroupBuyArrivalUndo(BaseModel):
    expected_version: int


class GroupBuyOrderPreviewAllocation(BaseModel):
    user_id: int
    display_name: str
    qty: int


class GroupBuyOrderPreviewLine(BaseModel):
    card_id: str
    name: str = ""
    product_id: int | None = None
    qty: int
    allocations: list[GroupBuyOrderPreviewAllocation] = []
    qty_extra: int = 0


class GroupBuyOrderPreview(BaseModel):
    lines: list[GroupBuyOrderPreviewLine]
    unmatched: list[GroupBuyReceiptUnmatchedOut]


class GroupBuyOrderHistoryRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


class GroupBuyOrderHistoryImport(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    order_numbers: list[str] = Field(min_length=1, max_length=200)


class GroupBuyHistoryOrderPreview(BaseModel):
    order_number: str
    order_date: str = ""
    seller_name: str = ""
    tracking_number: str = ""
    tracking_url: str = ""
    # Already on this group buy: it cannot be added again.
    already_added: bool = False
    # At least one matched card is in this group buy; the rest of the page is usually other purchases.
    in_group_buy: bool = False
    lines: list[GroupBuyOrderPreviewLine]
    unmatched: list[GroupBuyReceiptUnmatchedOut]


class GroupBuyOrderHistoryPreview(BaseModel):
    orders: list[GroupBuyHistoryOrderPreview]
    # Set by the PDF endpoint so the client can send the text back to import.
    text: str = ""


class GroupBuyOrderHistoryImported(BaseModel):
    order_ids: list[int]
    unmatched: list[GroupBuyReceiptUnmatchedOut] = []
    detail: GroupBuyDetail


class GroupBuyOrderAdded(BaseModel):
    order_id: int
    unmatched: list[GroupBuyReceiptUnmatchedOut] = []
    detail: GroupBuyDetail
