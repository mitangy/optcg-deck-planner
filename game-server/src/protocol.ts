/**
 * Duel wire protocol — protocolVersion 3.
 * Intents / views come from @optcg/rules; this module only validates envelopes.
 */
import type { GameEvent, Intent, Seat } from "@optcg/rules";

export const PROTOCOL_VERSION = 3 as const;

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
   * Optional clocks. Ranked queue always forces turnSeconds=30.
   * Omit / 0 = disabled for that clock.
   */
  timer?: {
    turnSeconds?: number;
    matchSeconds?: number;
  };
};

export type ErrorCode =
  | "illegal_intent"
  | "match_not_ready"
  | "match_over"
  | "bad_protocol"
  | "rate_limited"
  | "unauthorized"
  | "room_full";

export type WelcomeMessage = {
  protocolVersion: ProtocolVersion;
  matchId: string;
  /** Player seat, or camera seat when role is spectator. */
  seat: Seat;
  role?: "player" | "spectator";
  view: unknown;
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
  timer: { turnSeconds: number | null; matchSeconds: number | null };
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
  const ranked = o.ranked !== false;
  let seatUserIds: [number, number] | undefined;
  if (o.seatUserIds !== undefined) {
    if (!Array.isArray(o.seatUserIds) || o.seatUserIds.length !== 2) {
      throw Object.assign(new Error("seatUserIds must be a 2-tuple"), {
        code: "bad_protocol" as const,
      });
    }
    const [a, b] = o.seatUserIds as [unknown, unknown];
    if (typeof a !== "number" || typeof b !== "number") {
      throw Object.assign(new Error("seatUserIds must be numbers"), {
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
  if (turnSeconds === 0) turnSeconds = null;
  if (matchSeconds === 0) matchSeconds = null;
  // Ranked always enforces 30s player turns (match clock remains optional).
  if (ranked) {
    turnSeconds = 30;
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    seed,
    autoSkipMulligan,
    ranked,
    seatUserIds,
    players,
    timer: { turnSeconds, matchSeconds },
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

