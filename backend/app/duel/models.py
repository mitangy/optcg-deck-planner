
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.statuses import (
    FeedbackStatus,
    ReportStatus,
    TournamentMatchStatus,
    TournamentPlayerStatus,
    TournamentStatus,
)


class DuelRating(Base):
    __tablename__ = "duel_ratings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(Integer, default=1000, server_default="1000")
    games_played: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelSeason(Base):
    """A ranked season (#1405). No rows yet means Season 1, which began before launch (started_at None)."""

    __tablename__ = "duel_seasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The reset used when this season ended: "soft" or "hard".
    reset_mode: Mapped[str | None] = mapped_column(String(8), nullable=True)
    ended_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class DuelSeasonStanding(Base):
    """One player's final line in an ended season."""

    __tablename__ = "duel_season_standings"

    season_id: Mapped[int] = mapped_column(
        ForeignKey("duel_seasons.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    rank: Mapped[int] = mapped_column(Integer)
    rating: Mapped[int] = mapped_column(Integer)
    games_played: Mapped[int] = mapped_column(Integer)
    provisional: Mapped[bool] = mapped_column(Boolean)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    rating_after_reset: Mapped[int] = mapped_column(Integer)


class DuelMatch(Base):
    __tablename__ = "duel_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    seat0_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    seat1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    winner_seat: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(64), default="unknown")
    ranked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    seat0_rating_before: Mapped[int] = mapped_column(Integer)
    seat1_rating_before: Mapped[int] = mapped_column(Integer)
    seat0_rating_after: Mapped[int] = mapped_column(Integer)
    seat1_rating_after: Mapped[int] = mapped_column(Integer)
    seat0_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seat1_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelMatchSeatLog(Base):
    # Holds that seat's hidden cards, so only that player may see it.
    __tablename__ = "duel_match_seat_logs"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    seat: Mapped[int] = mapped_column(Integer, primary_key=True)
    log: Mapped[str] = mapped_column(Text)


class DuelMatchProgress(Base):
    __tablename__ = "duel_match_progress"

    match_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    seat0_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    seat1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ranked: Mapped[bool] = mapped_column(Boolean, default=False)
    seat0_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seat1_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    replay: Mapped[str | None] = mapped_column(Text, nullable=True)
    seat0_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    seat1_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelMatchLog(Base):
    __tablename__ = "duel_match_logs"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    replay: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelMatchSeat(Base):
    __tablename__ = "duel_match_seats"
    __table_args__ = (UniqueConstraint("match_id", "seat", name="uq_duel_match_seat"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), index=True
    )
    seat: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    leader_id: Mapped[str] = mapped_column(String(32), index=True)
    won: Mapped[bool] = mapped_column(Boolean)
    went_first: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    ranked: Mapped[bool] = mapped_column(Boolean, default=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deck: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelSoloGame(Base):
    """A finished game with no human opponent: against the server bot or hotseat practice (#988).

    The admin user page reads the summary columns (games per mode, recent games), and the training export
    (``/analyst/human-bot-games``) reads the replay of bot games (#1202); ratings, the leaderboard,
    matchup stats and match history never see these rows. Idempotent on ``game_id`` (the room's key).
    """

    __tablename__ = "duel_solo_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mode: Mapped[str] = mapped_column(String(16))
    bot_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opponent_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    won: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(String(64), default="unknown")
    replay: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class SimGame(Base):
    __tablename__ = "sim_games"
    __table_args__ = (UniqueConstraint("user_id", "match_key", name="uq_sim_games_user_match"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    match_key: Mapped[str] = mapped_column(Text)
    played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    my_leader: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opp_leader: Mapped[str | None] = mapped_column(String(32), nullable=True)
    my_deck: Mapped[list] = mapped_column(JSON)
    opp_deck: Mapped[list] = mapped_column(JSON)
    result: Mapped[str] = mapped_column(String(8))
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    went_first: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    has_log: Mapped[bool] = mapped_column(Boolean, default=False)
    combat_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="optcgsim", server_default="optcgsim")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CardReport(Base):
    __tablename__ = "card_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(32), default="")
    room_id: Mapped[str] = mapped_column(String(64), default="")
    client_build: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(16), default=FeedbackStatus.OPEN, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelUserSettings(Base):
    __tablename__ = "duel_user_settings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[str] = mapped_column(Text, default="")
    active_playmat_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active_card_back_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelSavedDeck(Base):
    __tablename__ = "duel_saved_decks"
    __table_args__ = (UniqueConstraint("user_id", "deck_id", name="uq_duel_saved_deck"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    deck_id: Mapped[str] = mapped_column(String(64))
    data: Mapped[str] = mapped_column(Text, default="")
    updated_at_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    planner_deck_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)


class DuelCosmetic(Base):
    __tablename__ = "duel_cosmetics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    mime: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    taken_down_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    taken_down_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    taken_down_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)


class PlayerReport(Base):
    __tablename__ = "player_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reported_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(String(16))
    image_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    match_id: Mapped[str] = mapped_column(String(64), default="")
    source: Mapped[str] = mapped_column(String(16))
    cosmetic_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(32), nullable=True)
    image_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=ReportStatus.OPEN, index=True)
    action: Mapped[str] = mapped_column(String(32), default="")
    staff_note: Mapped[str] = mapped_column(String(300), default="")
    handled_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PlayerWarning(Base):
    __tablename__ = "player_warnings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(String(300))
    issued_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelEvent(Base):
    __tablename__ = "duel_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Bumped whenever a rules-affecting field changes, so a stale rules page cannot join.
    rules_version: Mapped[str] = mapped_column(String(32))
    winners: Mapped[int] = mapped_column(Integer, default=3)
    min_games: Mapped[int] = mapped_column(Integer, default=3)
    min_opponents: Mapped[int] = mapped_column(Integer, default=2)
    min_turns: Mapped[int] = mapped_column(Integer, default=3)
    prize: Mapped[str] = mapped_column(String(200), default="", server_default="")
    prize_details: Mapped[str] = mapped_column(Text, default="", server_default="")
    prize_method: Mapped[str] = mapped_column(String(16), default="draw", server_default="draw")
    format: Mapped[str] = mapped_column(String(24), default="casual", server_default="casual")
    bracket_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_of: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EventEntry(Base):
    __tablename__ = "event_entries"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_entry"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rules_version: Mapped[str] = mapped_column(String(32))
    opted_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class EventDraw(Base):
    __tablename__ = "event_draws"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True)
    seed_hash: Mapped[str] = mapped_column(String(64))
    seed: Mapped[str | None] = mapped_column(String(64), nullable=True)
    committed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    drawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    committed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    drawn_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eligible_ids: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    forfeited: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")


class DuelTournament(Base):
    __tablename__ = "duel_tournaments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(60))
    format: Mapped[str] = mapped_column(String(16))
    size: Mapped[int] = mapped_column(Integer)
    timer: Mapped[str] = mapped_column(String(24), default="seat_15m")
    status: Mapped[str] = mapped_column(String(16), default=TournamentStatus.OPEN)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelTournamentPlayer(Base):
    __tablename__ = "duel_tournament_players"
    __table_args__ = (UniqueConstraint("tournament_id", "user_id", name="uq_duel_tournament_player"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[int] = mapped_column(ForeignKey("duel_tournaments.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=TournamentPlayerStatus.JOINED)
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DuelTournamentMatch(Base):
    __tablename__ = "duel_tournament_matches"
    __table_args__ = (UniqueConstraint("tournament_id", "round", "slot", name="uq_duel_tournament_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[int] = mapped_column(ForeignKey("duel_tournaments.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    slot: Mapped[int] = mapped_column(Integer)
    player_a_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    player_b_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=TournamentMatchStatus.WAITING)
    decided_by: Mapped[str | None] = mapped_column(String(16), nullable=True)
    room_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    server_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    host_claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    room_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_match_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
