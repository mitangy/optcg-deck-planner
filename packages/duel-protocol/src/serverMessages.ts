/**
 * Messages a duel room sends to a client, and the parsers a client runs on them.
 * Lenient where the server may be older than the client; strict where a bad payload would break the board
 * or leak hidden information. Parsers throw a plain `Error` (the client reports or ignores it, see
 * duel-web/src/net/duelClient.ts); the labels are for the error text.
 */
import { CHAT_MAX_LENGTH, PROTOCOL_VERSION, type ProtocolVersion, SKIN_DATA_URL, SKIN_MAX_CARD_BACK_CHARS, SKIN_MAX_PLAYMAT_CHARS, SKIN_PUBLIC_PATH, isProtocolVersion } from "./constants.js";
import type { ErrorCode } from "./errors.js";
import { asDonArtId } from "./clientMessages.js";
import type {
  BriefTicketWire,
  ChatLine,
  CosmeticsMessage,
  DiceCall,
  DiceResult,
  DiceStateMessage,
  DiceStep,

  MatchOverMessage,
  PlayerView,
  Seat,
  SeatPlayerInfo,
  SeatPlayers,
  SkinMessage,
  TimerMessage,
  UndoActionInfo,
  UndoOption,
  UndoScope,
  ViewMessage,
  WelcomeMessage,
  ArtPrefsMap,
} from "./types.js";

/** A message body that must be an object. */
function objectBody(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error(`${label} body required`);
  return raw as Record<string, unknown>;
}

/** A message body that must be an object carrying the current protocolVersion. */
function versionedBody(raw: unknown, label: string): Record<string, unknown> {
  const o = objectBody(raw, label);
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  return o;
}

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

function asSkinImage(raw: unknown, maxChars: number, resolvePublicPath: (path: string) => string): string | null {
  // Only image data URLs and API upload URLs are ever put in CSS `url(...)`;
  // anything else is dropped.
  if (typeof raw !== "string" || raw.length > maxChars) return null;
  if (SKIN_DATA_URL.test(raw)) return raw;
  if (SKIN_PUBLIC_PATH.test(raw)) return resolvePublicPath(raw);
  return null;
}

/**
 * A player's skin. An account upload arrives as a path relative to the API; `resolvePublicPath` turns it
 * into the URL the page loads it from (the protocol package knows no app config).
 */
export function parseReceivedSkin(raw: unknown, resolvePublicPath: (path: string) => string): SkinMessage {
  const o = objectBody(raw, "skin");
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (o.seat !== 0 && o.seat !== 1) throw new Error("skin.seat required");
  const skin = (o.skin && typeof o.skin === "object" ? o.skin : {}) as Record<string, unknown>;
  return {
    protocolVersion: PROTOCOL_VERSION,
    seat: o.seat,
    skin: {
      playmat: asSkinImage(skin.playmat, SKIN_MAX_PLAYMAT_CHARS, resolvePublicPath),
      cardBack: asSkinImage(skin.cardBack, SKIN_MAX_CARD_BACK_CHARS, resolvePublicPath),
      donArt: asDonArtId(skin.donArt),
    },
  };
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
    const hiddenViewer = choice.privateToSeat != null && (view.spectator || choice.privateToSeat !== view.seat);
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

const seatOf = (v: unknown): Seat | null => (v === 0 || v === 1 ? v : null);
const callOf = (v: unknown): DiceCall | null => (v === "high" || v === "low" ? v : null);

/** The finished dice roll of a welcome, or undefined unless every part is the right shape (lenient: it is only shown). */
export function parseDiceResult(raw: unknown): DiceResult | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const roller = seatOf(o.roller);
  const caller = seatOf(o.caller);
  const winner = seatOf(o.winner);
  const call = callOf(o.call);
  const roll = o.roll;
  if (roller === null || caller === null || winner === null || call === null) return undefined;
  if (typeof roll !== "number" || !Number.isInteger(roll) || roll < 1 || roll > 6) return undefined;
  return { roller, caller, call, roll, winner };
}

