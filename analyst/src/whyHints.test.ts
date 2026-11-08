import { describe, expect, it } from "vitest";
import { chatBody, contextBlock } from "./chat";
import { planner } from "./testkit";

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
