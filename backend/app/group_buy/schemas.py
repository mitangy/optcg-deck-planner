"""Group-buy request/response models."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.planner.schemas import GroupBuyArtWantOut, PrintingView


class GroupBuyCreate(BaseModel):
    title: str = Field(default="Group buy", min_length=1, max_length=200)
    deck_ids: list[int] | None = None


class GroupBuyContributionUpdate(BaseModel):
    deck_ids: list[int] | None = None
    # None = leave the member's current setting unchanged (older clients send only deck_ids).
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
    # Contribution settings (#1177); only meaningful while the group is open.
    include_singles: bool = True
    include_extra_copies: bool = False
    # Member's shopping "Copies needed" mode (True = separate per leader).
    # None once quantities are frozen, since the live setting no longer applies.
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
    # Catalog preferred (usually standard) printing — always available to reset checkout to.
    preferred_product_id: int | None = None
    preferred_market_price: float | None = None
    tcgplayer_url: str = ""
    image_url: str = ""
    # Art of the preferred (standard) printing, even when checkout is overridden to an alt.
    base_image_url: str = ""
    members: list[GroupBuyMemberQtyOut]
    alt_arts: list[PrintingView] = []
    # Every member's qty split across arts (alts first, rest on the preferred printing).
    art_wants: list[GroupBuyArtWantOut] = []
    # Viewer's chosen display art: None = automatic, 0 = base, >0 = product id.
    display_art: int | None = None
    # Viewer (current user) contribution on this line — for qty editors.
    my_qty: int = 0
    my_suggested_qty: int = 0
    my_is_custom: bool = False
    # True when the viewer opted out (custom qty 0 / Exclude).
    my_excluded: bool = False
    # Viewer's play Need for this card (max across their contribution decks) — alt want cap.
    my_need: int = 0


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
    # Present when is_public — unauthenticated read-only view path.
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
    # Saved TCGPlayer receipt paste (empty when none). Host uses this to rematch after refresh.
    receipt_text: str = ""
    has_receipt: bool = False
    # Host can undo the latest Mark purchased when a receipt-apply ledger exists.
    can_undo_purchase: bool = False
    # True for unauthenticated public viewers — UI must stay read-only.
    read_only: bool = False


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
    # When set, only these card_ids are applied (staging selection). None = all matched pool cards.
    card_ids: list[str] | None = None
    # Apply even when some pool lines are short / missing from the receipt.
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
    # exact | surplus | short | extra | missing
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
