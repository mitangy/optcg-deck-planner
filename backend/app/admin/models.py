
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.statuses import FeedbackStatus


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    app: Mapped[str] = mapped_column(String(16))
    page: Mapped[str] = mapped_column(String(200), default="")
    client_build: Mapped[str] = mapped_column(String(40), default="")
    viewport: Mapped[str] = mapped_column(String(32), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    room_id: Mapped[str] = mapped_column(String(64), default="")
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    discord_message_id: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
    discord_author: Mapped[str] = mapped_column(String(64), default="")
    github_issue: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=FeedbackStatus.OPEN, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ProductEvent(Base):
    """One funnel step a visitor reached (#1499). No IP, email or user agent: ``anon_id`` is a random client id."""

    __tablename__ = "product_events"
    __table_args__ = (Index("ix_product_events_name_created_at", "name", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    anon_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    app: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(40))
    device: Mapped[str | None] = mapped_column(String(8), nullable=True)
    props: Mapped[dict | None] = mapped_column(JSON, nullable=True)
