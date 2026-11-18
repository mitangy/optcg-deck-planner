
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.statuses import AccessStatus, LessonStatus


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    players: Mapped[int] = mapped_column(Integer)
    set_label: Mapped[str | None] = mapped_column(String(16), nullable=True)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    platform: Mapped[str | None] = mapped_column(String(40), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TournamentDeck(Base):
    __tablename__ = "tournament_decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[str] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    leader_id: Mapped[str] = mapped_column(String(32), index=True)
    decklist: Mapped[str] = mapped_column(Text, default="{}")
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    ties: Mapped[int] = mapped_column(Integer, default=0)
    placing: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TournamentGame(Base):
    __tablename__ = "tournament_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[str] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    round: Mapped[int] = mapped_column(Integer)
    leader_a: Mapped[str] = mapped_column(String(32), index=True)
    leader_b: Mapped[str] = mapped_column(String(32), index=True)
    winner: Mapped[str] = mapped_column(String(3))


class AnalystPrefs(Base):
    __tablename__ = "analyst_prefs"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    share_matches: Mapped[bool] = mapped_column(Boolean, default=True)


class AnalystAccess(Base):
    __tablename__ = "analyst_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16), default=AccessStatus.PENDING)
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    credit_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    topup_usd: Mapped[float] = mapped_column(Float, default=0.0)
    topup_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    auto_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    topup_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalystSetting(Base):
    __tablename__ = "analyst_settings"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[str] = mapped_column(String(64))


class AnalystLesson(Base):
    __tablename__ = "analyst_lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=LessonStatus.DRAFT)
    leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opponent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cards: Mapped[str] = mapped_column(String(400), default="")
    text: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="[]")
    source: Mapped[str] = mapped_column(String(16), default="player", server_default="player")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalystCorpusId(Base):
    """An opaque id for a duel in Log Pose's anonymized game corpus.

    Corpus searches return these instead of match ids, so a game found there can't be
    matched to anyone's match history.
    """

    __tablename__ = "analyst_corpus_ids"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    game_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)


class BotMatch(Base):
    __tablename__ = "bot_matches"
    __table_args__ = (UniqueConstraint("batch_id", "batch_index", name="uq_bot_matches_batch_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    batch_id: Mapped[str] = mapped_column(String(64), index=True)
    batch_index: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    rules_version: Mapped[str] = mapped_column(String(32), default="")
    registry_hash: Mapped[str] = mapped_column(String(32), default="")
    levels: Mapped[str] = mapped_column(String(32), default="")
    leader_a: Mapped[str] = mapped_column(String(32), index=True)
    leader_b: Mapped[str] = mapped_column(String(32), index=True)
    winner: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_seat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decks: Mapped[str] = mapped_column(Text, default="{}")
    tallies: Mapped[str] = mapped_column(Text, default="{}")
    replay: Mapped[str] = mapped_column(Text)


class AnalystThread(Base):
    __tablename__ = "analyst_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="")
    scope: Mapped[str] = mapped_column(String(120), default="general", server_default="general")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("ix_analyst_threads_user_scope", "user_id", "scope"),)


class AnalystMessage(Base):
    """One message of a chat thread, as the Claude API saw it (content blocks as JSON).

    Append-only: the analyst resends the thread as stored, so rows are never edited.
    """

    __tablename__ = "analyst_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("analyst_threads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystProposal(Base):
    __tablename__ = "analyst_proposals"

    thread_id: Mapped[int] = mapped_column(ForeignKey("analyst_threads.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystUsage(Base):
    __tablename__ = "analyst_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(64), default="")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    thread_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    outcome: Mapped[str] = mapped_column(String(16), default="ok")
    refusal: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tool_calls: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class AnalystMatchBrief(Base):
    __tablename__ = "analyst_match_briefs"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    variant: Mapped[str] = mapped_column(String(32))
    leader_id: Mapped[str] = mapped_column(String(32))
    opponent_id: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystMatchReview(Base):
    __tablename__ = "analyst_match_reviews"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(Text)
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystToken(Base):
    __tablename__ = "analyst_tokens"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystEvalRun(Base):
    __tablename__ = "analyst_eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    model: Mapped[str] = mapped_column(String(64), default="")
    suite: Mapped[str] = mapped_column(String(16), default="main", server_default="main", index=True)
    correct: Mapped[float] = mapped_column(Float)
    total: Mapped[int] = mapped_column(Integer)
    metric_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    metric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    lower_is_better: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    groups: Mapped[str] = mapped_column(Text, default="{}")
    spend_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnalystFeedback(Base):
    __tablename__ = "analyst_feedback"
    __table_args__ = (UniqueConstraint("user_id", "target", name="uq_analyst_feedback_user_target"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))
    target: Mapped[str] = mapped_column(String(80))
    thread_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    match_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rating: Mapped[str] = mapped_column(String(8))
    note: Mapped[str] = mapped_column(Text, default="")
    answer_excerpt: Mapped[str] = mapped_column(Text, default="")
    question_excerpt: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
