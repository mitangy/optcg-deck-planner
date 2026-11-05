// @vitest-environment jsdom
import { act, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LogPoseProvider, useLogPose, useLogPoseGame, useLogPosePage, type GameAskResult } from "./LogPose";
import type { GameChatContext } from "./client";
import { readThreadHint, THREADS_KEY } from "./threadStore";
import type { LogPoseScope } from "./scopes";

const API = "https://api.test";
const DECK: LogPoseScope = { key: "deck:planner:7", title: "Zoro Aggro" };
const MATCH: LogPoseScope = { key: "match:m1", title: "Luffy vs Zoro" };

type Thread = { id: number; title: string; scope: string; updated_at: string; messages: { role: "user" | "assistant"; text: string }[] };
const thread = (id: number, scope: string, title: string, text: string, updated_at = "2026-11-04T10:00:00Z"): Thread => ({ id, title, scope, updated_at, messages: [{ role: "user", text }] });

/** The analyst and API as one fake: the session, the thread endpoints, and a chat stream the test closes when it wants. */
function backend(threads: Thread[]) {
  const posts: Record<string, unknown>[] = [];
  const lists: string[] = [];
  let stream: ReadableStreamDefaultController<Uint8Array> | null = null;
  const enc = new TextEncoder();
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url));
    if (u.href === `${API}/analyst/chat/session`) {
      return Response.json({ enabled: true, token: "tok", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: "https://lp.test" });
    }
    if (u.href === "https://lp.test/chat") {
      posts.push(JSON.parse(String(init.body)));
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => void (stream = c) }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    if (u.pathname === "/analyst/chat/threads") {
      lists.push(u.search);
      const scope = u.searchParams.get("scope");
      const rows = threads.filter((t) => !scope || t.scope === scope).map(({ messages: _m, ...r }) => r);
      return Response.json({ threads: rows });
    }
    const m = /\/analyst\/chat\/threads\/(\d+)$/.exec(u.pathname);
    if (m) {
      const t = threads.find((x) => x.id === Number(m[1]));
      return t ? Response.json(t) : new Response("", { status: 404 });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const emit = (event: string, data: object) => stream?.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  return { impl, posts, lists, emit, close: () => stream?.close() };
}

function Page({ scope }: { scope?: LogPoseScope }) {
  useLogPosePage({ page: "test", label: "Test page", scope });
  return null;
}
function OpenButton() {
  const lp = useLogPose();
  return (
    <button type="button" data-testid="open" onClick={() => lp.openPanel()}>
      open
    </button>
  );
}

