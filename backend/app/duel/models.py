"""Duel models: ratings, matches, saved decks, cosmetics, reports, events and tournaments."""

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
    """Per-user ranked duel rating (Elo)."""

    __tablename__ = "duel_ratings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(Integer, default=1000, server_default="1000")
    games_played: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelMatch(Base):
    """Completed duel result (idempotent on match_id)."""

    __tablename__ = "duel_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    seat0_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    seat1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    winner_seat: Mapped[int] = mapped_column(Integer)  # 0 or 1
    reason: Mapped[str] = mapped_column(String(64), default="unknown")
    ranked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    seat0_rating_before: Mapped[int] = mapped_column(Integer)
    seat1_rating_before: Mapped[int] = mapped_column(Integer)
    seat0_rating_after: Mapped[int] = mapped_column(Integer)
    seat1_rating_after: Mapped[int] = mapped_column(Integer)
    # Added with match replays; null on older rows.
    seat0_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seat1_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelMatchSeatLog(Base):
    """One player's turn-by-turn log of a duel, as the game server saw it from their seat.

    Built from the replay with the opponent's hidden cards hidden, so it is safe to
    show that player (and only that player) in their match history.
    """

    __tablename__ = "duel_match_seat_logs"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    seat: Mapped[int] = mapped_column(Integer, primary_key=True)
    log: Mapped[str] = mapped_column(Text)


class DuelMatchProgress(Base):
    """The latest turn-by-turn snapshot of a duel that has no result yet.

    The game server sends one at the start of every turn and when a room closes
    without a result, so a game cut short (server restart, both players gone)
    still has its log up to that point. Deleted once the real result arrives.
    """

    __tablename__ = "duel_match_progress"

    match_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    seat0_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    seat1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ranked: Mapped[bool] = mapped_column(Boolean, default=False)
    seat0_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seat1_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Same shapes as DuelMatchLog.replay and DuelMatchSeatLog.log; null when over the size cap.
    replay: Mapped[str | None] = mapped_column(Text, nullable=True)
    seat0_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    seat1_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The game server sets this on the snapshot it sends as the room closes: nobody is playing this
    # game any more, so its recording (both hands included) can be watched (#476).
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelMatchLog(Base):
    """Full replay of one duel: seed, decks and every accepted intent, as JSON text.

    The engine is deterministic, so this replays the whole game. It holds both
    hands and decks, so it is never sent to players as-is.
    """

    __tablename__ = "duel_match_logs"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    replay: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelMatchSeat(Base):
    """One side of a finished duel, kept for Log Pose matchup stats.

    Built from the result and its replay at ingest (and backfilled for older
    replays): the leader, the deck as {card id: copies}, who went first and
    who won. Stats only ever report aggregates of these rows.
    """

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
    mode: Mapped[str] = mapped_column(String(16))  # bot | practice
    bot_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opponent_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Bot games: did the human win. Practice has one player on both sides, so it is null.
    won: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(String(64), default="unknown")
    # Bot games only: the full MatchReplay as JSON text (seed, decks, intents, result), null for practice (#1202).
    replay: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class SimGame(Base):
    """One OPTCGSim game a player imported (#1030). Owner-only: every read filters on user_id.

    No player or opponent names are stored, and the names inside combat_log are replaced on import.
    """

    __tablename__ = "sim_games"
    __table_args__ = (UniqueConstraint("user_id", "match_key", name="uq_sim_games_user_match"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    match_key: Mapped[str] = mapped_column(Text)
    played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    my_leader: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opp_leader: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # JSON arrays of "4xOP17-040" entries.
    my_deck: Mapped[list] = mapped_column(JSON)
    opp_deck: Mapped[list] = mapped_column(JSON)
    result: Mapped[str] = mapped_column(String(8))  # Won | Lost
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    went_first: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    has_log: Mapped[bool] = mapped_column(Boolean, default=False)
    combat_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="optcgsim", server_default="optcgsim")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CardReport(Base):
    """A tester's report that a duel card does not play as printed."""

    __tablename__ = "card_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(Text)
    # Null for anonymous reporters (no session cookie and no game token).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Where the card was inspected: match, practice, hotseat, deck.
    source: Mapped[str] = mapped_column(String(32), default="")
    room_id: Mapped[str] = mapped_column(String(64), default="")
    client_build: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(16), default=FeedbackStatus.OPEN, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelUserSettings(Base):
    """A signed-in player's duel-web settings, shared by every device they use.

    ``data`` is the client's JSON settings object (device-only fields such as
    the game server URL stay in the browser). The active playmat / card back
    point at that user's own ``DuelCosmetic`` rows; null means the default.
    """

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
    """A signed-in player's saved duel deck (the browser keeps its own cache).

    ``deck_id`` is the client's id; ``updated_at_ms`` is the client's
    ``updatedAt`` and decides last-writer-wins. A deleted deck stays as a
    tombstone (``deleted``, ``data`` empty) so other devices learn of it.
    """

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
    # The planner deck this one is kept in sync with (#1017); mirrors data.plannerDeckId.
    planner_deck_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)


