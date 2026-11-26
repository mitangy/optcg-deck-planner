"""Instagram auto-poster tables (#1477)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class InstagramPost(Base):
    """One post per UTC day: the unique slot_date keeps redeploys and extra workers from double-posting."""

    __tablename__ = "instagram_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    slot_date: Mapped[date] = mapped_column(Date, unique=True)
    caption: Mapped[str] = mapped_column(Text)
    image_jpeg: Mapped[bytes] = mapped_column(LargeBinary)
    # Random, unguessable part of the public image URL Instagram fetches.
    media_token: Mapped[str] = mapped_column(String(64), unique=True)
    # What the post was about (card id, tip key, week), so the same thing is not posted twice.
    subject: Mapped[str] = mapped_column(String(64), default="", index=True)
    # rendered | published | failed | dry_run
    status: Mapped[str] = mapped_column(String(16), default="rendered")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ig_media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InstagramToken(Base):
    """The long-lived access token after its first refresh (single row, id 1). Never logged."""

    __tablename__ = "instagram_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    access_token: Mapped[str] = mapped_column(Text)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # sha256 of the IG_ACCESS_TOKEN env value this row was seeded from; a different env token replaces the row.
    env_token_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
