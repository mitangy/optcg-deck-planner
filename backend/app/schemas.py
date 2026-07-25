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
    card_count: int
    total_cards: int
    sort_order: int


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
    section: str = "main"  # main | additional


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
    used_in: list[str]


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
