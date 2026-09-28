import { randomBytes, timingSafeEqual } from "node:crypto";

const localRankedMatchCreateSecret = randomBytes(32).toString("base64url");

export function getPort(): number {
  const raw = process.env.PORT ?? "2567";
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

/** When set, join options must include matching `secret` (legacy Step 2/3). */
export function getDevJoinSecret(): string | undefined {
  const s = process.env.DEV_JOIN_SECRET?.trim();
  return s ? s : undefined;
}

export function getLogLevel(): "debug" | "info" | "warn" {
  const v = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (v === "debug" || v === "warn") return v;
  return "info";
}

/** Shared with FastAPI GAME_TOKEN_SECRET / SESSION_SECRET. */
export function getGameTokenSecret(): string {
  return (
    process.env.GAME_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "dev-change-me-in-production"
  );
}

/**
 * Internal capability used only when the matchmaker creates a ranked room.
 * A random per-process fallback keeps local development zero-config while
 * preventing a browser from forging the value. Multi-process deployments
 * should set RANKED_MATCH_CREATE_SECRET to a shared secret.
 */
export function getRankedMatchCreateSecret(): string {
  return process.env.RANKED_MATCH_CREATE_SECRET?.trim() || localRankedMatchCreateSecret;
}

export function isRankedMatchCreateAttested(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const expected = Buffer.from(getRankedMatchCreateSecret());
  const supplied = Buffer.from(value);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** When true, join requires a valid gameToken (devUserId-only rejected). */
export function requireGameToken(): boolean {
  return (process.env.REQUIRE_GAME_TOKEN ?? "").toLowerCase() === "true";
}

export function getApiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

export function getDuelIngestSecret(): string {
  return process.env.DUEL_INGEST_SECRET?.trim() || "dev-duel-ingest";
}

/** Disconnect grace before seat is freed (seconds). */
export function getReconnectGraceSeconds(): number {
  const raw = process.env.RECONNECT_GRACE_SECONDS ?? "60";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/**
 * How long Colyseus holds a matchmake seat before the WebSocket must consume it.
 * Default 15s is too short for free-tier cold starts (HTTP matchmake succeeds,
 * then WS connect races the reservation → "seat reservation expired.").
 */
export function getSeatReservationSeconds(): number {
  const raw = process.env.COLYSEUS_SEAT_RESERVATION_TIME ?? "90";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** Comma-separated browser origins allowed for CORS (duel-web / Expo web). */
export function getCorsOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGINS ??
    [
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ].join(",");
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function getRedisUrl(): string | undefined {
  const s = process.env.REDIS_URL?.trim();
  return s ? s : undefined;
}
