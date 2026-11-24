import { useCallback, useEffect, useRef, useState } from "react";
import { AnalystError, errorText, fetchThread, stampChoice, stampPlan, streamAnalyst, type ChatContext, type DonePayload, type ThreadMessage } from "./client";
import { isRefusalCode, type RefusalCode } from "@optcg/analyst-contract";
import { placeAt, type Citation } from "./citations";
import { fromHistory, liveAnswer, type Msg } from "./chatMessages";
import { isEmptyAnswer } from "./proposals";
import type { SessionManager } from "./session";
import { readThreadHint, writeThreadHint } from "./threadStore";
import { GENERAL_SCOPE, isValidScope, type LogPoseScope } from "./scopes";
import { chatBody, resolveScopeChat } from "./threads";
import type { GameAskResult, LogPoseGame } from "./types";

export const NOT_SENT: GameAskResult = { sent: false, plan: false, choice: false, error: false, aborted: false };

export type CreditHooks = { apply: (d: DonePayload) => void; refuse: (code: RefusalCode) => void; refresh: () => void };

export function useChat(
  apiBase: string,
  session: SessionManager,
  isOpen: () => boolean,
  onUnread: () => void,
  credit: CreditHooks,
  live: { current: LogPoseGame | null },
  active: LogPoseScope,
) {
  const [messages, setMessages] = useState<Msg[]>([]);
  // The chat on show: its scope (what a new thread is created under) and thread. A chat picked from the Chats list can be another scope than the page's.
  const [scope, setScope] = useState<LogPoseScope>(active);
  const [threadId, setThreadId] = useState<number | null>(() => readThreadHint(active.key));
  // The send in flight and the thread, read synchronously: a message sent the moment the last one ends must see both.
  const threadRef = useRef(threadId);
  const scopeRef = useRef(scope);
  const activeRef = useRef(active);
  activeRef.current = active;
  const busyRef = useRef(false);
  const idleWaiters = useRef<(() => void)[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<"idle" | "loading" | "done">("idle");
  const abort = useRef<AbortController | null>(null);
  // Bumped whenever the chat on show is replaced (page scope change, pick, New chat, a send): a load that finishes late sees it and does nothing.
  const epoch = useRef(0);
  // The page scope the chat on show was last matched to. A pick leaves it alone, so the pick holds until the page's scope changes.
  const syncedKey = useRef<string | null>(null);
  const loading = useRef<Promise<void>>(Promise.resolve());

  const keepThread = useCallback((id: number, sendScope: LogPoseScope, at: number) => {
    writeThreadHint(sendScope.key, id);
    if (epoch.current !== at) return;
    threadRef.current = id;
    setThreadId(id);
  }, []);

  const show = useCallback((id: number, t: { messages: ThreadMessage[] }) => {
    threadRef.current = id;
    setThreadId(id);
    setMessages(t.messages.map(fromHistory));
  }, []);

  const startSync = useCallback(
    (target: LogPoseScope) => {
      const e = ++epoch.current;
      syncedKey.current = target.key;
      scopeRef.current = target;
      setScope(target);
      const hint = readThreadHint(target.key);
      threadRef.current = hint;
      setThreadId(hint);
      setMessages([]);
      setError(null);
      setHistory("loading");
      loading.current = resolveScopeChat(apiBase, target.key, hint, {
        early: (c) => epoch.current === e && show(c.id, c.thread),
        stale: () => epoch.current === e && writeThreadHint(target.key, null),
      })
        .then((c) => {
          if (epoch.current !== e) return;
          if (c) {
            show(c.id, c.thread);
            writeThreadHint(target.key, c.id);
          } else {
            threadRef.current = null;
            setThreadId(null);
            setMessages([]);
          }
        })
        .catch(() => {
          if (epoch.current === e) setError("Could not load your last chat.");
        })
        .finally(() => {
          if (epoch.current === e) setHistory("done");
        });
    },
    [apiBase, show],
  );

  // Waits while an answer is in flight: it must land in the chat it was asked in.
  const sync = useCallback((): Promise<void> => {
    if (!busyRef.current && syncedKey.current !== activeRef.current.key) startSync(activeRef.current);
    return loading.current;
  }, [startSync]);

  // After the first load, a page on another scope brings its chat along even while the panel is closed.
  useEffect(() => {
    if (syncedKey.current !== null) void sync();
  }, [active.key, busy, sync]);

  const openThread = useCallback(
    (row: { id: number; title: string; scope: string }) => {
      if (busyRef.current) return;
      const e = ++epoch.current;
      const next: LogPoseScope = { key: isValidScope(row.scope) ? row.scope : GENERAL_SCOPE.key, title: row.title };
      scopeRef.current = next;
      setScope(next);
      threadRef.current = row.id;
      setThreadId(row.id);
      setMessages([]);
      setError(null);
      setHistory("loading");
      fetchThread(apiBase, row.id)
        .then((t) => {
          if (epoch.current !== e) return;
          if (!t) {
            threadRef.current = null;
            setThreadId(null);
            setError("That chat is gone.");
          } else show(row.id, t);
        })
        .catch(() => epoch.current === e && setError("Could not load that chat."))
        .finally(() => epoch.current === e && setHistory("done"));
    },
    [apiBase, show],
  );

  const send = useCallback(
    async (text: string, context: ChatContext | undefined, opts?: { auto?: boolean }): Promise<GameAskResult> => {
      const message = text.trim();
      if (!message || busyRef.current) return NOT_SENT;
      const out: GameAskResult = { sent: true, plan: false, choice: false, error: false, aborted: false };
      const ctrl = new AbortController();
      abort.current = ctrl;
      busyRef.current = true;
      // The chat and scope this message belongs to, taken now: the answer lands there even if the page moves on while it streams.
      const at = ++epoch.current;
      const sendScope = scopeRef.current.key === activeRef.current.key ? activeRef.current : scopeRef.current;
      setHistory((h) => (h === "loading" ? "done" : h));
      setBusy(true);
      setStatus("");
      setError(null);
      setMessages((cur) => [...cur, { role: "user", text: message, citations: [] }, liveAnswer()]);
      const patchLast = (fn: (m: Msg) => Msg) =>
        setMessages((cur) => {
          const last = cur[cur.length - 1];
          return last?.role === "assistant" ? [...cur.slice(0, -1), fn(last)] : cur;
        });
      const body = chatBody(message, threadRef.current, sendScope, context);
      try {
        await streamAnalyst(
          session,
          "/chat",
          body,
          {
            onThread: (id) => keepThread(id, sendScope, at),
            onStatus: setStatus,
            onText: (delta) => patchLast((m) => ({ ...m, text: m.text + delta })),
            onCite: (cites: Citation[]) => patchLast((m) => ({ ...m, citations: [...m.citations, ...placeAt(cites, m.text.length)] })),
            onProposal: (p) => patchLast((m) => ({ ...m, proposals: [...(m.proposals ?? []).filter((x) => x.id !== p.id), p] })),
            onCardList: (l) => patchLast((m) => ({ ...m, cardLists: [...(m.cardLists ?? []).filter((x) => x.id !== l.id), l] })),
            onDraft: (d) => patchLast((m) => ({ ...m, drafts: [...(m.drafts ?? []).filter((x) => x.id !== d.id), d] })),
            // The board hears of it here, from the live stream only: an answer read back from a saved chat never starts a plan.
            onPlan: (plan) => {
              const stamped = stampPlan(plan, context);
              out.plan = true;
              patchLast((m) => ({ ...m, plans: [...(m.plans ?? []).filter((x) => x.id !== plan.id), stamped] }));
              live.current?.onLivePlan?.(stamped);
            },
            onChoice: (answer) => {
              const stamped = stampChoice(answer, context);
              out.choice = true;
              patchLast((m) => ({ ...m, choices: [...(m.choices ?? []).filter((x) => x.id !== stamped.id), stamped] }));
              live.current?.onLiveChoice?.(stamped);
            },
            onDone: (d) => {
              if (typeof d.thread_id === "number") keepThread(d.thread_id, sendScope, at);
              patchLast((m) => ({ ...m, saved: true }));
              if (!isOpen() && !opts?.auto) onUnread();
              credit.apply(d);
              credit.refresh();
            },
            onError: (e) => {
              out.error = true;
              if (isRefusalCode(e.code)) {
                credit.refuse(e.code);
                credit.refresh();
              } else setError(errorText(e));
            },
          },
          ctrl.signal,
        );
      } catch (e) {
        out.error = !ctrl.signal.aborted;
        if (ctrl.signal.aborted) patchLast((m) => ({ ...m, stopped: true }));
        else if (e instanceof AnalystError && isRefusalCode(e.code)) {
          credit.refuse(e.code);
          credit.refresh();
        } else setError(e instanceof AnalystError ? errorText(e) : errorText({}));
      } finally {
        out.aborted = ctrl.signal.aborted;
        if (abort.current === ctrl) abort.current = null;
        // A chat reset while this ran may already have started the next message: leave its busy state alone.
        const latest = abort.current === null;
        setMessages((cur) => {
          const last = cur[cur.length - 1];
          return last?.role === "assistant" && isEmptyAnswer(last) ? cur.slice(0, -1) : cur;
        });
        if (latest) {
          busyRef.current = false;
          setBusy(false);
          setStatus("");
        }
        for (const wake of idleWaiters.current.splice(0)) wake();
      }
      return out;
    },
    [session, keepThread, isOpen, onUnread, credit, live],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const whenIdle = useCallback(
    (signal?: AbortSignal) =>
      new Promise<boolean>((resolve) => {
        if (signal?.aborted) return resolve(false);
        if (!busyRef.current) return resolve(true);
        signal?.addEventListener("abort", () => resolve(false), { once: true });
        idleWaiters.current.push(() => resolve(true));
      }),
    [],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    epoch.current++;
    writeThreadHint(scopeRef.current.key, null);
    threadRef.current = null;
    setThreadId(null);
    setMessages([]);
    setError(null);
    setStatus("");
    setBusy(false);
    busyRef.current = false;
    setHistory("done");
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  return { messages, busy, status, error, history, threadId, scope, sync, openThread, send, stop, reset, whenIdle, busyNow: () => busyRef.current };
}

export type Chat = ReturnType<typeof useChat>;
