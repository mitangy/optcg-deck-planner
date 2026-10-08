import { describe, expect, it } from "vitest";
import { askContext, canAsk, hintAsk, HINT_LIMITS, requestAction } from "./ask";

const deck = { name: "Zoro", leaderId: "OP01-001", cards: [{ id: "OP01-016", copies: 4 }], plannerDeckId: 7 };
const page = { page: "deck", label: "Zoro", deck };

describe("asking Log Pose why (#399)", () => {
  it("offers Why? only when chat is on and Log Pose shows on this page (#399)", () => {
    expect(canAsk(true, false)).toBe(true);
    expect(canAsk(null, false)).toBe(false);
    expect(canAsk(false, false)).toBe(false);
    expect(canAsk(true, true)).toBe(false);
  });

  it("a Why? asks about the hint by its title and sends its id, detail and cards (#399)", () => {
    const ask = hintAsk({ id: "thin-early", tier: "shape", title: "Thin early game", detail: "Only 6 cheap cards.", cardIds: ["OP01-016"] });
    expect(ask.prompt).toContain("“Thin early game”");
    expect(ask.context?.hint).toEqual({ id: "thin-early", tier: "shape", title: "Thin early game", detail: "Only 6 cheap cards.", cardIds: ["OP01-016"] });
  });

  it("trims a long hint to the analyst's limits so the message is never refused (#399)", () => {
    const long = hintAsk({
      id: "i".repeat(200),
      tier: "synergy",
      title: "t".repeat(300),
      detail: "d".repeat(1000),
      cardIds: Array.from({ length: 30 }, (_, i) => `OP01-${String(i).padStart(3, "0")}${"x".repeat(30)}`),
    }).context!.hint!;
    expect(long.id).toHaveLength(HINT_LIMITS.id);
    expect(long.title).toHaveLength(HINT_LIMITS.title);
    expect(long.detail).toHaveLength(HINT_LIMITS.detail);
    expect(long.cardIds).toHaveLength(HINT_LIMITS.cards);
    expect(long.cardIds!.every((c) => c.length <= 20)).toBe(true);
  });

  it("a Why? sends the open deck even after its chip's × was pressed (#399)", () => {
    const ctx = askContext(page, { hint: { id: "count", tier: "rule", title: "t", detail: "d" } });
    expect(ctx?.deck).toEqual(deck);
    expect(ctx?.page).toBe("deck");
    expect(ctx?.hint?.id).toBe("count");
  });

  it("waits for the last chat to load before sending a Why? (#399)", () => {
    expect(requestAction({}, { busy: false, history: "idle" })).toBe("wait");
    expect(requestAction({}, { busy: false, history: "loading" })).toBe("wait");
    expect(requestAction({}, { busy: false, history: "done" })).toBe("send");
  });

  it("puts a Why? in the composer instead of sending while an answer is streaming (#399)", () => {
    expect(requestAction({}, { busy: true, history: "done" })).toBe("prefill");
    expect(requestAction({ send: false }, { busy: false, history: "done" })).toBe("prefill");
  });
});
