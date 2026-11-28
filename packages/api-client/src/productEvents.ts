/**
 * Funnel events (#1499): a small queue the apps push to and flush in batches to `POST /events`.
 *
 * Batches go out through `navigator.sendBeacon` so a tab that is closing still delivers them. The body is
 * `text/plain` on purpose: a JSON content type would make the browser send a CORS preflight a beacon cannot
 * wait for. Nothing identifying is sent: `anon_id` is a random id the page made up.
 */

export type ProductEventName =
  | "landing"
  | "home_view"
  | "deck_picked"
  | "game_start"
  | "game_done"
  | "signup_prompt_shown"
  | "review_opened"
  | "planner_open_from_duel"
  | "setting_changed";

export type ProductEventProps = { mode?: string; leader?: string; key?: string; path?: string };

export type ProductEventsOptions = {
  app: "duel" | "planner";
  /** Full URL of `POST /events`; read at flush time so a late-resolved base URL still works. */
  endpoint: () => string;
  /** Random client id (not PII); read at flush time. */
  anonId: () => string | null;
  /** Automated browsers (`navigator.webdriver`) send nothing unless a test sets this. */
  allowAutomation?: boolean;
  flushMs?: number;
  /** Test seams; default to the browser's. */
  env?: ProductEventsEnv;
};

export type ProductEventsEnv = {
  isAutomated: () => boolean;
  sendBeacon: ((url: string, data: Blob) => boolean) | null;
  fetchKeepalive: ((url: string, body: string) => void) | null;
  listen: (onHide: () => void) => () => void;
  setInterval: (fn: () => void, ms: number) => () => void;
};

export const MAX_BATCH = 20;
const MAX_QUEUE = 100;
const ANON_KEY = "optcg.anonId.v1";
const ANON_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * A random id for this tab's session only (session storage, so it is gone when the tab closes): funnel counts
 * need to tell visits apart, not to follow a person between visits. Null when storage is blocked.
 */
export function sessionAnonId(): string | null {
  try {
    const existing = sessionStorage.getItem(ANON_KEY);
    if (existing && ANON_RE.test(existing)) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    sessionStorage.setItem(ANON_KEY, next);
    return next;
  } catch {
    return null;
  }
}
export const FLUSH_MS = 10_000;

function browserEnv(): ProductEventsEnv {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    isAutomated: () => nav?.webdriver === true,
    sendBeacon: nav && typeof nav.sendBeacon === "function" ? (url, data) => nav.sendBeacon(url, data) : null,
    fetchKeepalive:
      typeof fetch === "function"
        ? (url, body) => {
            void fetch(url, { method: "POST", body, keepalive: true, credentials: "include", headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => undefined);
          }
        : null,
    listen: (onHide) => {
      if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
      const onVisibility = () => {
        if (document.visibilityState === "hidden") onHide();
      };
      window.addEventListener("pagehide", onHide);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("pagehide", onHide);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
    setInterval: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
  };
}

export type ProductEvents = {
  track: (name: ProductEventName, props?: ProductEventProps) => void;
  flush: () => void;
  /** Start flushing on page hide and every `flushMs`; returns the stop function. */
  start: () => () => void;
};

export function createProductEvents(opts: ProductEventsOptions): ProductEvents {
  const env = opts.env ?? browserEnv();
  const queue: { name: ProductEventName; props?: ProductEventProps }[] = [];
  const muted = () => env.isAutomated() && !opts.allowAutomation;

  function send(batch: typeof queue): void {
    const body = JSON.stringify({ app: opts.app, anon_id: opts.anonId() ?? undefined, events: batch });
    const url = opts.endpoint();
    try {
      if (env.sendBeacon?.(url, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
      env.fetchKeepalive?.(url, body);
    } catch {
      // Analytics must never throw into the page; a lost batch is acceptable.
    }
  }

  function flush(): void {
    while (queue.length > 0) send(queue.splice(0, MAX_BATCH));
  }

  return {
    track(name, props) {
      if (muted()) return;
      // A setting dragged back and forth is one fact, not one event per change.
      if (name === "setting_changed" && queue.some((e) => e.name === name && e.props?.key === props?.key)) return;
      if (queue.length >= MAX_QUEUE) {
        // Make room by dropping the least useful event: settings first, then the oldest.
        const low = queue.findIndex((e) => e.name === "setting_changed");
        queue.splice(low === -1 ? 0 : low, 1);
      }
      queue.push(props ? { name, props } : { name });
    },
    flush,
    start() {
      const stopListen = env.listen(flush);
      const stopTimer = env.setInterval(flush, opts.flushMs ?? FLUSH_MS);
      return () => {
        stopListen();
        stopTimer();
      };
    },
  };
}
