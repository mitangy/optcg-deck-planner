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

/** Comma-separated browser origins allowed for CORS (duel-web / Expo web). */
export function getCorsOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGINS ??
    "http://localhost:8081,http://127.0.0.1:8081,http://localhost:5173,http://127.0.0.1:5173";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function getRedisUrl(): string | undefined {
  const s = process.env.REDIS_URL?.trim();
  return s ? s : undefined;
}
