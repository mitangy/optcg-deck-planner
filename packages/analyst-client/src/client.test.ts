import { describe, expect, it } from "vitest";
import { AnalystError, BUDGET_MESSAGE, errorText, streamAnalyst } from "./client";
import { createSessionManager, needsRefresh } from "./session";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

type Call = { url: string; init: RequestInit };

/** A fetch that answers the session endpoint with successive tokens and the chat URL with `chat`. */
function fakeFetch(expiries: number[], chat: (auth: string) => Response) {
  const calls: Call[] = [];
  let minted = 0;
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith("/analyst/chat/session")) {
      const n = minted++;
      return Response.json({ enabled: true, token: `tok${n}`, expires_at: iso(expiries[Math.min(n, expiries.length - 1)]!), chat_url: "https://lp.test/" });
    }
    return chat(new Headers(init.headers).get("Authorization") ?? "");
  }) as typeof fetch;
  return { impl, calls, sessions: () => calls.filter((c) => c.url.endsWith("/session")).length };
}

const sse = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });

describe("chat session token (#log-pose-chat)", () => {
  it("refreshes a token with less than 2 minutes left and keeps one with more (#log-pose-chat)", () => {
    expect(needsRefresh(iso(119_000), NOW)).toBe(true);
    expect(needsRefresh(iso(121_000), NOW)).toBe(false);
  });

  it("mints a new token before a request when the current one is about to expire (#log-pose-chat)", async () => {
    const f = fakeFetch([60_000, 15 * 60_000], () => sse(""));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    await mgr.refresh();
    expect(await mgr.getAuth()).toEqual({ token: "tok1", chatUrl: "https://lp.test" });
    expect(await mgr.getAuth()).toEqual({ token: "tok1", chatUrl: "https://lp.test" });
    expect(f.sessions()).toBe(2);
  });
});

describe("analyst stream requests (#log-pose-chat)", () => {
  it("refreshes the session and retries once when the analyst answers 401 (#log-pose-chat)", async () => {
    const f = fakeFetch([15 * 60_000], (auth) =>
      auth === "Bearer tok0" ? new Response("", { status: 401 }) : sse('event: text\ndata: {"delta":"ok"}\n\n'),
    );
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const text: string[] = [];
    await streamAnalyst(mgr, "/chat", { message: "hi" }, { onText: (d) => text.push(d) }, undefined, f.impl);
    expect(text).toEqual(["ok"]);
    const chats = f.calls.filter((c) => c.url === "https://lp.test/chat");
    expect(chats.map((c) => new Headers(c.init.headers).get("Authorization"))).toEqual(["Bearer tok0", "Bearer tok1"]);
    expect(chats[1]!.init.credentials).toBe("omit");
  });

  it("gives up with an auth error after a second 401 instead of looping (#log-pose-chat)", async () => {
    const f = fakeFetch([15 * 60_000], () => new Response("", { status: 401 }));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    await expect(streamAnalyst(mgr, "/chat", { message: "hi" }, {}, undefined, f.impl)).rejects.toMatchObject({ code: "auth" });
    expect(f.calls.filter((c) => c.url === "https://lp.test/chat")).toHaveLength(2);
  });

  it("turns a 429 into the daily-limit message (#log-pose-chat)", async () => {
    const f = fakeFetch([15 * 60_000], () => new Response("", { status: 429 }));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const err = await streamAnalyst(mgr, "/chat", { message: "hi" }, {}, undefined, f.impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalystError);
    expect(errorText(err as AnalystError)).toBe(BUDGET_MESSAGE);
  });

  it("shows the daily-limit message for an in-stream budget error (#log-pose-chat)", async () => {
    const f = fakeFetch([15 * 60_000], () => sse('event: error\ndata: {"message":"cap hit","code":"budget"}\n\n'));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const shown: string[] = [];
    await streamAnalyst(mgr, "/chat", { message: "hi" }, { onError: (e) => shown.push(errorText(e)) }, undefined, f.impl);
    expect(shown).toEqual([BUDGET_MESSAGE]);
  });

  it("hands thread, status, text and done events to their handlers in order (#log-pose-chat)", async () => {
    const f = fakeFetch([15 * 60_000], () =>
      sse(
        'event: thread\ndata: {"thread_id":7}\n\nevent: status\ndata: {"text":"Looking"}\n\n' +
          'event: text\ndata: {"delta":"A"}\n\nevent: done\ndata: {"thread_id":7,"cost_usd":0.02}\n\n',
      ),
    );
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const seen: string[] = [];
    await streamAnalyst(
      mgr,
      "/chat",
      { message: "hi" },
      {
        onThread: (id) => seen.push(`thread:${id}`),
        onStatus: (t) => seen.push(`status:${t}`),
        onText: (d) => seen.push(`text:${d}`),
        onDone: (d) => seen.push(`done:${d.thread_id}`),
      },
      undefined,
      f.impl,
    );
    expect(seen).toEqual(["thread:7", "status:Looking", "text:A", "done:7"]);
  });
});
