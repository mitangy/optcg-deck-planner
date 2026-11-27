"""Instagram auto-poster tables (#1477)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class InstagramPost(Base):
    """One post per UTC day: the unique slot_date keeps redeploys and extra workers from double-posting."""

    __tablename__ = "instagram_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    slot_date: Mapped[date] = mapped_column(Date, unique=True)
    caption: Mapped[str] = mapped_column(Text)
    # None for a Reel row (the video lives in instagram_reels); the public image route answers 404 then.
    image_jpeg: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
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
    # Reel posts (#1482): the uploaded video and the trending song chosen through the Audio API.
    reel_id: Mapped[int | None] = mapped_column(ForeignKey("instagram_reels.id", ondelete="SET NULL", name="fk_instagram_posts_reel_id"), nullable=True)
    audio_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audio_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    audio_artist: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Why a Reel was replaced by the day's image post (error is for the post that is stored now).
    reel_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class InstagramReel(Base):
    """An uploaded trailer video that the poster publishes as a Reel with a trending song (#1482)."""

    __tablename__ = "instagram_reels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    caption: Mapped[str] = mapped_column(Text)
    # Not loaded with the row: list and edit calls must never pull up to 100 MB.
    video: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    # Random, unguessable part of the public video URL Instagram fetches.
    media_token: Mapped[str] = mapped_column(String(64), unique=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    # Read from the mp4 header at upload; None when it could not be read.
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    posted_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class InstagramToken(Base):
    """The long-lived access token after its first refresh (single row, id 1). Never logged."""

    __tablename__ = "instagram_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    access_token: Mapped[str] = mapped_column(Text)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # sha256 of the IG_ACCESS_TOKEN env value this row was seeded from; a different env token replaces the row.
    env_token_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
