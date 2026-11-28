
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
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


class ClientError(Base):
    """One uncaught error, grouped by fingerprint: a repeat inside the dedupe window bumps ``count`` instead of adding a row (#1500)."""

    __tablename__ = "client_errors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    app: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(String(500), default="")
    stack: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(200), default="")
    release: Mapped[str] = mapped_column(String(40), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    fingerprint: Mapped[str] = mapped_column(String(40), index=True)