class DuelCosmetic(Base):
    """An image a player uploaded as a playmat or card back (kept as history)."""

    __tablename__ = "duel_cosmetics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # playmat | cardBack
    mime: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Moderation takedown (#810): a soft delete. The bytes stay (possible illegal content is
    # preserved, not destroyed); the image is no longer served, listed, or selectable.
    taken_down_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    taken_down_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    taken_down_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)


class PlayerReport(Base):
    """A player's report of another player's conduct or image (#810)."""

    __tablename__ = "player_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reported_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(String(16))  # conduct | toxic | image
    image_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)  # playmat | cardBack
    note: Mapped[str] = mapped_column(Text, default="")
    match_id: Mapped[str] = mapped_column(String(64), default="")
    source: Mapped[str] = mapped_column(String(16))  # match | spectate | postmatch | history | friends
    # The DuelCosmetic the snapshot came from. No foreign key: the owner may delete it later.
    cosmetic_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(32), nullable=True)
    image_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=ReportStatus.OPEN, index=True)
    action: Mapped[str] = mapped_column(String(32), default="")  # image_removed | warned | banned
    staff_note: Mapped[str] = mapped_column(String(300), default="")
    handled_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PlayerWarning(Base):
    """A moderator's warning, shown to the player until they acknowledge it (#810)."""

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
    """An event the admin runs from the Events tab (#1019): dates, prizing and tourney style.

    The id is a slug that EventEntry/EventDraw rows point at (kept as plain strings, no FK)."""

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
    # "draw" (seeded giveaway among eligible players) or "placement" (top finishers, awarded by hand).
    prize_method: Mapped[str] = mapped_column(String(16), default="draw", server_default="draw")
    # casual | single_elim | round_robin | swiss
    format: Mapped[str] = mapped_column(String(24), default="casual", server_default="casual")
    bracket_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_of: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EventEntry(Base):
    """A signed-in player's opt-in to a giveaway event (#794). One per player per event."""

    __tablename__ = "event_entries"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_entry"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The official-rules version the player accepted when they joined.
    rules_version: Mapped[str] = mapped_column(String(32))
    opted_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class EventDraw(Base):
    """The verifiable draw for an event (#794): the seed hash is public before the event, the seed after the draw."""

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
    # JSON list of the user ids that were eligible when the draw ran, so the ranking stays fixed afterwards.
    eligible_ids: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    # JSON list of user ids that forfeited; the next person in the ranking moves up.
    forfeited: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")


class DuelTournament(Base):
    """A friends tournament: single elimination (4/8/16) or round robin, every match Bo1."""

    __tablename__ = "duel_tournaments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(60))
    format: Mapped[str] = mapped_column(String(16))  # single_elim | round_robin
    # single_elim: bracket size (4 | 8 | 16); round_robin: most players allowed.
    size: Mapped[int] = mapped_column(Integer)
    timer: Mapped[str] = mapped_column(String(24), default="seat_15m")  # off | turn_30 | seat_15m | turn_30_seat_15m
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
    """One pairing. ``room_id`` is the private game-server room the players meet in."""

    __tablename__ = "duel_tournament_matches"
    __table_args__ = (UniqueConstraint("tournament_id", "round", "slot", name="uq_duel_tournament_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[int] = mapped_column(ForeignKey("duel_tournaments.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    slot: Mapped[int] = mapped_column(Integer)
    player_a_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    player_b_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # waiting (a player is still coming from an earlier round) | ready | done
    status: Mapped[str] = mapped_column(String(16), default=TournamentMatchStatus.WAITING)
    decided_by: Mapped[str | None] = mapped_column(String(16), nullable=True)  # game | bye | walkover
    room_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    server_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    host_claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    room_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_match_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
