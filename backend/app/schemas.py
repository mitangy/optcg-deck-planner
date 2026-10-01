from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    # Public duel handle; None until the user picks one (duel-web prompts after sign-in).
    username: str | None = None
    sum_across_leaders: bool = False

    model_config = {"from_attributes": True}


class UsernameUpdate(BaseModel):
    # Loose bound here; app.usernames.validate_username enforces the real rules
    # and returns a friendly 422 detail.
    username: str = Field(max_length=64)


class UsernameSuggestionOut(BaseModel):
    username: str


class UserPreferencesUpdate(BaseModel):
    sum_across_leaders: bool | None = None


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # Bound payload size to avoid oversized parse/DB write DoS.
    decklist: str = Field(min_length=1, max_length=100_000)


class DeckCardUpsert(BaseModel):
    """Set absolute copy count for a card in a deck. needed=0 removes the line."""

    needed: int = Field(ge=0, le=99)
    # Soft confirm when projected main+leader copies would exceed MAIN_DECK_LIMIT (51).
    confirm_oversize: bool = False


class DeckSummary(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
    leader_image_url: str = ""
    card_count: int
    total_cards: int
    main_cards: int = 0
    don_cards: int = 0
    # Non-DON copies covered by the user's Owned counts (min(owned, needed) per
    # card) — same math as the deck page progress bar; out of main_cards.
    owned_copies: int = 0
    sort_order: int
    # Effective main for this leader (explicit flag or earliest same-leader fallback).
    is_main: bool = False


class CatalogCardResult(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    group_name: str = ""


class PrintingView(BaseModel):
    product_id: int
    name: str
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    group_name: str = ""
    is_special: bool = True
    # Per-deck (or shopping max-across-decks) alt want for play; 0 when unset.
    wanted: int = 0


class DeckCardPrintingUpdate(BaseModel):
    """Set how many copies of an alt printing are wanted in a deck (≤ card Need)."""

    qty: int = Field(ge=0, le=99)


class CardPrintingUpdate(BaseModel):
    """Set alt-art want across the user's decks that include the card (synced)."""

    qty: int = Field(ge=0, le=99)
    deck_ids: list[int] | None = None


class CardPrintingResult(BaseModel):
    card_id: str
    product_id: int
    """Max qty stored after per-deck clamps."""
    qty: int
    decks_updated: int


class RecentSale(BaseModel):
    price: float
    shipping: float = 0.0
    condition: str = ""
    variant: str = ""
    language: str = ""
    quantity: int = 1
    order_date: str = ""


class RecentSalesResponse(BaseModel):
    product_id: int
    sales: list[RecentSale]


class CardView(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    needed: int
    # Total owned (shared across every deck — what the Owned stepper edits).
    owned: int
    still_need: int
    # "Separate per leader": copies that leaders earlier in deck order need
    # first. still_need = needed − (owned − earlier_leaders_need), floored at 0.
    # Always 0 when copies are shared between leaders.
    earlier_leaders_need: int = 0
    earlier_leaders: list[str] = []
    market_price: float | None = None
    low_price: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    section: str = "main"  # main | additional | don
    alt_arts: list[PrintingView] = []


class DeckDetail(BaseModel):
    id: int
    name: str
    leader_card_id: str | None
    leader_name: str | None = None
    # Name of the Main deck this list is compared against (empty when this is Main).
    prior_decks: list[str] = []
    is_main: bool = False
    cards: list[CardView]
    main_cards: int = 0
    don_cards: int = 0


class LeaderNeed(BaseModel):
    label: str
    need: int


class ShoppingItem(BaseModel):
    card_id: str
    name: str
    rarity: str = ""
    color: str = ""
    card_type: str = ""
    cost: int | str | None = None
    need: int
    owned: int
    still_need: int
    market_price: float | None = None
    low_price: float | None = None
    remaining_cost: float | None = None
    image_url: str = ""
    tcgplayer_url: str = ""
    product_id: int | None = None
    used_in: list[str]
    alt_arts: list[PrintingView] = []
    # Deck sort: group by earliest leader, then first same-leader deck that uses the card.
    # Multi-leader cards use the earliest deck's leader as primary.
    deck_sort_key: str = ""
    primary_leader_card_id: str | None = None
    primary_leader_name: str | None = None
    leader_count: int = 1
    # Per-leader Need (max within each leader), in deck order. Explains how
    # ``need`` was combined; only set when more than one leader uses the card.
    need_by_leader: list[LeaderNeed] = Field(default_factory=list)
    # Whether ``need`` sums need_by_leader (True) or takes its max (False).
    need_summed: bool = False


class ShoppingResponse(BaseModel):
    items: list[ShoppingItem]
    cards_still_needed: int
    remaining_market: float
    unique_cards: int


class OwnedUpdate(BaseModel):
    qty: int = Field(ge=0, le=10_000)


class DeckOwnedResetResult(BaseModel):
    """Result of zeroing Owned for every card that appears in a deck."""

    deck_id: int
    reset_count: int
    deck: DeckDetail


class CatalogStatus(BaseModel):
    card_count: int
    last_synced_at: str | None
    notes: str = ""


class ShareCreate(BaseModel):
    kind: str = Field(default="shopping", pattern="^(shopping|deck)$")
    deck_id: int | None = None
    deck_ids: list[int] | None = None


class ShareInfo(BaseModel):
    token: str
    kind: str
    deck_id: int | None = None
    deck_ids: list[int] | None = None
    path: str


class PublicShoppingResponse(ShoppingResponse):
    owner_name: str = ""
    kind: str = "shopping"
    deck_name: str | None = None


class GroupBuyCreate(BaseModel):
    title: str = Field(default="Group buy", min_length=1, max_length=200)
    deck_ids: list[int] | None = None


class GroupBuyContributionUpdate(BaseModel):
    deck_ids: list[int] | None = None


class GroupBuyLineOverrideUpdate(BaseModel):
    product_id: int = Field(gt=0)


class GroupBuyQtyUpdate(BaseModel):
    qty: int = Field(ge=0, le=999)


class GroupBuyOrderUpdate(BaseModel):
    external_order_id: str | None = Field(default=None, max_length=200)
    order_notes: str | None = Field(default=None, max_length=4000)
    shipping_cost: float | None = Field(default=None, ge=0, le=100000)
    shipping_split: str | None = Field(default=None, pattern="^(equal|by_cost|by_copies)$")
    tax_cost: float | None = Field(default=None, ge=0, le=100000)


class GroupBuyPublicUpdate(BaseModel):
    is_public: bool


class GroupBuyMemberOut(BaseModel):
    user_id: int
    display_name: str
    role: str
    deck_ids: list[int] | None = None
    # Member's shopping "Copies needed" mode (True = separate per leader).
    # None once quantities are frozen, since the live setting no longer applies.
    sum_across_leaders: bool | None = None
    cards_still_needed: int = 0
    remaining_market: float = 0.0
    card_cost: float = 0.0
    shipping_share: float = 0.0
    tax_share: float = 0.0
    total_owed: float = 0.0


class GroupBuyMemberQtyOut(BaseModel):
    user_id: int
    display_name: str
    qty: int
    suggested_qty: int = 0
    is_custom: bool = False


class GroupBuyLineOut(BaseModel):
    card_id: str
    name: str
    color: str = ""
    rarity: str = ""
    card_type: str = ""
    cost: str | None = None
    total_qty: int
    market_price: float | None = None
    remaining_cost: float | None = None
    product_id: int | None = None
    # Catalog preferred (usually standard) printing — always available to reset checkout to.
    preferred_product_id: int | None = None
    preferred_market_price: float | None = None
    tcgplayer_url: str = ""
    image_url: str = ""
    members: list[GroupBuyMemberQtyOut]
    alt_arts: list[PrintingView] = []
    # Viewer (current user) contribution on this line — for qty editors.
    my_qty: int = 0
    my_suggested_qty: int = 0
    my_is_custom: bool = False
    # True when the viewer opted out (custom qty 0 / Exclude).
    my_excluded: bool = False
    # Viewer's play Need for this card (max across their contribution decks) — alt want cap.
    my_need: int = 0


class GroupBuySummary(BaseModel):
    id: int
    title: str
    status: str
    invite_token: str
    invite_path: str
    host_user_id: int
    host_name: str
    member_count: int
    is_host: bool
    is_public: bool = False
    # Present when is_public — unauthenticated read-only view path.
    public_path: str | None = None
    unique_cards: int
    cards_still_needed: int
    remaining_market: float
    created_at: str


class GroupBuyDetail(GroupBuySummary):
    members: list[GroupBuyMemberOut]
    lines: list[GroupBuyLineOut]
    locked_at: str | None = None
    ordered_at: str | None = None
    external_order_id: str = ""
    order_notes: str = ""
    shipping_cost: float = 0.0
    shipping_split: str = "equal"
    tax_cost: float = 0.0
    cards_subtotal: float = 0.0
    grand_total: float = 0.0
    # Saved TCGPlayer receipt paste (empty when none). Host uses this to rematch after refresh.
    receipt_text: str = ""
    has_receipt: bool = False
    # Host can undo the latest Mark purchased when a receipt-apply ledger exists.
    can_undo_purchase: bool = False
    # True for unauthenticated public viewers — UI must stay read-only.
    read_only: bool = False


class GroupBuyInvitePreview(BaseModel):
    title: str
    host_name: str
    member_count: int
    status: str
    invite_token: str
    is_public: bool = False
    public_path: str | None = None


class GroupBuyExport(BaseModel):
    paste_text: str
    url: str | None = None
    included_count: int
    copy_count: int
    with_product_id: int
    missing_product_id: int
    status: str


class GroupBuyReceiptMatchRequest(BaseModel):
    receipt_text: str = Field(min_length=1, max_length=200_000)


class GroupBuyReceiptApplyRequest(BaseModel):
    receipt_text: str = Field(min_length=1, max_length=200_000)
    # When set, only these card_ids are applied (staging selection). None = all matched pool cards.
    card_ids: list[str] | None = None
    # Apply even when some pool lines are short / missing from the receipt.
    allow_partial: bool = True


class GroupBuyReceiptUnmatchedOut(BaseModel):
    qty: int
    description: str
    set_name: str = ""
    card_name: str = ""


class GroupBuyReceiptLineOut(BaseModel):
    card_id: str
    name: str
    group_name: str = ""
    needed_qty: int
    receipt_qty: int
    # exact | surplus | short | extra | missing
    status: str
    confidence: str = ""
    product_id: int | None = None
    staged_qty: int = 0
    descriptions: list[str] = []


class GroupBuyReceiptMatchReport(BaseModel):
    lines: list[GroupBuyReceiptLineOut]
    unmatched: list[GroupBuyReceiptUnmatchedOut]
    summary: dict[str, int]
    can_apply_full: bool
    can_apply_partial: bool


# --- Duel (Step 4) ---


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


class DuelMatchIngest(BaseModel):
    match_id: str = Field(min_length=1, max_length=64)
    seat0_user_id: int
    seat1_user_id: int
    winner_seat: int = Field(ge=0, le=1)
    reason: str = Field(default="unknown", max_length=64)
    ranked: bool = True


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


class DuelPresenceEntry(BaseModel):
    user_id: int
    room_id: str = Field(min_length=1, max_length=64)
    role: str = Field(default="player", pattern="^(player|spectator)$")
    phase: str = Field(default="playing", pattern="^(waiting|playing|finished)$")
    ranked: bool = False


class DuelPresenceSnapshot(BaseModel):
    """Full presence snapshot from one game-server process (replaces its prior rows)."""

    instance_id: str = Field(min_length=1, max_length=64)
    entries: list[DuelPresenceEntry] = Field(default_factory=list, max_length=5000)


class FriendRequestIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)


class FriendInviteIn(BaseModel):
    room_id: str = Field(min_length=1, max_length=64)


class FriendOut(BaseModel):
    user_id: int
    username: str
    # offline | online | waiting | in_game | spectating
    status: str
    # Room a friend is playing or watching (spectatable); None otherwise.
    room_id: str | None = None
    ranked: bool = False


class FriendRequestOut(BaseModel):
    user_id: int
    username: str


class DuelInviteOut(BaseModel):
    id: int
    from_user_id: int
    from_username: str
    room_id: str
    expires_at: int


class FriendsOut(BaseModel):
    friends: list[FriendOut]
    incoming: list[FriendRequestOut]
    outgoing: list[FriendRequestOut]
    invites: list[DuelInviteOut]


class FriendRequestResult(BaseModel):
    # pending: request sent; accepted: they had already asked you, so you're friends now.
    status: str


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


class DuelCosmeticOut(BaseModel):
    id: int
    kind: str
    size: int
    created_at: str


class DuelCosmeticActiveOut(BaseModel):
    playmat: int | None = None
    cardBack: int | None = None


class DuelCosmeticsOut(BaseModel):
    items: list[DuelCosmeticOut]
    active: DuelCosmeticActiveOut


class DuelCosmeticActiveIn(BaseModel):
    kind: str
    id: int | None = None
