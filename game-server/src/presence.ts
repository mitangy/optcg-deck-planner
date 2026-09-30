import { randomUUID } from "node:crypto";
import { getApiBaseUrl, getDuelIngestSecret } from "./env.js";

/** One user in one room, as reported to the API for the friends list. */
export type PresenceEntry = {
  user_id: number;
  room_id: string;
  role: "player" | "spectator";
  phase: "waiting" | "playing" | "finished";
  ranked: boolean;
};

export interface PresenceSource {
  presenceEntries(): PresenceEntry[];
}

/**
 * Pushes a full snapshot of who is in which room to FastAPI
 * (`PUT /duel/presence`). Each push replaces this process's previous rows, and
 * the API ignores rows it has not heard about recently, so a missed push or a
 * crashed process heals on its own. Changes push after a short debounce; a
 * heartbeat re-sends the snapshot so rows stay fresh during long games.
 */
export class PresenceReporter {
  private sources = new Set<PresenceSource>();
  private started = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private send: typeof fetch = fetch,
    readonly instanceId: string = randomUUID(),
    private debounceMs = 1000,
    private heartbeatMs = 15000,
  ) {}

  register(source: PresenceSource): void {
    this.sources.add(source);
    this.markDirty();
  }

  unregister(source: PresenceSource): void {
    this.sources.delete(source);
    this.markDirty();
  }

  /** Something about seats or phase changed; push soon (no-op until started). */
  markDirty(): void {
    if (!this.started || this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.flush();
    }, this.debounceMs);
    this.debounce.unref?.();
  }

  /** Entries for real accounts only (legacy devUserId seats have synthetic negative ids). */
  snapshot(): PresenceEntry[] {
    const out: PresenceEntry[] = [];
    for (const source of this.sources) {
      for (const entry of source.presenceEntries()) {
        if (entry.user_id > 0) out.push(entry);
      }
    }
    return out;
  }

  async flush(): Promise<void> {
    try {
      const res = await this.send(`${getApiBaseUrl()}/duel/presence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Duel-Ingest-Token": getDuelIngestSecret() },
        body: JSON.stringify({ instance_id: this.instanceId, entries: this.snapshot() }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) console.warn(`Presence push failed: HTTP ${res.status}`);
    } catch {
      // A cold or unreachable API just means friends see stale status until the next beat.
      console.warn("Presence push failed; will retry on the next heartbeat");
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.flush();
    this.heartbeat = setInterval(() => void this.flush(), this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  stop(): void {
    this.started = false;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.debounce = null;
    this.heartbeat = null;
  }
}

/** Process-wide reporter; `index.ts` starts it, tests leave it idle. */
export const presence = new PresenceReporter();
