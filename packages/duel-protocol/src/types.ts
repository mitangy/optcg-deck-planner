/**
 * Wire types for protocolVersion 5. Views, intents and events come from @optcg/rules through `import type` only:
 * duel-web's main bundle must never load the rules engine, and a type import is erased at build time.
 */
import type { BotLevel, GameEvent, Intent, PlayerView, Seat } from "@optcg/rules";
import type { ErrorCode } from "./errors.js";
import type { ProtocolVersion } from "./constants.js";

export type { BotLevel, GameEvent, Intent, PlayerView, Seat };

/** A card on the board, as a viewer sees it. */
export type CardView = PlayerView["you"]["leader"];
/** A queued player decision; the front entry blocks other actions for its seat. */
export type PendingChoiceView = PlayerView["pendingChoices"][number];
export type PendingChoiceKind = PendingChoiceView["kind"];
export type ChoiceRequestView = NonNullable<PendingChoiceView["request"]>;
export type ChoiceOptionView = Extract<ChoiceRequestView, { options: unknown }>["options"][number];

export type PlayerDeckWire = {
  leaderId: string;
  deck: string[];
};

export type BotRoomOptions = { level: BotLevel; deck: PlayerDeckWire };

export type DuelJoinOptions = {
  protocolVersion: ProtocolVersion;
  /** Legacy / local freeform id when gameToken is absent. */
  devUserId?: string;
  /** FastAPI HMAC bearer (preferred). */
  gameToken?: string;
  /** Required when server has DEV_JOIN_SECRET set. */
  secret?: string;
  preferredSeat?: Seat;
  /** Step 5: join as read-only spectator (public view; both hands hidden). */
  role?: "player" | "spectator";
  /** Optional deck for this seat (overrides create-time placeholder for that seat). */
  deck?: PlayerDeckWire;
  /**
   * Move a live match to this device: rebind the seat the signed-in account
   * holds to this connection (#451). Needs role "player" and a preferredSeat.
   */
  takeover?: boolean;
  /**
   * Practice only: a game token of the account that controls this (guest) seat,
   * so that account can later take the seat over. Ignored when invalid.
   */
  ownerToken?: string;
};

export type DuelCreateOptions = {
  protocolVersion?: ProtocolVersion;
  seed?: number;
  /** Default true for Step 2 scripts. */
  autoSkipMulligan?: boolean;
  /** Who goes first in the first game. Honored only on local/dev servers; deployed servers flip a coin (#549). */
  firstSeat?: 0 | 1;
  /** False for private / hotseat; ranked queue sets true (forces a 15 minute chess clock per player). */
  ranked?: boolean;
  players?: [PlayerDeckWire, PlayerDeckWire];
  /**
   * Optional clocks. Ranked queue always forces a 15 minute chess clock per player (seatSeconds), no match clock and no turn clock.
   * Omit / 0 = disabled for that clock.
   */
  timer?: {
    turnSeconds?: number;
    matchSeconds?: number;
    /** Chess clock: each player's own time bank, spent while they must act. */
    seatSeconds?: number;
  };
  /** Server-only capability; never sent to browser clients. */
  rankedAttestation?: string;
  /**
   * "Play vs Bot" (#631): seat 1 is played by the server with this deck. The room is never ranked and
   * the game is not saved to match history.
   */
  bot?: BotRoomOptions;
};

/** Public per-seat player info (additive; older clients ignore it). */
export type SeatPlayerInfo = {
  /** Username, else account name; null when the seat is unknown. Never an email. */
  name: string | null;
};

/** Seat-indexed player names; null entries when unknown (older servers). */
export type SeatPlayers = [SeatPlayerInfo, SeatPlayerInfo];

/** Signed matchup-brief ticket for one player seat of an unranked room. */
export type BriefTicketWire = {
  ticket: string;
  /** The seat's own leader. */
  leaderId: string;
  /** The other seat's leader. */
  opponentId: string;
  /** The seat's own 50-card deck (no leader). */
  deck: string[];
};

