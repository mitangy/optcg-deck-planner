import { describe, expect, it } from "vitest";
import { fromHistory, liveAnswer } from "./chatMessages";
import { parseDraft } from "./drafts";
import { parseProposal } from "./proposals";

describe("chat messages (#726)", () => {
  it("marks the answer being streamed as live, so its edits and decks may act by themselves (#726)", () => {
    expect(liveAnswer()).toMatchObject({ role: "assistant", text: "", citations: [], live: true });
  });

  it("never marks an answer loaded from the saved thread as live, even with a deck edit or new deck on it (#726)", () => {
    const proposal = parseProposal({
      id: "t1",
      apply: true,
      target: { ref: "duel:d1", name: "Luffy", leader_id: "ST01-001" },
      lines: [{ id: "ST01-016", name: "x", before: 0, after: 2, reason: "r" }],
    })!;
    const draft = parseDraft({ id: "d1", leader_id: "ST01-001", name: "Red", cards: [{ id: "ST01-003", name: "Nami", copies: 4 }] })!;
    const m = fromHistory({ role: "assistant", text: "Done.", proposals: [proposal], drafts: [draft] });
    expect(m.live).toBeUndefined();
    expect(m).toMatchObject({ role: "assistant", text: "Done.", saved: true, proposals: [{ id: "t1" }], drafts: [{ id: "d1" }], citations: [] });
    expect(fromHistory({ role: "user", text: "hi" })).toMatchObject({ proposals: [], drafts: [], saved: true });
  });
});
