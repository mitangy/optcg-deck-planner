import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import {
  attackTargetIdsForAttacker,
  filterIntentsForSelection,
  findAttackIntent,
  hasBoardActions,
  matchesBoardId,
} from "./intentFilter";

const intents: Intent[] = [
  { type: "end_turn" },
  { type: "play_card", handIndex: 0 },
  { type: "play_card", handIndex: 2, trashCharacterId: "c1" },
  { type: "give_don", donId: "d1", targetId: "leader" },
  { type: "give_don", donId: "d1", targetId: "c1" },
  { type: "activate_leader", targetId: "leader" },
  { type: "activate_leader", targetId: "c1" },
  { type: "declare_attack", attackerId: "leader", target: { kind: "leader" } },
  {
    type: "declare_attack",
    attackerId: "leader",
    target: { kind: "character", instanceId: "opp-c1" },
  },
  { type: "declare_attack", attackerId: "c1", target: { kind: "leader" } },
  { type: "declare_block", blockerId: "c2" },
  { type: "counter_from_hand", handIndex: 3 },
];

describe("filterIntentsForSelection", () => {
  it("shows only phase-global actions when nothing is selected", () => {
    const shown = filterIntentsForSelection(intents, {});
    expect(shown).toEqual([{ type: "end_turn" }]);
  });

  it("shows play_card/counter for the selected hand index plus globals", () => {
    const shown = filterIntentsForSelection(intents, { handIndex: 0 });
    expect(shown).toEqual([{ type: "end_turn" }, { type: "play_card", handIndex: 0 }]);
  });

  it("matches counter_from_hand by hand index", () => {
    const shown = filterIntentsForSelection(intents, { handIndex: 3 });
    expect(shown).toEqual([
      { type: "end_turn" },
      { type: "counter_from_hand", handIndex: 3 },
    ]);
  });

  it("shows attacker/activator/give_don-target/blocker intents for a selected board id", () => {
    const shown = filterIntentsForSelection(intents, { boardId: "leader" });
    expect(shown).toEqual([
      { type: "end_turn" },
      { type: "give_don", donId: "d1", targetId: "leader" },
      { type: "activate_leader", targetId: "leader" },
      { type: "declare_attack", attackerId: "leader", target: { kind: "leader" } },
      {
        type: "declare_attack",
        attackerId: "leader",
        target: { kind: "character", instanceId: "opp-c1" },
      },
    ]);
  });

  it("shows blocker intents for a selected board id", () => {
    const shown = filterIntentsForSelection(intents, { boardId: "c2" });
    expect(shown).toEqual([{ type: "end_turn" }, { type: "declare_block", blockerId: "c2" }]);
  });

  it("prefers hand selection over board selection when both are set", () => {
    const shown = filterIntentsForSelection(intents, { handIndex: 0, boardId: "leader" });
    expect(shown).toEqual([{ type: "end_turn" }, { type: "play_card", handIndex: 0 }]);
  });

  it("returns only globals for a board id with no actions", () => {
    const shown = filterIntentsForSelection(intents, { boardId: "no-actions" });
    expect(shown).toEqual([{ type: "end_turn" }]);
  });
});


describe("pending-choice / trigger globals", () => {
  it("always surfaces resolve_trigger and resolve_pending_choice with no selection", () => {
    const pending: Intent[] = [
      { type: "resolve_pending_choice", accept: true } as Intent,
      { type: "resolve_pending_choice", accept: false } as Intent,
      { type: "resolve_trigger", accept: true } as Intent,
      { type: "play_card", handIndex: 0 },
      { type: "declare_attack", attackerId: "c1", target: { kind: "leader" } },
    ];
    const shown = filterIntentsForSelection(pending, {});
    expect(shown.map((i) => i.type).sort()).toEqual([
      "resolve_pending_choice",
      "resolve_pending_choice",
      "resolve_trigger",
    ]);
  });
});

describe("matchesBoardId / hasBoardActions", () => {
  it("matches attacker, target, blocker and donId roles", () => {
    expect(matchesBoardId({ type: "declare_attack", attackerId: "c1" } as Intent, "c1")).toBe(
      true,
    );
    expect(matchesBoardId({ type: "give_don", targetId: "c1" } as Intent, "c1")).toBe(true);
    expect(matchesBoardId({ type: "declare_block", blockerId: "c1" } as Intent, "c1")).toBe(
      true,
    );
    expect(matchesBoardId({ type: "give_don", donId: "c1" } as Intent, "c1")).toBe(true);
    expect(matchesBoardId({ type: "end_turn" } as Intent, "c1")).toBe(false);
  });

  it("hasBoardActions is true only when a non-global intent references the id", () => {
    expect(hasBoardActions(intents, "leader")).toBe(true);
    expect(hasBoardActions(intents, "c2")).toBe(true);
    expect(hasBoardActions(intents, "nope")).toBe(false);
  });
});

describe("attackTargetIdsForAttacker / findAttackIntent", () => {
  it("resolves leader-kind targets to the concrete opponent leader id", () => {
    const ids = attackTargetIdsForAttacker(intents, "leader", "opp-leader");
    expect(ids.sort()).toEqual(["opp-c1", "opp-leader"]);
  });

  it("returns no targets for an attacker with no declared attacks", () => {
    expect(attackTargetIdsForAttacker(intents, "c2", "opp-leader")).toEqual([]);
  });

  it("finds the matching declare_attack intent for an attacker/target pair", () => {
    expect(findAttackIntent(intents, "leader", "opp-leader", "opp-leader")).toEqual({
      type: "declare_attack",
      attackerId: "leader",
      target: { kind: "leader" },
    });
    expect(findAttackIntent(intents, "leader", "opp-c1", "opp-leader")).toEqual({
      type: "declare_attack",
      attackerId: "leader",
      target: { kind: "character", instanceId: "opp-c1" },
    });
    expect(findAttackIntent(intents, "leader", "missing", "opp-leader")).toBeNull();
  });
});
