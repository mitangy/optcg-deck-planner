import { describe, expect, it } from "vitest";
import { stubsJsonl, type FeedbackItem } from "./feedbackCases";

const item = (over: Partial<FeedbackItem>): FeedbackItem => ({
  id: 1, updated_at: "2026-10-20T00:00:00Z", kind: "chat", rating: "wrong", note: "Nami costs 4.", question: "Is Nami a 3 cost?",
  answer_excerpt: "Yes, Nami costs 3.", model: "claude-opus-5-5", thread_id: 5, match_id: null, ...over,
});

describe("draft eval cases from wrong ratings", () => {
  it("writes the question, the stored answer and the player's note for a human to finish (#679)", () => {
    const [line] = stubsJsonl([item({})]).trim().split("\n");
    expect(JSON.parse(line!)).toMatchObject({ id: "fb-1", source: "player-feedback", kind: "chat", question: "Is Nami a 3 cost?", bad_answer: "Yes, Nami costs 3.", player_note: "Nami costs 4." });
  });

  it("keeps only wrong ratings whose answer was stored, oldest first, and names the game for a review (#679)", () => {
    const out = stubsJsonl([
      item({ id: 3, kind: "review", match_id: "m9", question: "" }),
      item({ id: 2, rating: "down" }),
      item({ id: 1, answer_excerpt: "  " }),
      item({ id: 0 }),
    ]);
    const rows = out.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["fb-0", "fb-3"]);
    expect(rows[1]).toMatchObject({ kind: "review", match_id: "m9" });
    expect(stubsJsonl([])).toBe("");
  });
});
