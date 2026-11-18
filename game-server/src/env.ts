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

export function getGameTokenSecret(): string {
  return (
    process.env.GAME_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    DEV_GAME_TOKEN_SECRET
  );
}

// The public dev secret would let anyone sign game tokens offline.
export function assertProductionAuthConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const secret = env.GAME_TOKEN_SECRET?.trim() || env.SESSION_SECRET?.trim() || DEV_GAME_TOKEN_SECRET;
  if (secret === DEV_GAME_TOKEN_SECRET) {
    throw new Error("GAME_TOKEN_SECRET must be set in production");
  }
}

// Random per-process fallback stops a browser forging it while keeping dev zero-config; multi-process pools must share one.
export function getRankedMatchCreateSecret(): string {
  return process.env.RANKED_MATCH_CREATE_SECRET?.trim() || localRankedMatchCreateSecret;
}

export function isRankedMatchCreateAttested(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const expected = Buffer.from(getRankedMatchCreateSecret());
  const supplied = Buffer.from(value);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function requireGameToken(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return (env.REQUIRE_GAME_TOKEN ?? "").toLowerCase() === "true";
}

export function getApiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

// Lets friends find a room after the API's pool pointer moves to another pool; validated like that pointer.
export function getPoolUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.POOL_URL?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  return raw;
}

export function getMatchOutboxDatabaseUrl(): string | undefined {
  const value = process.env.MATCH_OUTBOX_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  return value || undefined;
}

const DEV_DUEL_INGEST_SECRET = "dev-duel-ingest";

export function getDuelIngestSecret(): string {
  return process.env.DUEL_INGEST_SECRET?.trim() || DEV_DUEL_INGEST_SECRET;
}

// The environment is managed outside this repo, so production still starts with the public default; anyone knowing it can post match results.
export function warnIfDefaultIngestSecretInProduction(
  env: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = console.error,
): boolean {
  if (env.NODE_ENV !== "production") return false;
  if (env.DUEL_INGEST_SECRET?.trim()) return false;
  log(
    `[SECURITY] DUEL_INGEST_SECRET is not set in production: the public default "${DEV_DUEL_INGEST_SECRET}" authenticates match-result and presence calls to the API. Set DUEL_INGEST_SECRET (the same value on the API).`,
  );
  return true;
}

export function getReconnectGraceSeconds(): number {
  const raw = process.env.RECONNECT_GRACE_SECONDS ?? "120";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

// Default 15s is too short for free-tier cold starts: the WS connect races the reservation ("seat reservation expired").
export function getSeatReservationSeconds(): number {
  const raw = process.env.COLYSEUS_SEAT_RESERVATION_TIME ?? "90";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

export function getRankedNoShowSeconds(): number {
  const n = Number(process.env.RANKED_NO_SHOW_SECONDS ?? "45");
  return Number.isFinite(n) && n > 0 ? n : 45;
}

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

// Anchored so a pattern can never match a suffix of a hostile origin.
export function getCorsOriginRegex(): RegExp | undefined {
  const raw = process.env.CORS_ORIGIN_REGEX?.trim();
  if (!raw) return undefined;
  return new RegExp(`^(?:${raw})$`);
}

export function getRedisUrl(): string | undefined {
  const s = process.env.REDIS_URL?.trim();
  return s ? s : undefined;
}
