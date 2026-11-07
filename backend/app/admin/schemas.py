"""Admin request/response models: feedback."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class FeedbackIn(BaseModel):
    """A player's problem report, idea or other note, with light context."""

    # Strip first so a padded two-word note cannot pass the length floor.
    model_config = ConfigDict(str_strip_whitespace=True)

    kind: Literal["bug", "idea", "other"]
    message: str = Field(min_length=10, max_length=2000)
    app: Literal["duel", "planner"]
    page: str = Field(default="", max_length=200)
    client_build: str = Field(default="", max_length=40)
    viewport: str = Field(default="", max_length=32)
    user_agent: str = Field(default="", max_length=300)
    room_id: str = Field(default="", max_length=64)


class FeedbackOut(BaseModel):
    id: int
    kind: str
    message: str
    app: str
    page: str
    client_build: str
    viewport: str
    user_agent: str
    room_id: str
    user_id: int | None
    reporter: str
    status: str
    created_at: str
    # GitHub issue opened for a Discord ticket: https://github.com/<repo>/issues/<n>
    github_issue: int | None = None


class FeedbackStatusIn(BaseModel):
    status: str = Field(pattern=r"^(open|fixed|wontfix)$")


# ---------------------------------------------------------------- admin page responses (refactor 2.1c)
# Field order follows the dicts the routes build, so the JSON is unchanged. These are the contract the
# generated TypeScript types come from (tools/ci/openapi-types.cjs).

Role = Literal["user", "moderator", "admin"]
GameMode = Literal["ranked", "friends", "private", "bot", "practice"]


class AdminCan(BaseModel):
    analytics: bool
    set_roles: bool
    ban: bool
    delete: bool


class AdminMe(BaseModel):
    role: Role
    can: AdminCan


class SignupDay(BaseModel):
    day: str
    real: int
    guests: int


class MatchDay(BaseModel):
    day: str
    ranked: int
    casual: int


class LeaderCount(BaseModel):
    leader_id: str
    games: int
    wins: int


class OverviewAccounts(BaseModel):
    total: int
    real: int
    guests: int
    staff: int
    banned: int
    new_7d: int
    new_30d: int


class OverviewActive(BaseModel):
    d1: int
    d7: int
    d30: int
    real_d7: int
    real_d30: int


class OverviewMatches(BaseModel):
    total: int
    last_7d: int
    ranked_7d: int
    avg_turns_30d: float | None


class OverviewPlanner(BaseModel):
    decks: int
    users_with_decks: int


class OverviewLogPose(BaseModel):
    questions_month: int
    spend_month_usd: float
    users_with_access: int


class AdminOverview(BaseModel):
    generated_at: str
    # The window of the day charts and `top_leaders`.
    days: int
    accounts: OverviewAccounts
    signups_by_day: list[SignupDay]
    active: OverviewActive
    matches_by_day: list[MatchDay]
    matches: OverviewMatches
    # The last `days` days, up to 25.
    top_leaders: list[LeaderCount]
    # Kept for older clients: always the last 30 days.
    top_leaders_30d: list[LeaderCount]
    planner: OverviewPlanner
    log_pose: OverviewLogPose


class DayMatchSeat(BaseModel):
    user_id: int
    name: str | None
    leader_id: str | None
    won: bool


class DayMatch(BaseModel):
    # The id the replay page takes: /replay/:id.
    id: str
    created_at: str | None
    ranked: bool
    turns: int | None
    winner_seat: int | None
    seats: list[DayMatchSeat]


class AdminDayMatches(BaseModel):
    day: str
    matches: list[DayMatch]


class EvalGroup(BaseModel):
    # Whole or half points; an int stays an int in the JSON.
    correct: float | int
    total: int


class EvalRun(BaseModel):
    # Which eval. Runs recorded before suites existed are "main".
    suite: Literal["main", "review_facts", "puzzles", "deck_advice"]
    run_at: str
    label: str
    model: str
    # The score, null for a run that only has a headline metric.
    correct: float | None
    total: int | None
    # The headline when a suite is not a score, e.g. "Wrong claims per review".
    metric_name: str | None
    metric_value: float | None
    lower_is_better: bool
    groups: dict[str, EvalGroup]
    spend_usd: float | None
    notes: str


class BotDay(BaseModel):
    day: str
    games: int
    finished: int


class BotGames(BaseModel):
    total: int
    finished: int
    unfinished: int
    first_game_at: str | None
    last_game_at: str | None
    leaders: int
    matchups: int
    avg_turns: float | None
    first_seat_win_rate: float | None
    last_batch_id: str | None
    by_day: list[BotDay]


class AdminBots(BaseModel):
    bot_games: BotGames
    # The window of `bot_games.by_day`.
    days: int
    evals: list[EvalRun]


FeedbackRating = Literal["up", "down", "wrong"]


class FeedbackCounts(BaseModel):
    up: int
    down: int
    wrong: int


class FeedbackItem(BaseModel):
    id: int
    created_at: str | None
    updated_at: str | None
    kind: Literal["chat", "review"]
    rating: FeedbackRating
    note: str
    answer_excerpt: str
    question: str
    model: str
    user_id: int
    user_name: str | None
    thread_id: int | None
    message_index: int | None
    match_id: str | None


class AdminFeedback(BaseModel):
    days: int
    counts: FeedbackCounts
    items: list[FeedbackItem]


