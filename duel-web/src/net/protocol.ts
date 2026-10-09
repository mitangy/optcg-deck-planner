/**
 * Wire types for protocolVersion 5 — mirrored from game-server/src/protocol.ts.
 * Do not import @optcg/rules into the app.
 */

import { lookupCard } from "../cards/atlas";
import { asDonArtId } from "../board/donArt";

export const PROTOCOL_VERSION = 5 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type Seat = 0 | 1;

export type PlayerDeckWire = {
  leaderId: string;
  deck: string[];
};

export type DuelJoinOptions = {
  protocolVersion: ProtocolVersion;
  devUserId?: string;
  gameToken?: string;
  secret?: string;
  preferredSeat?: Seat;
  role?: "player" | "spectator";
  /** Optional deck for this seat. */
  deck?: PlayerDeckWire;
};

export type DuelCreateOptions = {
  protocolVersion?: ProtocolVersion;
  seed?: number;
  autoSkipMulligan?: boolean;
  /** False for private / hotseat; ranked queue sets true (forces a 15 minute chess clock per player). */
  ranked?: boolean;
  players?: [PlayerDeckWire, PlayerDeckWire];
  timer?: {
    turnSeconds?: number;
    matchSeconds?: number;
    /** Per-player time bank (chess clock). */
    seatSeconds?: number;
  };
};

/** Prefer sending objects from view.legalIntents unchanged. */
export type Intent = Record<string, unknown> & { type: string };

export type ErrorCode =
  | "illegal_intent"
  | "match_not_ready"
  | "match_over"
  | "bad_protocol"
  | "rate_limited"
  | "unauthorized"
  | "room_full"
  | "unsupported_deck"
  | "opponent_no_show"
  | string;

/** Public per-seat player info from the game-server (never contains emails). */
export type SeatPlayerInfo = {
  name: string | null;
};

/** Seat-indexed player names; null entries when unknown (older servers). */
export type SeatPlayers = [SeatPlayerInfo, SeatPlayerInfo];

/** The game server's signed key to a Log Pose matchup brief: this seat's leader and deck against the other leader. */
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
  /** Whether the room is ranked; absent from an older server. */
  ranked?: boolean;
  /** Players of unranked rooms only. */
  brief?: BriefTicketWire;
};

/** A brief ticket as sent, or undefined unless every part is the right shape. */
export function parseBriefTicket(raw: unknown): BriefTicketWire | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.ticket !== "string" || typeof o.leaderId !== "string" || typeof o.opponentId !== "string") return undefined;
  if (!Array.isArray(o.deck) || !o.deck.every((c) => typeof c === "string")) return undefined;
  return { ticket: o.ticket, leaderId: o.leaderId, opponentId: o.opponentId, deck: o.deck as string[] };
}

function parseSeatPlayers(raw: unknown): SeatPlayers | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const one = (p: unknown): SeatPlayerInfo => {
    const name =
      p && typeof p === "object" ? (p as { name?: unknown }).name : undefined;
    return {
      name: typeof name === "string" && name.trim() ? name.trim().slice(0, 40) : null,
    };
  };
  return [one(raw[0]), one(raw[1])];
}

export type ViewMessage = {
  protocolVersion: ProtocolVersion;
  view: PlayerView;
};

