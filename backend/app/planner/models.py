"""Planner models: decks, owned cards, shopping extras, share links, price alerts and the catalog."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base

if TYPE_CHECKING:
    from app.core.models import User


class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    leader_card_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Baseline for Additional Cards among decks that share leader_card_id.
    # At most one True per (user, leader); unset falls back to earliest sort_order.
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Owner opts this deck out of what friends can browse (#703).
    hidden_from_friends: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="decks")
    cards: Mapped[list[DeckCard]] = relationship(
        back_populates="deck", cascade="all, delete-orphan", order_by="DeckCard.id"
    )


class DeckCard(Base):
    __tablename__ = "deck_cards"
    __table_args__ = (UniqueConstraint("deck_id", "card_id", name="uq_deck_card"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    needed: Mapped[int] = mapped_column(Integer)

    deck: Mapped[Deck] = relationship(back_populates="cards")


class DeckCardPrinting(Base):
    """Per-deck alt-art want counts (play allocation of DeckCard.needed)."""

    __tablename__ = "deck_card_printings"
    __table_args__ = (
        UniqueConstraint("deck_id", "card_id", "product_id", name="uq_deck_card_printing"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)


class Owned(Base):
    __tablename__ = "owned"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_user_owned"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship(back_populates="owned")


class OwnedPrinting(Base):
    """Copies of one alt-art printing a user owns (per user, like ``Owned``)."""

    __tablename__ = "owned_printings"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", "product_id", name="uq_user_owned_printing"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer)
    qty: Mapped[int] = mapped_column(Integer, default=0)


class CollectorWant(Base):
    """Copies of one alt printing a user wants on top of what their decks need (#1031).

    One count per user per printing (not per deck). Owned copies of the printing
    fill this want first; only the rest count toward deck needs.
    """

    __tablename__ = "collector_wants"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", "product_id", name="uq_user_collector_want"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CardDisplayChoice(Base):
    """Which art a user wants shown for a card in the planner.

    ``product_id`` 0 means the base art; a positive value is a special
    printing's product id. No row means automatic (most-owned alt).
    """

    __tablename__ = "card_display_choices"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", name="uq_user_card_display_choice"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)


class PriceAlert(Base):
    """A target price a user watches for one art of a card (#855).

    ``product_id`` 0 is the card's base art (CatalogCard.market_price); a positive
    value is that printing's own market price. ``armed`` alerts fire when the
    condition holds; firing disarms them until the price crosses back.
    """

    __tablename__ = "price_alerts"
    __table_args__ = (UniqueConstraint("user_id", "card_id", "product_id", name="uq_price_alert_art"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_price: Mapped[float] = mapped_column(Float, nullable=False)
    direction: Mapped[str] = mapped_column(String(8), default="below")
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notify_app: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    paused: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    armed: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    last_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Price at the moment it last fired, shown as "Hit Nov 2 at $4.20".
    triggered_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    """In-app inbox entry (the bell). Kind-based so other features can post here too."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), default="price_alert")
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    card_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ShoppingExtra(Base):
    """Card added straight to Master Shopping without a deck.

    ``qty`` is a TARGET number of copies to own (like a deck's needed count),
    combined with deck need by max, not a count of copies to buy.
    """

    __tablename__ = "shopping_extras"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_user_shopping_extra"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="shopping_extras")


class ShoppingExtraPrinting(Base):
    """Alt-art want counts for a card that is in Master Shopping through a ShoppingExtra.

    Deck cards keep their alt wants on DeckCardPrinting; a card added only from Master
    Shopping has no deck, so its wants live here. Their sum stays <= the extra's qty.
    """

    __tablename__ = "shopping_extra_printings"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", "product_id", name="uq_user_shopping_extra_printing"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)


class ShareLink(Base):
    """Public read-only link to a user's shopping list (or a deck)."""

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), default="shopping")  # shopping | deck
    deck_id: Mapped[int | None] = mapped_column(
        ForeignKey("decks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # JSON list of deck ids for shopping shares; null/empty = all decks
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Shopping shares: show the "Added directly" cards (shopping_extras). Links made
    # before this column existed keep showing them (#527).
    include_extras: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()


class CatalogCard(Base):
    __tablename__ = "catalog_cards"

    card_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    rarity: Mapped[str] = mapped_column(String(32), default="")
    color: Mapped[str] = mapped_column(String(64), default="")
    card_type: Mapped[str] = mapped_column(String(64), default="")
    cost: Mapped[str | None] = mapped_column(String(16), nullable=True)
    market_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, default="")
    tcgplayer_url: Mapped[str] = mapped_column(Text, default="")
    group_name: Mapped[str] = mapped_column(String(255), default="")
    is_special: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CatalogPrinting(Base):
    """All TCGPlayer products for a card number (standard + alt arts)."""

    __tablename__ = "catalog_printings"
    __table_args__ = (UniqueConstraint("card_id", "product_id", name="uq_card_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    market_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, default="")
    tcgplayer_url: Mapped[str] = mapped_column(Text, default="")
    group_name: Mapped[str] = mapped_column(String(255), default="")
    is_special: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CatalogGroup(Base):
    """A TCGCSV set (group). Printings only carry the name, so release dates map by name (#946)."""

    __tablename__ = "catalog_groups"

    group_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    abbreviation: Mapped[str] = mapped_column(String(64), default="")
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class PriceHistoryMonth(Base):
    """One TCGPlayer product's daily market prices for one month (#946).

    `market` is a JSON array of 31 entries, index = day - 1, null where a day is
    missing. One row per product-month keeps ~7.4k products x ~33 months small.
    """

    __tablename__ = "price_history_months"

    product_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    month: Mapped[date] = mapped_column(Date, primary_key=True)
    market: Mapped[str] = mapped_column(Text, default="[]")


class CatalogMeta(Base):
    __tablename__ = "catalog_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    card_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")


class ScanSample(Base):
    """A 200x280 JPEG crop of a card the user confirmed in the scanner, plus its final label (#852).

    Used to retrain the scanner. ``split`` is fixed at insert and never changes.
    """

    __tablename__ = "scan_samples"
    __table_args__ = (Index("ix_scan_samples_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    final_id: Mapped[str] = mapped_column(String(32))
    predicted_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence: Mapped[str] = mapped_column(String(8))  # sure | check | none
    label: Mapped[str] = mapped_column(String(12))  # confirmed | corrected
    split: Mapped[str] = mapped_column(String(8))  # train | test
    mime: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
