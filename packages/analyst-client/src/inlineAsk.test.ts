import { describe, expect, it } from "vitest";
import { CREDIT_MESSAGE, DAILY_MESSAGE } from "./client";
import { createInlineAsks, IDLE_INLINE, type InlineCredit } from "./inlineAsk";
import { createSessionManager } from "./session";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const sse = (...events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });

/** A fetch that answers the session endpoint, and records and answers the chat endpoint with `chat(body)`. */
function setup(
  chat: (body: { message: string; thread_id?: number; context?: unknown }) => Response | Promise<Response>,
  context: () => { page: string } | undefined = () => ({ page: "card" }),
) {
  const bodies: { message: string; thread_id?: number; context?: unknown }[] = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/analyst/chat/session"))
      return Response.json({
        enabled: true,
        token: "tok",
        expires_at: new Date(NOW + 15 * 60_000).toISOString(),
        chat_url: "https://lp.test/",
      });
    const body = JSON.parse(String(init.body)) as (typeof bodies)[number];
    bodies.push(body);
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return chat(body);
  }) as typeof fetch;
  const session = createSessionManager(
    "https://api.test",
    () => {},
    impl,
    () => NOW,
  );
  const credit = { applied: 0, refused: [] as string[], refreshed: 0 };
  const hooks: InlineCredit = {
    apply: () => void credit.applied++,
    refuse: (c) => void credit.refused.push(c),
    refresh: () => void credit.refreshed++,
  };
  const asks = createInlineAsks({
    session,
    context,
    credit: () => hooks,
    fetchImpl: impl,
  });
  const settled = (key: string, phases = ["done", "error", "stopped"]) =>
    new Promise<void>((resolve) => {
      const check = () => phases.includes(asks.get(key).phase) && resolve();
      asks.subscribe(check);
      check();
    });
  return { asks, bodies, credit, settled, session };
}

describe("a question answered inside a page (#960)", () => {
  it("streams the answer with its citations into the key and remembers the thread it was saved to (#960)", async () => {
    const t = setup(() =>
      sse(
        ["thread", { thread_id: 41 }],
        ["status", { text: "Looking up prices…" }],
        ["text", { delta: "Wait for the reprint news." }],
        [
          "cite",
          {
            citations: [{ source: "price:EB01-002", title: "Izo", cited_text: "dropped" }],
          },
        ],
        ["text", { delta: " Then buy." }],
        ["done", { thread_id: 41 }],
      ),
    );
    t.asks.ask("art:1", "When should I buy Izo?");
    expect(t.asks.get("art:1").phase).toBe("streaming");
    await t.settled("art:1");
    const s = t.asks.get("art:1");
    expect(s.phase).toBe("done");
    expect(s.text).toBe("Wait for the reprint news. Then buy.");
    // The citation follows the text streamed before it.
    expect(s.citations).toEqual([{ at: 26, source: "price:EB01-002", title: "Izo", cited_text: "dropped" }]);
    expect(s.threadId).toBe(41);
    expect(t.asks.get("art:2")).toBe(IDLE_INLINE);
  });

  it("sends the question and the page's context on a new thread, and counts the answer against the player's credit (#960)", async () => {
    const t = setup(() => sse(["thread", { thread_id: 7 }], ["text", { delta: "ok" }], ["done", { thread_id: 7 }]));
    t.asks.ask("a", "  When should I buy Izo?  ");
    await t.settled("a");
    expect(t.bodies).toEqual([{ message: "When should I buy Izo?", context: { page: "card" } }]);
    expect(t.credit.applied).toBe(1);
    expect(t.credit.refreshed).toBe(1);
  });

  it("asks once per key: an answer already coming or shown is not asked for again until it is reset (#960)", async () => {
    const t = setup(() => sse(["text", { delta: "hi" }], ["done", { thread_id: 3 }]));
    t.asks.ask("a", "q");
    t.asks.ask("a", "q");
    await t.settled("a");
    t.asks.ask("a", "q");
    expect(t.bodies).toHaveLength(1);
    t.asks.reset("a");
    expect(t.asks.get("a")).toBe(IDLE_INLINE);
    t.asks.ask("a", "q");
    await t.settled("a");
    expect(t.bodies).toHaveLength(2);
  });

  it("shows the friendly credit message for a 429 and tells the panel's credit meter (#960)", async () => {
    const t = setup(() => new Response('{"code":"credit"}', { status: 429 }));
    t.asks.ask("a", "q");
    await t.settled("a");
    const s = t.asks.get("a");
    expect(s.phase).toBe("error");
    expect(s.error).toBe(CREDIT_MESSAGE);
    expect(s.limit).toBe("credit");
    expect(t.credit.refused).toEqual(["credit"]);
  });

  it("shows a limit that arrives as an error event the same way (#960)", async () => {
    const t = setup(() => sse(["error", { code: "daily", message: "x" }]));
    t.asks.ask("a", "q");
    await t.settled("a");
    expect(t.asks.get("a")).toMatchObject({
      phase: "error",
      error: DAILY_MESSAGE,
      limit: "daily",
    });
    expect(t.credit.refused).toEqual(["daily"]);
  });

  it("keeps what streamed when stopped and does not report an error (#960)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const enc = new TextEncoder();
    const t = setup(
      () =>
        new Response(
          new ReadableStream({
            async start(c) {
              c.enqueue(enc.encode('event: text\ndata: {"delta":"Half an"}\n\n'));
              await gate;
              c.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    t.asks.ask("a", "q");
    await new Promise<void>((resolve) => {
      const check = () => t.asks.get("a").text && resolve();
      t.asks.subscribe(check);
      check();
    });
    t.asks.stop("a");
    release();
    await t.settled("a");
    expect(t.asks.get("a")).toMatchObject({
      phase: "stopped",
      text: "Half an",
      error: null,
    });
  });

  it("drops what a reset answer streams afterwards (#960)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup(async () => {
      await gate;
      return sse(["text", { delta: "late" }], ["done", { thread_id: 9 }]);
    });
    t.asks.ask("a", "q");
    t.asks.reset("a");
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(t.asks.get("a")).toBe(IDLE_INLINE);
  });
});
