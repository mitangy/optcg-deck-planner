import { describe, expect, it } from "vitest";
import { listThreads } from "./client";
import { chatBody, resolveScopeChat } from "./threads";

const API = "https://api.test";
type Row = { id: number; title: string; updated_at: string; scope: string };
const row = (id: number, scope: string): Row => ({ id, title: `t${id}`, updated_at: "2026-11-04T10:00:00Z", scope });
const thread = (id: number, text: string) => ({ id, title: `t${id}`, scope: "general", messages: [{ role: "user", text }] });

/** A fetch fake for the thread endpoints: `lists` by scope ("" for all), `threads` by id. A missing thread is a 404. */
function fake(o: { lists?: Record<string, Row[] | "fail">; threads?: Record<number, unknown | "fail"> }) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    calls.push(u.pathname + u.search);
    if (u.pathname.endsWith("/analyst/chat/threads")) {
      const list = o.lists?.[u.searchParams.get("scope") ?? ""];
      if (!list || list === "fail") return new Response("", { status: 500 });
      return Response.json({ threads: list });
    }
    const id = Number(u.pathname.split("/").pop());
    const t = o.threads?.[id];
    if (t === "fail") return new Response("", { status: 500 });
    return t ? Response.json(t) : new Response("", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("new chat requests carry their scope (#970)", () => {
  const deck = { key: "deck:planner:7", title: "Zoro Aggro" };

  it("names the scope and its title on a chat that has no thread yet (#970)", () => {
    expect(chatBody("hi", null, deck)).toEqual({ message: "hi", scope: "deck:planner:7", scope_title: "Zoro Aggro" });
  });

  it("sends only the thread id once the chat has one, so the thread keeps the scope it was made with (#970)", () => {
    expect(chatBody("hi", 12, deck)).toEqual({ message: "hi", thread_id: 12 });
  });

  it("sends no scope for the general chat, and cuts a long title to what the server takes (#970)", () => {
    expect(chatBody("hi", null, { key: "general", title: "General" })).toEqual({ message: "hi" });
    expect(chatBody("hi", null, { key: "match:m1", title: "x".repeat(120) }).scope_title).toHaveLength(80);
  });

  it("keeps the page context on the message (#970)", () => {
    expect(chatBody("hi", null, deck, { page: "deck" })).toMatchObject({ context: { page: "deck" } });
  });
});

describe("listing chats (#970)", () => {
  it("asks for one scope with ?scope=, or for all of them without it (#970)", async () => {
    const f = fake({ lists: { "deck:planner:7": [row(3, "deck:planner:7")], "": [row(3, "deck:planner:7"), row(1, "general")] } });
    expect((await listThreads(API, "deck:planner:7", f.impl)).map((t) => t.id)).toEqual([3]);
    expect((await listThreads(API, undefined, f.impl)).map((t) => [t.id, t.scope])).toEqual([[3, "deck:planner:7"], [1, "general"]]);
    expect(f.calls).toEqual(["/analyst/chat/threads?scope=deck%3Aplanner%3A7", "/analyst/chat/threads"]);
  });

  it("treats a thread listed without a scope as general (#970)", async () => {
    const impl = (async () => Response.json({ threads: [{ id: 4, title: "old", updated_at: "2026-10-01T00:00:00Z" }, { nope: true }] })) as unknown as typeof fetch;
    expect(await listThreads(API, undefined, impl)).toEqual([{ id: 4, title: "old", updated_at: "2026-10-01T00:00:00Z", scope: "general" }]);
  });
});

describe("finding the chat of a scope (#970)", () => {
  it("shows the newest chat the server lists for the scope, even when this browser remembers another or nothing (#970)", async () => {
    const f = fake({ lists: { "deck:planner:7": [row(9, "deck:planner:7"), row(5, "deck:planner:7")] }, threads: { 9: thread(9, "from my phone"), 5: thread(5, "old") } });
    expect((await resolveScopeChat(API, "deck:planner:7", null, { fetchImpl: f.impl }))?.id).toBe(9);
    expect((await resolveScopeChat(API, "deck:planner:7", 5, { fetchImpl: f.impl }))?.thread.messages[0]?.text).toBe("from my phone");
  });

  it("keeps the remembered chat when it is the newest, loading it only once (#970)", async () => {
    const f = fake({ lists: { "match:m1": [row(2, "match:m1")] }, threads: { 2: thread(2, "mine") } });
    expect((await resolveScopeChat(API, "match:m1", 2, { fetchImpl: f.impl }))?.id).toBe(2);
    expect(f.calls.filter((c) => c.endsWith("/threads/2"))).toHaveLength(1);
  });

  it("shows the remembered chat at once, before the list answers (#970)", async () => {
    let release: (r: Response) => void = () => {};
    const listed = new Promise<Response>((res) => (release = res));
    const impl = (async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/threads")) return listed;
      return Response.json(thread(2, "mine"));
    }) as typeof fetch;
    const early: number[] = [];
    const done = resolveScopeChat(API, "general", 2, { fetchImpl: impl, early: (c) => early.push(c.id) });
    await new Promise((r) => setTimeout(r, 10));
    expect(early).toEqual([2]);
    release(Response.json({ threads: [row(2, "general")] }));
    expect((await done)?.id).toBe(2);
  });

  it("finds no chat when the scope has none and nothing is remembered (#970)", async () => {
    const f = fake({ lists: { "deck:duel:d1": [] } });
    expect(await resolveScopeChat(API, "deck:duel:d1", null, { fetchImpl: f.impl })).toBeNull();
  });

  it("falls back to the remembered chat when the list can't be read (#970)", async () => {
    const f = fake({ lists: { general: "fail" }, threads: { 6: thread(6, "mine") } });
    expect((await resolveScopeChat(API, "general", 6, { fetchImpl: f.impl }))?.id).toBe(6);
  });

  it("reports an error when neither the list nor the remembered chat can be read (#970)", async () => {
    const f = fake({ lists: { general: "fail" }, threads: { 6: "fail" } });
    await expect(resolveScopeChat(API, "general", 6, { fetchImpl: f.impl })).rejects.toThrow("Could not load your last chat.");
  });

  it("forgets a remembered chat the server no longer has (#970)", async () => {
    const f = fake({ lists: { general: [] } });
    const stale: number[] = [];
    expect(await resolveScopeChat(API, "general", 8, { fetchImpl: f.impl, stale: (id) => stale.push(id) })).toBeNull();
    expect(stale).toEqual([8]);
  });
});
