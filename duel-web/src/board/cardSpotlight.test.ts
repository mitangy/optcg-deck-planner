import { describe, expect, it } from "vitest";
import { narrateEvents, type BattleLogEntry, type CardSpotlight } from "./battleLog";
import { newSpotlightBatch, spotlightTiming, SPOTLIGHT_MAX_CARDS, SPOTLIGHT_MS } from "./cardSpotlight";

const narrate = (events: unknown[]) => narrateEvents(events, { youSeat: 0, turnNumber: 3 });

function entry(id: string, spotlight?: Omit<CardSpotlight, "kind" | "label">): BattleLogEntry {
  return {
    id,
    turn: 3,
    text: "x",
    tone: "trash",
    important: false,
    segments: [],
    ...(spotlight ? { spotlight: { kind: "trash", label: "Trashed", ...spotlight } } : {}),
  };
}

describe("log spotlight field", () => {
  it("marks a played card with the field tile it lands on (#339)", () => {
    const [l] = narrate([{ type: "card_played", seat: 1, defId: "ST01-006", instanceId: "o-c9", costPaid: 1 }]);
    expect(l!.spotlight).toEqual({ defId: "ST01-006", ownerSeat: 1, kind: "play", label: "Played", instanceId: "o-c9" });
  });

  it("marks counters, K.O.s and effect trashes from hand, deck, Life and the field (#339)", () => {
    const lines = narrate([
      { type: "counter_applied", seat: 0, defId: "ST01-014", bonus: 2000 },
      { type: "counter_applied", seat: 0, defId: "ST01-016", bonus: 0 },
      { type: "character_ko", seat: 1, defId: "ST01-008" },
      { type: "card_moved", seat: 0, defId: "ST01-005", from: "hand", to: "trash" },
      { type: "card_moved", seat: 1, defId: "ST01-009", from: "deck", to: "trash" },
      { type: "card_moved", seat: 1, defId: "ST01-003", from: "life", to: "trash" },
      { type: "card_moved", seat: 0, defId: "ST01-004", from: "character", to: "trash" },
      { type: "character_trashed_for_space", seat: 0, defId: "ST01-007" },
    ]);
    expect(lines.map((l) => [l.spotlight?.defId, l.spotlight?.ownerSeat, l.spotlight?.kind, l.spotlight?.label])).toEqual([
      ["ST01-014", 0, "trash", "Counter +2000"],
      ["ST01-016", 0, "trash", "Counter"],
      ["ST01-008", 1, "trash", "K.O.'d"],
      ["ST01-005", 0, "trash", "Trashed from hand"],
      ["ST01-009", 1, "trash", "Trashed from deck"],
      ["ST01-003", 1, "trash", "Trashed from Life"],
      ["ST01-004", 0, "trash", "Trashed"],
      ["ST01-007", 0, "trash", "Trashed for space"],
    ]);
  });

  it("names and spotlights only your own Draw Phase card, flying to your hand (#445)", () => {
    const drew = { type: "drew", seat: 0, count: 1, defIds: ["ST01-004"], turnDraw: true };
    const [mine] = narrate([drew]);
    expect(mine!.text).toBe("You draw Sanji");
    expect(mine!.spotlight).toEqual({ defId: "ST01-004", ownerSeat: 0, kind: "draw", label: "Drew" });
    // Seat 1's draw reaches this viewer with the card stripped; a card that did arrive is still not theirs to show.
    const [theirs] = narrate([{ ...drew, seat: 1 }]);
    expect(theirs!.spotlight).toBeUndefined();
    expect(theirs!.text).toBe("Opponent draws 1");
    const [stripped] = narrate([{ type: "drew", seat: 1, count: 1, turnDraw: true }]);
    expect(stripped!.spotlight).toBeUndefined();
    // An effect draw (no turnDraw) stays a count.
    const [effect] = narrate([{ type: "drew", seat: 0, count: 2, defIds: ["ST01-004"] }]);
    expect(effect!.spotlight).toBeUndefined();
    expect(effect!.text).toBe("You draw 2");
  });

  it("leaves hidden cards, draws and searches out of the spotlight (#339)", () => {
    const lines = narrate([
      { type: "card_moved", seat: 1, defId: "HIDDEN", from: "hand", to: "trash" },
      { type: "card_played", seat: 1, defId: "HIDDEN", instanceId: "o-x", costPaid: 0 },
      { type: "drew", seat: 0, count: 1 },
      { type: "card_moved", seat: 0, defId: "ST01-005", from: "deck", to: "hand" },
    ]);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => !l.spotlight)).toBe(true);
  });
});

describe("newSpotlightBatch", () => {
  const A = { defId: "ST01-006", ownerSeat: 1 as const };
  const B = { defId: "ST01-008", ownerSeat: 0 as const };

  it("shows nothing on the first look at a log or after it was replaced (#339)", () => {
    expect(newSpotlightBatch(undefined, [entry("a", A)])).toBeNull();
    expect(newSpotlightBatch("gone", [entry("a", A)])).toBeNull();
  });

  it("batches only the cards added since the last seen entry, one group per owner (#339)", () => {
    const log = [entry("a", A), entry("b"), entry("c", B), entry("d", A), entry("e")];
    const batch = newSpotlightBatch("b", log)!;
    expect(batch.groups.map((g) => [g.ownerSeat, g.cards.map((c) => c.entryId)])).toEqual([
      [0, ["c"]],
      [1, ["d"]],
    ]);
    expect(newSpotlightBatch("d", log)).toBeNull();
  });

  it("caps a big burst per owner and counts the rest (#339)", () => {
    const log = [entry("start"), ...Array.from({ length: SPOTLIGHT_MAX_CARDS + 2 }, (_, i) => entry(`m${i}`, A))];
    const [g] = newSpotlightBatch("start", log)!.groups;
    expect(g!.cards).toHaveLength(SPOTLIGHT_MAX_CARDS);
    expect(g!.more).toBe(2);
  });
});

describe("spotlightTiming", () => {
  it("Animations Off shows no spotlight; reduced motion fades without travel (#339)", () => {
    expect(spotlightTiming({ mode: "off" }, 0)).toBeNull();
    const fade = spotlightTiming({ mode: "fade" }, 0)!;
    expect(fade.travel).toBe(false);
    expect(spotlightTiming({ mode: "move", scale: 1 }, 0)!.travel).toBe(true);
  });

  it("Fast halves the timings and a waiting batch halves the hold (#339)", () => {
    const normal = spotlightTiming({ mode: "move", scale: 1 }, 0)!;
    const fast = spotlightTiming({ mode: "move", scale: 0.5 }, 0)!;
    expect(normal.hold).toBe(SPOTLIGHT_MS.hold);
    expect(fast.hold).toBe(SPOTLIGHT_MS.hold / 2);
    expect(fast.exit).toBe(Math.round(SPOTLIGHT_MS.exit / 2));
    expect(spotlightTiming({ mode: "move", scale: 1 }, 2)!.hold).toBe(SPOTLIGHT_MS.hold / 2);
  });
});
