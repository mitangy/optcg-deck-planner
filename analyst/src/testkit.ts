/**
 * Shared helpers for the analyst's chat tests and the eval's scripted model: a fake planner API, a model that
 * plays back scripted replies, and the usage/budget shapes they use. No test framework in here.
 */
import { loadCatalog } from "./catalog";
import { toCitation, type CallModel, type ChatDeps, type ModelReply } from "./chat";

export const catalog = loadCatalog();

export type Call = { url: string; method: string; headers: Record<string, string>; body?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A fake planner API: answers by "METHOD path" (query string ignored) and records every call. */
export function planner(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = new URL(url).pathname;
    calls.push({ url, method, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined });
    const key = `${method} ${path}`;
    if (!(key in answers)) return new Response(JSON.stringify({ detail: `no fake for ${key}` }), { status: 404 });
    let answer = answers[key];
    // A list answers call by call (the last entry repeats): a status number, or an Error to fail like a dropped connection.
    if (Array.isArray(answer)) {
      const step = answer.length > 1 ? answer.shift() : answer[0];
      if (step instanceof Error) throw step;
      answer = step;
    }
    if (answer === null) return new Response(null, { status: 204 });
    if (typeof answer === "number") return new Response("{}", { status: answer });
    if (typeof answer === "function") return new Response(JSON.stringify((answer as (u: string) => unknown)(url)), { status: 200 });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
}

export const BUDGET = { allowed: true, spent_today_usd: 0.5, daily_cap_usd: 3 };
export const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

/** Streams one reply the way the API's stream does: each text block's text, then the citations attached to it. */
export function streamReply(reply: ModelReply, onText: (delta: string) => void, onCite?: Parameters<CallModel>[3]) {
  for (const b of reply.content) {
    if (b.type !== "text") continue;
    onText(String(b.text));
    for (const raw of (b.citations as unknown[] | undefined) ?? []) {
      const c = toCitation(raw);
      if (c) onCite?.(c);
    }
  }
}

/** A model that plays back scripted replies (an Error entry fails the call), recording the request of every call. */
export function scriptedModel(replies: (ModelReply | Error)[]) {
  const seen: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const callModel: CallModel = async (params, onText, _signal, onCite) => {
    seen.push(structuredClone(params));
    const next = replies.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no more replies");
    streamReply(next, onText, onCite);
    return next;
  };
  return { seen, callModel };
}

export const deps = (api: ChatDeps["api"], callModel: CallModel, extra: Partial<ChatDeps> = {}): ChatDeps => ({ api, catalog, knowledge: {}, callModel, ...extra });
