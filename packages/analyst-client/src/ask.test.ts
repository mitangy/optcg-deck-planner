import { describe, expect, it } from "vitest";
import { askContext, canAsk, gameMessageContext, hintAsk, HINT_LIMITS, requestAction } from "./ask";

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

describe("a message about the live game (#416)", () => {
  const snap = (turn: number) => ({ ticket: "mb1.x", snapshot: { turn } as never });

  it("reads the game when the message is sent, not when the chat opened (#416)", () => {
    let turn = 1;
    const game = { context: () => snap(turn) };
    expect(gameMessageContext(null, game, false)?.game?.snapshot).toMatchObject({ turn: 1 });
    turn = 2;
    expect(gameMessageContext(null, game, false)?.game?.snapshot).toMatchObject({ turn: 2 });
  });

  it("names the duel board as the page and keeps the page's deck (#416)", () => {
    const ctx = gameMessageContext(page, { context: () => snap(1) }, false);
    expect(ctx).toMatchObject({ page: "duel-board", deck });
  });

  it("leaves the game out once its chip is dropped, and when it can't be read (#416)", () => {
    const dropped = gameMessageContext(page, { context: () => snap(1) }, true);
    expect(dropped).toEqual({ page: "deck" });
    expect(dropped).not.toHaveProperty("game");
    const unreadable = gameMessageContext(page, { context: () => null }, false);
    expect(unreadable).toEqual({ page: "deck", deck });
  });

  it("changes nothing without a game (#416)", () => {
    expect(gameMessageContext(page, null, false)).toEqual({ page: "deck", deck });
  });
});
