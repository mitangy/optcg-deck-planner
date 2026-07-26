from __future__ import annotations

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    decklist: str = Field(min_length=1)


class DeckSummary(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
    leader_image_url: str = ""
    card_count: int
    total_cards: int
    sort_order: int


class PrintingView(BaseModel):
    product_id: int
    name: str
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    group_name: str = ""
    is_special: bool = True


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


class CardView(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    needed: int
    owned: int
    still_need: int
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    section: str = "main"  # main | additional
    alt_arts: list[PrintingView] = []


class DeckDetail(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
    prior_decks: list[str] = []
    cards: list[CardView]


class ShoppingItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    need: int
    owned: int
    still_need: int
    market_price: float | None = None
    low_price: float | None = None
    remaining_cost: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    used_in: list[str]
    alt_arts: list[PrintingView] = []
    # Deck sort: group by earliest leader, then first same-leader deck that uses the card.
    # Multi-leader cards use the earliest deck's leader as primary.
    deck_sort_key: str = ""
    primary_leader_card_id: str | None = None
    primary_leader_name: str | None = None
    leader_count: int = 1


class ShoppingResponse(BaseModel):
    items: list[ShoppingItem]
    cards_still_needed: int
    remaining_market: float
    unique_cards: int


class OwnedUpdate(BaseModel):
    qty: int = Field(ge=0)


class CatalogStatus(BaseModel):
    card_count: int
    last_synced_at: str | None
    notes: str = ""


class ShareCreate(BaseModel):
    kind: str = Field(default="shopping", pattern="^(shopping|deck)$")
    deck_id: int | None = None
    deck_ids: list[int] | None = None


class ShareInfo(BaseModel):
    token: str
    kind: str
    deck_id: int | None = None
    deck_ids: list[int] | None = None
    path: str


class PublicShoppingResponse(ShoppingResponse):
    owner_name: str = ""
    kind: str = "shopping"
    deck_name: str | None = None


class GroupBuyCreate(BaseModel):
    title: str = Field(default="Group buy", min_length=1, max_length=200)
    deck_ids: list[int] | None = None


class GroupBuyContributionUpdate(BaseModel):
    deck_ids: list[int] | None = None


class GroupBuyLineOverrideUpdate(BaseModel):
    product_id: int = Field(gt=0)


class GroupBuyQtyUpdate(BaseModel):
    qty: int = Field(ge=0, le=999)


class GroupBuyOrderUpdate(BaseModel):
    external_order_id: str | None = Field(default=None, max_length=200)
    order_notes: str | None = Field(default=None, max_length=4000)
    shipping_cost: float | None = Field(default=None, ge=0, le=100000)
    shipping_split: str | None = Field(default=None, pattern="^(equal|by_cost|by_copies)$")


class GroupBuyMemberOut(BaseModel):
    user_id: int
    display_name: str
    role: str
    deck_ids: list[int] | None = None
    cards_still_needed: int = 0
    remaining_market: float = 0.0
    card_cost: float = 0.0
    shipping_share: float = 0.0
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
    total_qty: int
    market_price: float | None = None
    remaining_cost: float | None = None
    product_id: int | None = None
    tcgplayer_url: str = ""
    image_url: str = ""
    members: list[GroupBuyMemberQtyOut]
    alt_arts: list[PrintingView] = []
    # Viewer (current user) contribution on this line — for qty editors.
    my_qty: int = 0
    my_suggested_qty: int = 0
    my_is_custom: bool = False


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
    cards_subtotal: float = 0.0
    grand_total: float = 0.0


class GroupBuyInvitePreview(BaseModel):
    title: str
    host_name: str
    member_count: int
    status: str
    invite_token: str


class GroupBuyExport(BaseModel):
    paste_text: str
    url: str | None = None
    included_count: int
    copy_count: int
    with_product_id: int
    missing_product_id: int
    status: str
