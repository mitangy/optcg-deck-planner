import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import {
  canDragDon,
  canDragHandCard,
  canDropPlayOnField,
  giveDonTargetIds,
  giveDonTargetIdsForAll,
  matchGiveDon,
  matchGiveDonMulti,
  matchPlayCardOnField,
  matchPlayCardTrash,
  parseDropAttr,
  playCardTrashTargetIds,
  resolveDropIntents,
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

describe("multi-select DON!! drag helpers", () => {
  it("intersects targets legal for every donId in the set", () => {
    // d1 -> {leader, c1}, d2 -> {leader}: only "leader" works for both.
    expect(giveDonTargetIdsForAll(intents, ["d1", "d2"])).toEqual(["leader"]);
    expect(giveDonTargetIdsForAll(intents, ["d1"]).sort()).toEqual(["c1", "leader"]);
    expect(giveDonTargetIdsForAll(intents, [])).toEqual([]);
    expect(giveDonTargetIdsForAll(intents, ["d1", "missing"])).toEqual([]);
  });

  it("resolves one give_don intent per donId with a legal drop, in order", () => {
    expect(matchGiveDonMulti(intents, ["d1", "d2"], "leader")).toEqual([
      { type: "give_don", donId: "d1", targetId: "leader" },
      { type: "give_don", donId: "d2", targetId: "leader" },
    ]);
    // d2 has no legal give_don to c1 — only d1's intent comes back.
    expect(matchGiveDonMulti(intents, ["d1", "d2"], "c1")).toEqual([
      { type: "give_don", donId: "d1", targetId: "c1" },
    ]);
    expect(matchGiveDonMulti(intents, ["missing"], "leader")).toEqual([]);
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

describe("resolveDropIntents", () => {
  it("resolves a single-don give_don drag onto matching target", () => {
    expect(
      resolveDropIntents(
        { type: "give_don", donIds: ["d1"] },
        { kind: "give_don_target", targetId: "leader" },
        intents,
      ),
    ).toEqual([{ type: "give_don", donId: "d1", targetId: "leader" }]);
  });

  it("resolves a multi-don give_don drag as sequential intents", () => {
    expect(
      resolveDropIntents(
        { type: "give_don", donIds: ["d1", "d2"] },
        { kind: "give_don_target", targetId: "leader" },
        intents,
      ),
    ).toEqual([
      { type: "give_don", donId: "d1", targetId: "leader" },
      { type: "give_don", donId: "d2", targetId: "leader" },
    ]);
  });

  it("rejects mismatched drop kinds", () => {
    expect(
      resolveDropIntents(
        { type: "give_don", donIds: ["d1"] },
        { kind: "play_field" },
        intents,
      ),
    ).toEqual([]);
    expect(
      resolveDropIntents(
        { type: "play_card", handIndex: 0 },
        { kind: "give_don_target", targetId: "leader" },
        intents,
      ),
    ).toEqual([]);
  });

  it("resolves play_card field and trash drops", () => {
    expect(
      resolveDropIntents(
        { type: "play_card", handIndex: 0 },
        { kind: "play_field" },
        intents,
      ),
    ).toEqual([{ type: "play_card", handIndex: 0 }]);
    expect(
      resolveDropIntents(
        { type: "play_card", handIndex: 2 },
        { kind: "play_field" },
        intents,
      ),
    ).toEqual([]);
    expect(
      resolveDropIntents(
        { type: "play_card", handIndex: 2 },
        { kind: "play_trash", characterId: "c1" },
        intents,
      ),
    ).toEqual([{ type: "play_card", handIndex: 2, trashCharacterId: "c1" }]);
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
