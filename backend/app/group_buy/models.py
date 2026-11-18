
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

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
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.statuses import GroupBuyStatus

if TYPE_CHECKING:
    from app.core.models import User


class GroupBuy(Base):
    __tablename__ = "group_buys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Group buy")
    status: Mapped[str] = mapped_column(String(32), default=GroupBuyStatus.OPEN)
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_order_id: Mapped[str] = mapped_column(String(200), default="")
    order_notes: Mapped[str] = mapped_column(Text, default="")
    shipping_cost: Mapped[float] = mapped_column(Float, default=0.0)
    shipping_split: Mapped[str] = mapped_column(String(32), default="equal")
    tax_cost: Mapped[float] = mapped_column(Float, default=0.0)
    receipt_text: Mapped[str] = mapped_column(Text, default="")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

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
    extra_skips: Mapped[list[GroupBuyExtraSkip]] = relationship(
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
    role: Mapped[str] = mapped_column(String(32), default="member")
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    include_singles: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    include_extra_copies: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class GroupBuySnapshotLine(Base):
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


class GroupBuyExtraSkip(Base):
    __tablename__ = "group_buy_extra_skips"
    __table_args__ = (
        UniqueConstraint(
            "group_buy_id", "user_id", "card_id", "product_id", name="uq_group_buy_extra_skip"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="extra_skips")


class GroupBuyReceiptApply(Base):
    __tablename__ = "group_buy_receipt_applies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    applied_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status_before: Mapped[str] = mapped_column(String(32), default=GroupBuyStatus.ORDERED)
    set_ordered_at: Mapped[int] = mapped_column(Integer, default=0)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="receipt_applies")
    lines: Mapped[list[GroupBuyReceiptApplyLine]] = relationship(
        back_populates="apply", cascade="all, delete-orphan"
    )


class GroupBuyReceiptApplyLine(Base):
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
