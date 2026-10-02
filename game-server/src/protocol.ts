/**
 * Duel wire protocol — protocolVersion 5 (generic effect choice requests).
 * Intents / views come from @optcg/rules; this module only validates envelopes.
 */
import type { GameEvent, Intent, Seat } from "@optcg/rules";

export const PROTOCOL_VERSION = 5 as const;

/** Ranked games share one 15 minute clock for the whole game. */
export const RANKED_MATCH_SECONDS = 15 * 60;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

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
};

export type PlayerDeckWire = {
  leaderId: string;
  deck: string[];
};

export type DuelCreateOptions = {
  protocolVersion?: ProtocolVersion;
  seed?: number;
  /** Default true for Step 2 scripts. */
  autoSkipMulligan?: boolean;
  players?: [PlayerDeckWire, PlayerDeckWire];
  /**
   * Optional clocks. Ranked queue always forces a 15 minute match clock and no turn clock.
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
};

export type ErrorCode =
  | "illegal_intent"
  | "match_not_ready"
  | "match_over"
  | "bad_protocol"
  | "rate_limited"
  | "unauthorized"
  | "room_full";

/** Public per-seat player info (additive; older clients ignore it). */
export type SeatPlayerInfo = {
  /** Username, else account name; null when the seat is unknown. Never an email. */
  name: string | null;
};

export type WelcomeMessage = {
  protocolVersion: ProtocolVersion;
  matchId: string;
  /** Player seat, or camera seat when role is spectator. */
  seat: Seat;
  role?: "player" | "spectator";
  view: unknown;
  /** Indexed by seat. */
  players?: [SeatPlayerInfo, SeatPlayerInfo];
};

export type EventsMessage = {
  protocolVersion: ProtocolVersion;
  events: GameEvent[];
};

export type ViewMessage = {
  protocolVersion: ProtocolVersion;
  view: unknown;
};

export type ErrorMessage = {
  protocolVersion: ProtocolVersion;
  code: ErrorCode | string;
  message: string;
};

export type MatchOverMessage = {
  protocolVersion: ProtocolVersion;
  result: {
    winner: Seat;
    reason: string;
  };
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
 * to the room as base64 data URLs. Purely cosmetic; null = use the default.
 */
export type SeatSkin = {
  playmat: string | null;
  cardBack: string | null;
};

export type SkinMessage = {
  protocolVersion: ProtocolVersion;
  seat: Seat;
  skin: SeatSkin;
};

/** Size caps (characters of the data URL) so skins cannot bloat room memory. */
export const SKIN_MAX_PLAYMAT_CHARS = 450_000;
export const SKIN_MAX_CARD_BACK_CHARS = 90_000;

const SKIN_DATA_URL = /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/;

function asSkinImage(raw: unknown, maxChars: number, field: string): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string" || raw.length > maxChars || !SKIN_DATA_URL.test(raw)) {
    throw Object.assign(new Error(`${field} must be a small base64 image data URL or null`), {
      code: "bad_protocol" as const,
    });
  }
  return raw;
}

/** Parse client → server skin update for the sender's seat. */
export function parseSkinMessage(raw: unknown): SeatSkin {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("skin message body required"), {
      code: "bad_protocol" as const,
    });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), {
      code: "bad_protocol" as const,
    });
  }
  const skin = (o.skin && typeof o.skin === "object" ? o.skin : {}) as Record<string, unknown>;
  return {
    playmat: asSkinImage(skin.playmat, SKIN_MAX_PLAYMAT_CHARS, "playmat"),
    cardBack: asSkinImage(skin.cardBack, SKIN_MAX_CARD_BACK_CHARS, "cardBack"),
  };
}

export function isProtocolVersion(v: unknown): v is ProtocolVersion {
  return v === PROTOCOL_VERSION;
}

export function parseJoinOptions(raw: unknown): DuelJoinOptions {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("Join options required"), { code: "bad_protocol" as const });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), {
      code: "bad_protocol" as const,
    });
  }
  const gameToken =
    typeof o.gameToken === "string" && o.gameToken.trim()
      ? o.gameToken.trim()
      : undefined;
  const devUserId =
    typeof o.devUserId === "string" && o.devUserId.trim()
      ? o.devUserId.trim()
      : undefined;
  if (!gameToken && !devUserId) {
    throw Object.assign(new Error("gameToken or devUserId required"), {
      code: "unauthorized" as const,
    });
  }
  const preferredSeat = o.preferredSeat;
  if (preferredSeat !== undefined && preferredSeat !== 0 && preferredSeat !== 1) {
    throw Object.assign(new Error("preferredSeat must be 0 or 1"), {
      code: "bad_protocol" as const,
    });
  }
  const roleRaw = o.role;
  let role: "player" | "spectator" | undefined;
  if (roleRaw === "spectator" || roleRaw === "player") {
    role = roleRaw;
  } else if (roleRaw !== undefined) {
    throw Object.assign(new Error("role must be player or spectator"), {
      code: "bad_protocol" as const,
    });
  }
  let deck: PlayerDeckWire | undefined;
  if (o.deck !== undefined) {
    deck = asPlayerDeck(o.deck);
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    devUserId,
    gameToken,
    secret: typeof o.secret === "string" ? o.secret : undefined,
    preferredSeat: preferredSeat as Seat | undefined,
    role,
    deck,
  };
}

