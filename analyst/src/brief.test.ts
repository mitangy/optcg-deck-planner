import { getCardDef } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { loadCatalog, type Catalog } from "./catalog";
import { BRIEF_INSTRUCTIONS, briefVariant, costUsd, runBrief, toCitation, type CallModel, type ChatDeps, type ModelReply, type SseEvent } from "./chat";

const catalog = loadCatalog();
const TICKET = "mb1.ticket-body.ticket-sig";
const BUDGET_OPEN = { allowed: true, spent_today_usd: 0.5, daily_cap_usd: 3 };
const BUDGET_SPENT = { allowed: false, spent_today_usd: 3.1, daily_cap_usd: 3 };
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

type Call = { url: string; method: string; headers: Record<string, string>; body?: any };

/** A fake planner API: answers by "METHOD path" and records every call. */
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
    if (typeof answer === "number") return new Response(JSON.stringify({ detail: "Not a valid brief ticket" }), { status: answer });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
}

/** A model that plays back scripted replies, streaming each reply's text and citations. */
function scriptedModel(replies: ModelReply[]) {
  const seen: Record<string, any>[] = [];
  const callModel: CallModel = async (params, onText, _signal, onCite) => {
    seen.push(structuredClone(params));
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
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

const deps = (api: ChatDeps["api"], callModel: CallModel): ChatDeps => ({
  api,
  catalog,
  knowledge: { playbook: { notes: new Map(), general: null }, stats: api },
  callModel,
});
const run = async (d: ChatDeps, generate: boolean) => {
  const events: SseEvent[] = [];
  await runBrief(d, "chat.tok", { ticket: TICKET, generate }, (e) => events.push(e), new AbortController().signal);
  return events;
};

// Two leaders that differ, and a deck that is not just 4-ofs of one card.
const LOOKUP = {
  leader_id: "OP01-001",
  opponent_id: "ST01-001",
  deck: [
    { id: "OP01-016", copies: 4 },
    { id: "ST01-006", copies: 3 },
  ],
  key: "k",
};
const loc = (source: string, cited_text: string) => ({ type: "search_result_location", source, title: "T", cited_text, search_result_index: 0, start_block_index: 0, end_block_index: 1 });

describe("matchup brief", () => {
  const SAVED = {
    text: "Plan: curve out. Mulligan: keep cheap. Watch the Lucci.",
    citations: [
      { at: 17, source: "playbook:OP01-001", title: "Playbook", cited_text: "Curve out" },
      { at: 40, source: "stats:OP01-001:ST01-001", title: "Matchup", cited_text: "52% over 20 games" },
    ],
    created_at: "2026-10-01T00:00:00+00:00",
  };

  it("serves a cached brief without calling the model, even over the daily cap (#401)", async () => {
    const { calls, api } = planner({
      "POST /analyst/briefs/lookup": { ...LOOKUP, brief: SAVED },
      "GET /analyst/chat/budget": BUDGET_SPENT,
    });
    const { seen, callModel } = scriptedModel([]);
    const events = await run(deps(api, callModel), true);
    expect(seen).toHaveLength(0);
    expect(calls.map((c) => c.url)).toEqual(["https://api.test/analyst/briefs/lookup"]);
    expect(events.map((e) => e.event).at(-1)).toBe("done");
    expect(events.at(-1)!.data).toEqual({ cached: true, cost_usd: 0 });
    expect(events.filter((e) => e.event === "text").map((e) => e.data.delta).join("")).toBe(SAVED.text);
  });

  it("replays a cached brief's citations at the offsets they were saved at (#401)", async () => {
    const { api } = planner({ "POST /analyst/briefs/lookup": { ...LOOKUP, brief: SAVED } });
    const events = await run(deps(api, scriptedModel([]).callModel), false);
    expect(events.map((e) => [e.event, e.event === "text" ? e.data.delta : (e.data.citations as { source: string }[] | undefined)?.map((c) => c.source)])).toEqual([
      ["text", SAVED.text.slice(0, 17)],
      ["cite", ["playbook:OP01-001"]],
      ["text", SAVED.text.slice(17, 40)],
      ["cite", ["stats:OP01-001:ST01-001"]],
      ["text", SAVED.text.slice(40)],
      ["done", undefined],
    ]);
    expect(events[1]!.data.citations).toEqual([{ source: "playbook:OP01-001", title: "Playbook", cited_text: "Curve out" }]);
  });

  it("a peek with nothing cached calls no model and records no spend (#401)", async () => {
    const { calls, api } = planner({
      "POST /analyst/briefs/lookup": { ...LOOKUP, brief: null },
      "GET /analyst/chat/budget": BUDGET_OPEN,
      "POST /analyst/chat/usage": null,
    });
    const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "Should not be written." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
    const events = await run(deps(api, callModel), false);
    expect(seen).toHaveLength(0);
    expect(events).toEqual([{ event: "done", data: { cached: false } }]);
    expect(calls.some((c) => c.url.includes("/chat/usage") || c.url.includes("/chat/budget"))).toBe(false);
  });

  it("a ticket the planner refuses never reaches the model (#401)", async () => {
    const { calls, api } = planner({ "POST /analyst/briefs/lookup": 403, "GET /analyst/chat/budget": BUDGET_OPEN, "POST /analyst/chat/usage": null });
    const { seen, callModel } = scriptedModel([{ content: [{ type: "text", text: "A brief for a ranked game." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
    await expect(run(deps(api, callModel), true)).rejects.toMatchObject({
      code: "bad_request",
      message: "Matchup briefs are only for casual and practice games.",
    });
    expect(seen).toHaveLength(0);
    expect(calls.some((c) => c.url.includes("/chat/usage"))).toBe(false);
  });

  it("an empty budget stops a brief that has to be written, after the lookup (#401)", async () => {
    const { seen, callModel } = scriptedModel([]);
    const { api } = planner({ "POST /analyst/briefs/lookup": { ...LOOKUP, brief: null }, "GET /analyst/chat/budget": BUDGET_SPENT });
    await expect(run(deps(api, callModel), true)).rejects.toMatchObject({ status: 429, code: "budget" });
    expect(seen).toHaveLength(0);
  });

  it("writes the brief on the model the budget names (#428)", async () => {
    const { calls, api } = planner({
      "POST /analyst/briefs/lookup": { ...LOOKUP, brief: null },
      "GET /analyst/chat/budget": { ...BUDGET_OPEN, model: "claude-opus-5-5" },
      "POST /analyst/chat/usage": null,
      "PUT /analyst/briefs": null,
    });
    const { seen, callModel } = scriptedModel([
      { content: [{ type: "text", text: "**Game plan** Curve out.", citations: [loc("card:OP01-016", "A 4 cost character")] }], stop_reason: "end_turn", usage: usage(1_000_000, 100_000) },
    ]);
    await run(deps(api, callModel), true);
    expect(seen[0]!.model).toBe("claude-opus-5-5");
    expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toMatchObject({ kind: "brief", model: "claude-opus-5-5" });
  });

  it("writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)", async () => {
    const { calls, api } = planner({
      "POST /analyst/briefs/lookup": { ...LOOKUP, brief: null },
      "GET /analyst/chat/budget": BUDGET_OPEN,
      "POST /analyst/chat/usage": null,
      "PUT /analyst/briefs": null,
    });
    const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-016"] } };
    const brief = "**Game plan** Curve out.\n**Numbers** 52% over 20 games.";
    const { seen, callModel } = scriptedModel([
      { content: [toolUse], stop_reason: "tool_use", usage: usage(1000, 100) },
      {
        content: [
          { type: "text", text: "**Game plan** Curve out.", citations: [loc("card:OP01-016", "A 4 cost character")] },
          { type: "text", text: "\n**Numbers** 52% over 20 games.", citations: [loc("stats:OP01-001:ST01-001", "52% over 20 games")] },
        ],
        stop_reason: "end_turn",
        usage: usage(2000, 200),
      },
    ]);
    const events = await run(deps(api, callModel), true);

    // The model is asked for a short brief with the cheap settings and only the shared tools.
    expect(seen).toHaveLength(2);
    expect(seen[0]!.max_tokens).toBe(1500);
    expect(seen[0]!.output_config).toEqual({ effort: "low" });
    expect(seen[0]!.system[0].text).toContain(BRIEF_INSTRUCTIONS);
    const names = (seen[0]!.tools as { name: string }[]).map((t) => t.name);
    const allowed = ["playbook", "matchup_stats", "tournament_stats", "get_cards", "analyze_deck", "draw_odds"];
    expect(names.filter((n) => !allowed.includes(n))).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(["playbook", "matchup_stats", "get_cards"]));
    expect(names).not.toContain("list_my_decks");
    expect(names).not.toContain("review_match");
    expect(seen[0]!.system[0].text).not.toContain("list_my_decks");

    // Both leaders by name and the whole deck, from the ticket's lookup, not from the browser.
    const prompt = seen[0]!.messages[0].content[0].text as string;
    expect(prompt).toContain(`Leader: OP01-001 (${getCardDef("OP01-001").name})`);
    expect(prompt).toContain(`Opponent's leader: ST01-001 (${getCardDef("ST01-001").name})`);
    expect(prompt).toContain("1xOP01-001\n4xOP01-016\n3xST01-006");
    expect(prompt.endsWith("Write the matchup brief.")).toBe(true);

    // A tool result holds only search results (or only text), never both.
    const toolResult = seen[1]!.messages.at(-1).content[0];
    expect(toolResult.content.every((b: { type: string }) => b.type === "search_result")).toBe(true);

    const lookup = calls.find((c) => c.url.endsWith("/briefs/lookup"))!;
    expect(lookup.body).toEqual({ ticket: TICKET, variant: briefVariant(catalog) });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("https://api.test/analyst/briefs");
    expect(put.body.ticket).toBe(TICKET);
    expect(put.body.variant).toBe(briefVariant(catalog));
    expect(put.body.text).toBe(brief);
    expect(put.body.citations.map((c: { at: number; source: string }) => [c.at, c.source])).toEqual([
      ["**Game plan** Curve out.".length, "card:OP01-016"],
      [brief.length, "stats:OP01-001:ST01-001"],
    ]);
    const spend = calls.find((c) => c.url.endsWith("/chat/usage"))!.body;
    expect(spend).toMatchObject({ kind: "brief", input_tokens: 3000, output_tokens: 300 });
    expect(events.at(-1)).toEqual({ event: "done", data: { cached: false, cost_usd: costUsd(usage(3000, 300)), saved: true } });
  });

  it("the cache variant follows the newest set (#401)", () => {
    const set = (prefix: string) => ({ cards: new Map(Array.from({ length: 60 }, (_, i) => [`${prefix}-${String(i + 1).padStart(3, "0")}`, {}])) }) as unknown as Catalog;
    expect(briefVariant(set("OP14"))).toBe("v1:OP14");
    expect(briefVariant(set("OP15"))).toBe("v1:OP15");
  });
});
