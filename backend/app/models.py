from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Bumped on logout so stolen cookies stop working before natural expiry.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    decks: Mapped[list[Deck]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned: Mapped[list[Owned]] = relationship(back_populates="user", cascade="all, delete-orphan")


class LoginTicket(Base):
    """Single-use OAuth login tickets (claimed once via POST /auth/claim)."""

    __tablename__ = "login_tickets"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    leader_card_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Baseline for Additional Cards among decks that share leader_card_id.
    # At most one True per (user, leader); unset falls back to earliest sort_order.
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
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


class CatalogMeta(Base):
    __tablename__ = "catalog_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    card_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")


class GroupBuy(Base):
    """Collaborative shopping pool (group buy) with invite link."""

    __tablename__ = "group_buys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Group buy")
    # open | locked | ordered | completed
    status: Mapped[str] = mapped_column(String(32), default="open")
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_order_id: Mapped[str] = mapped_column(String(200), default="")
    order_notes: Mapped[str] = mapped_column(Text, default="")
    shipping_cost: Mapped[float] = mapped_column(Float, default=0.0)
    # equal | by_cost | by_copies
    shipping_split: Mapped[str] = mapped_column(String(32), default="equal")
    # Sales tax / fees — always split by card cost in settlement.
    tax_cost: Mapped[float] = mapped_column(Float, default=0.0)
    # Last TCGPlayer receipt paste (host); survives refresh so Mark purchased can rematch.
    receipt_text: Mapped[str] = mapped_column(Text, default="")

    host: Mapped[User] = relationship()
    members: Mapped[list[GroupBuyMember]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    snapshot_lines: Mapped[list[GroupBuySnapshotLine]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    line_overrides: Mapped[list[GroupBuyLineOverride]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    qty_overrides: Mapped[list[GroupBuyQtyOverride]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    receipt_applies: Mapped[list[GroupBuyReceiptApply]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )


class GroupBuyMember(Base):
    __tablename__ = "group_buy_members"
    __table_args__ = (UniqueConstraint("group_buy_id", "user_id", name="uq_group_buy_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="member")  # host | member
    # JSON list of deck ids for this member's contribution; null/empty = all decks
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class GroupBuySnapshotLine(Base):
    """Frozen per-member qty at lock time."""

    __tablename__ = "group_buy_snapshot_lines"
    __table_args__ = (
        UniqueConstraint(
            "group_buy_id", "user_id", "card_id", name="uq_group_buy_snapshot_line"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="snapshot_lines")


class GroupBuyLineOverride(Base):
    """Host-chosen TCGPlayer product/printing for a merged card line."""

    __tablename__ = "group_buy_line_overrides"
    __table_args__ = (
        UniqueConstraint("group_buy_id", "card_id", name="uq_group_buy_line_override"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="line_overrides")


class GroupBuyQtyOverride(Base):
    """Per-member buy quantity override (defaults otherwise come from shopping still-need)."""

    __tablename__ = "group_buy_qty_overrides"
    __table_args__ = (
        UniqueConstraint(
            "group_buy_id", "user_id", "card_id", name="uq_group_buy_qty_override"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="qty_overrides")


class GroupBuyReceiptApply(Base):
    """One Mark purchased action — ledger so the host can undo Owned + snapshot changes."""

    __tablename__ = "group_buy_receipt_applies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    applied_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # locked | ordered — status immediately before this apply mutated the pool
    status_before: Mapped[str] = mapped_column(String(32), default="ordered")
    # True when this apply set ordered_at (auto-order from locked)
    set_ordered_at: Mapped[int] = mapped_column(Integer, default=0)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="receipt_applies")
    lines: Mapped[list[GroupBuyReceiptApplyLine]] = relationship(
        back_populates="apply", cascade="all, delete-orphan"
    )


class GroupBuyReceiptApplyLine(Base):
    """Per-member Owned / snapshot allocation recorded for one receipt apply."""

    __tablename__ = "group_buy_receipt_apply_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apply_id: Mapped[int] = mapped_column(
        ForeignKey("group_buy_receipt_applies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    apply: Mapped[GroupBuyReceiptApply] = relationship(back_populates="lines")
