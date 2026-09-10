/**
 * Duel wire protocol — protocolVersion 1.
 * Intents / views come from @optcg/rules; this module only validates envelopes.
 */
import type { GameEvent, Intent, Seat } from "@optcg/rules";

export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type DuelJoinOptions = {
  protocolVersion: ProtocolVersion;
  devUserId: string;
  /** Required when server has DEV_JOIN_SECRET set. */
  secret?: string;
  preferredSeat?: Seat;
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
  seat: Seat;
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
  if (typeof o.devUserId !== "string" || !o.devUserId.trim()) {
    throw Object.assign(new Error("devUserId required"), { code: "unauthorized" as const });
  }
  const preferredSeat = o.preferredSeat;
  if (preferredSeat !== undefined && preferredSeat !== 0 && preferredSeat !== 1) {
    throw Object.assign(new Error("preferredSeat must be 0 or 1"), {
      code: "bad_protocol" as const,
    });
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    devUserId: o.devUserId.trim(),
    secret: typeof o.secret === "string" ? o.secret : undefined,
    preferredSeat: preferredSeat as Seat | undefined,
  };
}

export function parseCreateOptions(raw: unknown): {
  protocolVersion: ProtocolVersion;
  seed: number;
  autoSkipMulligan: boolean;
  players?: [PlayerDeckWire, PlayerDeckWire];
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
  let players: [PlayerDeckWire, PlayerDeckWire] | undefined;
  if (o.players !== undefined) {
    if (!Array.isArray(o.players) || o.players.length !== 2) {
      throw Object.assign(new Error("players must be a 2-tuple"), { code: "bad_protocol" as const });
    }
    const [a, b] = o.players as [unknown, unknown];
    players = [asPlayerDeck(a), asPlayerDeck(b)];
  }
  return { protocolVersion: PROTOCOL_VERSION, seed, autoSkipMulligan, players };
}

function asPlayerDeck(raw: unknown): PlayerDeckWire {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("player deck object required"), { code: "bad_protocol" as const });
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.leaderId !== "string" || !Array.isArray(o.deck)) {
    throw Object.assign(new Error("leaderId + deck[] required"), { code: "bad_protocol" as const });
  }
  if (!o.deck.every((x) => typeof x === "string")) {
    throw Object.assign(new Error("deck must be string[]"), { code: "bad_protocol" as const });
  }
  return { leaderId: o.leaderId, deck: o.deck as string[] };
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
