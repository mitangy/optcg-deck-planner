"""Account models: users and sign-in tickets (refactor D-03)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, false, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base

if TYPE_CHECKING:
    from app.planner.models import Deck, Owned, ShoppingExtra


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    # Public duel handle (3–20 chars, see app/usernames.py). Unique case-insensitively
    # via ix_users_username_lower; NULL until the user picks one.
    username: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Bumped on logout so stolen cookies stop working before natural expiry.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Shopping Need: sum copies across distinct leaders instead of max across decks.
    sum_across_leaders: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    # Scanner training samples (#852): on by default; PATCH /preferences turns it off.
    share_scans: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # "user" | "moderator" | "admin" (see app/roles.py). Only ADMIN_EMAIL is ever admin.
    role: Mapped[str] = mapped_column(String(16), default="user", server_default="user")
    # Set while the account is banned (#667); the ban also bumps session_version.
    banned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # The staff user who banned it. No foreign key: deleting that staff account keeps the ban.
    banned_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # First-touch source captured at sign-in (#905), compact JSON like {"ref":"google.com"}.
    # "{}" = direct; NULL = unknown (account predates tracking). Existing databases get
    # the column via app.core.db._ensure_user_signup_source().
    signup_source: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    decks: Mapped[list[Deck]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned: Mapped[list[Owned]] = relationship(back_populates="user", cascade="all, delete-orphan")
    shopping_extras: Mapped[list[ShoppingExtra]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# Case-insensitive uniqueness for usernames (NULLs allowed on SQLite + Postgres).
# Existing databases get this via app.core.db._ensure_user_username().
Index("ix_users_username_lower", func.lower(User.username), unique=True)


class LoginTicket(Base):
    """Single-use OAuth login tickets (claimed once via POST /auth/claim)."""

    __tablename__ = "login_tickets"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