export type WelcomeMessage = {
  protocolVersion: ProtocolVersion;
  matchId: string;
  /** Player seat, or camera seat when role is spectator. */
  seat: Seat;
  role?: "player" | "spectator";
  view: PlayerView;
  /** Indexed by seat. */
  players?: SeatPlayers;
  /** Whether the room is ranked. Absent from older servers. */
  ranked?: boolean;
  /**
   * How this game's turn order was decided: null = coin flip (the first game), otherwise the seat that
   * chose (a rematch's loser). Absent from older servers.
   */
  firstSeatPickedBy?: Seat | null;
  /** Players of unranked rooms only: the key to a Log Pose matchup brief. */
  brief?: BriefTicketWire;
  /** Present in a "Play vs Bot" room: seat 1 is the server's bot (#631). */
  bot?: { level: BotLevel };
};

export type EventsMessage = {
  protocolVersion: ProtocolVersion;
  events: GameEvent[];
  /** Replay intents applied once these events happened (undo rewinds to a step). */
  step?: number;
};

export type ViewMessage = {
  protocolVersion: ProtocolVersion;
  view: PlayerView;
};

export type ErrorMessage = {
  protocolVersion: ProtocolVersion;
  code: ErrorCode;
  message: string;
};

export type MatchOverMessage = {
  protocolVersion: ProtocolVersion;
  result: {
    winner: Seat;
    reason: string;
  };
};

/** Server clock snapshot (absent when both clocks are off). */
export type TimerMessage = {
  protocolVersion: ProtocolVersion;
  turnSeconds: number | null;
  matchSeconds: number | null;
  turnEndsAt: number | null;
  matchEndsAt: number | null;
  activeSeat: Seat;
  /** Per-player clock length; null when that mode is off. */
  seatSeconds: number | null;
  /** Each seat's remaining ms as of this message. */
  seatRemainingMs: [number, number] | null;
  /** Seat whose clock is running (null: paused / mulligan / over). */
  clockSeat: Seat | null;
  /** Absolute deadline for the running seat's clock. */
  clockEndsAt: number | null;
};

/** Cosmetics are non-authoritative display prefs (alt art per defId). */
export type ArtPrefsMap = Record<string, string>;

export type CosmeticsMessage = {
  protocolVersion: ProtocolVersion;
  seat: Seat;
  artPrefs: ArtPrefsMap;
};

/**
 * A player's custom playmat / card back, downscaled by the sender and relayed
 * to the room as base64 data URLs or an account upload's public path
 * (`/duel/cosmetics/<id>/public/<sig>`, relative to the API). Purely cosmetic; null = use the default.
 */
export type SeatSkin = {
  playmat: string | null;
  cardBack: string | null;
  /** TCGPlayer productId of the DON!! card art (#440); null = the bundled art. */
  donArt: number | null;
};

export type SkinMessage = {
  protocolVersion: ProtocolVersion;
  seat: Seat;
  skin: SeatSkin;
};

/** Relayed match chat line. `seat` is the sender (players only). */
export type ChatMessage = {
  protocolVersion: ProtocolVersion;
  id: string;
  seat: Seat;
  text: string;
  /** Server receive time (epoch ms). */
  at: number;
};

/** Replayed on join / sync so reconnecting clients keep the conversation. */
export type ChatHistoryMessage = {
  protocolVersion: ProtocolVersion;
  messages: ChatMessage[];
};

/** Match chat line as a client holds it (the relay without its envelope). */
export type ChatLine = {
  id: string;
  seat: Seat;
  text: string;
  at: number;
};

/**
 * A player's own left-to-right hand order (card instance ids), sent whenever
 * they sort or drag cards around. Unranked rooms show it to spectators so their
 * fans match; it is never relayed to the other player.
 */
export type HandOrderMessage = {
  protocolVersion?: ProtocolVersion;
  ids: string[];
};

