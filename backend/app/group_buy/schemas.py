
from __future__ import annotations

from pydantic import BaseModel, Field

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


class GroupBuyMemberQtyOut(BaseModel):
    user_id: int
    display_name: str
    qty: int
    suggested_qty: int = 0
    is_custom: bool = False


class GroupBuyExtraSkipUpdate(BaseModel):
    skip: int = Field(ge=0, le=999)


class GroupBuyMyExtraOut(BaseModel):
    """One of the viewer's Extra copies on a card, and how many they leave out of this buy (#1269)."""

    product_id: int
    name: str = ""
    market_price: float | None = None
    wanted: int = 0
    skipped: int = 0


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


class GroupBuyOrderAdded(BaseModel):
    order_id: int
    unmatched: list[GroupBuyReceiptUnmatchedOut] = []
    detail: GroupBuyDetail
