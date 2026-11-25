
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
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
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
    __tablename__ = "card_display_choices"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", name="uq_user_card_display_choice"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)


class PriceAlert(Base):
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
    triggered_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
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
    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), default="shopping")
    deck_id: Mapped[int | None] = mapped_column(
        ForeignKey("decks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    effect_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    attribute: Mapped[str] = mapped_column(String(64), default="", server_default="")
    traits: Mapped[str] = mapped_column(Text, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CatalogPrinting(Base):
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
    __tablename__ = "catalog_groups"

    group_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    abbreviation: Mapped[str] = mapped_column(String(64), default="")
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class PriceHistoryMonth(Base):
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
    __tablename__ = "scan_samples"
    __table_args__ = (Index("ix_scan_samples_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    final_id: Mapped[str] = mapped_column(String(32))
    predicted_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence: Mapped[str] = mapped_column(String(8))
    label: Mapped[str] = mapped_column(String(12))
    split: Mapped[str] = mapped_column(String(8))
    mime: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