export function parseDiceState(raw: unknown): DiceStateMessage {
  const o = versionedBody(raw, "dice_state");
  const roller = seatOf(o.roller);
  const caller = seatOf(o.caller);
  const seat = seatOf(o.seat);
  if (roller === null || caller === null || seat === null) throw new Error("dice_state seats required");
  const steps: DiceStep[] = ["call", "roll", "choose", "done", "cancelled"];
  if (!steps.includes(o.step as DiceStep)) throw new Error("dice_state.step invalid");
  const roll = typeof o.roll === "number" && Number.isInteger(o.roll) && o.roll >= 1 && o.roll <= 6 ? o.roll : null;
  return {
    protocolVersion: PROTOCOL_VERSION,
    roller,
    caller,
    step: o.step as DiceStep,
    call: callOf(o.call),
    roll,
    winner: seatOf(o.winner),
    deadline: typeof o.deadline === "number" && Number.isFinite(o.deadline) ? o.deadline : null,
    seat,
    role: o.role === "spectator" ? "spectator" : "player",
    players: parseSeatPlayers(o.players),
  };
}

export function parseWelcome(raw: unknown): WelcomeMessage {
  const o = versionedBody(raw, "welcome");
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
    firstSeatPickedBy:
      o.firstSeatPickedBy === null ? null : o.firstSeatPickedBy === 0 || o.firstSeatPickedBy === 1 ? o.firstSeatPickedBy : undefined,
    dice: o.dice === null ? null : parseDiceResult(o.dice),
    // A spectator is never offered a brief, whatever the server sent.
    brief: role === "spectator" || view.spectator ? undefined : parseBriefTicket(o.brief),
  };
}

export function parseView(raw: unknown): ViewMessage {
  const o = versionedBody(raw, "view");
  if (!o.view || typeof o.view !== "object") throw new Error("view required");
  const view = o.view as PlayerView;
  if (view.spectator) {
    assertSpectatorPrivacy(view);
  } else {
    assertNoOpponentHand(view);
  }
  return { protocolVersion: PROTOCOL_VERSION, view };
}

/** An `error` as a client receives it: a code from this protocol, or one an older / newer server invented. */
export type ReceivedErrorMessage = {
  protocolVersion: ProtocolVersion;
  code: ErrorCode | (string & {});
  message: string;
};

export function parseError(raw: unknown): ReceivedErrorMessage {
  const o = objectBody(raw, "error");
  return {
    protocolVersion: PROTOCOL_VERSION,
    code: typeof o.code === "string" ? o.code : "unknown",
    message: typeof o.message === "string" ? o.message : "Unknown error",
  };
}

export function parseMatchOver(raw: unknown): MatchOverMessage {
  const o = objectBody(raw, "match_over");
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
  const o = objectBody(raw, "timer");
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
  const o = versionedBody(raw, "presence");
  const a = Array.isArray(o.awayUntil) ? o.awayUntil : [];
  const at = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return [at(a[0]), at(a[1])];
}

export function parseCosmetics(raw: unknown): CosmeticsMessage {
  const o = versionedBody(raw, "cosmetics");
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
  return asChatLine(versionedBody(raw, "chat"));
}

export function parseChatHistory(raw: unknown): ChatLine[] {
  const o = versionedBody(raw, "chat_history");
  if (!Array.isArray(o.messages)) throw new Error("chat_history.messages required");
  return o.messages.map(asChatLine);
}

/** An open undo request awaiting the other seat's answer. */
export type UndoPending = {
  /** Server-assigned per request; an accept echoes it so a changed request is not applied unseen (#540). Absent from older servers. */
  id?: number;
  from: Seat;
  toTurn: number;
  action: UndoActionInfo | null;
  scope: UndoScope;
  steps: number;
  /** Asked past a reveal. */
  force: boolean;
  revealReason: string | null;
};

/** Undo availability pushed by the server (enabled only in unranked rooms). */
export type UndoState = {
  enabled: boolean;
  /** Turn of the state an undo would restore right now; null when nothing to undo. */
  targetTurn: number | null;
  /** The last action, which an undo would take back; null when nothing to undo. */
  action: UndoActionInfo | null;
  /** Per-scope availability; null from an older server (then only the last action can be undone). */
  options: { action: UndoOption; turn: UndoOption } | null;
  /** Why nothing can be requested plainly; null when something can. */
  blockedReason: string | null;
  pending: UndoPending | null;
};

