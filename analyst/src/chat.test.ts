import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  DEFAULT_LEADER_ID,
  getCardDef,
  listLegalIntents,
  MATCH_REPLAY_SCHEMA,
  skipMulligans,
  type GameEvent,
  type MatchReplay,
  type Seat,
} from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import { admit, anthropicModel, CHAT_MODEL, chatBody, ChatHttpError, contextBlock, costUsd, flattenCited, originAllowed, runBrief, runChat, runReview, toCitation, type CallModel, type ChatDeps, type ModelReply, type SseEvent } from "./chat";
import { narrateGame, replayGame, searchGames } from "./matches";

const catalog = loadCatalog();

/** Play legal moves until a Life card is taken as damage. */
function gameWithLifeTaken(): { replay: MatchReplay; taken: Extract<GameEvent, { type: "life_taken" }> } {
  const players: MatchReplay["players"] = [
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  ];
  const seed = 17;
  const rng = createSeededRng(seed);
  let state = skipMulligans(createMatch({ seed, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }), rng);
  const intents: MatchReplay["intents"] = [];
  for (let i = 0; i < 500 && state.winner === null; i++) {
    const seat = (([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0))!;
    const legal = listLegalIntents(state, seat);
    const intent =
      legal.find((x) => x.type.includes("attack")) ?? legal.find((x) => x.type.startsWith("pass")) ?? legal.find((x) => x.type === "end_turn") ?? legal[0]!;
    const result = applyIntent(state, intent, { seat, rng });
    state = result.state;
    intents.push({ seat, intent });
    const taken = result.events.find((e): e is Extract<GameEvent, { type: "life_taken" }> => e.type === "life_taken");
    if (taken) {
      return {
        replay: { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, lifeCheckEveryHit: true, players, intents, end: { winner: (1 - taken.seat) as Seat, reason: "concede" } },
        taken,
      };
    }
  }
  throw new Error("no Life was taken");
}

const { replay, taken } = gameWithLifeTaken();

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/** A fake planner API: answers by "METHOD path" (query string ignored) and records every call. */
function planner(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = new URL(url).pathname;
    calls.push({ url, method, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined });
    const key = `${method} ${path}`;
    if (!(key in answers)) return new Response(JSON.stringify({ detail: `no fake for ${key}` }), { status: 404 });
    const answer = answers[key];
    if (answer === null) return new Response(null, { status: 204 });
    if (typeof answer === "number") return new Response("{}", { status: answer });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
}

const BUDGET = { allowed: true, spent_today_usd: 0.5, daily_cap_usd: 3 };
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

/** A model that plays back scripted replies, streaming each reply's text. */
function scriptedModel(replies: (ModelReply | Error)[]) {
  const seen: Record<string, any>[] = [];
  const callModel: CallModel = async (params, onText, _signal, onCite) => {
    seen.push(structuredClone(params));
    const next = replies.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no more replies");
    // Like the API's stream: a text block's text, then the citations attached to it.
    for (const b of next.content) {
      if (b.type !== "text") continue;
      onText(String(b.text));
      for (const raw of (b.citations as unknown[] | undefined) ?? []) {
        const c = toCitation(raw);
        if (c) onCite?.(c);
      }
    }
    return next;
  };
  return { seen, callModel };
}

const deps = (api: ChatDeps["api"], callModel: CallModel): ChatDeps => ({ api, catalog, knowledge: {}, callModel });

describe("game archive", () => {
  it("names every hidden card in an archive replay and calls the seats Player A and B (#377)", () => {
    const game = narrateGame(replay);
    const side = taken.seat === 0 ? "A" : "B";
    expect(game.log).toContain(`Player ${side} takes Life (${getCardDef(taken.defId).name})`);
    expect(game.log[0]).toBe("--- Turn 1 (Player A's turn) ---");
    expect(game.result).toEqual({ winner: side === "A" ? "B" : "A", reason: "concede" });
    expect(game.openingHands.A).toHaveLength(5);
    expect(game.openingHands.A).not.toEqual(game.openingHands.B);
  });

  it("searches the archive with the service secret only, never a player token (#377)", async () => {
    const { calls, api } = planner({
      "GET /analyst/corpus/games": { total: 1, offset: 0, window_days: 30, games: [{ game_id: "g_1", A: { leader: "OP01-001" }, B: { leader: "OP01-060" } }] },
      "GET /analyst/corpus/games/g_1/replay": { game_id: "g_1", date: null, ranked: true, rating_bands: {}, replay },
    });
    const found = await searchGames(api, { leader: " op01-001", result: "lost", wentFirst: false, days: 30 });
    expect(calls[0]).toEqual({
      url: "https://api.test/analyst/corpus/games?leader=OP01-001&result=lost&went_first=false&days=30",
      method: "GET",
      headers: { "X-Analyst-Service": "svc" },
      body: undefined,
    });
    expect(found.games[0]!.A.leader_name).toBe(getCardDef("OP01-001").name);
    const game = await replayGame(api, "g_1");
    expect(calls[1]!.headers).toEqual({ "X-Analyst-Service": "svc" });
    expect(game.gameId).toBe("g_1");
  });
});

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
    const spent = planner({ "GET /analyst/me": {}, "GET /analyst/chat/budget": { ...BUDGET, allowed: false } });
    const err = await admit(spent.api, "chat.1.2.sig").catch((e) => e);
    expect(err).toBeInstanceOf(ChatHttpError);
    expect(err).toMatchObject({ status: 429, code: "budget" });
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
    expect(spend).toMatchObject({ kind: "chat", input_tokens: 3000, output_tokens: 300 });
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

describe("why hints (#399)", () => {
  const hint = { id: "thin-early", tier: "shape" as const, title: "Thin early game", detail: "Only 6 cards cost 3 or less.", cardIds: ["OP01-016", "OP01-017"] };

  it("puts the hint the player asked about in the context block (#399)", () => {
    const block = contextBlock({ page: "deck", hint })!;
    expect(block).toContain("build hint (shape, id thin-early): Thin early game");
    expect(block).toContain("hint detail: Only 6 cards cost 3 or less.");
    expect(block).toContain("hint cards: OP01-016, OP01-017");
  });

  it("names the planner deck id so Log Pose can find the saved deck (#399)", () => {
    const block = contextBlock({ deck: { name: "Zoro", leaderId: "OP01-001", cards: [], plannerDeckId: 42 } })!;
    expect(block).toContain("planner deck id: 42");
  });

  it("accepts a hint at the app's length limits (#399)", () => {
    const r = chatBody.safeParse({
      message: "Why?",
      context: { hint: { id: "x".repeat(80), tier: "rule", title: "t".repeat(200), detail: "d".repeat(600), cardIds: Array.from({ length: 20 }, () => "OP01-001") } },
    });
    expect(r.success).toBe(true);
  });
});

describe("post-game analysis", () => {
  it("reviews the game from the player's seat and saves the analysis for next time (#377)", async () => {
    const { calls, api } = planner({
      "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay },
      "POST /analyst/chat/usage": null,
      "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
    });
    const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "You lost on turn 3." }], stop_reason: "end_turn", usage: usage(5000, 400) }]);
    const events: SseEvent[] = [];
    await runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, (e) => events.push(e), new AbortController().signal);
    // The model reads the game from the player's seat: their Life card named, the opponent's hidden.
    const blocks = seen[0]!.messages[0].content as { type: string; source?: string; content?: { text: string }[]; citations?: unknown }[];
    const prompt = blocks.flatMap((b) => b.content ?? []).map((c) => c.text).join("\n");
    expect(prompt).toContain(`Seat ${taken.seat} (you) takes Life (${getCardDef(taken.defId).name})`);
    expect(seen[0]!.tools).toBeUndefined();
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("https://api.test/analyst/reviews/m1");
    expect(put.body).toEqual({ text: "You lost on turn 3.", citations: [] });
    expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toMatchObject({ kind: "review", input_tokens: 5000 });
    expect(events.map((e) => e.event)).toEqual(["status", "text", "done"]);
  });
});

