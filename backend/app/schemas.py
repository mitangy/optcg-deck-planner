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


class DeckUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    decklist: str | None = None


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