/**
 * Undo (unranked rooms only). A seat requests taking back the last action (#497)
 * or the whole turn (#536); the other seat accepts or declines. Practice
 * clients auto-accept.
 */
export type UndoAction = "request" | "accept" | "decline" | "cancel";

/** What a request takes back: the last action, or every action of that turn. */
export type UndoScope = "action" | "turn";

/** A parsed undo message: `scope` / `force` only matter on a "request". */
export type UndoRequestBody = {
  action: UndoAction;
  scope: UndoScope;
  force: boolean;
  /** An "accept" names the request it saw (`pending.id`); absent from older clients (#540). */
  id?: number;
};

/** Extra fields of a "request": default is the last action, not forced. */
export type UndoRequestOptions = { scope?: UndoScope; force?: boolean; id?: number };

/** One undoable action: who took it and a short description ("play Nami"). */
export type UndoActionInfo = { seat: Seat; label: string };

/** Whether one scope can be undone right now, and why not. */
export type UndoOption = {
  /** Can be requested without force. */
  available: boolean;
  /** Actions it would take back (0 when none). */
  steps: number;
  /** Why it cannot be requested plainly; absent when `available`. */
  blockedReason?: string;
  /** Blocked only by a reveal, so a forced request is accepted. */
  forceable: boolean;
  /** What was revealed, when a reveal sits in the range (forced undo lets them redo it). */
  revealReason?: string;
};

/** Undo availability + any open request, pushed on join / sync / change. */
export type UndoStateMessage = {
  protocolVersion: ProtocolVersion;
  /** False in ranked rooms (undo is never offered there). */
  enabled: boolean;
  /** Turn of the state an undo would restore right now, or null when nothing to undo. */
  targetTurn: number | null;
  /** The action an undo would take back (the last one, by either seat), or null. */
  action: UndoActionInfo | null;
  /** Per-scope availability (#536); absent from older servers. */
  options: { action: UndoOption; turn: UndoOption } | null;
  /** Why no scope can be requested plainly ("Nothing to undo yet", "Undo stops here: ..."); null when one can. */
  blockedReason: string | null;
  /** Open request awaiting the other seat's answer. */
  pending: {
    /** Server-assigned, new for every request, so an accept can name the one it saw (#540). */
    id: number;
    from: Seat;
    toTurn: number;
    action: UndoActionInfo | null;
    scope: UndoScope;
    /** Actions the request takes back. */
    steps: number;
    /** Requested past a reveal. */
    force: boolean;
    /** What was revealed, set when `force`. */
    revealReason: string | null;
  } | null;
};

/** Broadcast after an accepted undo rewinds the match. */
export type UndoAppliedMessage = {
  protocolVersion: ProtocolVersion;
  toTurn: number;
  /** Replay intent count after the rewind; battle-log lines past it are dropped. */
  toStep: number;
  /** Seat that asked for the undo. */
  by: Seat;
  /** The action that was taken back (the last one when the whole turn went). */
  action: UndoActionInfo;
  /** What was taken back; "action" from older servers. */
  scope: UndoScope;
  /** How many actions went. */
  steps: number;
};

/**
 * Rematch (unranked rooms): both seats "request", then the loser picks
 * "first" or "second"; "decline" withdraws / refuses. A "request" may carry
 * a `deck` to play the next game with instead of the seat's current deck;
 * a deck on any other action is a protocol error.
 */
export type RematchAction = "request" | "decline" | "first" | "second";

export type RematchStateMessage = {
  protocolVersion: ProtocolVersion;
  /** Match is over, the room is unranked and both players are still here. */
  available: boolean;
  requested: [boolean, boolean];
  /** True when that seat's current request carries a different deck. */
  newDeck: [boolean, boolean];
  declinedBy: Seat | null;
  /** Set once both agreed: the loser, who picks first / second. */
  chooser: Seat | null;
};
