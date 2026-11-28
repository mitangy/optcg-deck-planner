
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, false, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.roles import Role

if TYPE_CHECKING:
    from app.planner.models import Deck, Owned, ShoppingExtra


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    username: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Shopping Need: sum copies across distinct leaders instead of max across decks.
    sum_across_leaders: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    share_scans: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    role: Mapped[str] = mapped_column(String(16), default=Role.USER, server_default="user")
    banned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    banned_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    signup_source: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # Set for a group buy's "not on the app" member (#1445): the group buy the row belongs to. These
    # rows hold a name and nothing else; nobody signs in as one and they are left out of user lists.
    placeholder_group_buy_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "group_buys.id",
            ondelete="CASCADE",
            use_alter=True,
            name="fk_users_placeholder_group_buy_id",
        ),
        nullable=True,
        index=True,
        default=None,
    )
    # Day (UTC) of the newest authenticated request, stamped at most once a day (#1499) for return-visit stats.
    last_seen_at: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    decks: Mapped[list[Deck]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned: Mapped[list[Owned]] = relationship(back_populates="user", cascade="all, delete-orphan")
    shopping_extras: Mapped[list[ShoppingExtra]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


def is_placeholder_user(user: User) -> bool:
    return user.placeholder_group_buy_id is not None


# Case-insensitive uniqueness for usernames (NULLs allowed on SQLite + Postgres).
# Created by migration 0001 (Alembic cannot render expression indexes; it is written by hand).
Index("ix_users_username_lower", func.lower(User.username), unique=True)


class LoginTicket(Base):
    __tablename__ = "login_tickets"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
