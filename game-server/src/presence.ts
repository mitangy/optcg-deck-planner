import { randomUUID } from "node:crypto";
import { getApiBaseUrl, getDuelIngestSecret, getPoolUrl } from "./env.js";

export type PresenceEntry = {
  user_id: number;
  room_id: string;
  role: "player" | "spectator";
  phase: "waiting" | "playing" | "finished";
  ranked: boolean;
  server_url?: string;
};

export type Takedown = { user_id: number; kind: "playmat" | "cardBack"; cosmetic_id: number };

export interface PresenceSource {
  presenceEntries(): PresenceEntry[];
}

// Each push replaces this process's rows and the API ignores stale rows, so a missed push or a crashed process heals on its own.
export class PresenceReporter {
  private sources = new Set<PresenceSource>();
  private started = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSentEmpty = false;
  private takedownListeners = new Set<(list: Takedown[]) => void>();

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

  onTakedowns(listener: (list: Takedown[]) => void): () => void {
    this.takedownListeners.add(listener);
    return () => this.takedownListeners.delete(listener);
  }

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
    const serverUrl = getPoolUrl();
    for (const source of this.sources) {
      for (const entry of source.presenceEntries()) {
        if (entry.user_id > 0) out.push(serverUrl ? { ...entry, server_url: serverUrl } : entry);
      }
    }
    return out;
  }

  async flush(): Promise<void> {
    const entries = this.snapshot();
    try {
      const res = await this.send(`${getApiBaseUrl()}/duel/presence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Duel-Ingest-Token": getDuelIngestSecret() },
        body: JSON.stringify({ instance_id: this.instanceId, entries }),
        signal: AbortSignal.timeout(10000),
      });
      this.lastSentEmpty = res.ok && entries.length === 0;
      if (!res.ok) console.warn(`Presence push failed: HTTP ${res.status}`);
      else await this.relayTakedowns(res);
    } catch {
      // A cold or unreachable API just means friends see stale status until the next beat.
      console.warn("Presence push failed; will retry on the next heartbeat");
    }
  }

  private async relayTakedowns(res: Response): Promise<void> {
    if (this.takedownListeners.size === 0) return;
    let list: Takedown[] = [];
    try {
      const body = (await res.json()) as { takedowns?: unknown };
      if (Array.isArray(body.takedowns)) {
        list = body.takedowns.filter(
          (t): t is Takedown =>
            !!t &&
            typeof t.user_id === "number" &&
            typeof t.cosmetic_id === "number" &&
            (t.kind === "playmat" || t.kind === "cardBack"),
        );
      }
    } catch {
      return; // 204 / empty / not JSON: an API from before takedowns
    }
    this.deliverTakedowns(list);
  }

  /** Hand takedowns to every listener (a throwing listener never blocks the others). */
  deliverTakedowns(list: Takedown[]): void {
    if (list.length === 0) return;
    for (const listener of this.takedownListeners) {
      try {
        listener(list);
      } catch (e) {
        console.warn("Takedown listener failed", e);
      }
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.flush();
    this.heartbeat = setInterval(() => void this.beat(), this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  // With nobody in a room and the empty snapshot already delivered, skip the beat so the API's database can sleep.
  private async beat(): Promise<void> {
    if (this.lastSentEmpty && this.snapshot().length === 0) return;
    await this.flush();
  }

  stop(): void {
    this.started = false;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.debounce = null;
    this.heartbeat = null;
  }
}

export const presence = new PresenceReporter();
