import { getCardDef } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import {
  admit, anthropicModel, CHAT_MODEL, chatBody, ChatHttpError, costUsd, originAllowed, runBrief, runChat, runReview, type CallModel, type ChatDeps, type ModelReply, type SseEvent,
} from "./chat";
import { lifeTakenGame } from "./testFixtures";
import { BUDGET, catalog, deps, planner, scriptedModel, usage } from "./testkit";

const { replay, taken } = lifeTakenGame();

describe("chat", () => {
  it("prices calls at the chat model's rates, cache reads and writes included (#377)", () => {
    const opus = "claude-opus-5-5";
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 }, opus)).toBeCloseTo(4);
    expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000 }, opus)).toBeCloseTo(20);
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }, opus)).toBeCloseTo(5.2);
  });

  it("costUsd prices Sonnet at Sonnet rates (#428)", () => {
    const u = { input_tokens: 1_000_000, output_tokens: 100_000 };
    expect(costUsd(u, "claude-sonnet-5-5")).toBeCloseTo(3);
    expect(costUsd(u, "claude-opus-5-5")).toBeCloseTo(6);
  });

  it("costUsd prices Sonnet cache reads at 0.20 per million, as Opus does (#430)", () => {
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }, "claude-sonnet-5-5")).toBeCloseTo(0.2);
  });

  it("costUsd prices Haiku 4.5 at its own rates and an unknown model as Opus (#430)", () => {
    const u = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 };
    expect(costUsd(u, "claude-haiku-4-5")).toBeCloseTo(1 + 5 + 0.1 + 1.25);
    expect(costUsd(u, "claude-mystery-9")).toBeCloseTo(costUsd(u, "claude-opus-5-5"));
  });

  it("costUsd moves Haiku 5.5 to its long-prompt tier only past 100K prompt tokens, cache included (#430)", () => {
    const m = "claude-haiku-5-5";
    expect(costUsd({ input_tokens: 100_000, output_tokens: 100_000 }, m)).toBeCloseTo(0.06);
    expect(costUsd({ input_tokens: 100_001, output_tokens: 100_000 }, m)).toBeCloseTo(0.30001, 4);
    expect(costUsd({ input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 99_000, cache_creation_input_tokens: 1001 }, m)).toBeCloseTo(0.0005 + 0.00495 + 0.0006255, 6);
  });

  it("prices a Haiku 5.5 turn call by call, so only the call over 100K pays the long tier (#430)", async () => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": { ...BUDGET, model: "claude-haiku-5-5" },
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const { callModel } = scriptedModel([
      { content: [toolUse], stop_reason: "tool_use", usage: usage(150_000, 0) },
      { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn", usage: usage(60_000, 0) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, (e) => events.push(e), new AbortController().signal);
    // 150K at 0.50 plus 60K at 0.10; pricing the 210K total as one call would give 0.105.
    const expected = 0.075 + 0.006;
    expect(events.at(-1)!.data).toMatchObject({ cost_usd: expect.closeTo(expected, 6) });
    expect((calls.find((c) => c.url.endsWith("/chat/usage"))!.body as Record<string, number>).cost_usd).toBeCloseTo(expected, 6);
  });

  describe("thread scope (#970)", () => {
    const turn = async (body: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const { calls, api } = planner({
        "POST /analyst/chat/threads": { id: 9 },
        "POST /analyst/chat/threads/9/messages": null,
        "GET /analyst/chat/threads/4/content": { id: 4, title: "t", messages: [] },
        "POST /analyst/chat/threads/4/messages": null,
        "POST /analyst/chat/usage": null,
        "GET /analyst/chat/budget": BUDGET,
        ...extra,
      });
      const { callModel } = scriptedModel([{ content: [{ type: "text", text: "Ahoy." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
      await runChat(deps(api, callModel), "chat.tok", chatBody.parse(body), () => undefined, new AbortController().signal);
      return calls.filter((c) => c.url.endsWith("/analyst/chat/threads") && c.method === "POST");
    };

    it("creates the thread with the scope and title the client sent", async () => {
      const created = await turn({ message: "How is this deck?", scope: "deck:planner:42", scope_title: "Zoro aggro" });
      expect(created).toHaveLength(1);
      expect(created[0]!.body).toEqual({ title: "Zoro aggro", scope: "deck:planner:42" });
    });

    it("scopes to general and titles from the message when the client sends neither", async () => {
      const created = await turn({ message: "  How   is\nmy deck? " });
      expect(created[0]!.body).toEqual({ title: "How is my deck?", scope: "general" });
    });

    it("rejects a scope that isn't one of the four shapes", () => {
      for (const scope of ["", "match:", "match:a b", "deck:planner:x", "deck:other:1", "match:" + "a".repeat(65)]) {
        expect(chatBody.safeParse({ message: "hi", scope }).success, scope).toBe(false);
      }
      for (const scope of ["general", "match:abc123-r1", "deck:planner:7", "deck:duel:0b9c-4f_x"]) {
        expect(chatBody.safeParse({ message: "hi", scope }).success, scope).toBe(true);
      }
    });

    it("makes no thread when one is continued, and ignores the scope sent with it", async () => {
      const created = await turn({ message: "More", thread_id: 4, scope: "match:g1", scope_title: "New" });
      expect(created).toHaveLength(0);
    });
  });

  it("sends no output_config.effort to Haiku 4.5, in a chat, a review or a brief, while Sonnet gets one (#430)", async () => {
    const chat = async (model: string) => {
      const { api } = planner({
        "POST /analyst/chat/threads": { id: 9 },
        "POST /analyst/chat/threads/9/messages": null,
        "POST /analyst/chat/usage": null,
        "GET /analyst/chat/budget": { ...BUDGET, model },
      });
      const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "Ahoy." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
      await runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, () => undefined, new AbortController().signal);
      return seen[0]!;
    };
    const review = async (model: string) => {
      const { api } = planner({
        "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay },
        "GET /analyst/chat/budget": { ...BUDGET, model },
        "POST /analyst/chat/usage": null,
        "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
      });
      const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "You lost." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
      await runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, () => undefined, new AbortController().signal);
      return seen[0]!;
    };
    expect((await chat("claude-sonnet-5-5")).output_config).toEqual({ effort: "medium" });
    expect((await review("claude-sonnet-5-5")).output_config).toEqual({ effort: "high" });
    const haikuChat = await chat("claude-haiku-4-5");
    expect(haikuChat.model).toBe("claude-haiku-4-5");
    expect("output_config" in haikuChat).toBe(false);
    const haikuReview = await review("claude-haiku-4-5");
    expect(haikuReview.model).toBe("claude-haiku-4-5");
    expect("output_config" in haikuReview).toBe(false);
    // Haiku 5.5 does take an effort.
    expect((await chat("claude-haiku-5-5")).output_config).toEqual({ effort: "medium" });
  });

  it("turns away a missing token, an expired session and a spent budget before any model call (#377)", async () => {
    const ok = planner({ "GET /analyst/me": {}, "GET /analyst/chat/budget": BUDGET });
    await expect(admit(ok.api, "chat.1.2.sig")).resolves.toBe("chat.1.2.sig");
    await expect(admit(ok.api, null)).rejects.toMatchObject({ status: 401, code: "auth" });
    await expect(admit(ok.api, "personal-link-token")).rejects.toMatchObject({ status: 401 });
    const expired = planner({ "GET /analyst/me": 401 });
    await expect(admit(expired.api, "chat.1.2.sig")).rejects.toMatchObject({ status: 401, code: "auth" });
    const spent = planner({ "GET /analyst/me": {}, "GET /analyst/chat/budget": { ...BUDGET, allowed: false, refusal: "daily" } });
    const err = await admit(spent.api, "chat.1.2.sig").catch((e) => e);
    expect(err).toBeInstanceOf(ChatHttpError);
    expect(err).toMatchObject({ status: 429, code: "daily" });
  });

  it("refuses with the code of the limit that stopped the player and logs a free refused row (#446)", async () => {
    for (const refusal of ["credit", "daily", "monthly"] as const) {
      const { calls, api } = planner({ "GET /analyst/me": {}, "GET /analyst/chat/budget": { ...BUDGET, allowed: false, refusal }, "POST /analyst/chat/usage": null });
      await expect(admit(api, "chat.1.2.sig", "review")).rejects.toMatchObject({ status: 429, code: refusal });
      expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toEqual({ kind: "review", cost_usd: 0, outcome: "refused", refusal });
    }
  });

  it("logs a busy refusal when a third stream starts (#446)", async () => {
    const { calls, api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/usage": null, "GET /analyst/chat/budget": BUDGET });
    const never = new Promise<ModelReply>(() => {});
    const callModel: CallModel = () => never;
    const d = deps(api, callModel);
    void runChat(d, "chat.77.2.sig", { message: "one" }, () => {}, new AbortController().signal);
    void runChat(d, "chat.77.2.sig", { message: "two" }, () => {}, new AbortController().signal);
    await new Promise((r) => setTimeout(r, 20));
    await expect(runChat(d, "chat.77.2.sig", { message: "three" }, () => {}, new AbortController().signal)).rejects.toMatchObject({ code: "busy" });
    expect(calls.filter((c) => c.url.endsWith("/chat/usage")).map((c) => c.body)).toEqual([{ kind: "chat", cost_usd: 0, outcome: "refused", refusal: "busy" }]);
  });

  it("stops between tool rounds when the credit runs out, keeps what was answered and says why (#446)", async () => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      // The check that counts the unsaved answer (extra=...) finds the credit gone.
      "GET /analyst/chat/budget": (url: string) => (url.includes("extra=") ? { ...BUDGET, allowed: false, refusal: "credit" } : BUDGET),
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const { seen, callModel } = scriptedModel([
      { content: [{ type: "text", text: "Checking." }, toolUse], stop_reason: "tool_use", usage: usage(1000, 100) },
      { content: [{ type: "text", text: "Should never be asked." }], stop_reason: "end_turn", usage: usage(2000, 200) },
    ]);
    const events: SseEvent[] = [];
    await expect(runChat(deps(api, callModel), "chat.tok", { message: "Is this leader good?" }, (e) => events.push(e), new AbortController().signal)).rejects.toMatchObject({ status: 429, code: "credit" });
    expect(seen).toHaveLength(1);
    expect(events.map((e) => e.event)).not.toContain("done");
    // What the second check was asked: the first round's cost.
    const check = calls.filter((c) => c.url.includes("extra="));
    expect(check).toHaveLength(1);
    expect(Number(new URL(check[0]!.url).searchParams.get("extra"))).toBeCloseTo(costUsd(usage(1000, 100)), 6);
    // The thread keeps the question and the text answered, as plain messages that end on the assistant.
    const saved = calls.find((c) => c.url.endsWith("/threads/9/messages"))!.body as { messages: { role: string; content: any }[] };
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved.messages[1]!.content).toEqual([{ type: "text", text: "Checking." }]);
    // The cost is recorded, then a free row says the limit stopped it.
    const rows = calls.filter((c) => c.url.endsWith("/chat/usage")).map((c) => c.body as Record<string, unknown>);
    expect(rows[0]).toMatchObject({ kind: "chat", thread_id: 9, outcome: "ok", tool_calls: 1, input_tokens: 1000 });
    expect(rows[1]).toEqual({ kind: "chat", cost_usd: 0, outcome: "refused", refusal: "credit", thread_id: 9 });
  });

  it("sends the player's credit with the done event so the meter can update (#446)", async () => {
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": { ...BUDGET, credit_usd: 5, credit_spent_usd: 1.25, refusal: null },
    });
    const { callModel } = scriptedModel([{ content: [{ type: "text", text: "Hi." }], stop_reason: "end_turn", usage: usage(10, 5) }]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, (e) => events.push(e), new AbortController().signal);
    expect(events.at(-1)!.data).toMatchObject({ credit_usd: 5, credit_spent_usd: 1.25, refusal: null });
  });

  it("keeps nothing when the limit stops an answer before it said anything (#446)", async () => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": (url: string) => (url.includes("extra=") ? { ...BUDGET, allowed: false, refusal: "daily" } : BUDGET),
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const { callModel } = scriptedModel([{ content: [toolUse], stop_reason: "tool_use", usage: usage(1000, 100) }]);
    await expect(runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, () => {}, new AbortController().signal)).rejects.toMatchObject({ code: "daily" });
    expect(calls.some((c) => c.url.endsWith("/messages"))).toBe(false);
  });

  it("marks a chat that was stopped as aborted and one that broke as an error (#446)", async () => {
    const run = async (abort: boolean) => {
      const { calls, api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/usage": null });
      const ctrl = new AbortController();
      const dropped = Object.assign(new Error("connection reset"), { partialUsage: usage(700, 40) });
      const { callModel } = scriptedModel([dropped]);
      const wrapped: CallModel = async (...a) => {
        if (abort) ctrl.abort();
        return callModel(...a);
      };
      await runChat(deps(api, wrapped), "chat.1.2.sig", { message: "Hi" }, () => {}, ctrl.signal).catch(() => undefined);
      return (calls.find((c) => c.url.endsWith("/chat/usage"))!.body as Record<string, unknown>).outcome;
    };
    expect(await run(true)).toBe("aborted");
    expect(await run(false)).toBe("error");
  });

  it("answers a price_history call with a cited price: source and says what it is doing (#946)", async () => {
    const released = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
      "GET /catalog/cards/OP05-119/price-history": { card_id: "OP05-119", product_id: 555, name: "Monkey.D.Luffy (Alternate Art)", group_name: "OP05", released, current: 20, points: [[released, 30], [new Date().toISOString().slice(0, 10), 20]] },
    });
    const toolUse = { type: "tool_use", id: "t1", name: "price_history", input: { card_id: "OP05-119", product_id: 555 } };
    const { seen, callModel } = scriptedModel([
      { content: [toolUse], stop_reason: "tool_use", usage: usage(1000, 100) },
      { content: [{ type: "text", text: "Buy now." }], stop_reason: "end_turn", usage: usage(2000, 200) },
    ]);
    const events: SseEvent[] = [];
    await runChat({ ...deps(api, callModel), knowledge: { stats: api } }, "chat.tok", { message: "When should I buy the OP05-119 alt?" }, (e) => events.push(e), new AbortController().signal);
    expect(events.find((e) => e.event === "status")!.data).toEqual({ text: "Checking price history" });
    const toolResult = seen[1]!.messages.at(-1).content[0];
    expect(toolResult.content[0]).toMatchObject({ type: "search_result", source: "price:OP05-119#555", citations: { enabled: true } });
    expect(toolResult.content.every((b: { type: string }) => b.type === "search_result")).toBe(true);
  });

  it("runs the tools the model asks for, streams the answer and saves the whole turn (#377)", async () => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const { seen, callModel } = scriptedModel([
      { content: [{ type: "text", text: "Checking." }, toolUse], stop_reason: "tool_use", usage: usage(1000, 100) },
      { content: [{ type: "text", text: "Zoro is a 5000 leader." }], stop_reason: "end_turn", usage: usage(2000, 200) },
    ]);
    const events: SseEvent[] = [];
    const body = { message: "Is this leader good?", context: { app: "duel" as const, deck: { name: "Zoro", leaderId: "OP01-001", cards: [{ id: "OP01-016", copies: 4 }] } } };
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);

    expect(events.map((e) => e.event)).toEqual(["thread", "text", "status", "text", "done"]);
    expect(events[2]!.data).toEqual({ text: "Reading card text" });
    // The second call carries the tool's result for the model to read.
    const toolResult = seen[1]!.messages.at(-1).content[0];
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    // Card facts come back as a search result the model can cite.
    expect(toolResult.content[0]).toMatchObject({ type: "search_result", source: "card:OP01-001", citations: { enabled: true } });
    expect(JSON.stringify(toolResult.content)).toContain(getCardDef("OP01-001").name);

    const saved = calls.find((c) => c.url.endsWith("/threads/9/messages"))!.body as { messages: { role: string; content: any }[] };
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(saved.messages[0]!.content[0].text).toMatch(/^<context>\n[\s\S]*1xOP01-001\n4xOP01-016/);
    expect(saved.messages[0]!.content[1]).toEqual({ type: "text", text: "Is this leader good?" });
    expect(saved.messages[2]!.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    // Stored content has no cache breakpoints; those are added per request.
    expect(JSON.stringify(saved)).not.toContain("cache_control");

    const spend = calls.find((c) => c.url.endsWith("/chat/usage"))!.body as Record<string, unknown>;
    expect(spend).toMatchObject({ kind: "chat", input_tokens: 3000, output_tokens: 300, thread_id: 9, outcome: "ok", tool_calls: 1 });
    expect(spend.duration_ms).toBeGreaterThanOrEqual(0);
    expect(spend.cost_usd).toBeCloseTo(costUsd(usage(3000, 300)));
    expect(events.at(-1)!.data).toMatchObject({ thread_id: 9, spent_today_usd: 0.5, daily_cap_usd: 3 });
  });

  it("runs every call on the model the planner's budget names, and falls back to the default for an unknown one (#428)", async () => {
    const runOn = async (budgetModel: unknown) => {
      const { calls, api } = planner({
        "POST /analyst/chat/threads": { id: 9 },
        "POST /analyst/chat/threads/9/messages": null,
        "POST /analyst/chat/usage": null,
        "GET /analyst/chat/budget": { ...BUDGET, model: budgetModel },
      });
      const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "Ahoy." }], stop_reason: "end_turn", usage: usage(1_000_000, 100_000) }]);
      await runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, () => undefined, new AbortController().signal);
      return { model: seen[0]!.model, spend: calls.find((c) => c.url.endsWith("/chat/usage"))!.body as Record<string, unknown> };
    };
    const opus = await runOn("claude-opus-5-5");
    expect(opus.model).toBe("claude-opus-5-5");
    expect(opus.spend).toMatchObject({ model: "claude-opus-5-5" });
    expect(opus.spend.cost_usd).toBeCloseTo(6);
    const sonnet = await runOn("claude-sonnet-5-5");
    expect(sonnet.model).toBe("claude-sonnet-5-5");
    expect(sonnet.spend.cost_usd).toBeCloseTo(3);
    // An unknown name (or none) is not sent to the API: the env/default model is used instead.
    expect((await runOn("gpt-5")).model).toBe(CHAT_MODEL);
    expect((await runOn(undefined)).model).toBe(CHAT_MODEL);
  });

  it("resends an existing thread as stored and adds only the new turn (#377)", async () => {
    const earlier = [
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Ahoy." }] },
    ];
    const { calls, api } = planner({
      "GET /analyst/chat/threads/4/content": { id: 4, title: "t", messages: earlier },
      "POST /analyst/chat/threads/4/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "Sure." }], stop_reason: "end_turn", usage: usage(10, 5) }]);
    await runChat(deps(api, callModel), "chat.tok", { thread_id: 4, message: "Again?" }, () => {}, new AbortController().signal);
    expect(seen[0]!.messages.slice(0, 2)).toEqual(earlier);
    expect(seen[0]!.messages[2].content[0]).toMatchObject({ type: "text", text: "Again?", cache_control: { type: "ephemeral" } });
    const saved = calls.find((c) => c.url.endsWith("/threads/4/messages"))!.body as { messages: unknown[] };
    expect(saved.messages).toHaveLength(2);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/chat/threads"))).toBe(false);
  });

  it("drops earlier turns' thinking blocks when resending a thread (#424)", async () => {
    const earlier = [
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      { role: "assistant", content: [{ type: "thinking", thinking: "hmm", signature: "sigA" }, { type: "redacted_thinking", data: "xx" }, { type: "text", text: "Ahoy." }] },
    ];
    const { api } = planner({
      "GET /analyst/chat/threads/4/content": { id: 4, title: "t", messages: earlier },
      "POST /analyst/chat/threads/4/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const now = { type: "thinking", thinking: "look it up", signature: "sigB" };
    const { seen, callModel } = scriptedModel([
      { content: [now, toolUse], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    await runChat(deps(api, callModel), "chat.tok", { thread_id: 4, message: "Again?" }, () => {}, new AbortController().signal);
    expect(seen[0]!.messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Ahoy." }] });
    // This turn's own thinking stays for the tool loop.
    const turn = seen[1]!.messages.at(-2);
    expect(turn.role).toBe("assistant");
    expect(turn.content[0]).toEqual(now);
    expect(JSON.stringify(seen[1]!.messages.slice(0, 2))).not.toContain("thinking");
  });

  it("drops an earlier assistant turn that was only thinking instead of resending its signature (#425)", async () => {
    const earlier = [
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sigA" }] },
    ];
    const { api } = planner({
      "GET /analyst/chat/threads/4/content": { id: 4, title: "t", messages: earlier },
      "POST /analyst/chat/threads/4/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "Sure." }], stop_reason: "end_turn", usage: usage(10, 5) }]);
    await runChat(deps(api, callModel), "chat.tok", { thread_id: 4, message: "Again?" }, () => {}, new AbortController().signal);
    expect(JSON.stringify(seen[0]!.messages)).not.toContain("thinking");
    expect(seen[0]!.messages.some((m: any) => m.role === "assistant")).toBe(false);
    expect(seen[0]!.messages.every((m: any) => m.content.length > 0)).toBe(true);
  });

  it("doesn't save a turn the model never finished, but still counts what it cost (#377)", async () => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/usage": null,
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const { callModel } = scriptedModel([{ content: [toolUse], stop_reason: "tool_use", usage: usage(1000, 100) }, new Error("overloaded")]);
    await expect(runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, () => {}, new AbortController().signal)).rejects.toThrow("overloaded");
    expect(calls.some((c) => c.url.endsWith("/messages"))).toBe(false);
    expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toMatchObject({ input_tokens: 1000, output_tokens: 100 });
  });

  it("counts the tokens of a chat stream that broke mid-answer (#377)", async () => {
    const { calls, api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/usage": null });
    const dropped = Object.assign(new Error("connection reset"), { partialUsage: usage(700, 40) });
    const { callModel } = scriptedModel([dropped]);
    await expect(runChat(deps(api, callModel), "chat.1.2.sig", { message: "Hi" }, () => {}, new AbortController().signal)).rejects.toThrow("connection reset");
    expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toMatchObject({ kind: "chat", input_tokens: 700, output_tokens: 40 });
  });

  it("counts the tokens of a Claude stream that was cut off, carrying them on the error (#377)", async () => {
    const handlers: Record<string, (...a: any[]) => void> = {};
    const stream = {
      on: (event: string, cb: (...a: any[]) => void) => void (handlers[event] = cb),
      finalMessage: async () => {
        handlers.streamEvent!({ type: "message_start" }, { usage: usage(900, 1) });
        handlers.streamEvent!({ type: "message_delta" }, { usage: usage(900, 55) });
        throw new Error("aborted");
      },
    };
    const model = anthropicModel({ beta: { messages: { stream: () => stream } } } as never);
    const err = await model({}, () => {}, new AbortController().signal).catch((e) => e);
    expect(err.message).toBe("aborted");
    expect(err.partialUsage).toMatchObject({ input_tokens: 900, output_tokens: 55 });
  });

  it("lets a user have two chat or review streams at a time, and another once one ends (#377)", async () => {
    const { api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/usage": null, "POST /analyst/chat/threads/9/messages": null, "GET /analyst/chat/budget": BUDGET });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const reply: ModelReply = { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn", usage: usage(10, 5) };
    const slow: CallModel = async () => {
      await gate;
      return reply;
    };
    const fast: CallModel = async () => reply;
    const signal = new AbortController().signal;
    const first = runChat(deps(api, slow), "chat.1.2.sig", { message: "Hi" }, () => {}, signal);
    const second = runChat(deps(api, slow), "chat.1.4.sig3", { message: "Beside it" }, () => {}, signal);
    await expect(runChat(deps(api, slow), "chat.1.3.sig2", { message: "Again" }, () => {}, signal)).rejects.toMatchObject({ status: 429, code: "busy" });
    await expect(runReview(deps(api, slow), "chat.1.3.sig2", { match_id: "m1" }, () => {}, signal)).rejects.toMatchObject({ status: 429, code: "busy" });
    await expect(runChat(deps(api, fast), "chat.2.2.sig", { message: "Hi" }, () => {}, signal)).resolves.toBeUndefined();
    release();
    await Promise.all([first, second]);
    await expect(runChat(deps(api, fast), "chat.1.3.sig2", { message: "Again" }, () => {}, signal)).resolves.toBeUndefined();
  });

  it("counts a generating brief as one of the user's two streams, but not a cached or peeked one (#409)", async () => {
    const lookup = { leader_id: "OP01-001", opponent_id: "ST01-001", deck: [{ id: "OP01-016", copies: 4 }], key: "k" };
    const TICKET = "mb1.ticket-body.ticket-sig";
    const { api } = planner({
      "POST /analyst/briefs/lookup": { ...lookup, brief: null },
      "GET /analyst/chat/budget": BUDGET,
      "POST /analyst/chat/usage": null,
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "PUT /analyst/briefs": null,
    });
    const cached = planner({ "POST /analyst/briefs/lookup": { ...lookup, brief: { text: "Saved.", citations: [], created_at: null } } }).api;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const reply: ModelReply = { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn", usage: usage(10, 5) };
    const slow: CallModel = async () => {
      await gate;
      return reply;
    };
    const fast: CallModel = async () => reply;
    const signal = new AbortController().signal;
    const brief = (d: ChatDeps, generate: boolean, token = "chat.1.3.sig2") => runBrief(d, token, { ticket: TICKET, generate }, () => {}, signal);
    const first = brief(deps(api, slow), true, "chat.1.2.sig");
    const second = runChat(deps(api, slow), "chat.1.4.sig3", { message: "Beside it" }, () => {}, signal);
    await expect(brief(deps(api, fast), true)).rejects.toMatchObject({ status: 429, code: "busy" });
    await expect(brief(deps(api, fast), false)).resolves.toBeUndefined();
    await expect(brief(deps(cached, fast), true)).resolves.toBeUndefined();
    await expect(brief(deps(api, fast), true, "chat.2.2.sig")).resolves.toBeUndefined();
    release();
    await Promise.all([first, second]);
    await expect(brief(deps(api, fast), true)).resolves.toBeUndefined();
  });

  it("lets only the apps' own origins call the chat from a browser (#377)", () => {
    const list = ["https://optcgduel.app"];
    expect(originAllowed(list, "https://optcgduel.app")).toBe(true);
    expect(originAllowed(list, "https://duel-web-git-x.vercel.app")).toBe(true);
    expect(originAllowed(list, "http://localhost:5173")).toBe(true);
    expect(originAllowed(list, "https://evil.example")).toBe(false);
    expect(originAllowed(list, "https://optcgduel.app.evil.example")).toBe(false);
    expect(originAllowed(list, undefined)).toBe(false);
  });
});
