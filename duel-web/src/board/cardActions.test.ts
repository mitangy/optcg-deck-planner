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
  soleCardButton,
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

describe("card actions on the card (#255)", () => {
  it("splitCardActions keeps phase-wide intents in the bar and per-card ones on the card (#255)", () => {
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

  it("splitCardActions collapses the per-Character replace plays into one button (#255)", () => {
    const shown: Intent[] = [
      { type: "play_card", handIndex: 2, trashCharacterId: "y-c1" },
      { type: "play_card", handIndex: 2, trashCharacterId: "y-c2" },
    ];
    expect(splitCardActions(shown).card).toHaveLength(1);
  });

  it("an ability reads Activate Ability and names its target (#255)", () => {
    const text = cardActionText(
      { type: "activate_ability", sourceId: "y-leader", abilityId: "leader_give_rested_don", targetId: "y-c1" },
      view,
    );
    expect(text.label).toBe("Activate Ability");
    expect(text.sub).toMatch(/^→ \S/);
    expect(text.title).toMatch(/^Activate /);
  });

  it("an ability with no target shows its readable ability id (#255)", () => {
    const text = cardActionText(
      { type: "activate_ability", sourceId: "y-leader", abilityId: "leader_give_rested_don" },
      view,
    );
    expect(text.sub).toBe("Leader give rested don");
  });

  it("humanizeAbilityId leaves opaque ids out (#255)", () => {
    expect(humanizeAbilityId("a1")).toBeNull();
    expect(humanizeAbilityId(undefined)).toBeNull();
  });

  it("the Counter button shows the hand card's live Counter value (#255)", () => {
    expect(cardActionText({ type: "counter_from_hand", handIndex: 0 }, view).label).toBe(
      "Counter +3000",
    );
    expect(cardActionText({ type: "counter_from_hand", handIndex: 2 }, view).label).toBe(
      "Counter +1000",
    );
  });

  it("counterIntentForHand finds the one Counter play for that slot only (#255)", () => {
    const intents: Intent[] = [
      { type: "counter_from_hand", handIndex: 0 },
      { type: "counter_event", handIndex: 5 },
      { type: "pass_counter" },
    ];
    expect(counterIntentForHand(intents, 5)).toEqual({ type: "counter_event", handIndex: 5 });
    expect(counterIntentForHand(intents, 1)).toBeNull();
  });

  it("counterIntentForHand will not guess between two Counter plays on one slot (#255)", () => {
    const intents: Intent[] = [
      { type: "counter_from_hand", handIndex: 3 },
      { type: "counter_event", handIndex: 3 },
    ];
    expect(counterIntentForHand(intents, 3)).toBeNull();
  });

  it("counterIntentForCard maps a hand card id to its slot (#255)", () => {
    const intents: Intent[] = [
      { type: "counter_from_hand", handIndex: 0 },
      { type: "counter_from_hand", handIndex: 2 },
    ];
    expect(counterIntentForCard(intents, view.you.hand, "y-h3")).toEqual(intents[1]);
    expect(counterIntentForCard(intents, view.you.hand, "y-h2")).toBeNull();
    expect(counterIntentForCard(intents, view.you.hand, "nope")).toBeNull();
  });

  it("blockIntentFor picks the declare_block of that Blocker (#255)", () => {
    const intents: Intent[] = [
      { type: "declare_block", blockerId: "y-c1" },
      { type: "declare_block", blockerId: "y-c3" },
    ];
    expect(blockIntentFor(intents, "y-c3")).toEqual(intents[1]);
    expect(blockIntentFor(intents, "y-c2")).toBeNull();
  });
});

describe("counter step primary label (#255)", () => {
  const safe = { remaining: 0, stagedIds: [] as string[] };
  const short = { remaining: 2000, stagedIds: [] as string[] };

  it("reads Resolve once the defender is already safe (#255)", () => {
    expect(counterPrimaryLabel(safe, false)).toBe("Resolve");
    expect(counterPrimaryLabel(safe, true)).toBe("Resolve");
  });

  it("stays Pass counter / Take hit while counters are still needed (#255)", () => {
    expect(counterPrimaryLabel(short, false)).toBe("Pass counter");
    expect(counterPrimaryLabel(short, true)).toBe("Take hit");
  });

  it("does not claim Resolve when the powers are unknown (#255)", () => {
    expect(counterPrimaryLabel({ remaining: null, stagedIds: [] }, false)).toBe("Pass counter");
  });

  it("the tray's staged counters still read Confirm counter, even when safe (#255)", () => {
    expect(counterPrimaryLabel({ remaining: 0, stagedIds: ["y-h5"] }, true)).toBe("Confirm counter");
    // The desktop bar has no staging, so the same state is just Resolve.
    expect(counterPrimaryLabel({ remaining: 0, stagedIds: ["y-h5"] }, false)).toBe("Resolve");
  });

  it("warns instead of Confirm counter while the staged counters are still short (#271)", () => {
    expect(counterPrimaryLabel({ remaining: 1000, stagedIds: ["y-h5"] }, true)).toBe(
      "Counter anyway (still lose)",
    );
    // An unreadable staged value can't be called short.
    expect(
      counterPrimaryLabel({ remaining: 1000, stagedIds: ["y-h5"], stagedUnknown: true }, true),
    ).toBe("Confirm counter");
  });
});

describe("popoverPlacement (#255, #449)", () => {
  const box = { left: 600, top: 400, width: 100, height: 140 };
  const size = { width: 160, height: 150 };
  const vp = { width: 1280, height: 720 };

  it("centres over the card, tucked over its top edge (#255)", () => {
    expect(popoverPlacement(box, size, vp)).toEqual({ left: 650, top: 410, above: true });
  });

  it("flips below the card when its height does not fit above (#255, #449)", () => {
    expect(popoverPlacement({ ...box, top: 40 }, size, vp)).toEqual({ left: 650, top: 170, above: false });
    // 100 px of headroom was enough for the old fixed 72 px rule, but not for a 150 px popover.
    expect(popoverPlacement({ ...box, top: 100 }, size, vp)).toEqual({ left: 650, top: 230, above: false });
  });

  it("stays inside the viewport at both edges (#255)", () => {
    expect(popoverPlacement({ ...box, left: 0 }, { ...size, width: 200 }, { width: 375, height: 720 }).left).toBe(108);
    expect(popoverPlacement({ ...box, left: 300 }, { ...size, width: 200 }, { width: 375, height: 720 }).left).toBe(267);
  });

  it("slides back on screen when neither side has room (#449)", () => {
    // 375 px tall landscape window, card in the middle: 150 px does not fit above or below.
    const short = { width: 812, height: 375 };
    const mid = { left: 300, top: 120, width: 60, height: 84 };
    const tall = { width: 160, height: 180 };
    const p = popoverPlacement(mid, tall, short);
    expect(p.above).toBe(false);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + tall.height).toBeLessThanOrEqual(short.height - 8);
    // Taller than the window: pinned to the top edge.
    expect(popoverPlacement(mid, { width: 160, height: 500 }, short).top).toBe(8);
  });

  it("keeps a popover that fits neither side inside the window, over the roomier side (#449)", () => {
    const low = { left: 600, top: 300, width: 100, height: 140 };
    const out = popoverPlacement(low, { width: 160, height: 330 }, { width: 1280, height: 480 });
    expect(out.top + 330).toBeLessThanOrEqual(480 - 8);
    expect(out.top).toBeGreaterThanOrEqual(8);
  });
});

describe("one-tap on a card with a single pop-up button (#502)", () => {
  it("presses the lone action when there is no DON!! row, the lone +1 when there are no actions (#502)", () => {
    expect(soleCardButton(["play"], [])).toEqual({ kind: "action", action: "play" });
    expect(soleCardButton([], [1])).toEqual({ kind: "don", count: 1 });
  });

  it("keeps the pop-up when it holds a real choice (#502)", () => {
    expect(soleCardButton([], [])).toBeNull();
    expect(soleCardButton(["attack"], [1])).toBeNull();
    expect(soleCardButton(["attack", "activate"], [])).toBeNull();
    expect(soleCardButton([], [1, 2])).toBeNull();
    expect(soleCardButton(["attack"], [1, 2])).toBeNull();
  });
});
