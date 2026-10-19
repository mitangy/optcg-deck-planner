import { describe, expect, it } from "vitest";
import { getPlayerView } from "../engine.js";
import { projectGameEvents, projectPendingChoice } from "../engine/views.js";
import { forOpponent } from "../engine/perspective.js";
import { Harness } from "../testing/harness.js";
import type { GameEvent, PendingChoice } from "../types.js";

// Hidden information must never reach a viewer who should not see it (#487).

const SECRET = "ST01-014";
const OTHER = "ST01-009";

function secretChoice(overrides: Partial<PendingChoice> = {}): PendingChoice {
  return {
    id: "c1",
    seat: 0,
    kind: "effect",
    cardDefId: SECRET,
    sourceInstanceId: "src",
    optional: false,
    prompt: "Choose 1 card.",
    request: { type: "select", min: 1, max: 1, options: [{ id: "o1", eligible: true, defId: SECRET, instanceId: "i1" }] },
    privateToSeat: 0,
    hideCardDefFromOthers: true,
    bindings: { o1: "i1" },
    resolutionFrameId: "frame",
    ...overrides,
  } as PendingChoice;
}

describe("pending choice projection (#487)", () => {
  it("redacts a nested unordered choice for the other seat and spectators (#487)", () => {
    const parent: PendingChoice = {
      id: "p",
      seat: 0,
      kind: "order_effects",
      cardDefId: OTHER,
      optional: false,
      prompt: "Order your effects.",
      unorderedChoices: [secretChoice()],
    } as PendingChoice;
    for (const viewer of [1, null] as const) {
      const nested = projectPendingChoice(parent, viewer).unorderedChoices![0]!;
      expect(nested.bindings).toBeUndefined();
      expect(nested.resolutionFrameId).toBeUndefined();
      expect(nested.cardDefId).toBe("HIDDEN");
      expect(nested.sourceInstanceId).toBeUndefined();
      expect(nested.request).toEqual({ type: "select", min: 0, max: 0, options: [] });
    }
    // The owner still sees the card and options, but never the internal bindings.
    const own = projectPendingChoice(parent, 0).unorderedChoices![0]!;
    expect(own.bindings).toBeUndefined();
    expect(own.resolutionFrameId).toBeUndefined();
    expect(own.cardDefId).toBe(SECRET);
    expect((own.request as { options: unknown[] }).options).toHaveLength(1);
  });
});

describe("event projection hides private identities (#487)", () => {
  const base = { seat: 0 } as const;

  it("hides the card of a face-down Life addition from every viewer but keeps the rest (#487)", () => {
    const events: GameEvent[] = [{ type: "life_added", ...base, defId: SECRET, source: "hand" }, { type: "life_added", ...base, defId: SECRET, source: "deck_top", faceUp: false }];
    for (const viewer of [0, 1, null] as const) {
      expect(projectGameEvents(events, viewer)).toEqual([
        { type: "life_added", seat: 0, defId: "HIDDEN", source: "hand" },
        { type: "life_added", seat: 0, defId: "HIDDEN", source: "deck_top", faceUp: false },
      ]);
    }
  });

  it("shows the card of a face-up Life addition to every viewer (#487)", () => {
    const events: GameEvent[] = [{ type: "life_added", ...base, defId: SECRET, source: "trash", faceUp: true }];
    for (const viewer of [0, 1, null] as const) expect(projectGameEvents(events, viewer)).toEqual(events);
  });

  it("shows an available [Trigger] card only to its owner (#487)", () => {
    const events: GameEvent[] = [{ type: "trigger_available", ...base, defId: SECRET }];
    expect(projectGameEvents(events, 0)).toEqual(events);
    expect(projectGameEvents(events, 1)).toEqual([{ type: "trigger_available", seat: 0, defId: "HIDDEN" }]);
    expect(projectGameEvents(events, null)).toEqual([{ type: "trigger_available", seat: 0, defId: "HIDDEN" }]);
  });

  it("hides the card of a hidden move from the other seat and spectators only (#487)", () => {
    const hiddenMove: GameEvent = { type: "card_moved", seat: 0, defId: SECRET, from: "hand", to: "deck", hidden: true };
    expect(projectGameEvents([hiddenMove], 0)).toEqual([hiddenMove]);
    for (const viewer of [1, null] as const) expect(projectGameEvents([hiddenMove], viewer)).toEqual([{ type: "card_moved", seat: 0, defId: "HIDDEN", from: "hand", to: "deck", hidden: true }]);
  });

  it("keeps the card of a public move for every viewer (#487)", () => {
    const events: GameEvent[] = [{ type: "card_moved", seat: 0, defId: SECRET, from: "field", to: "trash" }, { type: "card_moved", seat: 0, defId: OTHER, from: "hand", to: "trash", hidden: false }];
    for (const viewer of [0, 1, null] as const) expect(projectGameEvents(events, viewer)).toEqual(events);
  });

  it("hides the source card and prompt of a private card choice from others (#487)", () => {
    const added: GameEvent = { type: "pending_choice_added", seat: 0, kind: "effect", cardDefId: SECRET, optional: true, prompt: "Pick Nami.", privateToSeat: 0, hideCardDefFromOthers: true };
    const resolved: GameEvent = { type: "pending_choice_resolved", seat: 0, kind: "effect", cardDefId: SECRET, accepted: true, privateToSeat: 0, hideCardDefFromOthers: true };
    expect(projectGameEvents([added, resolved], 0)).toEqual([added, resolved]);
    for (const viewer of [1, null] as const) {
      expect(projectGameEvents([added, resolved], viewer)).toEqual([
        { ...added, cardDefId: "HIDDEN", prompt: "Opponent is resolving a private card choice." },
        { ...resolved, cardDefId: "HIDDEN" },
      ]);
    }
  });

  it("replaces only the prompt of a plain private choice for others (#487)", () => {
    const added: GameEvent = { type: "pending_choice_added", seat: 0, kind: "effect", cardDefId: SECRET, optional: true, prompt: "Pick Nami.", privateToSeat: 0 };
    expect(projectGameEvents([added], 0)).toEqual([added]);
    for (const viewer of [1, null] as const) expect(projectGameEvents([added], viewer)).toEqual([{ ...added, prompt: "Opponent is making a private choice." }]);
  });

  it("leaves a public choice untouched for everyone (#487)", () => {
    const added: GameEvent = { type: "pending_choice_added", seat: 0, kind: "effect", cardDefId: SECRET, optional: true, prompt: "Pick Nami." };
    for (const viewer of [0, 1, null] as const) expect(projectGameEvents([added], viewer)).toEqual([added]);
  });
});