function Game({ scope }: { scope: LogPoseScope }) {
  const game = useMemo(() => ({ label: "this game", scope, context: () => ({ ticket: "t", snapshot: {} }) as unknown as GameChatContext, renderPlan: () => null }), [scope]);
  useLogPoseGame(game);
  return null;
}
let ask: ((text: string) => Promise<GameAskResult>) | null = null;
function AskProbe() {
  ask = useLogPose().askGame;
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
async function mount(scope: LogPoseScope | undefined, be: ReturnType<typeof backend>, o: { open?: boolean } = {}) {
  vi.stubGlobal("fetch", be.impl);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await show(scope);
  await settle();
  if (o.open === false) return;
  await act(async () => (host!.querySelector('[data-testid="open"]') as HTMLButtonElement).click());
  await settle();
}
const show = (scope: LogPoseScope | undefined, game?: LogPoseScope) =>
  act(async () =>
    root!.render(
      <LogPoseProvider apiBase={API}>
        <Page scope={scope} />
        {game ? <Game scope={game} /> : null}
        <AskProbe />
        <OpenButton />
      </LogPoseProvider>,
    ),
  );
const label = () => document.querySelector('[data-testid="lp-scope-label"]')?.textContent;
const body = () => document.querySelector(".lp-body")?.textContent ?? "";
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement | undefined;
async function send(text: string) {
  const input = document.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Send")!.click());
  await settle();
}

const ALL = [
  thread(5, DECK.key, DECK.title, "deck question"),
  thread(2, MATCH.key, MATCH.title, "match question"),
  thread(1, "general", "Rules chat", "general question", "2026-11-03T10:00:00Z"),
];

describe("Log Pose opens the chat of the page's scope (#970)", () => {
  it("shows a deck page's own chat and names it in the header (#970)", async () => {
    const be = backend(ALL);
    await mount(DECK, be);
    expect(label()).toBe("Deck: Zoro Aggro");
    expect(body()).toContain("deck question");
    expect(body()).not.toContain("general question");
    expect(be.lists).toContain("?scope=deck%3Aplanner%3A7");
  });

  it("shows the general chat on a page with no scope (#970)", async () => {
    await mount(undefined, backend(ALL));
    expect(label()).toBe("General");
    expect(body()).toContain("general question");
  });

  it("starts blank in a scope that has no chat yet, rather than showing another (#970)", async () => {
    await mount({ key: "deck:planner:99", title: "New deck" }, backend(ALL));
    expect(label()).toBe("Deck: New deck");
    expect(body()).not.toContain("question");
  });

  it("offers New chat on a deck page and the general chat, but not in a match chat (#970)", async () => {
    await mount(MATCH, backend(ALL));
    expect(label()).toBe("Match: Luffy vs Zoro");
    expect(button("New chat")).toBeUndefined();
    await show(DECK);
    await settle();
    expect(button("New chat")).toBeDefined();
    await show(undefined);
    await settle();
    expect(button("New chat")).toBeDefined();
  });

  it("switches to the new page's chat when the page moves to another scope (#970)", async () => {
    await mount(DECK, backend(ALL));
    await show(MATCH);
    await settle();
    expect(label()).toBe("Match: Luffy vs Zoro");
    expect(body()).toContain("match question");
    expect(body()).not.toContain("deck question");
  });

  it("starts a scope's chat as a new thread carrying that scope, and remembers it for that scope only (#970)", async () => {
    const be = backend(ALL);
    await mount({ key: "deck:planner:99", title: "New deck" }, be);
    await send("rate my deck");
    expect(be.posts[0]).toMatchObject({ message: "rate my deck", scope: "deck:planner:99", scope_title: "New deck" });
    expect(be.posts[0]).not.toHaveProperty("thread_id");
    be.emit("thread", { thread_id: 40 });
    be.emit("done", { thread_id: 40 });
    be.close();
    await settle();
    expect(readThreadHint("deck:planner:99")).toBe(40);
    expect(readThreadHint("general")).toBeNull();
  });

  it("sends into the open thread without a scope once the chat exists (#970)", async () => {
    const be = backend(ALL);
    await mount(DECK, be);
    await send("and the curve?");
    expect(be.posts[0]).toMatchObject({ message: "and the curve?", thread_id: 5 });
    expect(be.posts[0]).not.toHaveProperty("scope");
  });
});

describe("an answer in flight and the chat on show (#970)", () => {
  it("lets the answer land in the chat it was asked in, and switches to the new page's chat after it (#970)", async () => {
    const be = backend(ALL);
    await mount({ key: "deck:planner:99", title: "New deck" }, be);
    await send("rate my deck");
    await show(MATCH);
    await settle();
    // Still on the deck chat while the answer streams.
    expect(label()).toBe("Deck: New deck");
    be.emit("thread", { thread_id: 40 });
    be.emit("text", { delta: "Looks fine" });
    await settle();
    expect(body()).toContain("Looks fine");
    be.emit("done", { thread_id: 40 });
    be.close();
    await settle();
    expect(readThreadHint("deck:planner:99")).toBe(40);
    expect(readThreadHint("match:m1")).toBe(2); // its own chat, not the answer's thread
    expect(label()).toBe("Match: Luffy vs Zoro");
    expect(body()).toContain("match question");
    expect(body()).not.toContain("Looks fine");
  });
});

describe("the Chats list (#970)", () => {
  async function pick(name: string) {
    await act(async () => button("Chats")!.click());
    await settle();
    const row = [...document.querySelectorAll(".lp-chats-row")].find((r) => r.textContent?.includes(name)) as HTMLButtonElement;
    await act(async () => row.click());
    await settle();
  }

  it("lists this page's chat first, then the others by kind (#970)", async () => {
    await mount(DECK, backend(ALL));
    await act(async () => button("Chats")!.click());
    await settle();
    const groups = [...document.querySelectorAll(".lp-chats-group")].map((g) => [g.querySelector("h3")!.textContent, [...g.querySelectorAll(".lp-chats-title")].map((t) => t.textContent)]);
    expect(groups).toEqual([
      ["This page", ["Zoro Aggro"]],
      ["Matches", ["Luffy vs Zoro"]],
      ["General", ["Rules chat"]],
    ]);
  });

  it("opens a picked chat in place, with its own name in the header (#970)", async () => {
    await mount(DECK, backend(ALL));
    await pick("Luffy vs Zoro");
    expect(label()).toBe("Match: Luffy vs Zoro");
    expect(body()).toContain("match question");
    // A match chat can't start another chat, even from a deck page.
    expect(button("New chat")).toBeUndefined();
    expect(document.querySelector(".lp-chats-menu")).toBeNull();
  });

  it("keeps a picked chat through an answer and a re-render, until the page's scope changes (#970)", async () => {
    const be = backend(ALL);
    await mount(DECK, be);
    await pick("Rules chat");
    await show({ ...DECK });
    await send("one more thing");
    expect(be.posts[0]).toMatchObject({ thread_id: 1 });
    be.emit("done", { thread_id: 1 });
    be.close();
    await settle();
    expect(label()).toBe("General");
    expect(body()).toContain("general question");
    await show(MATCH);
    await settle();
    expect(label()).toBe("Match: Luffy vs Zoro");
  });

  it("starts a fresh chat in the shown chat's scope with New chat, leaving the old one listed (#970)", async () => {
    const be = backend(ALL);
    await mount(DECK, be);
    await act(async () => button("New chat")!.click());
    await settle();
    expect(body()).not.toContain("deck question");
    expect(JSON.parse(localStorage.getItem(THREADS_KEY) ?? "{}")["deck:planner:7"]).toBeUndefined();
    await send("fresh start");
    expect(be.posts[0]).toMatchObject({ scope: "deck:planner:7", scope_title: "Zoro Aggro" });
    expect(be.posts[0]).not.toHaveProperty("thread_id");
  });
});

describe("a message the board sends for the player (#970)", () => {
  it("goes into the match's chat even when the panel was never opened (#970)", async () => {
    const be = backend(ALL);
    await mount(undefined, be, { open: false });
    await show(undefined, MATCH);
    await settle();
    const done = ask!("what now?");
    await settle();
    expect(be.posts[0]).toMatchObject({ message: "what now?", thread_id: 2 });
    be.emit("done", { thread_id: 2 });
    be.close();
    await done;
  });

  it("starts the match's chat under the match's scope when the game has none yet (#970)", async () => {
    const be = backend(ALL);
    await mount(undefined, be, { open: false });
    await show(undefined, { key: "match:m9", title: "Nami vs Law" });
    await settle();
    const done = ask!("what now?");
    await settle();
    expect(be.posts[0]).toMatchObject({ scope: "match:m9", scope_title: "Nami vs Law" });
    be.emit("done", { thread_id: 3 });
    be.close();
    await done;
  });
});