class FeedbackExportItem(BaseModel):
    """A FeedbackItem without the player (user_id, user_name): what the analyst service reads."""

    id: int
    created_at: str | None
    updated_at: str | None
    kind: Literal["chat", "review"]
    rating: FeedbackRating
    note: str
    answer_excerpt: str
    question: str
    model: str
    thread_id: int | None
    message_index: int | None
    match_id: str | None


class FeedbackExport(BaseModel):
    items: list[FeedbackExportItem]


class SignupSourceOut(BaseModel):
    ref: str | None = None
    land: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None


class GameCounts(BaseModel):
    ranked: int
    friends: int
    private: int
    bot: int
    practice: int


class AdminUser(BaseModel):
    id: int
    email: str
    name: str
    username: str | None
    role: Role
    created_at: str
    banned_at: str | None
    ban_reason: str | None
    # First-touch source captured at sign-up (#905). Null: unknown (account predates tracking); `{}`: direct.
    signup_source: SignupSourceOut | None
    # Ranked + friends + private games (bot and practice are in `games` only).
    matches: int
    last_match_at: str | None
    # Games per mode (#988).
    games: GameCounts


class AdminUsers(BaseModel):
    total: int
    users: list[AdminUser]


class AdminUserMatchOpponent(BaseModel):
    id: int
    name: str


class AdminUserMatch(BaseModel):
    # Match id (opens /replay/:id when `replay`), or the solo game key.
    id: str
    created_at: str
    mode: GameMode
    leader_id: str | None
    opponent_leader_id: str | None
    # Null for bot and practice.
    opponent: AdminUserMatchOpponent | None
    bot_level: str | None
    won: bool | None
    turns: int | None
    reason: str
    replay: bool


class LastSeen(BaseModel):
    lobby: str | None
    match: str | None
    solo: str | None
    log_pose: str | None


class UserOnline(BaseModel):
    now: bool
    room_role: Literal["player", "spectator"] | None
    ranked: bool | None


class UserRating(BaseModel):
    rating: int
    ranked_games: int


class UserModeTally(BaseModel):
    mode: GameMode
    games: int
    wins: int


class UserPlanner(BaseModel):
    decks: int
    owned_cards: int
    owned_unique: int


class UserDuel(BaseModel):
    saved_decks: int
    uploads: int
    uploads_taken_down: int
    friends: int
    friend_requests_pending: int


class UserLogPose(BaseModel):
    access: Literal["pending", "approved", "denied"] | None
    questions_total: int
    questions_month: int
    spend_total_usd: float
    spend_month_usd: float
    last_used_at: str | None
    threads: int


class BannedBy(BaseModel):
    id: int
    name: str


class UserModeration(BaseModel):
    reports_against: int
    reports_open: int
    reports_filed: int
    warnings: int
    banned_by: BannedBy | None


class AdminUserDetail(BaseModel):
    user: AdminUser
    last_seen_at: str | None
    last_seen: LastSeen
    online: UserOnline
    rating: UserRating | None
    modes: list[UserModeTally]
    # When the first bot / practice game of any account was saved; null while none has been.
    solo_tracked_since: str | None
    top_leaders: list[LeaderCount]
    recent_matches: list[AdminUserMatch]
    planner: UserPlanner
    duel: UserDuel
    log_pose: UserLogPose
    moderation: UserModeration


class ReportPerson(BaseModel):
    id: int
    name: str


class ReportedPlayer(BaseModel):
    id: int
    name: str
    role: Role
    banned: bool
    open_reports: int
    total_reports: int
    warnings: int


class ReportRow(BaseModel):
    id: int
    created_at: str
    status: Literal["open", "dismissed", "actioned"]
    action: str
    staff_note: str
    handled_by_name: str | None
    handled_at: str | None
    reason: Literal["conduct", "toxic", "image"]
    image_kind: Literal["playmat", "cardBack"] | None
    note: str
    match_id: str
    source: str
    # The saved match exists, so /replay/:id opens.
    match_finished: bool
    has_image: bool
    cosmetic_id: int | None
    image_taken_down: bool
    reporter: ReportPerson | None
    reported: ReportedPlayer


class AdminReports(BaseModel):
    reports: list[ReportRow]


class UploadOwner(BaseModel):
    id: int
    name: str
    role: Role
    banned: bool


class UploadRow(BaseModel):
    id: int
    kind: Literal["playmat", "cardBack"]
    mime: str
    size: int
    created_at: str
    # The owner has it switched on as their playmat / card back.
    in_use: bool
    report_count: int
    taken_down_at: str | None
    taken_down_by_name: str | None
    taken_down_reason: str | None
    owner: UploadOwner


class UploadRestored(BaseModel):
    """What a restore answers: the UploadRow plus the two keys the route has always added (in that order)."""

    id: int
    user_id: int
    kind: Literal["playmat", "cardBack"]
    taken_down: bool
    mime: str
    size: int
    created_at: str
    in_use: bool
    report_count: int
    taken_down_at: str | None
    taken_down_by_name: str | None
    taken_down_reason: str | None
    owner: UploadOwner


class UploadsPage(BaseModel):
    total: int
    items: list[UploadRow]


class HostingOut(BaseModel):
    """Each provider is `{"configured": false}`, `{"configured": true, "error": ...}` or its data; the shapes differ per provider."""

    vercel: dict[str, Any]
    render: dict[str, Any]
    github: dict[str, Any]


class TrafficOut(BaseModel):
    days: int
    vercel: dict[str, Any]
    render: dict[str, Any]
