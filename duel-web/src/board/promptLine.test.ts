import { describe, expect, it } from "vitest";
import type { PendingChoiceView } from "../net/protocol";
import { promptShortLine, respondSubline } from "./promptLine";

const HAKI =
  "Color of the Supreme King Haki — rest 1 of your DON!! cards, and if you do, give your opponent's Leader and all of their Characters -1000 power during this turn? [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle.";

function choice(over: Partial<PendingChoiceView>): PendingChoiceView {
  return {
    id: "c1",
    seat: 0,
    kind: "effect",
    cardDefId: "OP01-017",
    optional: true,
    prompt: HAKI,
    request: { type: "confirm" },
    ...over,
  };
}

const KO_PICK = choice({
  prompt: "Nico Robin — choose up to 1 card to K.O.",
  request: { type: "select", min: 0, max: 1, options: [] },
});

describe("promptShortLine", () => {
  it("shows a confirm as its question, without the card name or the rest of the text (#278)", () => {
    expect(promptShortLine(choice({}))).toBe(
      "Rest 1 of your DON!! cards, and if you do, give your opponent's Leader and all of their Characters -1000 power during this turn?",
    );
  });

  it("shows a pick as what the effect asks for, without the card name (#278)", () => {
    expect(promptShortLine(KO_PICK)).toBe("Choose up to 1 card to K.O.");
  });

  it("treats a choice with no request as a confirm (#278)", () => {
    const life = choice({
      prompt: "Rayleigh — activate this card's [Trigger]? [Trigger] K.O. up to 1 Character.",
      request: undefined,
    });
    expect(promptShortLine(life)).toBe("Activate this card's [Trigger]?");
  });
});

describe("respondSubline", () => {
  const base = { oppName: "Teach", mySeat: 0 as const };

  it("says block or counter only in the block / counter step with nothing open (#278)", () => {
    expect(respondSubline({ ...base, phase: "block", choice: null })).toBe(
      "Teach is attacking — block or counter",
    );
    expect(respondSubline({ ...base, phase: "counter", choice: undefined })).toBe(
      "Teach is attacking — block or counter",
    );
  });

  it("asks the open confirm's question instead of block or counter (#278)", () => {
    expect(respondSubline({ ...base, phase: "counter", choice: choice({}) })).toMatch(/^Rest 1 of your DON!!/);
  });

  it("names the pick when a K.O. choice is open during the battle (#278)", () => {
    expect(respondSubline({ ...base, phase: "counter", choice: KO_PICK })).toBe("Choose up to 1 card to K.O.");
  });

  it("does not say block or counter outside those steps (#278)", () => {
    const sub = respondSubline({ ...base, phase: "main", choice: null });
    expect(sub).not.toMatch(/block or counter/);
    expect(sub).not.toBe("");
  });

  it("ignores the opponent's choice, which is not yours to answer (#278)", () => {
    expect(respondSubline({ ...base, phase: "counter", choice: choice({ seat: 1 }) })).toBe(
      "Teach is attacking — block or counter",
    );
  });
});
