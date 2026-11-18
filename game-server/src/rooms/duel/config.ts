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
export type EnvConfig = {
  devJoinSecret: string | undefined;
  requireGameToken: boolean;
  reconnectGraceSeconds: number;
  seatReservationSeconds: number;
  rankedNoShowSeconds: number;
  outboxEnabled: boolean;
};

export type RoomConfig = EnvConfig & {
  seed: number;
  firstSeat: Seat;
  autoSkipMulligan: boolean;
  diceRoll: boolean;
  /** Elo and rated rules: only true when the in-process matchmaker attested the create. */
  ranked: boolean;
  requestedRanked: boolean;
  timer: { turnSeconds: number | null; matchSeconds: number | null; seatSeconds: number | null };
  bot: BotRoomOptions | undefined;
  players: [PlayerDeckWire, PlayerDeckWire] | undefined;
  seatUserIds: [number, number] | undefined;
};

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
