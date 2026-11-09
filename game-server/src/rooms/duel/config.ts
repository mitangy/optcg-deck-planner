import type { Seat } from "@optcg/rules";
import {
  getDevJoinSecret,
  getMatchOutboxDatabaseUrl,
  getRankedNoShowSeconds,
  getReconnectGraceSeconds,
  getSeatReservationSeconds,
  isRankedMatchCreateAttested,
  requireGameToken,
} from "../../env.js";
import type { BotRoomOptions, PlayerDeckWire, parseCreateOptions } from "../../protocol.js";
/** What a room takes from the server's environment (the deployment's settings), read once when the room is created. */
export type EnvConfig = {
  /** When set, join options must carry this secret (legacy dev joins). */
  devJoinSecret: string | undefined;
  /** Joins need a valid gameToken (always on in production). */
  requireGameToken: boolean;
  /** How long a dropped seat may reclaim itself. */
  reconnectGraceSeconds: number;
  /** How long Colyseus holds a matchmake seat for the socket. */
  seatReservationSeconds: number;
  /** How long a paired ranked room waits for both players. */
  rankedNoShowSeconds: number;
  /** Results can be written to the outbox (a deployed server, or one with MATCH_OUTBOX_DATABASE_URL set). */
  outboxEnabled: boolean;
};

/** Everything that shapes one room, fixed at creation: its create options plus the environment. */
export type RoomConfig = EnvConfig & {
  seed: number;
  /** Seat that goes first in the room's first game (a coin flip on deployed servers, #549). */
  firstSeat: Seat;
  autoSkipMulligan: boolean;
  /** The first game's turn order is decided by a dice roll (#1190): every deployed server, else only when the create asked. Practice rooms never roll. */
  diceRoll: boolean;
  /** Elo and rated rules: only true when the in-process matchmaker attested the create. */
  ranked: boolean;
  /** The create request's own `ranked` flag, before the attestation check. */
  requestedRanked: boolean;
  timer: { turnSeconds: number | null; matchSeconds: number | null; seatSeconds: number | null };
  /** The server-side player of a "Play vs Bot" room. */
  bot: BotRoomOptions | undefined;
  /** Decks the room was created with (seat order). */
  players: [PlayerDeckWire, PlayerDeckWire] | undefined;
  /** A paired ranked room: the accounts that may sit, in seat order. */
  seatUserIds: [number, number] | undefined;
};

/** The environment as deployed servers read it. Production source of every `EnvConfig` field. */
export function readEnvConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  return {
    devJoinSecret: getDevJoinSecret(),
    requireGameToken: requireGameToken(env),
    reconnectGraceSeconds: getReconnectGraceSeconds(),
    seatReservationSeconds: getSeatReservationSeconds(),
    rankedNoShowSeconds: getRankedNoShowSeconds(),
    outboxEnabled: Boolean(getMatchOutboxDatabaseUrl()) || env.NODE_ENV === "production",
  };
}

/**
 * Tests set `override` to give every new room these environment settings instead of mutating
 * `process.env` (null, the default, is the real environment).
 */
export const roomEnvSource: { override: Partial<EnvConfig> | null } = { override: null };

/** Build a room's config from its create options. Never trusts a browser-provided `ranked: true`: only the matchmaker's attestation makes a room ranked. */
export function buildRoomConfig(options: unknown, parsed: ReturnType<typeof parseCreateOptions>): RoomConfig {
  const attestation =
    options && typeof options === "object" ? (options as { rankedAttestation?: unknown }).rankedAttestation : undefined;
  const env = { ...readEnvConfig(), ...roomEnvSource.override };
  return {
    ...env,
    seed: parsed.seed,
    firstSeat: parsed.firstSeat,
    autoSkipMulligan: parsed.autoSkipMulligan,
    diceRoll: env.requireGameToken || parsed.diceRoll,
    ranked: parsed.ranked && isRankedMatchCreateAttested(attestation),
    requestedRanked: parsed.ranked,
    timer: parsed.timer,
    bot: parsed.bot,
    players: parsed.players,
    seatUserIds: parsed.seatUserIds,
  };
}
