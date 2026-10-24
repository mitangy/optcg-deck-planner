"""Request/response models for friend views, spares and trades (#703)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

Visibility = Literal["friends", "off"]


class SharingOut(BaseModel):
    decks: Visibility
    collection: Visibility
    trades_open: bool
    show_values: bool
    prompted: bool


class SharingIn(BaseModel):
    decks: Visibility | None = None
    collection: Visibility | None = None
    trades_open: bool | None = None
    show_values: bool | None = None


class FriendProfileOut(BaseModel):
    user_id: int
    username: str
    decks_shared: bool
    collection_shared: bool
    trades_open: bool
    deck_count: int | None = None
    unique_cards: int | None = None
    total_copies: int | None = None
    total_value: float | None = None
    spare_cards: int | None = None


class FriendDeckSummary(BaseModel):
    id: int
    name: str
    leader_card_id: str | None = None
    leader_name: str | None = None
    leader_image_url: str = ""
    total_cards: int = 0
    main_cards: int = 0


class FriendDeckCard(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    needed: int
    image_url: str = ""
    market_price: float | None = None
    my_owned: int = 0
    my_still_need: int = 0


class FriendDeckDetail(BaseModel):
    id: int
    name: str
    leader_card_id: str | None = None
    leader_name: str | None = None
    leader_image_url: str = ""
    main_cards: int = 0
    cards: list[FriendDeckCard]
    my_missing_copies: int = 0
    my_missing_cost: float | None = None


class FriendOwnedItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    owned: int
    alts_owned: int = 0
    market_price: float | None = None
    image_url: str = ""
    value: float | None = None
    spare: int = 0


class FriendCollectionOut(BaseModel):
    items: list[FriendOwnedItem]
    unique_cards: int
    total_copies: int
    total_value: float | None = None


class SparePrinting(BaseModel):
    product_id: int
    label: str = ""
    image_url: str = ""
    owned: int


class SpareItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    image_url: str = ""
    market_price: float | None = None
    spare: int
    want: int = 0
    printings: list[SparePrinting] = []


class MySpareItem(SpareItem):
    keep_qty: int = 0


class FriendSparesOut(BaseModel):
    their_spares: list[SpareItem]
    you_need: list[SpareItem]
    they_need: list[SpareItem]


class MySparesOut(BaseModel):
    items: list[MySpareItem]


class TradeKeepIn(BaseModel):
    keep_qty: int = Field(ge=0, le=99)


class TradeKeepOut(BaseModel):
    card_id: str
    keep_qty: int
    spare: int


class TradeLineIn(BaseModel):
    side: Literal["give", "get"]
    card_id: str = Field(min_length=1, max_length=32)
    product_id: int | None = None
    qty: int = Field(ge=1, le=20)

    @field_validator("card_id")
    @classmethod
    def _norm_card(cls, v: str) -> str:
        return v.strip().upper()


class TradeIn(BaseModel):
    to_user_id: int
    message: str = Field(default="", max_length=500)
    lines: list[TradeLineIn] = Field(min_length=1, max_length=40)


class CounterIn(BaseModel):
    message: str = Field(default="", max_length=500)
    lines: list[TradeLineIn] = Field(min_length=1, max_length=40)


class TradeLineOut(BaseModel):
    side: Literal["give", "get"]
    card_id: str
    product_id: int | None = None
    qty: int
    name: str
    image_url: str = ""
    market_price: float | None = None
    printing_label: str | None = None


class TradeOut(BaseModel):
    id: int
    from_user_id: int
    from_username: str
    to_user_id: int
    to_username: str
    status: str
    message: str = ""
    parent_offer_id: int | None = None
    created_at: int
    responded_at: int | None = None
    completed_at: int | None = None
    expires_at: int
    lines: list[TradeLineOut]
    give_value: float | None = None
    get_value: float | None = None
    i_am_sender: bool
    my_applied: bool = False
    other_applied: bool = False


class TradesOut(BaseModel):
    incoming: list[TradeOut]
    outgoing: list[TradeOut]
    active: list[TradeOut]
    history: list[TradeOut]


class TradeSummaryOut(BaseModel):
    incoming_pending: int
    active: int
