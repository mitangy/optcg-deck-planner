import { describe, expect, it } from "vitest";
import type { Intent, PlayerView } from "../net/protocol";
import { DEMO_VIEW } from "../pages/DemoPage";
import {
  blockIntentFor,
  cardActionText,
  counterIntentForCard,
  counterIntentForHand,
  counterPrimaryLabel,
  humanizeAbilityId,
  popoverPlacement,
  splitCardActions,
} from "./cardActions";

// DEMO_VIEW hand: 0 ST01-003, 1 ST01-006, 2 ST01-008, 3 ST01-009, 4 ST01-014 (+2000 Counter).
const view: PlayerView = {
  ...DEMO_VIEW,
  you: {
    ...DEMO_VIEW.you,
    hand: DEMO_VIEW.you.hand.map((c, i) => (i === 0 ? { ...c, counter: 3000 } : c)),
  },
};

describe("card actions on the card (#PR_B)", () => {
  it("splitCardActions keeps phase-wide intents in the bar and per-card ones on the card (#PR_B)", () => {
    const shown: Intent[] = [
      { type: "mulligan", doMulligan: false },
      { type: "activate_ability", sourceId: "y-leader", abilityId: "x_y" },
      { type: "play_card", handIndex: 0 },
      { type: "resolve_trigger" },
    ];
    const { card, bar } = splitCardActions(shown);
    expect(card.map((i) => i.type)).toEqual(["activate_ability", "play_card"]);
    expect(bar.map((i) => i.type)).toEqual(["mulligan", "resolve_trigger"]);
  });

  it("splitCardActions collapses the per-Character replace plays into one button (#PR_B)", () => {
    const shown: Intent[] = [
      { type: "play_card", handIndex: 2, trashCharacterId: "y-c1" },
      { type: "play_card", handIndex: 2, trashCharacterId: "y-c2" },
    ];
    expect(splitCardActions(shown).card).toHaveLength(1);
  });

  it("an ability reads Activate Ability and names its target (#PR_B)", () => {
    const text = cardActionText(
      { type: "activate_ability", sourceId: "y-leader", abilityId: "leader_give_rested_don", targetId: "y-c1" },
      view,
    );
    expect(text.label).toBe("Activate Ability");
    expect(text.sub).toMatch(/^→ \S/);
    expect(text.title).toMatch(/^Activate /);
  });

  it("an ability with no target shows its readable ability id (#PR_B)", () => {
    const text = cardActionText(
      { type: "activate_ability", sourceId: "y-leader", abilityId: "leader_give_rested_don" },
      view,
    );
    expect(text.sub).toBe("Leader give rested don");
  });

  it("humanizeAbilityId leaves opaque ids out (#PR_B)", () => {
    expect(humanizeAbilityId("a1")).toBeNull();
    expect(humanizeAbilityId(undefined)).toBeNull();
  });

  it("the Counter button shows the hand card's live Counter value (#PR_B)", () => {
    expect(cardActionText({ type: "counter_from_hand", handIndex: 0 }, view).label).toBe(
      "Counter +3000",
    );
    expect(cardActionText({ type: "counter_from_hand", handIndex: 2 }, view).label).toBe(
      "Counter +1000",
    );
  });

  it("counterIntentForHand finds the one Counter play for that slot only (#PR_B)", () => {
    const intents: Intent[] = [
      { type: "counter_from_hand", handIndex: 0 },
      { type: "counter_event", handIndex: 5 },
      { type: "pass_counter" },
    ];
    expect(counterIntentForHand(intents, 5)).toEqual({ type: "counter_event", handIndex: 5 });
    expect(counterIntentForHand(intents, 1)).toBeNull();
  });

  it("counterIntentForHand will not guess between two Counter plays on one slot (#PR_B)", () => {
    const intents: Intent[] = [
      { type: "counter_from_hand", handIndex: 3 },
      { type: "counter_event", handIndex: 3 },
    ];
    expect(counterIntentForHand(intents, 3)).toBeNull();
  });

  it("counterIntentForCard maps a hand card id to its slot (#PR_B)", () => {
    const intents: Intent[] = [
      { type: "counter_from_hand", handIndex: 0 },
      { type: "counter_from_hand", handIndex: 2 },
    ];
    expect(counterIntentForCard(intents, view.you.hand, "y-h3")).toEqual(intents[1]);
    expect(counterIntentForCard(intents, view.you.hand, "y-h2")).toBeNull();
    expect(counterIntentForCard(intents, view.you.hand, "nope")).toBeNull();
  });

  it("blockIntentFor picks the declare_block of that Blocker (#PR_B)", () => {
    const intents: Intent[] = [
      { type: "declare_block", blockerId: "y-c1" },
      { type: "declare_block", blockerId: "y-c3" },
    ];
    expect(blockIntentFor(intents, "y-c3")).toEqual(intents[1]);
    expect(blockIntentFor(intents, "y-c2")).toBeNull();
  });
});

describe("counter step primary label (#PR_B)", () => {
  const safe = { remaining: 0, stagedIds: [] as string[] };
  const short = { remaining: 2000, stagedIds: [] as string[] };

  it("reads Resolve once the defender is already safe (#PR_B)", () => {
    expect(counterPrimaryLabel(safe, false)).toBe("Resolve");
    expect(counterPrimaryLabel(safe, true)).toBe("Resolve");
  });

  it("stays Pass counter / Take hit while counters are still needed (#PR_B)", () => {
    expect(counterPrimaryLabel(short, false)).toBe("Pass counter");
    expect(counterPrimaryLabel(short, true)).toBe("Take hit");
  });

  it("does not claim Resolve when the powers are unknown (#PR_B)", () => {
    expect(counterPrimaryLabel({ remaining: null, stagedIds: [] }, false)).toBe("Pass counter");
  });

  it("the tray's staged counters still read Confirm counter, even when safe (#PR_B)", () => {
    expect(counterPrimaryLabel({ remaining: 0, stagedIds: ["y-h5"] }, true)).toBe("Confirm counter");
    // The desktop bar has no staging, so the same state is just Resolve.
    expect(counterPrimaryLabel({ remaining: 0, stagedIds: ["y-h5"] }, false)).toBe("Resolve");
  });
});

describe("popoverPlacement (#PR_B)", () => {
  const box = { left: 600, top: 400, width: 100, height: 140 };

  it("centres over the card, tucked over its top edge (#PR_B)", () => {
    expect(popoverPlacement(box, 160, 1280)).toEqual({ left: 650, top: 410, above: true });
  });

  it("flips below the card when there is no headroom (#PR_B)", () => {
    expect(popoverPlacement({ ...box, top: 40 }, 160, 1280)).toEqual({ left: 650, top: 170, above: false });
  });

  it("stays inside the viewport at both edges (#PR_B)", () => {
    expect(popoverPlacement({ ...box, left: 0 }, 200, 375).left).toBe(108);
    expect(popoverPlacement({ ...box, left: 300 }, 200, 375).left).toBe(267);
  });
});
