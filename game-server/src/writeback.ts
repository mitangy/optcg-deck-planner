import { Pool } from "pg";
import type { MatchReplay, SeatLog } from "@optcg/rules";
import { getApiBaseUrl, getDuelIngestSecret, getMatchOutboxDatabaseUrl } from "./env.js";

export type MatchResultPayload = {
  match_id: string;
  seat0_user_id: number;
  seat1_user_id: number;
  winner_seat: 0 | 1;
  reason: string;
  ranked: boolean;
  seat0_leader_id?: string;
  seat1_leader_id?: string;
  turns?: number;
  /** Seed, decks and intents; the backend stores it and never serves it to players. */
  replay?: MatchReplay;
  /** What each seat saw, turn by turn; the backend serves each player only their own. */
  seat_logs?: [SeatLog, SeatLog];
};
export interface OutboxDatabase {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
type Claimed = { match_id: string; payload: MatchResultPayload; attempts: number };

/** At-least-once delivery. The API commits each match_id only once. */
export class MatchResultOutbox {
  private running: Promise<void> | null = null;
  constructor(private db: OutboxDatabase, private send: typeof fetch = fetch) {}

  async initialize(): Promise<void> {
    await this.db.query(`CREATE TABLE IF NOT EXISTS duel_match_outbox (
      match_id varchar(64) PRIMARY KEY, payload jsonb NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      delivered_at timestamptz, last_error text
    )`);
    await this.db.query(`ALTER TABLE duel_match_outbox ADD COLUMN IF NOT EXISTS delivered_at timestamptz`);
    await this.db.query(`ALTER TABLE duel_match_outbox ADD COLUMN IF NOT EXISTS last_error text`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS duel_match_outbox_due ON duel_match_outbox (available_at) WHERE delivered_at IS NULL`);
  }

  async enqueue(payload: MatchResultPayload): Promise<void> {
    const result = await this.db.query<{ match_id: string }>(
      `INSERT INTO duel_match_outbox (match_id, payload) VALUES ($1, $2::jsonb)
       ON CONFLICT (match_id) DO UPDATE SET payload = duel_match_outbox.payload
       WHERE duel_match_outbox.payload = EXCLUDED.payload RETURNING match_id`,
      [payload.match_id, JSON.stringify(payload)],
    );
    if (!result.rows.length) throw new Error("Conflicting result for match_id");
  }

  drain(): Promise<void> {
    if (!this.running) this.running = this.drainBatch().finally(() => { this.running = null; });
    return this.running;
  }

  private async drainBatch(): Promise<void> {
    const claimed = await this.db.query<Claimed>(
      `UPDATE duel_match_outbox SET attempts = attempts + 1, locked_until = now() + interval '60 seconds'
       WHERE match_id IN (SELECT match_id FROM duel_match_outbox
         WHERE delivered_at IS NULL AND available_at <= now()
         AND (locked_until IS NULL OR locked_until < now())
         ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 10)
       RETURNING match_id, payload, attempts`,
    );
    // Every claimed row starts immediately, before its lease can expire.
    const deliveries = await Promise.allSettled(claimed.rows.map(row => this.deliver(row)));
    const failed = deliveries.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }

  private async deliver(row: Claimed): Promise<void> {
    let error: string | null = null;
    let terminal = false;
    try {
      const res = await this.send(`${getApiBaseUrl()}/duel/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Duel-Ingest-Token": getDuelIngestSecret() },
        body: JSON.stringify(row.payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        error = `HTTP ${res.status}`;
        terminal = [400, 409, 422].includes(res.status);
      }
      await res.body?.cancel();
    } catch {
      error = "Network failure or timeout";
    }
    // attempts fences out a worker whose lease expired. Retain delivered rows
    // so a repeated enqueue cannot send the same match again.
    if (!error) {
      await this.db.query(`UPDATE duel_match_outbox SET delivered_at = now(), locked_until = NULL, last_error = NULL
        WHERE match_id = $1 AND attempts = $2`, [row.match_id, row.attempts]);
      return;
    }
    console.warn(JSON.stringify({ event: "match_delivery_failed", matchId: row.match_id, error, terminal }));
    const delay = Math.min(300, 2 ** Math.min(row.attempts, 9)) + Math.floor(Math.random() * 5);
    await this.db.query(`UPDATE duel_match_outbox SET locked_until = NULL, last_error = $3,
      available_at = CASE WHEN $4 THEN 'infinity'::timestamptz ELSE now() + ($5 * interval '1 second') END
      WHERE match_id = $1 AND attempts = $2`, [row.match_id, row.attempts, error, terminal, delay]);
  }
}

let pool: Pool | null = null;
let outbox: MatchResultOutbox | null = null;
let drainTimer: ReturnType<typeof setInterval> | null = null;

export async function startMatchResultOutbox(): Promise<void> {
  if (outbox) return;
  const connectionString = getMatchOutboxDatabaseUrl();
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") throw new Error("MATCH_OUTBOX_DATABASE_URL (or DATABASE_URL) is required in production");
    console.warn("Match persistence disabled locally: configure MATCH_OUTBOX_DATABASE_URL to test ratings.");
    return;
  }
  pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000, max: 4 });
  pool.on("error", () => console.error("Outbox database connection failed; next operation will reconnect"));
  const candidate = new MatchResultOutbox(pool);
  try { await candidate.initialize(); } catch (error) { await pool.end(); pool = null; throw error; }
  outbox = candidate;
  const drain = () => void candidate.drain().catch(() => console.error("Outbox drain failed; retained rows will retry"));
  drain(); // Startup does not wait for a cold API or a delivery backlog.
  drainTimer = setInterval(drain, 5000);
  drainTimer.unref();
}

export async function stopMatchResultOutbox(): Promise<void> {
  if (drainTimer) clearInterval(drainTimer);
  drainTimer = null;
  await outbox?.drain().catch(() => undefined);
  await pool?.end();
  pool = null;
  outbox = null;
}

/** Resolves once durable; API delivery happens independently. */
export async function postMatchResult(payload: MatchResultPayload): Promise<void> {
  if (!outbox) throw new Error("Match result outbox is not configured");
  await outbox.enqueue(payload);
}
