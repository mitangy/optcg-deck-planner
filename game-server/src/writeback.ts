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
/** A game with no result yet: its log so far. The backend keeps only the latest per match. */
export type MatchProgressPayload = Pick<
  MatchResultPayload,
  "seat0_user_id" | "seat1_user_id" | "ranked" | "seat0_leader_id" | "seat1_leader_id" | "turns" | "replay" | "seat_logs"
> & {
  /**
   * The room is closing without a result: this is the game's last log and must
   * be stored durably. Live turn snapshots leave it out, so the API may keep
   * them in Redis instead of writing Postgres every turn.
   */
  final?: true;
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

  /**
   * Milliseconds until the next undelivered row is due (0 when one is due now),
   * or null when nothing is waiting. Rows another process holds count from the
   * end of its lease; rows parked forever ('infinity') never wake anyone.
   */
  async nextDueInMs(): Promise<number | null> {
    const { rows } = await this.db.query<{ wait_ms: number | string | null }>(
      `SELECT EXTRACT(EPOCH FROM (MIN(GREATEST(available_at, COALESCE(locked_until, available_at))) - now())) * 1000 AS wait_ms
       FROM duel_match_outbox WHERE delivered_at IS NULL AND available_at < 'infinity'::timestamptz`,
    );
    const wait = rows[0]?.wait_ms;
    // MIN over no rows is NULL: nothing is waiting.
    return wait === null || wait === undefined ? null : Math.max(0, Math.ceil(Number(wait)));
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

/**
 * Drains the outbox only when there is something to send: after an enqueue, at
 * startup, and when a failed delivery's retry falls due. An idle game server
 * sends the database nothing, so a serverless Postgres (Neon) can scale to zero.
 */
export class OutboxScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  constructor(
    private outbox: Pick<MatchResultOutbox, "enqueue" | "drain" | "nextDueInMs">,
    private setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    },
    private clearTimer: (t: ReturnType<typeof setTimeout>) => void = clearTimeout,
    /** Floor between drains, so a row due "now" that another process holds cannot spin. */
    private minWaitMs = 1000,
  ) {}

  /** Durably queue a result, then deliver it right away. */
  async enqueue(payload: MatchResultPayload): Promise<void> {
    await this.outbox.enqueue(payload);
    void this.kick();
  }

  /** Drain now (or right after the drain in progress) and schedule the next due retry. */
  kick(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }

  private async run(): Promise<void> {
    do {
      this.again = false;
      if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
      try {
        await this.outbox.drain();
      } catch {
        console.error("Outbox drain failed; retained rows will retry");
      }
    } while (this.again && !this.stopped);
    let wait: number | null;
    try {
      wait = await this.outbox.nextDueInMs();
    } catch {
      // Can't tell what is pending (database unreachable): look again later.
      wait = 30_000;
    }
    if (wait === null || this.stopped) return;
    this.timer = this.setTimer(() => { this.timer = null; void this.kick(); }, Math.max(this.minWaitMs, wait));
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    await this.running;
  }
}

let pool: Pool | null = null;
let outbox: MatchResultOutbox | null = null;
let scheduler: OutboxScheduler | null = null;

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
  scheduler = new OutboxScheduler(candidate);
  void scheduler.kick(); // Startup does not wait for a cold API or a delivery backlog.
}

export async function stopMatchResultOutbox(): Promise<void> {
  await scheduler?.stop();
  scheduler = null;
  await outbox?.drain().catch(() => undefined);
  await pool?.end();
  pool = null;
  outbox = null;
}

/** Resolves once durable; API delivery happens independently. */
export async function postMatchResult(payload: MatchResultPayload): Promise<void> {
  if (!scheduler) throw new Error("Match result outbox is not configured");
  await scheduler.enqueue(payload);
}

/**
 * Sends a game's progress snapshots one at a time, newest wins: a snapshot that
 * arrives while one is in flight replaces any still waiting. A failed send is
 * dropped, since the next turn's snapshot carries everything it had.
 */
export class LatestOnlySender<T> {
  private next: T | null = null;
  private sending: Promise<void> | null = null;
  constructor(private send: (payload: T) => Promise<void>, private onError: (error: unknown) => void = () => {}) {}

  push(payload: T): Promise<void> {
    this.next = payload;
    if (!this.sending) this.sending = this.pump().finally(() => { this.sending = null; });
    return this.sending;
  }

  private async pump(): Promise<void> {
    while (this.next !== null) {
      const payload = this.next;
      this.next = null;
      try {
        await this.send(payload);
      } catch (error) {
        this.onError(error);
      }
    }
  }
}

/** Save an unfinished game's log so far. Best effort: the next snapshot retries. */
export async function postMatchProgress(matchId: string, payload: MatchProgressPayload): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/duel/matches/${encodeURIComponent(matchId)}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Duel-Ingest-Token": getDuelIngestSecret() },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
