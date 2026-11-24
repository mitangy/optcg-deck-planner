
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.statuses import FriendshipStatus, TradeStatus


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_low_id", "user_high_id", name="uq_friendship_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_low_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_high_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default=FriendshipStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelPresence(Base):
    __tablename__ = "duel_presence"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    room_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    instance_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(16), default="player")
    phase: Mapped[str] = mapped_column(String(16), default="playing")
    ranked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    server_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DuelLobbySeen(Base):
    __tablename__ = "duel_lobby_seen"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DuelInvite(Base):
    __tablename__ = "duel_invites"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_duel_invite_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[str] = mapped_column(String(64))
    server_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserSharing(Base):
    __tablename__ = "user_sharing"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    decks: Mapped[str] = mapped_column(String(16), default="friends", server_default="friends")
    collection: Mapped[str] = mapped_column(String(16), default="friends", server_default="friends")
    trades_open: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    show_values: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    prompted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TradeKeep(Base):
    __tablename__ = "trade_keep"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_trade_keep"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32))
    keep_qty: Mapped[int] = mapped_column(Integer, default=0)


class TradeOffer(Base):
    __tablename__ = "trade_offers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=TradeStatus.PENDING)
    message: Mapped[str] = mapped_column(String(500), default="")
    parent_offer_id: Mapped[int | None] = mapped_column(
        ForeignKey("trade_offers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    lines: Mapped[list[TradeOfferLine]] = relationship(
        cascade="all, delete-orphan", order_by="TradeOfferLine.id"
    )


class TradeOfferLine(Base):
    __tablename__ = "trade_offer_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(
        ForeignKey("trade_offers.id", ondelete="CASCADE"), index=True
    )
    side: Mapped[str] = mapped_column(String(8))
    card_id: Mapped[str] = mapped_column(String(32))
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qty: Mapped[int] = mapped_column(Integer)
    market_price: Mapped[float | None] = mapped_column(Float, nullable=True)


class TradeApply(Base):
    __tablename__ = "trade_applies"
    __table_args__ = (UniqueConstraint("offer_id", "user_id", name="uq_trade_apply"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(
        ForeignKey("trade_offers.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[list[TradeApplyLine]] = relationship(
        cascade="all, delete-orphan", order_by="TradeApplyLine.id"
    )


class TradeApplyLine(Base):
    __tablename__ = "trade_apply_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apply_id: Mapped[int] = mapped_column(
        ForeignKey("trade_applies.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(String(32))
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    delta: Mapped[int] = mapped_column(Integer)
    qty_before: Mapped[int] = mapped_column(Integer)
