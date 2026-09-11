import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import {
  canDragDon,
  canDragHandCard,
  canDropPlayOnField,
  giveDonTargetIds,
  matchGiveDon,
  matchPlayCardOnField,
  matchPlayCardTrash,
  parseDropAttr,
  playCardTrashTargetIds,
  resolveDropIntent,
} from "./dragIntents";

const intents: Intent[] = [
  { type: "end_turn" },
  { type: "give_don", donId: "d1", targetId: "leader" },
  { type: "give_don", donId: "d1", targetId: "c1" },
  { type: "give_don", donId: "d2", targetId: "leader" },
  { type: "play_card", handIndex: 0 },
  { type: "play_card", handIndex: 2, trashCharacterId: "c1" },
  { type: "play_card", handIndex: 2, trashCharacterId: "c2" },
  { type: "activate_leader", targetId: "leader" },
];

describe("canDragDon / giveDonTargetIds", () => {
  it("allows drag only when give_don exists for donId", () => {
    expect(canDragDon(intents, "d1")).toBe(true);
    expect(canDragDon(intents, "d2")).toBe(true);
    expect(canDragDon(intents, "d3")).toBe(false);
    expect(canDragDon(intents, "leader")).toBe(false);
  });

  it("lists distinct give_don targets for a don", () => {
    expect(giveDonTargetIds(intents, "d1").sort()).toEqual(["c1", "leader"]);
    expect(giveDonTargetIds(intents, "d2")).toEqual(["leader"]);
    expect(giveDonTargetIds(intents, "missing")).toEqual([]);
  });

  it("matches exact give_don intent", () => {
    expect(matchGiveDon(intents, "d1", "c1")).toEqual({
      type: "give_don",
      donId: "d1",
      targetId: "c1",
    });
    expect(matchGiveDon(intents, "d1", "missing")).toBeNull();
    expect(matchGiveDon(intents, "d2", "c1")).toBeNull();
  });
});

describe("play_card drag / drop matching", () => {
  it("allows hand drag when play_card exists for index", () => {
    expect(canDragHandCard(intents, 0)).toBe(true);
    expect(canDragHandCard(intents, 2)).toBe(true);
    expect(canDragHandCard(intents, 1)).toBe(false);
  });

  it("field drop only when play_card has no trashCharacterId", () => {
    expect(canDropPlayOnField(intents, 0)).toBe(true);
    expect(canDropPlayOnField(intents, 2)).toBe(false);
    expect(matchPlayCardOnField(intents, 0)).toEqual({
      type: "play_card",
      handIndex: 0,
    });
    expect(matchPlayCardOnField(intents, 2)).toBeNull();
  });

  it("trash targets for full-board play_card", () => {
    expect(playCardTrashTargetIds(intents, 2).sort()).toEqual(["c1", "c2"]);
    expect(playCardTrashTargetIds(intents, 0)).toEqual([]);
    expect(matchPlayCardTrash(intents, 2, "c2")).toEqual({
      type: "play_card",
      handIndex: 2,
      trashCharacterId: "c2",
    });
    expect(matchPlayCardTrash(intents, 2, "c9")).toBeNull();
  });
});

describe("resolveDropIntent", () => {
  it("resolves give_don drag onto matching target", () => {
    expect(
      resolveDropIntent(
        { type: "give_don", donId: "d1" },
        { kind: "give_don_target", targetId: "leader" },
        intents,
      ),
    ).toEqual({ type: "give_don", donId: "d1", targetId: "leader" });
  });

  it("rejects mismatched drop kinds", () => {
    expect(
      resolveDropIntent(
        { type: "give_don", donId: "d1" },
        { kind: "play_field" },
        intents,
      ),
    ).toBeNull();
    expect(
      resolveDropIntent(
        { type: "play_card", handIndex: 0 },
        { kind: "give_don_target", targetId: "leader" },
        intents,
      ),
    ).toBeNull();
  });

  it("resolves play_card field and trash drops", () => {
    expect(
      resolveDropIntent(
        { type: "play_card", handIndex: 0 },
        { kind: "play_field" },
        intents,
      ),
    ).toEqual({ type: "play_card", handIndex: 0 });
    expect(
      resolveDropIntent(
        { type: "play_card", handIndex: 2 },
        { kind: "play_field" },
        intents,
      ),
    ).toBeNull();
    expect(
      resolveDropIntent(
        { type: "play_card", handIndex: 2 },
        { kind: "play_trash", characterId: "c1" },
        intents,
      ),
    ).toEqual({ type: "play_card", handIndex: 2, trashCharacterId: "c1" });
  });
});

describe("parseDropAttr", () => {
  it("parses data-dnd-drop values", () => {
    expect(parseDropAttr("play_field")).toEqual({ kind: "play_field" });
    expect(parseDropAttr("give_don:abc")).toEqual({
      kind: "give_don_target",
      targetId: "abc",
    });
    expect(parseDropAttr("play_trash:c1")).toEqual({
      kind: "play_trash",
      characterId: "c1",
    });
    expect(parseDropAttr("")).toBeNull();
    expect(parseDropAttr("nope")).toBeNull();
  });
});