export function parseCreateOptions(raw: unknown): {
  protocolVersion: ProtocolVersion;
  seed: number;
  autoSkipMulligan: boolean;
  ranked: boolean;
  seatUserIds?: [number, number];
  players?: [PlayerDeckWire, PlayerDeckWire];
  timer: { turnSeconds: number | null; matchSeconds: number | null; seatSeconds: number | null };
} {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (o.protocolVersion !== undefined && !isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported protocolVersion on create"), {
      code: "bad_protocol" as const,
    });
  }
  const seed =
    typeof o.seed === "number" && Number.isFinite(o.seed)
      ? Math.floor(o.seed)
      : Date.now() % 1_000_000_000;
  const autoSkipMulligan = o.autoSkipMulligan !== false;
  // A browser can create a public `duel` room directly. DuelRoom decides
  // whether this request is actually ranked after verifying its attestation.
  const ranked = o.ranked === true;
  let seatUserIds: [number, number] | undefined;
  if (o.seatUserIds !== undefined) {
    if (!Array.isArray(o.seatUserIds) || o.seatUserIds.length !== 2) {
      throw Object.assign(new Error("seatUserIds must be a 2-tuple"), {
        code: "bad_protocol" as const,
      });
    }
    const [a, b] = o.seatUserIds as [unknown, unknown];
    if (
      typeof a !== "number" ||
      typeof b !== "number" ||
      !Number.isSafeInteger(a) ||
      !Number.isSafeInteger(b) ||
      a === b
    ) {
      throw Object.assign(new Error("seatUserIds must be distinct integers"), {
        code: "bad_protocol" as const,
      });
    }
    seatUserIds = [a, b];
  }
  let players: [PlayerDeckWire, PlayerDeckWire] | undefined;
  if (o.players !== undefined) {
    if (!Array.isArray(o.players) || o.players.length !== 2) {
      throw Object.assign(new Error("players must be a 2-tuple"), { code: "bad_protocol" as const });
    }
    const [a, b] = o.players as [unknown, unknown];
    players = [asPlayerDeck(a), asPlayerDeck(b)];
  }
  const timerRaw =
    o.timer && typeof o.timer === "object"
      ? (o.timer as Record<string, unknown>)
      : {};
  let turnSeconds =
    typeof timerRaw.turnSeconds === "number" && Number.isFinite(timerRaw.turnSeconds)
      ? Math.max(0, Math.floor(timerRaw.turnSeconds))
      : null;
  let matchSeconds =
    typeof timerRaw.matchSeconds === "number" && Number.isFinite(timerRaw.matchSeconds)
      ? Math.max(0, Math.floor(timerRaw.matchSeconds))
      : null;
  let seatSeconds =
    typeof timerRaw.seatSeconds === "number" && Number.isFinite(timerRaw.seatSeconds)
      ? Math.max(0, Math.floor(timerRaw.seatSeconds))
      : null;
  if (turnSeconds === 0) turnSeconds = null;
  if (matchSeconds === 0) matchSeconds = null;
  if (seatSeconds === 0) seatSeconds = null;
  // Ranked always enforces one 15 minute clock for the whole game, with no per-turn limit.
  if (ranked) {
    turnSeconds = null;
    matchSeconds = RANKED_MATCH_SECONDS;
    seatSeconds = null;
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    seed,
    autoSkipMulligan,
    ranked,
    seatUserIds,
    players,
    timer: { turnSeconds, matchSeconds, seatSeconds },
  };
}

function asPlayerDeck(raw: unknown): PlayerDeckWire {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("player deck object required"), { code: "bad_protocol" as const });
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.leaderId !== "string" || !Array.isArray(o.deck)) {
    throw Object.assign(new Error("leaderId + deck[] required"), { code: "bad_protocol" as const });
  }
  if (o.deck.length > 200) {
    throw Object.assign(new Error("deck may contain at most 200 cards"), {
      code: "bad_protocol" as const,
    });
  }
  const normalizeId = (value: unknown, field: string): string => {
    if (typeof value !== "string") {
      throw Object.assign(new Error(`${field} must be a card id`), {
        code: "bad_protocol" as const,
      });
    }
    const id = value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(id)) {
      throw Object.assign(new Error(`${field} is not a valid card id`), {
        code: "bad_protocol" as const,
      });
    }
    return id;
  };
  return {
    leaderId: normalizeId(o.leaderId, "leaderId"),
    deck: o.deck.map((id) => normalizeId(id, "deck entry")),
  };
}