/** Broadcast after an accepted undo. */
export type UndoApplied = {
  toTurn: number;
  /** Intent count after the rewind; absent from older servers. */
  toStep?: number;
  by: Seat;
  action: UndoActionInfo | null;
  /** What went; "action" from older servers. */
  scope: UndoScope;
  steps?: number;
};

function parseUndoOption(raw: unknown): UndoOption | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.available !== "boolean") return null;
  return {
    available: o.available,
    steps: typeof o.steps === "number" ? o.steps : 0,
    ...(typeof o.blockedReason === "string" ? { blockedReason: o.blockedReason } : {}),
    forceable: o.forceable === true,
    ...(typeof o.revealReason === "string" ? { revealReason: o.revealReason } : {}),
  };
}

export function parseUndoState(raw: unknown): UndoState {
  const o = versionedBody(raw, "undo_state");
  const turn = typeof o.targetTurn === "number" ? o.targetTurn : null;
  const p = o.pending as Record<string, unknown> | null | undefined;
  const pending: UndoPending | null =
    p && typeof p === "object" && (p.from === 0 || p.from === 1) && typeof p.toTurn === "number"
      ? {
          ...(typeof p.id === "number" ? { id: p.id } : {}),
          from: p.from as Seat,
          toTurn: p.toTurn,
          action: parseUndoActionInfo(p.action),
          scope: p.scope === "turn" ? "turn" : "action",
          steps: typeof p.steps === "number" ? p.steps : 1,
          force: p.force === true,
          revealReason: typeof p.revealReason === "string" ? p.revealReason : null,
        }
      : null;
  const opts = o.options as Record<string, unknown> | null | undefined;
  const optAction = opts && typeof opts === "object" ? parseUndoOption(opts.action) : null;
  const optTurn = opts && typeof opts === "object" ? parseUndoOption(opts.turn) : null;
  return {
    enabled: o.enabled === true,
    targetTurn: turn,
    action: parseUndoActionInfo(o.action),
    options: optAction && optTurn ? { action: optAction, turn: optTurn } : null,
    blockedReason: typeof o.blockedReason === "string" ? o.blockedReason : null,
    pending,
  };
}

/** Lenient: an older server sends no action, and a malformed one is just dropped. */
function parseUndoActionInfo(raw: unknown): UndoActionInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if ((a.seat !== 0 && a.seat !== 1) || typeof a.label !== "string" || a.label === "") return null;
  return { seat: a.seat, label: a.label };
}

export function parseUndoApplied(raw: unknown): UndoApplied {
  const o = versionedBody(raw, "undo_applied");
  if (typeof o.toTurn !== "number") throw new Error("undo_applied.toTurn required");
  if (o.by !== 0 && o.by !== 1) throw new Error("undo_applied.by required");
  return {
    toTurn: o.toTurn,
    ...(typeof o.toStep === "number" ? { toStep: o.toStep } : {}),
    by: o.by,
    action: parseUndoActionInfo(o.action),
    scope: o.scope === "turn" ? "turn" : "action",
    ...(typeof o.steps === "number" ? { steps: o.steps } : {}),
  };
}

/** Rematch vote after a match ends (unranked rooms). */
export type RematchState = {
  /** Over, unranked, and both players still in the room. */
  available: boolean;
  requested: [boolean, boolean];
  /** That seat's current request carries a different deck for the next game. */
  newDeck: [boolean, boolean];
  declinedBy: Seat | null;
  /** Both agreed: the loser picks who goes first. */
  chooser: Seat | null;
};

export function parseRematchState(raw: unknown): RematchState {
  const o = versionedBody(raw, "rematch_state");
  const req = Array.isArray(o.requested) ? o.requested : [];
  const newDeck = Array.isArray(o.newDeck) ? o.newDeck : [];
  const seatOrNull = (v: unknown): Seat | null => (v === 0 || v === 1 ? v : null);
  return {
    available: o.available === true,
    requested: [req[0] === true, req[1] === true],
    newDeck: [newDeck[0] === true, newDeck[1] === true],
    declinedBy: seatOrNull(o.declinedBy),
    chooser: seatOrNull(o.chooser),
  };
}
