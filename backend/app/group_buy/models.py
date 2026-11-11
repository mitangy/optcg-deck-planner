"""Group-buy models."""

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
    """Collaborative shopping pool (group buy) with invite link."""

    __tablename__ = "group_buys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Group buy")
    # GroupBuyStatus: open | locked | ordered | completed
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
    # equal | by_cost | by_copies
    shipping_split: Mapped[str] = mapped_column(String(32), default="equal")
    # Sales tax / fees — always split by card cost in settlement.
    tax_cost: Mapped[float] = mapped_column(Float, default=0.0)
    # Last TCGPlayer receipt paste (host); survives refresh so Mark purchased can rematch.
    receipt_text: Mapped[str] = mapped_column(Text, default="")
    # When True, anyone with the invite token can view the pool read-only (no mutations).
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
    role: Mapped[str] = mapped_column(String(32), default="member")  # host | member
    # JSON list of deck ids for this member's contribution; null/empty = all decks
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cards added straight to Master Shopping (in no deck) count toward the contribution (#1177).
    include_singles: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    # Extra copy wants (alt arts on top of the decks) count toward the contribution (#1177).
    include_extra_copies: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
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


class GroupBuyExtraSkip(Base):
    """Extra copies a member leaves out of one group buy (#1269); their Shopping list is untouched."""

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
    # Copies of this Extra skipped in this group buy.
    qty: Mapped[int] = mapped_column(Integer, default=0)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="extra_skips")


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
    # GroupBuyStatus (locked or ordered) — status immediately before this apply mutated the pool
    status_before: Mapped[str] = mapped_column(String(32), default=GroupBuyStatus.ORDERED)
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
