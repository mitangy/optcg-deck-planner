import { describe, expect, it } from "vitest";
import { narrateEvents, type BattleLogEntry } from "./battleLog";
import type { MotionCue } from "./motionCues";
import { logSfx, mergeSfx, newLogEntries, resultSfx, viewSfx } from "./sfx";

const log = (...ids: string[]): BattleLogEntry[] =>
  ids.map((id) => ({ id, turn: 1, text: "x", tone: "play", important: false, segments: [] }));

/** Real narration, as the board sees it, with you in seat 0. */
const narrated = (...events: Record<string, unknown>[]) =>
  narrateEvents(events as never, { youSeat: 0, turnNumber: 2 });

describe("newLogEntries", () => {
  it("returns nothing on first look, so a mount never plays the past (#253)", () => {
    expect(newLogEntries(undefined, log("a", "b"))).toEqual([]);
  });

  it("returns only the lines after the last one seen (#253)", () => {
    expect(newLogEntries("a", log("a", "b", "c")).map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("returns every line when the log was empty before (#253)", () => {
    expect(newLogEntries(null, log("a")).map((e) => e.id)).toEqual(["a"]);
  });

  it("returns nothing when the log was replaced by a resync or undo (#253)", () => {
    expect(newLogEntries("a", log("y", "z"))).toEqual([]);
  });
});

describe("logSfx", () => {
  it("earns your own play, counter and attack but not the opponent's, which have their own cues (#253)", () => {
    const mine = narrated(
      { type: "card_played", seat: 0, defId: "ST01-005" },
      { type: "counter_applied", seat: 0, defId: "ST01-014", bonus: 2000 },
      { type: "attack_declared", seat: 0, target: { kind: "leader" } },
    );
    expect(logSfx(mine, false)).toEqual(["play", "counter", "attack"]);
    const theirs = narrated(
      { type: "card_played", seat: 1, defId: "ST01-005" },
      { type: "counter_applied", seat: 1, defId: "ST01-014", bonus: 2000 },
      { type: "attack_declared", seat: 1, target: { kind: "leader" } },
    );
    expect(logSfx(theirs, false)).toEqual([]);
  });

  it("earns a block and a K.O. whoever does it (#253)", () => {
    const lines = narrated(
      { type: "blocked", seat: 1 },
      { type: "character_ko", seat: 1, defId: "ST01-005" },
    );
    expect(logSfx(lines, false)).toEqual(["block", "ko"]);
  });

  it("earns DON!! attached by either side, not DON!! placed (#253)", () => {
    const lines = narrated(
      { type: "don_given", seat: 1, targetDefId: "ST01-005" },
      { type: "don_given", seat: 0, targetDefId: "ST01-005" },
      { type: "don_placed", seat: 0, count: 2 },
    );
    expect(logSfx(lines, false)).toEqual(["don", "don"]);
  });

  it("lets spectators hear both sides (#253)", () => {
    const lines = narrateEvents(
      [
        { type: "card_played", seat: 1, defId: "ST01-005" },
        { type: "attack_declared", seat: 0, target: { kind: "leader" } },
      ] as never,
      { youSeat: null, turnNumber: 2 },
    );
    expect(logSfx(lines, true)).toEqual(["play", "attack"]);
  });
});

describe("viewSfx", () => {
  const draw: MotionCue = { kind: "draw", side: "opp", count: 2, ids: [] };
  const don: MotionCue = { kind: "don", side: "you", count: 1, activeAfter: 1 };

  it("earns a draw for either side and DON!! added (#253)", () => {
    expect(viewSfx([draw, don])).toEqual(["draw", "don"]);
    expect(viewSfx([{ ...draw, side: "you" }])).toEqual(["draw"]);
  });

  it("merges a burst of draws into one cue (#253)", () => {
    expect(viewSfx([draw, { ...draw, count: 1 }, draw])).toEqual(["draw"]);
  });

  it("ignores Life moves and power changes (#253)", () => {
    expect(viewSfx([{ kind: "life_lost", side: "you", count: 1 }, { kind: "power", side: "you", id: "a", up: true }])).toEqual([]);
  });
});

describe("resultSfx", () => {
  it("wins or loses when a winner first appears (#253)", () => {
    expect(resultSfx(null, 0, 0, false)).toBe("win");
    expect(resultSfx(null, 1, 0, false)).toBe("lose");
  });

  it("is silent on mount, once decided, and for spectators (#253)", () => {
    expect(resultSfx(undefined, 0, 0, false)).toBeNull();
    expect(resultSfx(0, 0, 0, false)).toBeNull();
    expect(resultSfx(null, 0, 0, true)).toBeNull();
    expect(resultSfx(null, null, 0, false)).toBeNull();
  });
});

describe("mergeSfx", () => {
  it("drops duplicates and keeps the most important three (#253)", () => {
    expect(mergeSfx(["draw", "draw", "play", "don", "attack", "ko"])).toEqual(["ko", "attack", "play"]);
  });
});
