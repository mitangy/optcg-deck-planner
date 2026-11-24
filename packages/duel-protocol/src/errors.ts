import { isProtocolVersion } from "./constants.js";

export const ERROR_CODES = [
  "illegal_intent",
  "stale_intent",
  "match_not_ready",
  "match_over",
  "bad_protocol",
  "rate_limited",
  "unauthorized",
  "room_full",
  "unsupported_deck",
  "opponent_no_show",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Shown when an account that holds a seat tries to spectate the same match (#1371). */
export const SEATED_SPECTATOR_MESSAGE = "You're playing in this match, so you can't spectate it.";

export class ProtocolError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, code: ErrorCode = "bad_protocol") {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

export function errorCodeOf(e: unknown, fallback: ErrorCode): ErrorCode {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  return ERROR_CODES.find((c) => c === code) ?? fallback;
}

export function bad(message: string): ProtocolError {
  return new ProtocolError(message);
}

export function expectBody(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw bad(`${label} body required`);
  return raw as Record<string, unknown>;
}

export function expectEnvelope(raw: unknown, label: string): Record<string, unknown> {
  const o = expectBody(raw, label);
  if (!isProtocolVersion(o.protocolVersion)) throw bad("Unsupported or missing protocolVersion");
  return o;
}