export type EventsMessage = {
  protocolVersion: ProtocolVersion;
  events: unknown[];
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

/** Server clock snapshot (optional — absent when both clocks are off). */
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


/** A player's custom playmat / card back as small data URLs (null = default). */
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

/** Must match the game server's caps (game-server/src/protocol.ts). */
export const SKIN_MAX_PLAYMAT_CHARS = 450_000;
export const SKIN_MAX_CARD_BACK_CHARS = 90_000;

const SKIN_DATA_URL = /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/;

function asSkinImage(raw: unknown, maxChars: number): string | null {
  // Only image data URLs are ever put in CSS `url(...)`; anything else is dropped.
  return typeof raw === "string" && raw.length <= maxChars && SKIN_DATA_URL.test(raw)
    ? raw
    : null;
}

export function parseSkin(raw: unknown): SkinMessage {
  if (!raw || typeof raw !== "object") throw new Error("skin body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (o.seat !== 0 && o.seat !== 1) throw new Error("skin.seat required");
  const skin = (o.skin && typeof o.skin === "object" ? o.skin : {}) as Record<string, unknown>;
  return {
    protocolVersion: PROTOCOL_VERSION,
    seat: o.seat,
    skin: {
      playmat: asSkinImage(skin.playmat, SKIN_MAX_PLAYMAT_CHARS),
      cardBack: asSkinImage(skin.cardBack, SKIN_MAX_CARD_BACK_CHARS),
      donArt: asDonArtId(skin.donArt),
    },
  };
}

/** Mirrors @optcg/rules PendingChoiceKind. */
export type PendingChoiceKind =
  | "life_trigger"
  /** Generic effect prompt; see `request`. */
  | "effect"
  /** Controller must reorder 2+ simultaneous effects before they resolve. */
  | "order_effects";

/** Mirrors @optcg/rules ChoiceOption. Hidden cards arrive as defId "HIDDEN". */
export type ChoiceOptionView = {
  id: string;
  defId?: string;
  label?: string;
  zone?: "leader" | "character" | "stage" | "hand" | "trash" | "deck" | "life" | "don" | "resolving";
  ownerSeat?: Seat;
  instanceId?: string;
  eligible: boolean;
  rested?: boolean;
};

export type DeckPlacement = "deck_bottom" | "deck_top" | "trash" | "top_or_bottom" | "hand" | "shuffle" | "look_only";

/** Mirrors @optcg/rules ChoiceRequest. */
export type ChoiceRequestView =
  | { type: "confirm" }
  /** `distinctNames`: no two picks may share a card name. */
  | { type: "select"; min: number; max: number; options: ChoiceOptionView[]; distinctNames?: true }
  | { type: "mode"; options: ChoiceOptionView[] }
  | { type: "order"; options: ChoiceOptionView[]; destination: string; allowTopOrBottom?: boolean }
  | {
      type: "look";
      options: ChoiceOptionView[];
      minSelect: number;
      maxSelect: number;
      groups: { label: string; max: number; eligibleIds: string[] }[];
      rest: DeckPlacement;
      restLabel: string;
    };

/** A queued player decision; the front entry blocks other actions for its seat. */
export type PendingChoiceView = {
  id: string;
  seat: Seat;
  kind: PendingChoiceKind;
  cardDefId: string;
  sourceInstanceId?: string;
  optional: boolean;
  /** Server-authoritative prompt text. */
  prompt: string;
  request?: ChoiceRequestView;
  privateToSeat?: Seat;
  hideCardDefFromOthers?: boolean;
  /** life_trigger, owner only: the Life card has no [Trigger], so only declining (add to hand) is legal. */
  noTrigger?: boolean;
  /** Optional-cost confirm, owner only: the cost depends on hidden cards and cannot be paid, so only declining is legal (#369). */
  unpayable?: boolean;
  optionCount?: number;
  /** order_effects: the simultaneous abilities to permute via order_pending_effects. */
  unorderedChoices?: PendingChoiceView[];
};

export type CardView = {
  id: string;
  defId: string;
  rested?: boolean;
  attachedDonCount?: number;
  /** Live power (DON!!, stage, battle bonuses included). */
  power?: number;
  fieldCost?: number;
  /** Printed power before modifiers (optional). */
  printedPower?: number | null;
  summoningSick?: boolean;
  rush?: boolean;
  /** Rested / sick / rush / future CC labels (stun, unrestable, …). */
  statusLabels?: string[];
};

export type PlayerView = {
  seat: Seat;
  spectator?: boolean;
  cameraSeat?: Seat;
  you: {
    leader: CardView;
    characters: CardView[];
    stage: CardView | null;
    /**
     * Own hand only. `playCost` is the live cost on your main phase; `counter` is the
     * live Counter (printed plus "+N Counter" statics) during your counter step.
     */
    hand: { id: string; defId: string; playCost?: number; counter?: number }[];
    handCount?: number;
    deckCount: number;
    trash: string[];
    lifeCount: number;
    faceUpLife?: Array<{ index: number; defId: string }>;
    /** Your events (and other cards) mid-resolution, between the hand and the trash. */
    resolving?: { id: string; defId: string }[];
    donDeckCount: number;
    costArea: { id: string; rested: boolean }[];
    activeDonCount: number;
    mulliganDone?: boolean;
    turnsStarted?: number;
  };
  opponent: {
    leader: CardView;
    characters: CardView[];
    stage: CardView | null;
    handCount: number;
    deckCount: number;
    trash: string[];
    lifeCount: number;
    faceUpLife?: Array<{ index: number; defId: string }>;
    donDeckCount: number;
    costAreaCount: number;
    activeDonCount: number;
    turnsStarted?: number;
    mulliganDone?: boolean;
  };
  activeSeat: Seat;
  /** Seat that takes turn 1. Absent on older servers (seat 0 went first). */
  firstSeat?: Seat;
  phase: string;
  turnNumber: number;
  battle: unknown;
  /** @deprecated Use `pendingChoices[0]` (kind `"life_trigger"`). Kept for older payloads. */
  pendingTrigger: unknown;
  /** FIFO queue of ask-to-trigger prompts; front of the queue blocks Main-phase actions for its seat. */
  pendingChoices?: PendingChoiceView[];
  winner: Seat | null;
  winReason: string | null;
  legalIntents: Intent[];
  /** Spectators of unranked rooms: both hands, indexed by seat. */
  revealedHands?: [{ id: string; defId: string }[], { id: string; defId: string }[]];
};

export function isProtocolVersion(v: unknown): v is ProtocolVersion {
  return v === PROTOCOL_VERSION;
}

export function assertNoOpponentHand(view: PlayerView): void {
  const opp = view.opponent as PlayerView["opponent"] & { hand?: unknown };
  if (Object.prototype.hasOwnProperty.call(opp, "hand") && opp.hand !== undefined) {
    throw new Error("privacy leak: opponent.hand present in view");
  }
  if (typeof opp.handCount !== "number") {
    throw new Error("opponent.handCount missing");
  }
  for (const choice of view.pendingChoices ?? []) {
    const request = choice.request;
    const hiddenViewer = view.spectator || (choice.privateToSeat != null && choice.privateToSeat !== view.seat);
    if (hiddenViewer && request && "options" in request && request.options.some((o) => o.defId && o.defId !== "HIDDEN" && !o.instanceId)) {
      throw new Error("privacy leak: private choice options visible to this viewer");
    }
  }
}

/** Spectators must not receive either seat's hand contents. */
export function assertSpectatorPrivacy(view: PlayerView): void {
  assertNoOpponentHand(view);
  if (view.you.hand.length > 0) {
    throw new Error("privacy leak: spectator you.hand not empty");
  }
  if (typeof view.you.handCount !== "number") {
    throw new Error("spectator you.handCount missing");
  }
}

export function parseWelcome(raw: unknown): WelcomeMessage {
  if (!raw || typeof raw !== "object") throw new Error("welcome body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (typeof o.matchId !== "string") throw new Error("matchId required");
  if (o.seat !== 0 && o.seat !== 1) throw new Error("seat required");
  if (!o.view || typeof o.view !== "object") throw new Error("view required");
  const view = o.view as PlayerView;
  const role =
    o.role === "spectator" || o.role === "player" ? o.role : undefined;
  if (role === "spectator" || view.spectator) {
    assertSpectatorPrivacy(view);
  } else {
    assertNoOpponentHand(view);
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    matchId: o.matchId,
    seat: o.seat,
    role,
    view,
    players: parseSeatPlayers(o.players),
    ranked: typeof o.ranked === "boolean" ? o.ranked : undefined,
    // A spectator is never offered a brief, whatever the server sent.
    brief: role === "spectator" || view.spectator ? undefined : parseBriefTicket(o.brief),
  };
}

export function parseView(raw: unknown): ViewMessage {
  if (!raw || typeof raw !== "object") throw new Error("view body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (!o.view || typeof o.view !== "object") throw new Error("view required");
  const view = o.view as PlayerView;
  if (view.spectator) {
    assertSpectatorPrivacy(view);
  } else {
    assertNoOpponentHand(view);
  }
  return { protocolVersion: PROTOCOL_VERSION, view };
}

export function parseError(raw: unknown): ErrorMessage {
  if (!raw || typeof raw !== "object") throw new Error("error body required");
  const o = raw as Record<string, unknown>;
  return {
    protocolVersion: PROTOCOL_VERSION,
    code: typeof o.code === "string" ? o.code : "unknown",
    message: typeof o.message === "string" ? o.message : "Unknown error",
  };
}

export function parseMatchOver(raw: unknown): MatchOverMessage {
  if (!raw || typeof raw !== "object") throw new Error("match_over body required");
  const o = raw as Record<string, unknown>;
  const result = o.result as { winner?: unknown; reason?: unknown } | undefined;
  if (!result || (result.winner !== 0 && result.winner !== 1)) {
    throw new Error("match_over.result.winner required");
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    result: {
      winner: result.winner,
      reason: typeof result.reason === "string" ? result.reason : "unknown",
    },
  };
}

export function parseTimer(raw: unknown): TimerMessage {
  if (!raw || typeof raw !== "object") throw new Error("timer body required");
  const o = raw as Record<string, unknown>;
  const asNullableNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const activeSeat = o.activeSeat === 1 ? 1 : 0;
  return {
    protocolVersion: PROTOCOL_VERSION,
    turnSeconds: asNullableNumber(o.turnSeconds),
    matchSeconds: asNullableNumber(o.matchSeconds),
    turnEndsAt: asNullableNumber(o.turnEndsAt),
    matchEndsAt: asNullableNumber(o.matchEndsAt),
    activeSeat,
    seatSeconds: asNullableNumber(o.seatSeconds),
    seatRemainingMs:
      Array.isArray(o.seatRemainingMs) &&
      o.seatRemainingMs.length === 2 &&
      o.seatRemainingMs.every((n) => typeof n === "number" && Number.isFinite(n))
        ? [o.seatRemainingMs[0] as number, o.seatRemainingMs[1] as number]
        : null,
    clockSeat: o.clockSeat === 0 || o.clockSeat === 1 ? o.clockSeat : null,
    clockEndsAt: asNullableNumber(o.clockEndsAt),
  };
}

/** Which seats are temporarily disconnected, and until when they may return. */
export function parsePresence(raw: unknown): [number | null, number | null] {
  if (!raw || typeof raw !== "object") throw new Error("presence body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  const a = Array.isArray(o.awayUntil) ? o.awayUntil : [];
  const at = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return [at(a[0]), at(a[1])];
}


export function parseCosmetics(raw: unknown): CosmeticsMessage {
  if (!raw || typeof raw !== "object") throw new Error("cosmetics body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (o.seat !== 0 && o.seat !== 1) throw new Error("cosmetics.seat required");
  const artPrefs = asArtPrefsMap(o.artPrefs);
  return {
    protocolVersion: PROTOCOL_VERSION,
    seat: o.seat,
    artPrefs,
  };
}

function asArtPrefsMap(raw: unknown): ArtPrefsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ArtPrefsMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function shortId(id: unknown): string {
  return String(id ?? "?").slice(0, 8);
}

function nameForDef(defId: string | undefined): string | null {
  if (!defId) return null;
  const n = lookupCard(defId).name;
  return n && n !== defId ? n : defId;
}

function findBoardName(view: PlayerView | undefined, instanceId: unknown): string {
  if (!view || instanceId == null) return shortId(instanceId);
  const id = String(instanceId);
  if (view.you.leader.id === id) return nameForDef(view.you.leader.defId) ?? shortId(id);
  if (view.you.stage?.id === id) return nameForDef(view.you.stage.defId) ?? shortId(id);
  const ch = view.you.characters.find((c) => c.id === id);
  if (ch) return nameForDef(ch.defId) ?? shortId(id);
  if (view.opponent.leader.id === id) {
    return nameForDef(view.opponent.leader.defId) ?? shortId(id);
  }
  if (view.opponent.stage?.id === id) {
    return nameForDef(view.opponent.stage.defId) ?? shortId(id);
  }
  const och = view.opponent.characters.find((c) => c.id === id);
  if (och) return nameForDef(och.defId) ?? shortId(id);
  return shortId(id);
}

function handName(view: PlayerView | undefined, handIndex: unknown): string {
  if (!view || typeof handIndex !== "number") return `#${String(handIndex)}`;
  const card = view.you.hand[handIndex];
  if (!card) return `#${handIndex}`;
  return nameForDef(card.defId) ?? `#${handIndex}`;
}

export function intentLabel(intent: Intent, view?: PlayerView): string {
  switch (intent.type) {
    case "mulligan":
      return intent.doMulligan ? "Mulligan (redraw 5)" : "Keep opening hand";
    case "play_card":
      // Full board: one legal play per Character that could be trashed, so
      // name the one this button replaces.
      return intent.trashCharacterId != null
        ? `Play ${handName(view, intent.handIndex)}, replacing ${findBoardName(view, intent.trashCharacterId)}`
        : `Play ${handName(view, intent.handIndex)}`;
    case "give_don":
      return `Give DON → ${findBoardName(view, intent.targetId)}`;
    case "activate_leader":
      return `Activate Leader → ${findBoardName(view, intent.targetId)}`;
    case "activate_ability": {
      const source = findBoardName(view, intent.sourceId);
      const target =
        intent.targetId != null ? findBoardName(view, intent.targetId) : null;
      return target ? `Activate ${source} → ${target}` : `Activate ${source}`;
    }
    case "declare_attack": {
      const target = intent.target as { kind?: string; instanceId?: string } | undefined;
      if (target?.kind === "leader") {
        return `Attack Leader (${findBoardName(view, view?.opponent.leader.id)})`;
      }
      if (target?.kind === "character") {
        return `Attack ${findBoardName(view, target.instanceId)}`;
      }
      return `Attack ${JSON.stringify(intent.target)}`;
    }
    case "declare_block":
      return `Block (${findBoardName(view, intent.blockerId)})`;
    case "pass_block":
      return "Pass block";
    case "counter_from_hand":
      return `Counter ${handName(view, intent.handIndex)}`;
    case "counter_event":
      return `Counter event ${handName(view, intent.handIndex)}`;
    case "pass_counter":
      return "Pass counter";
    case "resolve_pending_choice": {
      const front = view?.pendingChoices?.[0];
      const who = front ? nameForDef(front.cardDefId) ?? front.cardDefId : "ability";
      if (!intent.accept) return `Decline — ${who}`;
      return front?.request?.type === "confirm" || !front?.request ? `Accept — ${who}` : `Resolve — ${who}`;
    }
    case "order_pending_effects":
      return "Confirm effect order";
    case "end_turn":
      return "End turn";
    default:
      return intent.type;
  }
}

/** Match chat line relayed by the server (players send; everyone receives). */
export type ChatLine = {
  id: string;
  seat: Seat;
  text: string;
  at: number;
};

/** Server-side cap; the input enforces the same limit. */
export const CHAT_MAX_LENGTH = 200;

function asChatLine(raw: unknown): ChatLine {
  if (!raw || typeof raw !== "object") throw new Error("chat line required");
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) throw new Error("chat.id required");
  if (o.seat !== 0 && o.seat !== 1) throw new Error("chat.seat required");
  if (typeof o.text !== "string") throw new Error("chat.text required");
  return {
    id: o.id,
    seat: o.seat,
    text: o.text.slice(0, CHAT_MAX_LENGTH),
    at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : Date.now(),
  };
}

export function parseChat(raw: unknown): ChatLine {
  if (!raw || typeof raw !== "object") throw new Error("chat body required");
  if (!isProtocolVersion((raw as Record<string, unknown>).protocolVersion)) {
    throw new Error("bad protocolVersion");
  }
  return asChatLine(raw);
}

export function parseChatHistory(raw: unknown): ChatLine[] {
  if (!raw || typeof raw !== "object") throw new Error("chat_history body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (!Array.isArray(o.messages)) throw new Error("chat_history.messages required");
  return o.messages.map(asChatLine);
}

/** Undo availability pushed by the server (enabled only in unranked rooms). */
export type UndoState = {
  enabled: boolean;
  /** Turn an undo would rewind to right now; null when nothing to undo. */
  targetTurn: number | null;
  /** Open request awaiting the other seat's answer. */
  pending: { from: Seat; toTurn: number } | null;
};

/** Client to room: your hand's order (card instance ids, left to right) for spectators' fans. */
export type HandOrderMessage = {
  protocolVersion: ProtocolVersion;
  ids: string[];
};

export type UndoAction = "request" | "accept" | "decline" | "cancel";

export function parseUndoState(raw: unknown): UndoState {
  if (!raw || typeof raw !== "object") throw new Error("undo_state body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  const turn = typeof o.targetTurn === "number" ? o.targetTurn : null;
  const p = o.pending as Record<string, unknown> | null | undefined;
  const pending =
    p && typeof p === "object" && (p.from === 0 || p.from === 1) && typeof p.toTurn === "number"
      ? { from: p.from as Seat, toTurn: p.toTurn }
      : null;
  return { enabled: o.enabled === true, targetTurn: turn, pending };
}

export function parseUndoApplied(raw: unknown): { toTurn: number; by: Seat } {
  if (!raw || typeof raw !== "object") throw new Error("undo_applied body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (typeof o.toTurn !== "number") throw new Error("undo_applied.toTurn required");
  if (o.by !== 0 && o.by !== 1) throw new Error("undo_applied.by required");
  return { toTurn: o.toTurn, by: o.by };
}

/** Rematch vote after a match ends (unranked rooms). */
export type RematchState = {
  /** Over, unranked, and both players still in the room. */
  available: boolean;
  requested: [boolean, boolean];
  declinedBy: Seat | null;
  /** Both agreed: the loser picks who goes first. */
  chooser: Seat | null;
};

export type RematchAction = "request" | "decline" | "first" | "second";

export function parseRematchState(raw: unknown): RematchState {
  if (!raw || typeof raw !== "object") throw new Error("rematch_state body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  const req = Array.isArray(o.requested) ? o.requested : [];
  const seatOrNull = (v: unknown): Seat | null => (v === 0 || v === 1 ? v : null);
  return {
    available: o.available === true,
    requested: [req[0] === true, req[1] === true],
    declinedBy: seatOrNull(o.declinedBy),
    chooser: seatOrNull(o.chooser),
  };
}
