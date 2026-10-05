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

const DEV_GAME_TOKEN_SECRET = "dev-change-me-in-production";

/** Shared with FastAPI GAME_TOKEN_SECRET / SESSION_SECRET. */
export function getGameTokenSecret(): string {
  return (
    process.env.GAME_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    DEV_GAME_TOKEN_SECRET
  );
}

/**
 * Refuse to start a production server whose game tokens anyone could sign
 * offline with the public dev secret. Bare devUserId joins are handled by
 * requireGameToken, which is always on in production.
 */
export function assertProductionAuthConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const secret = env.GAME_TOKEN_SECRET?.trim() || env.SESSION_SECRET?.trim() || DEV_GAME_TOKEN_SECRET;
  if (secret === DEV_GAME_TOKEN_SECRET) {
    throw new Error("GAME_TOKEN_SECRET must be set in production");
  }
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

/**
 * When true, join requires a valid gameToken (devUserId-only rejected).
 * Always on in production; REQUIRE_GAME_TOKEN only turns it on elsewhere.
 */
export function requireGameToken(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return (env.REQUIRE_GAME_TOKEN ?? "").toLowerCase() === "true";
}

export function getApiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

/** Shared Postgres used for durable match-result delivery in production. */
export function getMatchOutboxDatabaseUrl(): string | undefined {
  const value = process.env.MATCH_OUTBOX_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  return value || undefined;
}

export function getDuelIngestSecret(): string {
  return process.env.DUEL_INGEST_SECRET?.trim() || "dev-duel-ingest";
}

/** Disconnect grace before seat is freed (seconds). */
export function getReconnectGraceSeconds(): number {
  const raw = process.env.RECONNECT_GRACE_SECONDS ?? "120";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120;
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

/** Seconds a paired ranked room waits for both players before giving up. */
export function getRankedNoShowSeconds(): number {
  const n = Number(process.env.RANKED_NO_SHOW_SECONDS ?? "45");
  return Number.isFinite(n) && n > 0 ? n : 45;
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

/**
 * Optional full-match regex for extra CORS origins (e.g. Vercel branch URLs).
 * Anchored here so a pattern can never match a suffix of a hostile origin.
 */
export function getCorsOriginRegex(): RegExp | undefined {
  const raw = process.env.CORS_ORIGIN_REGEX?.trim();
  if (!raw) return undefined;
  return new RegExp(`^(?:${raw})$`);
}

export function getRedisUrl(): string | undefined {
  const s = process.env.REDIS_URL?.trim();
  return s ? s : undefined;
}
