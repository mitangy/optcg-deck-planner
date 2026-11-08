import { isProtocolVersion } from "./constants.js";

/** Codes a duel room reports in an `error` message. */
export const ERROR_CODES = [
  "illegal_intent",
  "match_not_ready",
  "match_over",
  "bad_protocol",
  "rate_limited",
  "unauthorized",
  "room_full",
  "unsupported_deck",
  /** Ranked: the paired opponent never joined the match room. */
  "opponent_no_show",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** A client message the server refuses; `code` is what the client is told. */
export class ProtocolError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, code: ErrorCode = "bad_protocol") {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

/** The code an error carries (a ProtocolError, or any error tagged with a known code), else `fallback`. */
export function errorCodeOf(e: unknown, fallback: ErrorCode): ErrorCode {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  return ERROR_CODES.find((c) => c === code) ?? fallback;
}

/** `new ProtocolError(message)`: the usual "bad_protocol" refusal. */
export function bad(message: string): ProtocolError {
  return new ProtocolError(message);
}

/** A message body that must be an object. */
export function expectBody(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw bad(`${label} body required`);
  return raw as Record<string, unknown>;
}

/** A message body that must be an object carrying the current protocolVersion. */
export function expectEnvelope(raw: unknown, label: string): Record<string, unknown> {
  const o = expectBody(raw, label);
  if (!isProtocolVersion(o.protocolVersion)) throw bad("Unsupported or missing protocolVersion");
  return o;
}
