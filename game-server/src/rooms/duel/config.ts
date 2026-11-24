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
import { verifyTournamentTicket } from "../../tournamentTicket.js";
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
  seedPinned: boolean;
  firstSeat: Seat;
  autoSkipMulligan: boolean;
  diceRoll: boolean;
  /** Elo and rated rules: only true when the in-process matchmaker attested the create. */
  ranked: boolean;
  requestedRanked: boolean;
  /** A valid backend ticket: hands stay hidden from spectators, no undo, and only the ticketed accounts may play. */
  tournament: boolean;
  tournamentSeats: [number, number] | undefined;
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
  const ranked = parsed.ranked && isRankedMatchCreateAttested(attestation);
  // A missing or bad ticket only means this is not a tournament room. A bot or ranked room never is one.
  const ticket = ranked || parsed.bot ? null : verifyTournamentTicket(parsed.tournamentTicket);
  return {
    ...env,
    seed: parsed.seed,
    seedPinned: parsed.seedPinned,
    firstSeat: parsed.firstSeat,
    autoSkipMulligan: parsed.autoSkipMulligan,
    diceRoll: env.requireGameToken || parsed.diceRoll,
    ranked,
    requestedRanked: parsed.ranked,
    tournament: ticket !== null,
    tournamentSeats: ticket?.seats,
    timer: parsed.timer,
    bot: parsed.bot,
    players: parsed.players,
    seatUserIds: parsed.seatUserIds,
  };
}
