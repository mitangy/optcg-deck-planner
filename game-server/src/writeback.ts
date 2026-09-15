import { Pool } from "pg";
import { getApiBaseUrl, getDuelIngestSecret, getLogLevel, getMatchOutboxDatabaseUrl } from "./env.js";

export type MatchResultPayload = {
  match_id: string;
  seat0_user_id: number;
  seat1_user_id: number;
  winner_seat: 0 | 1;
  reason: string;
  ranked: boolean;
};

let pool: Pool | null = null;
let drainTimer: ReturnType<typeof setInterval> | null = null;

export async function startMatchResultOutbox(): Promise<void> {
  const connectionString = getMatchOutboxDatabaseUrl();
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MATCH_OUTBOX_DATABASE_URL (or DATABASE_URL) is required in production");
    }
    log("warn", "match_outbox_disabled", { reason: "no database configured" });
    return;
  }
  pool = new Pool({ connectionString });
  await pool.query(`CREATE TABLE IF NOT EXISTS duel_match_outbox (
    match_id varchar(64) PRIMARY KEY,
    payload jsonb NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await drainMatchResultOutbox();
  drainTimer = setInterval(() => void drainMatchResultOutbox(), 5000);
}

export async function stopMatchResultOutbox(): Promise<void> {
  if (drainTimer) clearInterval(drainTimer);
  drainTimer = null;
  await pool?.end();
  pool = null;
}

/** Persist first; transient API failures are retried by the durable outbox. */
export async function postMatchResult(payload: MatchResultPayload): Promise<void> {
  if (!pool) {
    await deliver(payload);
    return;
  }
  await pool.query(
    `INSERT INTO duel_match_outbox (match_id, payload) VALUES ($1, $2::jsonb)
     ON CONFLICT (match_id) DO NOTHING`,
    [payload.match_id, JSON.stringify(payload)],
  );
  await drainMatchResultOutbox();
}

export async function drainMatchResultOutbox(): Promise<void> {
  if (!pool) return;
  const claimed = await pool.query<{ match_id: string; payload: MatchResultPayload; attempts: number }>(
    `UPDATE duel_match_outbox SET attempts = attempts + 1, locked_until = now() + interval '30 seconds'
     WHERE match_id IN (SELECT match_id FROM duel_match_outbox
       WHERE available_at <= now() AND (locked_until IS NULL OR locked_until < now())
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 25)
     RETURNING match_id, payload, attempts`,
  );
  for (const row of claimed.rows) {
    const ok = await deliver(row.payload);
    if (ok) {
      await pool.query("DELETE FROM duel_match_outbox WHERE match_id = $1", [row.match_id]);
    } else {
      const seconds = Math.min(300, 2 ** Math.min(row.attempts, 8));
      await pool.query(
        `UPDATE duel_match_outbox SET locked_until = NULL, available_at = now() + ($2 * interval '1 second') WHERE match_id = $1`,
        [row.match_id, seconds],
      );
    }
  }
}

async function deliver(payload: MatchResultPayload): Promise<boolean> {
  const url = `${getApiBaseUrl()}/duel/matches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Duel-Ingest-Token": getDuelIngestSecret(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      log("warn", "match_ingest_failed", {
        status: res.status,
        body: text.slice(0, 200),
        matchId: payload.match_id,
      });
      return false;
    }
    log("info", "match_ingest_ok", { matchId: payload.match_id });
    return true;
  } catch (e) {
    log("warn", "match_ingest_error", {
      matchId: payload.match_id,
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

function log(level: "info" | "warn", event: string, data: Record<string, unknown>) {
  const configured = getLogLevel();
  const order = { debug: 0, info: 1, warn: 2 } as const;
  if (order[level] < order[configured]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
  if (level === "warn") console.warn(line);
  else console.log(line);
}
