import { getCardDef, type Seat } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { runReview, type CallModel, type ModelReply, type SseEvent } from "./chat";
import { lifeTakenGame } from "./testFixtures";
import { deps, planner, scriptedModel, usage } from "./testkit";

const { replay, taken } = lifeTakenGame();

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

  it("a review on a model that thinks first still gets room to write (#831)", async () => {
    const THINKING = 20000;
    const { calls, api } = planner({
      "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay },
      "POST /analyst/chat/usage": null,
      "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
    });
    // Behaves like the API: thinking is spent from max_tokens before any text.
    const callModel: CallModel = async (params, onText) => {
      const maxTokens = params.max_tokens as number;
      if (maxTokens - THINKING <= 0) {
        return { content: [{ type: "thinking", thinking: "" }], stop_reason: "max_tokens", usage: usage(30000, maxTokens) } as ModelReply;
      }
      onText("You lost on turn 3.");
      return { content: [{ type: "text", text: "You lost on turn 3." }], stop_reason: "end_turn", usage: usage(30000, THINKING + 400) } as ModelReply;
    };
    await runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, () => undefined, new AbortController().signal);
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ text: "You lost on turn 3.", citations: [] });
    expect(calls.find((c) => c.url.endsWith("/chat/usage"))!.body).toMatchObject({ kind: "review", input_tokens: 30000 });
  });

  it("a review cut off by the length cap says so (#831)", async () => {
    const { api } = planner({
      "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay },
      "POST /analyst/chat/usage": null,
    });
    const { callModel } = scriptedModel([{ content: [{ type: "thinking", thinking: "" }], stop_reason: "max_tokens", usage: usage(30000, 6000) } as ModelReply]);
    await expect(runReview(deps(api, callModel), "chat.tok", { match_id: "m1" }, () => undefined, new AbortController().signal)).rejects.toThrow(/ran out of room/);
  });
});
