/**
 * One question put to Log Pose from inside a page (a drawer under a button), not through the chat panel (#960).
 * It streams over the same /chat endpoint as the panel, so it counts against the same credit and daily limits, shows
 * the same friendly errors and is saved as a normal chat thread the panel can open ("Continue in Log Pose").
 * React-free so it can be tested in node; the hook in LogPose.tsx subscribes to it.
 */
import { placeAt, type Citation, type PlacedCitation } from "./citations";
import { AnalystError, errorText, streamAnalyst, type ChatContext, type ChatRequest, type DonePayload } from "./client";
import type { RefusalCode } from "./credit";
import type { SessionManager } from "./session";

export type InlinePhase = "idle" | "streaming" | "done" | "stopped" | "error";

export type InlineState = {
  phase: InlinePhase;
  /** The answer so far. */
  text: string;
  citations: PlacedCitation[];
  /** What Log Pose is doing while it works ("Looking up prices…"). */
  status: string;
  /** The friendly line for a failure, or null. */
  error: string | null;
  /** Set when the failure was a credit / daily / monthly limit. */
  limit: RefusalCode | null;
  /** The chat thread the question was saved to (known once the stream starts). */
  threadId: number | null;
};

export const IDLE_INLINE: InlineState = {
  phase: "idle",
  text: "",
  citations: [],
  status: "",
  error: null,
  limit: null,
  threadId: null,
};

/** How the answer changes the player's credit, as the panel's chat uses it. */
export type InlineCredit = {
  apply: (d: DonePayload) => void;
  refuse: (code: RefusalCode) => void;
  refresh: () => void;
};

export type InlineDeps = {
  session: SessionManager;
  /** The page's context (page id, open deck) taken when the question is sent. */
  context: () => ChatContext | undefined;
  credit: () => InlineCredit;
  fetchImpl?: typeof fetch;
};

const isLimit = (code: string | undefined): code is RefusalCode => code === "credit" || code === "daily" || code === "monthly";

export type InlineAsks = {
  get: (key: string) => InlineState;
  subscribe: (fn: () => void) => () => void;
  /** Streams `prompt` for `key`. Does nothing while that key already has an answer coming or shown: `reset` it first to ask again. */
  ask: (key: string, prompt: string) => void;
  /** Stops the answer in flight (what has streamed stays). */
  stop: (key: string) => void;
  /** Forgets the answer for `key` (stopping it if it is still coming). */
  reset: (key: string) => void;
};

export function createInlineAsks(deps: InlineDeps): InlineAsks {
  const states = new Map<string, InlineState>();
  const running = new Map<string, AbortController>();
  const listeners = new Set<() => void>();
  const set = (key: string, next: InlineState) => {
    states.set(key, next);
    for (const fn of [...listeners]) fn();
  };
  const patch = (key: string, ctrl: AbortController, fn: (s: InlineState) => InlineState) => {
    // A reset (or a newer question) took the key over: this stream's late events are dropped.
    if (running.get(key) === ctrl) set(key, fn(states.get(key) ?? IDLE_INLINE));
  };
  const get = (key: string) => states.get(key) ?? IDLE_INLINE;

  const ask = (key: string, prompt: string) => {
    const message = prompt.trim();
    if (!message || get(key).phase !== "idle") return;
    const ctrl = new AbortController();
    running.set(key, ctrl);
    set(key, { ...IDLE_INLINE, phase: "streaming" });
    const body: ChatRequest = { message };
    const context = deps.context();
    if (context) body.context = context;
    const credit = deps.credit();
    const fail = (code: string | undefined, e: { message?: string; code?: string }) =>
      patch(key, ctrl, (s) => ({
        ...s,
        phase: "error",
        status: "",
        error: errorText(e),
        limit: isLimit(code) ? code : null,
      }));
    void (async () => {
      try {
        await streamAnalyst(
          deps.session,
          "/chat",
          body,
          {
            onThread: (id) => patch(key, ctrl, (s) => ({ ...s, threadId: id })),
            onStatus: (status) => patch(key, ctrl, (s) => ({ ...s, status })),
            onText: (delta) => patch(key, ctrl, (s) => ({ ...s, text: s.text + delta })),
            // A citation follows the text streamed so far.
            onCite: (cites: Citation[]) =>
              patch(key, ctrl, (s) => ({
                ...s,
                citations: [...s.citations, ...placeAt(cites, s.text.length)],
              })),
            onDone: (d) => {
              patch(key, ctrl, (s) =>
                s.phase === "error"
                  ? s
                  : {
                      ...s,
                      phase: "done",
                      status: "",
                      threadId: typeof d.thread_id === "number" ? d.thread_id : s.threadId,
                    },
              );
              credit.apply(d);
              credit.refresh();
            },
            onError: (e) => {
              if (isLimit(e.code)) {
                credit.refuse(e.code);
                credit.refresh();
              }
              fail(e.code, e);
            },
          },
          ctrl.signal,
          deps.fetchImpl,
        );
        // The stream ended without a done event or an error: whatever came is all there is.
        patch(key, ctrl, (s) => {
          if (s.phase !== "streaming") return s;
          if (ctrl.signal.aborted) return { ...s, phase: "stopped", status: "" };
          return {
            ...s,
            phase: s.text.trim() ? "done" : "error",
            status: "",
            error: s.text.trim() ? null : errorText({}),
          };
        });
      } catch (e) {
        if (ctrl.signal.aborted) patch(key, ctrl, (s) => ({ ...s, phase: "stopped", status: "" }));
        else if (e instanceof AnalystError && isLimit(e.code)) {
          credit.refuse(e.code);
          credit.refresh();
          fail(e.code, e);
        } else fail(undefined, e instanceof AnalystError ? e : {});
      } finally {
        if (running.get(key) === ctrl) running.delete(key);
      }
    })();
  };

  return {
    get,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    ask,
    stop: (key) => running.get(key)?.abort(),
    reset: (key) => {
      const ctrl = running.get(key);
      running.delete(key);
      ctrl?.abort();
      if (states.has(key)) set(key, IDLE_INLINE);
    },
  };
}
