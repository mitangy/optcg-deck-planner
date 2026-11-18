// import type only: duel-web's main bundle must not load the rules engine.
import type { BotLevel, GameEvent, Intent, PlayerView, Seat } from "@optcg/rules";
import type { ErrorCode } from "./errors.js";
import type { ProtocolVersion } from "./constants.js";

export type { BotLevel, GameEvent, Intent, PlayerView, Seat };

export type CardView = PlayerView["you"]["leader"];
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
  devUserId?: string;
  gameToken?: string;
  secret?: string;
  preferredSeat?: Seat;
  role?: "player" | "spectator";
  deck?: PlayerDeckWire;
  takeover?: boolean;
  ownerToken?: string;
};

export type DuelCreateOptions = {
  protocolVersion?: ProtocolVersion;
  seed?: number;
  autoSkipMulligan?: boolean;
  /** Honored only on local/dev servers; deployed servers flip a coin. */
  firstSeat?: 0 | 1;
  diceRoll?: boolean;
  ranked?: boolean;
  players?: [PlayerDeckWire, PlayerDeckWire];
  timer?: {
    turnSeconds?: number;
    matchSeconds?: number;
    seatSeconds?: number;
  };
  /** Server-only capability; never sent to browser clients. */
  rankedAttestation?: string;
  /** Signed by the backend for a tournament match's room; the game server checks it before treating the room as a tournament room. */
  tournamentTicket?: string;
  bot?: BotRoomOptions;
};

export type SeatPlayerInfo = {
  /** Never an email. */
  name: string | null;
};

export type SeatPlayers = [SeatPlayerInfo, SeatPlayerInfo];

export type BriefTicketWire = {
  ticket: string;
  leaderId: string;
  opponentId: string;
  deck: string[];
};

export type WelcomeMessage = {
  protocolVersion: ProtocolVersion;
  matchId: string;
  seat: Seat;
  role?: "player" | "spectator";
  view: PlayerView;
  players?: SeatPlayers;
  ranked?: boolean;
  tournament?: boolean;
  firstSeatPickedBy?: Seat | null;
  dice?: DiceResult | null;
  brief?: BriefTicketWire;
  bot?: { level: BotLevel };
};

export type EventsMessage = {
  protocolVersion: ProtocolVersion;
  events: GameEvent[];
  step?: number;
};

export type ViewMessage = {
  protocolVersion: ProtocolVersion;
  view: PlayerView;
  /** Server state version of `view`. Rises on every state change, undo included. */
  step?: number;
};

/** Client intent envelope. Both guards are optional: older clients omit them. */
export type IntentMessage = {
  protocolVersion: ProtocolVersion;
  intent: Intent;
  /** The ViewMessage.step the client acted on; a different current step makes the server drop the intent. */
  step?: number;
  /** Instance id of the hand card a handIndex intent meant. */
  cardId?: string;
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

export type TimerMessage = {
  protocolVersion: ProtocolVersion;
  turnSeconds: number | null;
  matchSeconds: number | null;
  turnEndsAt: number | null;
  matchEndsAt: number | null;
  activeSeat: Seat;
  seatSeconds: number | null;
  seatRemainingMs: [number, number] | null;
  clockSeat: Seat | null;
  clockEndsAt: number | null;
};

export type ArtPrefsMap = Record<string, string>;

export type CosmeticsMessage = {
  protocolVersion: ProtocolVersion;
  seat: Seat;
  artPrefs: ArtPrefsMap;
};

export type SeatSkin = {
  playmat: string | null;
  cardBack: string | null;
  donArt: number | null;
};

export type SkinMessage = {
  protocolVersion: ProtocolVersion;
  seat: Seat;
  skin: SeatSkin;
};

export type ChatMessage = {
  protocolVersion: ProtocolVersion;
  id: string;
  seat: Seat;
  text: string;
  at: number;
};

export type ChatHistoryMessage = {
  protocolVersion: ProtocolVersion;
  messages: ChatMessage[];
};

export type ChatLine = {
  id: string;
  seat: Seat;
  text: string;
  at: number;
};

export type HandOrderMessage = {
  protocolVersion?: ProtocolVersion;
  ids: string[];
};

export type UndoAction = "request" | "accept" | "decline" | "cancel";

export type UndoScope = "action" | "turn";

export type UndoRequestBody = {
  action: UndoAction;
  scope: UndoScope;
  force: boolean;
  id?: number;
};

export type UndoRequestOptions = { scope?: UndoScope; force?: boolean; id?: number };

export type UndoActionInfo = { seat: Seat; label: string };

export type UndoOption = {
  available: boolean;
  steps: number;
  blockedReason?: string;
  forceable: boolean;
  revealReason?: string;
};

export type UndoStateMessage = {
  protocolVersion: ProtocolVersion;
  enabled: boolean;
  targetTurn: number | null;
  action: UndoActionInfo | null;
  options: { action: UndoOption; turn: UndoOption } | null;
  blockedReason: string | null;
  pending: {
    id: number;
    from: Seat;
    toTurn: number;
    action: UndoActionInfo | null;
    scope: UndoScope;
    steps: number;
    force: boolean;
    revealReason: string | null;
  } | null;
};

export type UndoAppliedMessage = {
  protocolVersion: ProtocolVersion;
  toTurn: number;
  toStep: number;
  by: Seat;
  action: UndoActionInfo;
  scope: UndoScope;
  steps: number;
};

export type RematchAction = "request" | "decline" | "first" | "second";

export type RematchStateMessage = {
  protocolVersion: ProtocolVersion;
  available: boolean;
  requested: [boolean, boolean];
  newDeck: [boolean, boolean];
  declinedBy: Seat | null;
  chooser: Seat | null;
};

export type DiceCall = "high" | "low";
export type DiceStep = "call" | "roll" | "choose" | "done" | "cancelled";
export type DiceAction =
  | { action: "call"; call: DiceCall }
  | { action: "roll" }
  | { action: "first" }
  | { action: "second" };

export type DiceResult = {
  roller: Seat;
  caller: Seat;
  call: DiceCall;
  roll: number;
  winner: Seat;
};

export type DiceStateMessage = {
  protocolVersion: ProtocolVersion;
  roller: Seat;
  caller: Seat;
  step: DiceStep;
  call: DiceCall | null;
  roll: number | null;
  winner: Seat | null;
  deadline: number | null;
  seat: Seat;
  role: "player" | "spectator";
  players?: SeatPlayers;
};
