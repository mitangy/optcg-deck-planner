/**
 * Duel wire protocol — protocolVersion 5 (generic effect choice requests).
 * Message types, constants and envelope parsers live in @optcg/duel-protocol (shared with duel-web); this module
 * re-exports them and keeps the two parsers that need the game server's own modules or the engine's runtime:
 * room creation options (seed / first-seat guards, bot levels) and intents (validated by @optcg/rules).
 */
import { BOT_LEVELS, parseIntent, type BotLevel, type Intent, type Seat } from "@optcg/rules";
import {
  PROTOCOL_VERSION,
  asPlayerDeck,
  bad,
  expectEnvelope,
  isProtocolVersion,
  type BotRoomOptions,
  type PlayerDeckWire,
  type ProtocolVersion,
} from "@optcg/duel-protocol";
import { gameFirstSeat, gameSeed } from "./matchmakeGuard.js";

export * from "@optcg/duel-protocol";

/** Ranked games give each player a 15 minute chess clock (30 minutes total). */
export const RANKED_SEAT_SECONDS = 15 * 60;

export function parseCreateOptions(raw: unknown): {
  protocolVersion: ProtocolVersion;
  seed: number;
  /** Seat that goes first in the room's first game. */
  firstSeat: Seat;
  autoSkipMulligan: boolean;
  /** Ask for the opening dice roll (#1190); deployed servers roll regardless. */
  diceRoll: boolean;
  ranked: boolean;
  seatUserIds?: [number, number];
  players?: [PlayerDeckWire, PlayerDeckWire];
  bot?: BotRoomOptions;
  timer: { turnSeconds: number | null; matchSeconds: number | null; seatSeconds: number | null };
} {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (o.protocolVersion !== undefined && !isProtocolVersion(o.protocolVersion)) {
    throw bad("Unsupported protocolVersion on create");
  }
  const seed = gameSeed(
    typeof o.seed === "number" && Number.isFinite(o.seed) ? Math.floor(o.seed) : undefined,
  );
  if (o.firstSeat !== undefined && o.firstSeat !== 0 && o.firstSeat !== 1) {
    throw bad("firstSeat must be 0 or 1");
  }
  const firstSeat = gameFirstSeat(o.firstSeat as Seat | undefined);
  const autoSkipMulligan = o.autoSkipMulligan !== false;
  const diceRoll = o.diceRoll === true;
  // A browser can create a public `duel` room directly. DuelRoom decides
  // whether this request is actually ranked after verifying its attestation.
  let bot: BotRoomOptions | undefined;
  if (o.bot !== undefined) {
    const b = o.bot && typeof o.bot === "object" ? (o.bot as Record<string, unknown>) : null;
    if (!b || typeof b.level !== "string" || !BOT_LEVELS.includes(b.level as BotLevel)) {
      throw bad(`bot.level must be one of ${BOT_LEVELS.join(", ")}`);
    }
    bot = { level: b.level as BotLevel, deck: asPlayerDeck(b.deck) };
  }
  // A bot room is never ranked, whatever else the options say.
  const ranked = o.ranked === true && !bot;
  let seatUserIds: [number, number] | undefined;
  if (o.seatUserIds !== undefined) {
    if (!Array.isArray(o.seatUserIds) || o.seatUserIds.length !== 2) {
      throw bad("seatUserIds must be a 2-tuple");
    }
    const [a, b] = o.seatUserIds as [unknown, unknown];
    if (
      typeof a !== "number" ||
      typeof b !== "number" ||
      !Number.isSafeInteger(a) ||
      !Number.isSafeInteger(b) ||
      a === b
    ) {
      throw bad("seatUserIds must be distinct integers");
    }
    seatUserIds = [a, b];
  }
  let players: [PlayerDeckWire, PlayerDeckWire] | undefined;
  if (o.players !== undefined) {
    if (!Array.isArray(o.players) || o.players.length !== 2) {
      throw bad("players must be a 2-tuple");
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
  // Ranked always enforces a 15 minute chess clock per player: no shared match clock, no per-turn limit.
  if (ranked) {
    turnSeconds = null;
    matchSeconds = null;
    seatSeconds = RANKED_SEAT_SECONDS;
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    seed,
    firstSeat,
    autoSkipMulligan,
    diceRoll,
    ranked,
    seatUserIds: bot ? undefined : seatUserIds,
    players,
    bot,
    timer: { turnSeconds, matchSeconds, seatSeconds },
  };
}

export function parseIntentMessage(raw: unknown): Intent {
  const o = expectEnvelope(raw, "intent message");
  if (
    !o.intent ||
    typeof o.intent !== "object" ||
    typeof (o.intent as { type?: unknown }).type !== "string"
  ) {
    throw bad("intent object with type required");
  }
  // The engine indexes arrays with intent fields, so the shape is checked here (refactor 0.2).
  const parsed = parseIntent(o.intent);
  if (!parsed.ok) {
    throw bad(parsed.message);
  }
  return parsed.intent;
}

