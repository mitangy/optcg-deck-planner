import { describe, expect, it } from "vitest";
import { AnalystError, BUDGET_MESSAGE, GENERIC_ERROR, errorText, fetchSavedReview, fetchThread, streamAnalyst } from "./client";
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

describe("chat session token (#377)", () => {
  it("refreshes a token with less than 2 minutes left and keeps one with more (#377)", () => {
    expect(needsRefresh(iso(119_000), NOW)).toBe(true);
    expect(needsRefresh(iso(121_000), NOW)).toBe(false);
  });

  it("mints a new token before a request when the current one is about to expire (#377)", async () => {
    const f = fakeFetch([60_000, 15 * 60_000], () => sse(""));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    await mgr.refresh();
    expect(await mgr.getAuth()).toEqual({ token: "tok1", chatUrl: "https://lp.test" });
    expect(await mgr.getAuth()).toEqual({ token: "tok1", chatUrl: "https://lp.test" });
    expect(f.sessions()).toBe(2);
  });
});

describe("analyst stream requests (#377)", () => {
  it("refreshes the session and retries once when the analyst answers 401 (#377)", async () => {
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

  it("gives up with an auth error after a second 401 instead of looping (#377)", async () => {
    const f = fakeFetch([15 * 60_000], () => new Response("", { status: 401 }));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    await expect(streamAnalyst(mgr, "/chat", { message: "hi" }, {}, undefined, f.impl)).rejects.toMatchObject({ code: "auth" });
    expect(f.calls.filter((c) => c.url === "https://lp.test/chat")).toHaveLength(2);
  });

  it("turns a 429 into the daily-limit message (#377)", async () => {
    const f = fakeFetch([15 * 60_000], () => new Response("", { status: 429 }));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const err = await streamAnalyst(mgr, "/chat", { message: "hi" }, {}, undefined, f.impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalystError);
    expect(errorText(err as AnalystError)).toBe(BUDGET_MESSAGE);
  });

  it("shows the analyst's own reason when it refuses before streaming (#387)", async () => {
    const refuse = (body: string) => () => new Response(body, { status: 503, headers: { "Content-Type": "application/json" } });
    for (const [body, shown] of [
      ['{"error":"Log Pose chat isn\'t set up on this server.","code":"server"}', "Log Pose chat isn't set up on this server."],
      ["<html>Bad gateway</html>", GENERIC_ERROR],
    ] as const) {
      const f = fakeFetch([15 * 60_000], refuse(body));
      const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
      const err = await streamAnalyst(mgr, "/chat", { message: "hi" }, {}, undefined, f.impl).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AnalystError);
      expect(errorText(err as AnalystError)).toBe(shown);
    }
  });

  it("shows the daily-limit message for an in-stream budget error (#377)", async () => {
    const f = fakeFetch([15 * 60_000], () => sse('event: error\ndata: {"message":"cap hit","code":"budget"}\n\n'));
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const shown: string[] = [];
    await streamAnalyst(mgr, "/chat", { message: "hi" }, { onError: (e) => shown.push(errorText(e)) }, undefined, f.impl);
    expect(shown).toEqual([BUDGET_MESSAGE]);
  });

  it("hands thread, status, text and done events to their handlers in order (#377)", async () => {
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

describe("cite events and saved citations (#390)", () => {
  it("hands the citations of a cite event to the panel and ignores malformed ones (#390)", async () => {
    const f = fakeFetch([15 * 60_000], () =>
      sse(
        [
          'event: text\ndata: {"delta":"Zoro costs 3."}\n\n',
          'event: cite\ndata: {"citations":[{"source":"card:OP01-001","title":"Zoro","cited_text":"cost 3"},{"title":"no source"},"junk",{"source":"rule:1-1"}]}\n\n',
          'event: cite\ndata: {"citations":[]}\n\n',
          'event: cite\ndata: {"citations":"nope"}\n\n',
        ].join(""),
      ),
    );
    const mgr = createSessionManager("https://api.test", () => {}, f.impl, () => NOW);
    const seen: unknown[] = [];
    await streamAnalyst(mgr, "/chat", { message: "hi" }, { onCite: (c) => seen.push(c) }, undefined, f.impl);
    expect(seen).toEqual([
      [
        { source: "card:OP01-001", title: "Zoro", cited_text: "cost 3" },
        { source: "rule:1-1", title: "", cited_text: "" },
      ],
    ]);
  });

  it("reads a saved thread's and review's citations with their offsets, and none from an older answer (#390)", async () => {
    const answers: Record<string, unknown> = {
      "/analyst/chat/threads/4": { id: 4, title: "t", messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "Zoro costs 3.", citations: [{ at: 13, source: "card:OP01-001", title: "Zoro", cited_text: "cost 3" }, { at: -5, source: "rule:1-1" }, { at: 3, source: "" }, { at: 4 }] }] },
      "/analyst/reviews/m1": { match_id: "m1", text: "You lost.", created_at: "x" },
    };
    const impl = (async (url: string) => Response.json(answers[new URL(url).pathname])) as unknown as typeof fetch;
    const thread = await fetchThread("https://api.test", 4, impl);
    expect(thread!.messages[0]!.citations).toEqual([]);
    expect(thread!.messages[1]!.citations).toEqual([
      { at: 13, source: "card:OP01-001", title: "Zoro", cited_text: "cost 3" },
      { at: 0, source: "rule:1-1", title: "", cited_text: "" },
    ]);
    expect((await fetchSavedReview("https://api.test", "m1", impl))!.citations).toEqual([]);
  });
});
