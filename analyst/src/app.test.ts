import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, TOKEN_CHECK_MS, type AppDeps } from "./app";
import { MAX_TOOL_ROUNDS } from "./chat";
import { loadConfig, type Config } from "./config";
import { BUDGET, catalog, deps as chatDeps, planner, scriptedModel, usage } from "./testkit";

const TOKEN = "chat.42.2.sig";
const config = (over: Partial<Config> = {}): Config => ({ ...loadConfig({}), connectorKey: "", ...over });

const open: { close: () => void }[] = [];
afterEach(() => {
  vi.useRealTimers();
  while (open.length) open.pop()!.close();
});

/** Serves the app on a free port; `chat: true` wires the in-app chat to a scripted model and a fake planner. */
function serve(answers: Record<string, unknown>, opts: { config?: Partial<Config>; replies?: Parameters<typeof scriptedModel>[0]; chat?: boolean } = {}) {
  const { calls, api } = planner(answers);
  const model = scriptedModel(opts.replies ?? []);
  const deps: AppDeps = { catalog, knowledge: {}, api, chat: opts.chat === false ? null : chatDeps(api, model.callModel) };
  const server = createApp(config(opts.config), deps).listen(0);
  open.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { calls, base, model };
}

const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
const mcp = (url: string) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(INITIALIZE) });
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

/** The events of an SSE body, in order. */
const frames = (text: string) => text.split("\n\n").filter(Boolean).map((f) => ({ event: /^event: (.*)$/m.exec(f)![1]!, data: JSON.parse(/^data: (.*)$/m.exec(f)![1]!) as Record<string, any> }));

const CHAT_ANSWERS = { "GET /analyst/me": {}, "GET /analyst/chat/budget": BUDGET, "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/threads/9/messages": null, "POST /analyst/chat/usage": null };
const bearer = { Authorization: `Bearer ${TOKEN}` };
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("connector links (refactor 3.7a)", () => {
  it("serves MCP only on the connector key's path (refactor 3.7a)", async () => {
    const { base } = serve({}, { config: { connectorKey: "sekret" } });
    expect((await mcp(`${base}/mcp/wrong`)).status).toBe(404);
    expect(await (await mcp(`${base}/mcp/wrong`)).json()).toEqual({ error: "Not found" });
    expect((await mcp(`${base}/mcp/sekret`)).status).toBe(200);
  });

  it("answers 404 for a personal link the planner rejects and 503 when the planner cannot say (refactor 3.7a)", async () => {
    const rejected = serve({ "GET /analyst/me": 401 });
    expect((await mcp(`${rejected.base}/mcp/u/old`)).status).toBe(404);
    const down = serve({ "GET /analyst/me": 500 });
    const res = await mcp(`${down.base}/mcp/u/tok`);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("Try again shortly");
  });

  it("checks a personal link with the planner once, then again after it has gone stale (refactor 3.7a)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { calls, base } = serve({ "GET /analyst/me": {} });
    const checks = () => calls.filter((c) => c.url.endsWith("/analyst/me")).length;
    expect((await mcp(`${base}/mcp/u/tok`)).status).toBe(200);
    expect((await mcp(`${base}/mcp/u/tok`)).status).toBe(200);
    expect(checks()).toBe(1);
    vi.setSystemTime(Date.now() + TOKEN_CHECK_MS + 1000);
    expect((await mcp(`${base}/mcp/u/tok`)).status).toBe(200);
    expect(checks()).toBe(2);
  });
});

describe("chat routes (refactor 3.7a)", () => {
  it("allows the apps' origins to call the chat from a browser and nobody else (refactor 3.7a)", async () => {
    const { base } = serve({});
    const preflight = (origin: string) => fetch(`${base}/chat`, { method: "OPTIONS", headers: { Origin: origin } });
    const ok = await preflight("https://optcgduel.app");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://optcgduel.app");
    expect(ok.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    const evil = await preflight("https://evil.example");
    expect(evil.status).toBe(204);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers 503 when the chat is not set up, 400 for a malformed body and 401 without a chat token (refactor 3.7a)", async () => {
    const off = serve({}, { chat: false });
    const unset = await post(`${off.base}/chat`, { message: "Hi" });
    expect(unset.status).toBe(503);
    expect((await unset.json()).code).toBe("server");

    const { base } = serve(CHAT_ANSWERS);
    const bad = await post(`${base}/chat`, { message: "" }, bearer);
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("bad_request");
    const anon = await post(`${base}/chat`, { message: "Hi" });
    expect(anon.status).toBe(401);
    expect((await anon.json()).code).toBe("auth");
  });

  it("turns away a player whose budget is spent with the 429 JSON before any stream starts (refactor 3.7a)", async () => {
    const { base } = serve({ ...CHAT_ANSWERS, "GET /analyst/chat/budget": { allowed: false, refusal: "daily", spent_today_usd: 3.1, daily_cap_usd: 3 } });
    const res = await post(`${base}/chat`, { message: "Hi" }, bearer);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).code).toBe("daily");
  });

  it("streams the answer as server-sent events: thread, text, done (refactor 3.7a)", async () => {
    const { base } = serve(CHAT_ANSWERS, { replies: [{ content: [{ type: "text", text: "Ahoy." }], stop_reason: "end_turn", usage: usage(10, 10) }] });
    const res = await post(`${base}/chat`, { message: "Hi" }, bearer);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const body = await res.text();
    expect(body).toContain('event: text\ndata: {"delta":"Ahoy."}\n\n');
    expect(frames(body).map((f) => f.event)).toEqual(["thread", "text", "done"]);
    expect(frames(body)[0]!.data).toEqual({ thread_id: 9 });
  });

  it("shows the player a generic message for an unexpected failure and its own text for a Log Pose one (refactor 3.7a)", async () => {
    const spy = quiet();
    const broken = serve(CHAT_ANSWERS, { replies: [new Error("sk-secret-detail")] });
    const failed = await (await post(`${broken.base}/chat`, { message: "Hi" }, bearer)).text();
    const err = frames(failed).find((f) => f.event === "error")!;
    expect(err.data).toEqual({ message: "Log Pose hit a problem. Try again.", code: "server" });
    expect(failed).not.toContain("sk-secret-detail");
    expect(spy.mock.calls.map((c) => String(c[0])).some((l) => l.includes("sk-secret-detail"))).toBe(true);

    const lookup = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const endless = serve(CHAT_ANSWERS, { replies: Array.from({ length: MAX_TOOL_ROUNDS }, () => ({ content: [lookup], stop_reason: "tool_use", usage: usage(1, 1) })) });
    const text = await (await post(`${endless.base}/chat`, { message: "Hi" }, bearer)).text();
    expect(frames(text).find((f) => f.event === "error")!.data.message).toBe("Log Pose used too many lookups on that one. Try asking something narrower.");
    spy.mockRestore();
  });
});