export function parseIntentMessage(raw: unknown): Intent {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("intent message body required"), {
      code: "bad_protocol" as const,
    });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), {
      code: "bad_protocol" as const,
    });
  }
  if (
    !o.intent ||
    typeof o.intent !== "object" ||
    typeof (o.intent as { type?: unknown }).type !== "string"
  ) {
    throw Object.assign(new Error("intent object with type required"), {
      code: "bad_protocol" as const,
    });
  }
  return o.intent as Intent;
}

/** Parse client → server cosmetics update (artPrefs for the sender's seat). */
export function parseCosmeticsMessage(raw: unknown): ArtPrefsMap {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("cosmetics message body required"), {
      code: "bad_protocol" as const,
    });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), {
      code: "bad_protocol" as const,
    });
  }
  return asArtPrefsMap(o.artPrefs);
}

function asArtPrefsMap(raw: unknown): ArtPrefsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Object.assign(new Error("artPrefs object required"), {
      code: "bad_protocol" as const,
    });
  }
  const out: ArtPrefsMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k.trim()) continue;
    if (typeof v !== "string" || !v.trim()) continue;
    // Bound size so cosmetics cannot bloat room memory.
    if (Object.keys(out).length >= 200) break;
    out[k.trim()] = v.trim();
  }
  return out;
}


/** Max characters per chat line (after trimming / control-char stripping). */
export const CHAT_MAX_LENGTH = 200;

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

/** Validates an inbound chat body and returns the cleaned text. */
export function parseChatMessage(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("chat message body required"), {
      code: "bad_protocol" as const,
    });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), {
      code: "bad_protocol" as const,
    });
  }
  if (typeof o.text !== "string") {
    throw Object.assign(new Error("chat text required"), { code: "bad_protocol" as const });
  }
  // Collapse whitespace and drop control characters so a line can't break layout.
  const text = o.text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
  if (!text) {
    throw Object.assign(new Error("chat text is empty"), { code: "bad_protocol" as const });
  }
  return text;
}

/**
 * Turn undo (unranked rooms only). A seat requests a rewind to the start of a
 * turn; the other seat accepts or declines. Practice clients auto-accept.
 */
export type UndoAction = "request" | "accept" | "decline" | "cancel";

/** Undo availability + any open request, pushed on join / sync / change. */
export type UndoStateMessage = {
  protocolVersion: ProtocolVersion;
  /** False in ranked rooms (undo is never offered there). */
  enabled: boolean;
  /** Turn an undo would rewind to right now, or null when nothing to undo. */
  targetTurn: number | null;
  /** Open request awaiting the other seat's answer. */
  pending: { from: Seat; toTurn: number } | null;
};

/** Broadcast after an accepted undo rewinds the match. */
export type UndoAppliedMessage = {
  protocolVersion: ProtocolVersion;
  toTurn: number;
  /** Seat that asked for the undo. */
  by: Seat;
};

/**
 * Rematch (unranked rooms): both seats "request", then the loser picks
 * "first" or "second"; "decline" withdraws / refuses.
 */
export type RematchAction = "request" | "decline" | "first" | "second";

export type RematchStateMessage = {
  protocolVersion: ProtocolVersion;
  /** Match is over, the room is unranked and both players are still here. */
  available: boolean;
  requested: [boolean, boolean];
  declinedBy: Seat | null;
  /** Set once both agreed: the loser, who picks first / second. */
  chooser: Seat | null;
};

export function parseRematchMessage(raw: unknown): RematchAction {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("rematch message body required"), { code: "bad_protocol" as const });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), { code: "bad_protocol" as const });
  }
  if (o.action !== "request" && o.action !== "decline" && o.action !== "first" && o.action !== "second") {
    throw Object.assign(new Error("rematch action must be request|decline|first|second"), {
      code: "bad_protocol" as const,
    });
  }
  return o.action;
}

export function parseUndoMessage(raw: unknown): UndoAction {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("undo message body required"), {
      code: "bad_protocol" as const,
    });
  }
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) {
    throw Object.assign(new Error("Unsupported or missing protocolVersion"), {
      code: "bad_protocol" as const,
    });
  }
  if (
    o.action !== "request" &&
    o.action !== "accept" &&
    o.action !== "decline" &&
    o.action !== "cancel"
  ) {
    throw Object.assign(new Error("undo action must be request|accept|decline|cancel"), {
      code: "bad_protocol" as const,
    });
  }
  return o.action;
}
