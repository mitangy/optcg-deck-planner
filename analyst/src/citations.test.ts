import {
  applyIntent, buildTestDeck, createMatch, createSeededRng, DEFAULT_LEADER_ID, listLegalIntents, MATCH_REPLAY_SCHEMA, skipMulligans, type MatchReplay, type Seat,
} from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { anthropicModel, flattenCited, runChat, runReview, toCitation, type SseEvent } from "./chat";
import { lifeTakenGame } from "./testFixtures";
import { BUDGET, catalog, deps, planner, scriptedModel, usage } from "./testkit";

const { replay, taken } = lifeTakenGame();

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

  it("gives the review a card reference with every card's text, and the opponent's deck only once the game is over (#472)", async () => {
    // Seat 1's deck holds OP12-002 (never played) and ST01-009 (played); neither is in seat 0's deck.
    const all = buildTestDeck(20);
    const players: MatchReplay["players"] = [
      { leaderId: DEFAULT_LEADER_ID, deck: all.slice(0, 12) },
      { leaderId: DEFAULT_LEADER_ID, deck: all.slice(8, 20) },
    ];
    const rng = createSeededRng(17);
    let state = skipMulligans(createMatch({ seed: 17, firstSeat: 0, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }), rng);
    const intents: MatchReplay["intents"] = [];
    for (let i = 0; i < 8; i++) {
      const seat = (([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0))!;
      const legal = listLegalIntents(state, seat);
      const intent = legal.find((x) => x.type === "play_card") ?? legal.find((x) => x.type.startsWith("pass")) ?? legal.find((x) => x.type === "end_turn") ?? legal[0]!;
      state = applyIntent(state, intent, { seat, rng }).state;
      intents.push({ seat, intent });
    }
    const finished: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed: 17, firstSeat: 0, skipMulligans: true, players, intents, end: { winner: 1, reason: "concede" } };
    const reference = async (r: MatchReplay) => {
      const { api } = planner({
        "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: 0, replay: r },
        "POST /analyst/chat/usage": null,
        "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
      });
      const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: usage(10, 5) }]);
      await runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, () => undefined, new AbortController().signal);
      const blocks = seen[0]!.messages[0].content as { type: string; text?: string }[];
      const refs = blocks.filter((b) => b.type === "text" && b.text?.startsWith("Card reference:"));
      expect(refs).toHaveLength(1);
      // After the per-turn sources, before the closing instruction.
      expect(blocks.indexOf(refs[0]!)).toBe(blocks.length - 2);
      expect(blocks[blocks.length - 1]!.text).toContain("Write the post-game analysis.");
      return refs[0]!.text!.split("\n");
    };
    const row = (lines: string[], id: string) => lines.find((l) => l.startsWith(`- ${id} `));
    const printed = (id: string) => {
      const c = catalog.cards.get(id)!;
      const stats = [c.type, c.colors.join("/"), c.life !== undefined ? `life ${c.life}` : "", c.cost !== undefined ? `cost ${c.cost}` : "", `power ${c.power}`, c.counter ? `counter ${c.counter}` : "", c.traits.length ? `traits: ${c.traits.join("/")}` : ""].filter(Boolean);
      return { head: `- ${id} ${c.name} (${stats.join(", ")})`, text: c.text.slice(0, 40) };
    };
    const over = await reference(finished);
    let withText = 0;
    for (const id of [DEFAULT_LEADER_ID, "ST01-003", "ST01-006", "ST01-008", "ST01-009", "OP12-002"]) {
      const { head, text } = printed(id);
      expect(row(over, id)).toContain(head);
      if (text) withText += 1;
      expect(row(over, id)).toContain(text);
    }
    expect(withText).toBeGreaterThan(0);
    const hidden = await reference({ ...finished, end: undefined });
    expect(row(hidden, "ST01-003")).toBeDefined();
    expect(row(hidden, "ST01-009")).toBeDefined();
    expect(row(hidden, "OP12-002")).toBeUndefined();
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