const turnText = (t: string, citations?: unknown[]) => ({ type: "text", text: t, ...(citations ? { citations } : {}) });
const loc = (source: string, cited_text: string, title = "T") => ({ type: "search_result_location", source, title, cited_text, search_result_index: 0, start_block_index: 0, end_block_index: 1 });

describe("sources and citations (#390)", () => {
  it("keeps only search-result citations and shortens a very long quote (#390)", () => {
    expect(toCitation(loc("card:OP01-001", "Zoro text", "Zoro"))).toEqual({ source: "card:OP01-001", title: "Zoro", cited_text: "Zoro text" });
    expect(toCitation({ type: "web_search_result_location", url: "https://x", cited_text: "x" })).toBeNull();
    expect(toCitation({ type: "page_location", source: "card:OP01-001", cited_text: "x" })).toBeNull();
    expect(toCitation({ type: "search_result_location", source: "", cited_text: "x" })).toBeNull();
    expect(toCitation(loc("rule:1-1", "r".repeat(2000)))!.cited_text).toHaveLength(800);
  });

  it("places each block's citations at the end of that block's text, shifted by the trimmed leading space (#390)", () => {
    const flat = flattenCited([
      turnText("  Zoro is 5000 power.", [loc("card:OP01-001", "power 5000"), loc("card:OP01-001", "power 5000"), loc("rule:1-1", "Rule")]),
      { type: "tool_use", id: "x", name: "y", input: {} },
      turnText(" My read: he is slow.", [{ type: "web_search_result_location", cited_text: "n" }]),
      turnText(" Done. ", [loc("match:m1#t2", "Turn 2")]),
    ]);
    expect(flat.text).toBe("Zoro is 5000 power. My read: he is slow. Done.");
    expect(flat.citations).toEqual([
      { at: 19, source: "card:OP01-001", title: "T", cited_text: "power 5000" },
      { at: 19, source: "rule:1-1", title: "T", cited_text: "Rule" },
      { at: 46, source: "match:m1#t2", title: "T", cited_text: "Turn 2" },
    ]);
    expect(flat.text.slice(0, 19)).toBe("Zoro is 5000 power.");
  });

  it("sends a cite event after the cited text and before the next text, batching citations of one block (#390)", async () => {
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { callModel } = scriptedModel([
      {
        content: [
          turnText("Zoro costs 3.", [loc("card:OP01-001", "cost 3"), loc("card:OP01-001", "power 5000")]),
          turnText(" I'd keep him."),
          turnText(" Rule says so.", [loc("rule:6-5-3", "Blocker")]),
        ],
        stop_reason: "end_turn",
        usage: usage(10, 5),
      },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, (e) => events.push(e), new AbortController().signal);
    expect(events.map((e) => e.event)).toEqual(["thread", "text", "cite", "text", "text", "cite", "done"]);
    expect(events[2]!.data).toEqual({
      citations: [
        { source: "card:OP01-001", title: "T", cited_text: "cost 3" },
        { source: "card:OP01-001", title: "T", cited_text: "power 5000" },
      ],
    });
    expect(events[5]!.data).toEqual({ citations: [{ source: "rule:6-5-3", title: "T", cited_text: "Blocker" }] });
  });

  it("stores the model's answer with its citations untouched and keeps rounds apart by a blank line like the saved thread (#390)", async () => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
    const cited = turnText("Zoro is a leader.", [loc("card:OP01-001", "leader")]);
    const { callModel } = scriptedModel([
      { content: [turnText("Checking."), toolUse], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [cited], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", { message: "Hi" }, (e) => events.push(e), new AbortController().signal);
    const deltas = events.filter((e) => e.event === "text").map((e) => e.data.delta);
    expect(deltas).toEqual(["Checking.", "\n\nZoro is a leader."]);
    const saved = calls.find((c) => c.url.endsWith("/threads/9/messages"))!.body as { messages: { content: any[] }[] };
    expect(saved.messages[3]!.content).toEqual([cited]);
  });

  it("counts the tokens of a review stream that broke mid-answer (#377)", async () => {
    const { calls, api } = planner({ "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay }, "POST /analyst/chat/usage": null });
    const dropped = Object.assign(new Error("connection reset"), { partialUsage: usage(4000, 120) });
    const { callModel } = scriptedModel([dropped]);
    await expect(runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, () => {}, new AbortController().signal)).rejects.toThrow("connection reset");
    expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toMatchObject({ kind: "review", input_tokens: 4000, output_tokens: 120 });
  });

  it("sends the game to the review as one search result per turn and saves the review's citations with their offsets (#390)", async () => {
    const { calls, api } = planner({
      "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay },
      "POST /analyst/chat/usage": null,
      "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
    });
    const { seen, callModel } = scriptedModel([
      {
        content: [turnText("You lost on turn 3.", [loc("match:m1#t3", "Seat 1 takes Life")]), turnText(" Next time keep Nami back.")],
        stop_reason: "end_turn",
        usage: usage(5000, 400),
      },
    ]);
    const events: SseEvent[] = [];
    await runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, (e) => events.push(e), new AbortController().signal);
    const blocks = seen[0]!.messages[0].content as { type: string; source?: string }[];
    const sent = blocks.filter((b) => b.type === "search_result").map((b) => b.source);
    expect(sent[0]).toBe("match:m1");
    expect(sent.length).toBeGreaterThan(2);
    for (const src of sent.slice(1)) expect(src).toMatch(/^match:m1#t\d+$/);
    expect(events.map((e) => e.event)).toEqual(["status", "text", "cite", "text", "done"]);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({
      text: "You lost on turn 3. Next time keep Nami back.",
      citations: [{ at: 19, source: "match:m1#t3", title: "T", cited_text: "Seat 1 takes Life" }],
    });
  });

  it("passes the Claude stream's text and search-result citations on, ignoring other kinds (#390)", async () => {
    const handlers: Record<string, (...a: any[]) => void> = {};
    const stream = {
      on: (event: string, cb: (...a: any[]) => void) => void (handlers[event] = cb),
      finalMessage: async () => {
        handlers.text!("Zoro costs 3.");
        handlers.citation!(loc("card:OP01-001", "cost 3", "Zoro"), []);
        handlers.citation!({ type: "web_search_result_location", url: "https://x", cited_text: "n" }, []);
        return { content: [], stop_reason: "end_turn", usage: usage(1, 1) };
      },
    };
    const model = anthropicModel({ beta: { messages: { stream: () => stream } } } as never);
    const texts: string[] = [];
    const cites: unknown[] = [];
    await model({}, (d) => texts.push(d), new AbortController().signal, (c) => cites.push(c));
    expect(texts).toEqual(["Zoro costs 3."]);
    expect(cites).toEqual([{ source: "card:OP01-001", title: "Zoro", cited_text: "cost 3" }]);
  });

  it("returns the model that served the call, so the eval can check it (#403)", async () => {
    const stream = {
      on: () => undefined,
      finalMessage: async () => ({ content: [], stop_reason: "end_turn", usage: usage(1, 1), model: "claude-served-model" }),
    };
    const model = anthropicModel({ beta: { messages: { stream: () => stream } } } as never);
    const reply = await model({}, () => undefined, new AbortController().signal);
    expect(reply.model).toBe("claude-served-model");
  });
});

describe("deck edit suggestions (#400)", () => {
  const MAIN = [
    ...["ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013", "ST01-014"].map((id) => ({ id, copies: 4 })),
    { id: "ST01-015", copies: 2 },
  ];
  const propose = { type: "tool_use", id: "t1", name: "propose_deck_edit", input: { summary: "Trim the event", changes: [{ id: "ST01-016", delta: 2, reason: "Cheaper" }, { id: "ST01-015", delta: -2, reason: "Too slow" }] } };
  const body = { message: "Review this deck", context: { app: "duel" as const, deck: { name: "Luffy", leaderId: "ST01-001", ref: "duel:d1", cards: MAIN } } };
  const run = async (save: boolean) => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/threads/9/proposals": save ? null : 500,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { seen, callModel } = scriptedModel([
      { content: [propose], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "See the card." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);
    return { calls, seen, events };
  };

  it("streams a deck edit as a proposal event and saves it after the turn (#400)", async () => {
    const { calls, events } = await run(true);
    const proposal = events.find((e) => e.event === "proposal")!;
    expect(proposal.data).toMatchObject({
      id: "t1",
      version: 1,
      target: { ref: "duel:d1", name: "Luffy", leader_id: "ST01-001" },
      lines: [
        { id: "ST01-016", before: 0, after: 2 },
        { id: "ST01-015", before: 2, after: 0 },
      ],
      legality: { legal: true, count: 50 },
    });
    expect(events.map((e) => e.event)).toEqual(["thread", "status", "proposal", "text", "done"]);
    // The proposals are saved after the turn's messages.
    const urls = calls.map((c) => c.url.replace("https://api.test", ""));
    expect(urls.indexOf("/analyst/chat/threads/9/proposals")).toBeGreaterThan(urls.indexOf("/analyst/chat/threads/9/messages"));
    expect(calls.find((c) => c.url.endsWith("/threads/9/proposals"))!.body).toEqual({ proposals: [proposal.data] });
  });

  it("sends the deck edit back to the model as search results only, never mixed with text (#400)", async () => {
    const { seen } = await run(true);
    const result = seen[1]!.messages.at(-1).content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content.every((b: { type: string }) => b.type === "search_result")).toBe(true);
    expect(result.content[0].source).toMatch(/^deck:/);
  });

  it("still finishes the turn when saving the proposal fails (#400)", async () => {
    const { calls, events } = await run(false);
    expect(events.at(-1)!.event).toBe("done");
    expect(calls.some((c) => c.url.endsWith("/threads/9/messages"))).toBe(true);
  });

  it("never shows the app's deck ref to the model (#400)", async () => {
    const { seen } = await run(true);
    expect(JSON.stringify(seen[0]!.messages)).not.toContain("duel:d1");
  });

  it("gives a refused edit no card and tells the model why (#400)", async () => {
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const bad = { ...propose, input: { summary: "Add one", changes: [{ id: "ST01-016", delta: 1, reason: "More" }] } };
    const { seen, callModel } = scriptedModel([
      { content: [bad], stop_reason: "tool_use", usage: usage(1, 1) },
      { content: [{ type: "text", text: "Ok." }], stop_reason: "end_turn", usage: usage(1, 1) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);
    expect(events.some((e) => e.event === "proposal")).toBe(false);
    expect(seen[1]!.messages.at(-1).content[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/51 of 50/) });
  });
});
