"""Log Pose (analyst) models, plus the Limitless tournament tables that feed its stats."""

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
    """A Limitless TCG event whose results feed Log Pose tournament stats. No player data is kept."""

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
    """One entrant's deck at an event: leader, list as {card id: copies}, final record and placing. No names."""

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
    """One finished pairing: the two leaders and who won (A, B or tie). Byes and unfinished pairings are not kept."""

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
    """Whether a player's games count toward Log Pose stats (on unless they turn it off)."""

    __tablename__ = "analyst_prefs"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    share_matches: Mapped[bool] = mapped_column(Boolean, default=True)


class AnalystAccess(Base):
    """A player's request to use the Log Pose chat panel, and the owner's answer.

    Holds no email or name: the owner list shows the player's display name, looked up live.
    """

    __tablename__ = "analyst_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    # "pending" | "approved" | "denied"
    status: Mapped[str] = mapped_column(String(16), default=AccessStatus.PENDING)
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # This player's monthly credit in dollars; NULL means the default (ANALYST_USER_CREDIT_USD).
    credit_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Extra credit an owner granted for one month: topup_usd counts only while topup_month ("2026-10") is the current month.
    topup_usd: Mapped[float] = mapped_column(Float, default=0.0)
    topup_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # Approved at once by the free-spots rule (it keeps its spot used even if later revoked).
    auto_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    # When a player out of credit asked for more; cleared when an owner grants or dismisses it.
    topup_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalystSetting(Base):
    """One global Log Pose setting (today only the chat model), the same for every player and both apps."""

    __tablename__ = "analyst_settings"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[str] = mapped_column(String(64))


class AnalystLesson(Base):
    """A short strategy lesson Claude drafted through a player's personal link.

    Drafts wait for that player to approve or reject them in duel-web; only
    approved lessons are read back to Claude alongside the playbook.
    """

    __tablename__ = "analyst_lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=LessonStatus.DRAFT)
    leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opponent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cards: Mapped[str] = mapped_column(String(400), default="")
    text: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="[]")
    # "player" (drafted through the owner's link) | "bots" (bot-vs-real lines, posted by the weekly job, shared with every player once approved)
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
    """One bot-vs-bot self-play game (#635). Kept apart from duel_matches on purpose.

    Nothing here feeds matchup_stats, the leaderboard or ratings: bot games only reach
    Log Pose through /analyst/bot-games and /analyst/stats/sim, always labelled as simulations.
    Sides are "A" (seat 0) and "B" (seat 1).
    """

    __tablename__ = "bot_matches"
    __table_args__ = (UniqueConstraint("batch_id", "batch_index", name="uq_bot_matches_batch_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    batch_id: Mapped[str] = mapped_column(String(64), index=True)
    batch_index: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    rules_version: Mapped[str] = mapped_column(String(32), default="")
    registry_hash: Mapped[str] = mapped_column(String(32), default="")
    # Bot level per seat, "hard/hard" (seat 0 / seat 1).
    levels: Mapped[str] = mapped_column(String(32), default="")
    leader_a: Mapped[str] = mapped_column(String(32), index=True)
    leader_b: Mapped[str] = mapped_column(String(32), index=True)
    # Winning seat (0 / 1); NULL when the game did not finish.
    winner: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_seat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # {"A": {card: copies}, "B": {...}} for card searches.
    decks: Mapped[str] = mapped_column(Text, default="{}")
    # {"A": LineTally, "B": LineTally} from packages/rules/src/sim/selfPlay.ts.
    tallies: Mapped[str] = mapped_column(Text, default="{}")
    replay: Mapped[str] = mapped_column(Text)


class AnalystThread(Base):
    """A Log Pose chat thread in the in-app panel."""

    __tablename__ = "analyst_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="")
    # What the chat is about: general, match:<id>, deck:planner:<n> or deck:duel:<id> (#970).
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
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystProposal(Base):
    """A deck edit Log Pose suggested in a thread (an Apply card), kept so the card comes back after a reload (#400).

    `id` is the model's tool_use id; `payload` is the proposal as JSON.
    """

    __tablename__ = "analyst_proposals"

    thread_id: Mapped[int] = mapped_column(ForeignKey("analyst_threads.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystUsage(Base):
    """What one Log Pose model call cost, for the daily and monthly spend caps."""

    __tablename__ = "analyst_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # chat | review
    model: Mapped[str] = mapped_column(String(64), default="")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    # The thread a chat call belonged to. No foreign key: deleting a thread keeps its usage rows (cost totals stay), with this nulled.
    thread_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # ok | error | aborted | refused
    outcome: Mapped[str] = mapped_column(String(16), default="ok")
    # Why a refused request was turned away: credit | daily | monthly | busy.
    refusal: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tool_calls: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class AnalystMatchBrief(Base):
    """Log Pose's matchup brief for a casual or practice game, written once per (variant, leaders, deck) and shared."""

    __tablename__ = "analyst_match_briefs"

    # sha256 of variant|leader|opponent|sorted deck counts (see brief_tickets.brief_key).
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    variant: Mapped[str] = mapped_column(String(32))
    leader_id: Mapped[str] = mapped_column(String(32))
    opponent_id: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    # JSON list of the citations placed in the text; NULL when there were none.
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystMatchReview(Base):
    """Log Pose's post-game analysis of one duel for one of its players, kept so it's written once."""

    __tablename__ = "analyst_match_reviews"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(Text)
    # JSON list of the citations placed in the text (offset, source id, title, quote); NULL on reviews written before sources.
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystToken(Base):
    """A player's personal Log Pose connector token (stored hashed, one per user)."""

    __tablename__ = "analyst_tokens"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystEvalRun(Base):
    """One run of the Log Pose eval (analyst/evals), shown on the admin page to track accuracy over time."""

    __tablename__ = "analyst_eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    model: Mapped[str] = mapped_column(String(64), default="")
    # Which eval: main | review_facts | puzzles | deck_advice (EVAL_SUITES in routers/admin.py). Older rows are main.
    suite: Mapped[str] = mapped_column(String(16), default="main", server_default="main", index=True)
    # Score in cases (a case's mean over its reps), out of total. 0 of 0 for a run that only has a headline metric.
    correct: Mapped[float] = mapped_column(Float)
    total: Mapped[int] = mapped_column(Integer)
    # The headline for suites that are not a score, e.g. "Wrong claims per review" 0.8, lower is better (#679).
    metric_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    metric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    lower_is_better: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # JSON: {"A": {"correct": 15, "total": 15}, ...}
    groups: Mapped[str] = mapped_column(Text, default="{}")
    spend_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnalystFeedback(Base):
    """A player's 👍 / 👎 / "This is wrong" on one Log Pose chat answer or match review (#679).

    One row per player per answer: voting again replaces the rating and note. The excerpt is the start of the answer
    as stored, so the admin can read what was rated without opening the player's thread.
    """

    __tablename__ = "analyst_feedback"
    __table_args__ = (UniqueConstraint("user_id", "target", name="uq_analyst_feedback_user_target"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # chat | review
    # "chat:<thread_id>:<answer index>" or "review:<match_id>": what was rated, unique per player.
    target: Mapped[str] = mapped_column(String(80))
    thread_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    match_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rating: Mapped[str] = mapped_column(String(8))  # up | down | wrong
    note: Mapped[str] = mapped_column(Text, default="")
    answer_excerpt: Mapped[str] = mapped_column(Text, default="")
    # The player's question that the chat answer replied to (empty for a review); turns a "wrong" into an eval case.
    question_excerpt: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
