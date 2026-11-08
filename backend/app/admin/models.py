"""Admin models: player feedback."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.statuses import FeedbackStatus


class Feedback(Base):
    """A "Report a problem" / "Send feedback" message from the planner or duel-web."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # bug | idea | other
    kind: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    # duel | planner | discord (filed by the Den Den Mushi bot from a Discord post, #979)
    app: Mapped[str] = mapped_column(String(16))
    # Path only (no query string), e.g. /demo.
    page: Mapped[str] = mapped_column(String(200), default="")
    client_build: Mapped[str] = mapped_column(String(40), default="")
    viewport: Mapped[str] = mapped_column(String(32), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    room_id: Mapped[str] = mapped_column(String(64), default="")
    # Null for anonymous senders (no session cookie and no game token).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Discord message (or forum thread) id the ticket came from; unique so a post is filed once.
    discord_message_id: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
    discord_author: Mapped[str] = mapped_column(String(64), default="")
    # GitHub issue opened for a Discord ticket; set once so a retry never opens a second.
    github_issue: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=FeedbackStatus.OPEN, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
