"""Duel request/response models: tokens, matches, ratings, reports, decks, cosmetics, sim games."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class DuelDevTokenIn(BaseModel):
    """Mint a game token for a local/dev user key (ENABLE_DEV_LOGIN or ENABLE_DUEL_DEV_TOKEN)."""

    user_key: str = Field(min_length=1, max_length=64)


class DuelGuestTokenIn(BaseModel):
    """Mint a game token for a stable browser guest id (always available)."""

    guest_id: str = Field(min_length=8, max_length=64)


class DuelTokenOut(BaseModel):
    token: str
    expires_at: int
    user_id: int
    email: str
    # Name the game-server shows to other players (embedded in the token).
    display_name: str = ""
    rating: int
    games_played: int
    # Game-server pool new games should join (blue/green); None: use the build's default.
    game_server_url: str | None = None


class GameServerPoolIn(BaseModel):
    # https://… (or http://localhost / 127.0.0.1 for dev); null clears the pointer.
    url: str | None = Field(default=None, max_length=512)


class GameServerPoolOut(BaseModel):
    # The Redis pointer (duel:gs:current), if set.
    pool_url: str | None = None
    # What token responses hand out now: the pointer, else GAME_SERVER_URL, else null.
    game_server_url: str | None = None


class DuelMatchIngest(BaseModel):
    match_id: str = Field(min_length=1, max_length=64)
    seat0_user_id: int
    seat1_user_id: int
    winner_seat: int = Field(ge=0, le=1)
    reason: str = Field(default="unknown", max_length=64)
    ranked: bool = True
    seat0_leader_id: str | None = Field(default=None, max_length=32)
    seat1_leader_id: str | None = Field(default=None, max_length=32)
    turns: int | None = Field(default=None, ge=0, le=10_000)
    # Seed, decks and accepted intents (see game-server MatchReplay). Kept server-side only.
    replay: dict | None = None
    # [seat 0's log, seat 1's log] (see @optcg/rules SeatLog); each player only ever reads their own.
    seat_logs: list[dict] | None = Field(default=None, min_length=2, max_length=2)


class DuelSoloGameIngest(BaseModel):
    """A finished bot or practice game, reported by the game server (#988)."""

    game_id: str = Field(min_length=1, max_length=80)
    user_id: int
    mode: Literal["bot", "practice"]
    bot_level: str | None = Field(default=None, max_length=16)
    leader_id: str | None = Field(default=None, max_length=32)
    opponent_leader_id: str | None = Field(default=None, max_length=32)
    won: bool | None = None
    turns: int | None = Field(default=None, ge=0, le=10_000)
    reason: str = Field(default="unknown", max_length=64)


class DuelMatchProgressIngest(BaseModel):
    """A game still being played (or cut short): its log so far. Replaced every turn."""

    seat0_user_id: int
    seat1_user_id: int
    ranked: bool = False
    seat0_leader_id: str | None = Field(default=None, max_length=32)
    seat1_leader_id: str | None = Field(default=None, max_length=32)
    turns: int | None = Field(default=None, ge=0, le=10_000)
    replay: dict | None = None
    seat_logs: list[dict] | None = Field(default=None, min_length=2, max_length=2)
    # True on the snapshot sent as the room closes (nobody is playing any more). It is the
    # game's last, so it is written to Postgres even when Redis holds the live ones (#389).
    closed: bool = False


class DuelMatchHistoryEntry(BaseModel):
    match_id: str
    created_at: str | None
    ranked: bool
    your_seat: int
    won: bool
    reason: str
    turns: int | None
    your_leader_id: str | None
    opponent_leader_id: str | None
    opponent_name: str
    rating_before: int
    rating_after: int
    has_replay: bool
    has_log: bool = False
    # False for a game that never sent a result (its log runs to the last saved turn).
    finished: bool = True
    # The recording can be opened in the replay viewer: a kept replay of a finished game, or of a cut-off game whose room closed.
    replay_ready: bool = False
    # The player has an answered Log Pose chat about this game (#970).
    has_chat: bool = False


class DuelMatchReplayOut(BaseModel):
    match_id: str
    your_seat: int
    players: list[str]
    finished: bool
    turns: int | None
    # Seed, decks and accepted intents (@optcg/rules MatchReplay). Only the game's own players get it.
    replay: dict


class DuelMatchHistoryOut(BaseModel):
    matches: list[DuelMatchHistoryEntry]


class DuelMatchDetailOut(BaseModel):
    match: DuelMatchHistoryEntry
    # The game turn by turn from your seat (@optcg/rules SeatLog); null when none was kept.
    log: dict | None


class DuelMatchOut(BaseModel):
    match_id: str
    created: bool
    winner_seat: int
    seat0_rating_before: int
    seat1_rating_before: int
    seat0_rating_after: int
    seat1_rating_after: int


class DuelRatingOut(BaseModel):
    user_id: int
    email: str
    # Display name (username when set, else account name).
    name: str
    username: str | None = None
    rating: int
    games_played: int
    # Finished games (ranked and unranked) from the user's own seat.
    wins: int = 0
    losses: int = 0
    # 1 + players with games and a strictly higher rating; null before the first ranked game.
    rank: int | None = None


class DuelLiveOut(BaseModel):
    """Counts only: players online and matches in progress."""

    online: int
    matches: int


class DuelLeaderboardEntryOut(BaseModel):
    """Public rating data; account email is intentionally excluded."""

    user_id: int
    # Display name (username when set, else account name).
    name: str
    username: str | None = None
    rating: int
    games_played: int


class DuelLeaderboardOut(BaseModel):
    entries: list[DuelLeaderboardEntryOut]


class CardReportIn(BaseModel):
    """A tester's description of a card that does not play as printed."""

    # Strip first so a padded two-word note cannot pass the length floor.
    model_config = ConfigDict(str_strip_whitespace=True)

    card_id: str = Field(pattern=r"^[A-Za-z0-9_-]{2,32}$")
    description: str = Field(min_length=10, max_length=2000)
    source: str = Field(default="", max_length=32)
    room_id: str = Field(default="", max_length=64)
    client_build: str = Field(default="", max_length=40)


class CardReportOut(BaseModel):
    id: int
    card_id: str
    description: str
    user_id: int | None
    reporter: str
    source: str
    room_id: str
    client_build: str
    status: str
    created_at: str


class CardReportStatusIn(BaseModel):
    status: str = Field(pattern=r"^(open|fixed|wontfix)$")


class DuelSettingsIn(BaseModel):
    settings: dict[str, str | bool | int | float]


class DuelSettingsOut(BaseModel):
    # None until the player saves settings from any device.
    settings: dict[str, str | bool | int | float] | None
    updated_at: str | None = None


class DuelDeckBody(BaseModel):
    name: str = Field(max_length=200)
    leaderId: str = Field(max_length=32)
    cards: list[Annotated[str, StringConstraints(max_length=32)]] = Field(max_length=60)
    artPrefs: dict[str, str] | None = None
    plannerArt: dict[str, str] | None = None
    plannerDeckId: int | None = None
    editedLocally: bool | None = None


class DuelDeckPut(BaseModel):
    deck: DuelDeckBody
    updatedAt: int = Field(ge=0)


class DuelDeckBulkItem(DuelDeckPut):
    id: str


class DuelDeckBulkPut(BaseModel):
    decks: list[DuelDeckBulkItem] = Field(max_length=200)


class DuelDeckOut(BaseModel):
    id: str
    updatedAt: int
    deleted: bool
    deck: DuelDeckBody | None = None
    # Set on the tombstone of an uploaded deck that was identical to this synced deck.
    mergedInto: str | None = None


class DuelDecksOut(BaseModel):
    decks: list[DuelDeckOut]


class DuelCosmeticOut(BaseModel):
    id: int
    kind: str
    size: int
    created_at: str
    # Signed link anyone can load without a session (relative to the API base),
    # e.g. "/duel/cosmetics/123/public/<sig>"; publicly cacheable for an hour (#812).
    public_path: str


class DuelCosmeticActiveOut(BaseModel):
    playmat: int | None = None
    cardBack: int | None = None


class DuelCosmeticsOut(BaseModel):
    items: list[DuelCosmeticOut]
    active: DuelCosmeticActiveOut


class DuelCosmeticActiveIn(BaseModel):
    kind: str
    id: int | None = None


class SimGamesImportIn(BaseModel):
    """Raw OPTCGSim match records (the optcgsim-matches export). Each is validated on its own."""

    games: list[dict] = Field(max_length=500)


class SimGamesImportOut(BaseModel):
    imported: int
    skipped_duplicates: int
    skipped_invalid: int
    total: int


class SimGameOut(BaseModel):
    id: str
    played_at: str | None
    my_leader: str | None
    opp_leader: str | None
    my_deck: list[str]
    opp_deck: list[str]
    result: str
    turns: int | None
    went_first: bool | None
    has_log: bool
    source: str


class SimGameDetailOut(SimGameOut):
    combat_log: str | None


class SimGamesOut(BaseModel):
    games: list[SimGameOut]
    total: int


class SimMatchupOut(BaseModel):
    my_leader: str | None
    opp_leader: str | None
    games: int
    wins: int
    losses: int


class SimMatchupsOut(BaseModel):
    matchups: list[SimMatchupOut]


class SimGamesClearedOut(BaseModel):
    deleted: int


# ---------------------------------------------------------------- giveaway events (refactor 2.1c)
# Field order follows the dicts routers/events.py builds, so the JSON is unchanged.

EventFormat = Literal["casual", "single_elim", "round_robin", "swiss"]
EventPrizeMethod = Literal["draw", "placement"]
EventStatus = Literal["upcoming", "live", "ended", "drawn"]


class EventProgress(BaseModel):
    games: int
    opponents: int
    eligible: bool


class EventPublic(BaseModel):
    id: str
    title: str
    starts_at: str
    ends_at: str
    description: str
    prize: str
    prize_details: str
    prize_method: EventPrizeMethod
    format: EventFormat
    # Only for single elimination, otherwise null.
    bracket_size: int | None
    best_of: Literal[1, 3]
    winners: int
    rules_version: str
    min_games: int
    min_opponents: int
    min_turns: int
    status: EventStatus
    seed_hash: str | None
    # Null until the draw runs.
    seed: str | None
    eligible_user_ids: list[int] | None
    viewer: Literal["anonymous", "guest", "staff", "player"]
    can_join: bool
    cant_join_reason: str | None
    opted_in: bool
    progress: EventProgress | None


class EventEnvelope(BaseModel):
    """`event` is null when no event is live, upcoming or recently ended."""

    event: EventPublic | None


class EventJoined(BaseModel):
    opted_in: bool


class EventCounters(BaseModel):
    opted_in: int
    games_in_window: int
    players_with_game: int
    eligible: int
    flagged_eligible: int


class EventParticipant(BaseModel):
    user_id: int
    name: str
    email: str
    games: int
    opponents: int
    eligible: bool
    excluded: Literal["guest", "banned", "staff"] | None
    # Advisory cheat-review flags (#809). They never change eligibility.
    flags: list[Literal["new_account", "new_opponents", "isolated_group", "private_only"]]


class EventDrawee(BaseModel):
    user_id: int
    name: str
    email: str
    forfeited: bool


class EventDrawState(BaseModel):
    seed_hash: str
    committed_at: str | None
    drawn_at: str | None
    # Null until the draw runs.
    seed: str | None
    forfeited: list[int]
    ranking: list[EventDrawee]
    winners: list[EventDrawee]


class AdminEvent(BaseModel):
    id: str
    title: str
    starts_at: str
    ends_at: str
    status: EventStatus
    description: str
    prize: str
    prize_details: str
    prize_method: EventPrizeMethod
    format: EventFormat
    bracket_size: int | None
    best_of: Literal[1, 3]
    winners: int
    rules_version: str
    min_games: int
    min_opponents: int
    min_turns: int
    winners_count: int
    counters: EventCounters
    participants: list[EventParticipant]
    draw: EventDrawState | None


class AdminEventSummary(BaseModel):
    id: str
    title: str
    starts_at: str
    ends_at: str
    status: EventStatus
    format: EventFormat
    prize: str
    joined: int


class AdminEventList(BaseModel):
    events: list[AdminEventSummary]


class AdminEventDeleted(BaseModel):
    deleted: str
