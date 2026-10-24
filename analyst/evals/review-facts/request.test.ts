import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { reviewRequest, REVIEW_MAX_LINES, runReview, type CallModel, type ChatDeps, type ModelReply } from "../../src/chat";
import { reviewGame } from "../../src/matches";
import { scriptedExtractor } from "./extract";
import { fixtureReplay } from "./game";
import { evaluateReview } from "./pipeline";
import { totals } from "./report";

const catalog = loadCatalog();
const replay = fixtureReplay();
const usage = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const reply = (text: string): ModelReply => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage });

const capture = (text = "On turn 3, you played Pearl.") => {
  const seen: Record<string, unknown>[] = [];
  const callModel: CallModel = async (params, onText) => {
    seen.push(structuredClone(params));
    onText(text);
    return reply(text);
  };
  return { seen, callModel };
};

/** The planner API the app talks to, faked: it serves the replay and takes the saved review. */
const fakeApi = (model: string): ChatDeps["api"] => ({
  baseUrl: "https://api.test",
  serviceSecret: "svc",
  fetchImpl: (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const key = `${init.method ?? "GET"} ${path}`;
    const answers: Record<string, unknown> = {
      "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: 0, replay },
      "GET /analyst/chat/budget": { allowed: true, spent_today_usd: 0, daily_cap_usd: 3, model },
      "POST /analyst/chat/usage": null,
      "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
    };
    if (!(key in answers)) return new Response("{}", { status: 404 });
    return answers[key] === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(answers[key]), { status: 200 });
  }) as unknown as typeof fetch,
});

describe("the eval sends the production review request", () => {
  it("sends the eval the same model request the app sends for the same game (#675)", async () => {
    const production = capture();
    await runReview({ api: fakeApi("claude-sonnet-5-5"), catalog, knowledge: {}, callModel: production.callModel }, "chat.tok", { match_id: "m1" }, () => undefined, new AbortController().signal);
    const evalSide = capture();
    await evaluateReview({ catalog, model: "claude-sonnet-5-5", callModel: evalSide.callModel, extractor: scriptedExtractor }, { id: "m1", replay, seat: 0 });
    expect(production.seen).toHaveLength(1);
    expect(evalSide.seen[0]).toEqual(production.seen[0]);
    expect(production.seen[0]).toEqual(JSON.parse(JSON.stringify(reviewRequest(catalog, "claude-sonnet-5-5", reviewGame("m1", replay, 0, { maxLines: REVIEW_MAX_LINES })))));
  });

  it("scores the extracted claims of a review against the game (#675)", async () => {
    const { callModel } = capture("On turn 3, you played Pearl. On turn 5, you played Pearl. Nice game.");
    const extractor = async () => ({
      claims: [
        { quote: "On turn 3, you played Pearl.", kind: "played" as const, actor: "you" as const, turn: 3, card: "Pearl", target: null, number: null },
        { quote: "On turn 5, you played Pearl.", kind: "played" as const, actor: "you" as const, turn: 5, card: "Pearl", target: null, number: null },
        { quote: "Nice game.", kind: "other" as const, actor: null, turn: null, card: null, target: null, number: null },
        { quote: "you won", kind: "result" as const, actor: "you" as const, turn: null, card: null, target: null, number: null },
      ],
      usage,
      model: "x",
      costUsd: 0,
      invalid: 0,
    });
    const { row, claims } = await evaluateReview({ catalog, model: "claude-sonnet-5-5", callModel, extractor }, { id: "m1", replay, seat: 0 });
    expect(claims.map((c) => c.verdict)).toEqual(["supported", "wrong_turn", "unverifiable"]);
    expect(row).toMatchObject({ claims: 3, dropped: 1, supported: 1, wrong_turn: 1, contradicted: 0, unverifiable: 1 });
    expect(totals([row])).toMatchObject({ checkable: 2, wrong: 1, wrongPerReview: 1, wrongShare: 0.5 });
  });
});