describe("player view zones (#487)", () => {
  it("lists each side's trash and only its face-up Life cards with their index (#487)", () => {
    const h = new Harness();
    h.trash(0, "ST01-003", "ST01-006");
    h.trash(1, "ST01-009");
    h.life(0, "ST01-014", "ST01-003", "ST01-006");
    h.state.players[0].faceUpLife = [false, true, true];
    h.life(1, "ST01-009", "ST01-008");
    h.state.players[1].faceUpLife = [true, false];
    const t0 = ["ST01-003", "ST01-006"];
    const t1 = ["ST01-009"];
    const v0 = getPlayerView(h.state, 0);
    expect(v0.you.trash).toEqual(t0);
    expect(v0.opponent.trash).toEqual(t1);
    expect(v0.you.faceUpLife).toEqual([{ index: 1, defId: "ST01-003" }, { index: 2, defId: "ST01-006" }]);
    expect(v0.opponent.faceUpLife).toEqual([{ index: 0, defId: "ST01-009" }]);
    const v1 = getPlayerView(h.state, 1);
    expect(v1.you.trash).toEqual(t1);
    expect(v1.opponent.trash).toEqual(t0);
    expect(v1.you.faceUpLife).toEqual([{ index: 0, defId: "ST01-009" }]);
    expect(v1.opponent.faceUpLife).toEqual([{ index: 1, defId: "ST01-003" }, { index: 2, defId: "ST01-006" }]);
  });
});

describe("forOpponent rewrites a label for the other player (#487)", () => {
  const cases: [string, string, string][] = [
    ["sh ending", "Trash 2 cards from your hand.", "Your opponent trashes 2 cards from their hand."],
    ["ch ending", "Search your deck.", "Your opponent searches their deck."],
    ["ss ending", "Pass 1 card.", "Your opponent passes 1 card."],
    ["x ending", "Fix your Leader.", "Your opponent fixes their Leader."],
    ["z ending", "Buzz your Leader.", "Your opponent buzzes their Leader."],
    ["consonant + y", "Carry 1 card.", "Your opponent carries 1 card."],
    ["vowel + y", "Play 1 card.", "Your opponent plays 1 card."],
    ["plain verb", "Draw 2 cards.", "Your opponent draws 2 cards."],
    ["no object", "Draw.", "Your opponent draws."],
    ["no trailing period", "Draw 2 cards", "Your opponent draws 2 cards"],
    ["possessives", "Rest your Leader and your opponent's Character.", "Your opponent rests their Leader and your Character."],
    ["dotted verb", "K.O. 1 of your opponent's Characters.", "Your opponent K.O.s 1 of your Characters."],
    ["Then sentence", "Draw 1 card. Then, trash 1 card from your hand.", "Your opponent draws 1 card. Then, they trash 1 card from their hand."],
    ["multiple sentences", "Draw 2 cards. Trash 1 card.", "Your opponent draws 2 cards. Your opponent trashes 1 card."],
    ["digit start", "2 cards are drawn.", "2 cards are drawn."],
    ["plus start", "+1000 power during this turn.", "+1000 power during this turn."],
    ["later sentence unparseable", "Draw 1 card. Then, 5 cards go.", "Draw 1 card. Then, 5 cards go."],
  ];
  it.each(cases)("controller to opponent: %s (#487)", (_name, label, expected) => {
    expect(forOpponent(label)).toBe(expected);
  });

  const reverse: [string, string, string][] = [
    ["es after sh", "Your opponent trashes 2 cards from their hand.", "Trash 2 cards from your hand."],
    ["es after ch", "Your opponent searches their deck.", "Search your deck."],
    ["es after ss", "Your opponent passes 1 card.", "Pass 1 card."],
    ["es after x", "Your opponent fixes their Leader.", "Fix your Leader."],
    ["es after z", "Your opponent buzzes their Leader.", "Buzz your Leader."],
    ["ies", "Your opponent carries 1 card.", "Carry 1 card."],
    ["plain s", "Your opponent draws 2 cards.", "Draw 2 cards."],
    ["silent e verb", "Your opponent places 1 card.", "Place 1 card."],
    ["no object", "Your opponent draws.", "Draw."],
    ["no trailing period", "Your opponent draws 2 cards", "Draw 2 cards"],
    ["possessives", "Your opponent rests their Leader and your Character.", "Rest your Leader and your opponent's Character."],
    ["Then sentence", "Your opponent draws 1 card. Then, your opponent trashes 1 card from their hand.", "Draw 1 card. Then, trash 1 card from your hand."],
  ];
  it.each(reverse)("opponent to controller: %s (#487)", (_name, label, expected) => {
    expect(forOpponent(label)).toBe(expected);
  });
});
