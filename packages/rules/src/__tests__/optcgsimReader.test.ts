import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSimExport, parseSimGame, type SimGame, type SimMatchRecord } from "../sim/optcgsim/index.js";

const fixture = (name: string): SimMatchRecord =>
  JSON.parse(readFileSync(new URL(`../sim/optcgsim/__fixtures__/${name}`, import.meta.url), "utf8")) as SimMatchRecord;

const FIRST = fixture("game-me-first-won.json"); // turnOrder 0, PlayerA won
const SECOND = fixture("game-me-second-lost.json"); // turnOrder 1, PlayerA lost, PlayerA mulliganed

/** Minimal synthetic log: one card drawn by `owner` 2, then the Don phase starts the turn. */
const synth = (opts: { ply: string[]; pre?: string[]; match?: Partial<SimMatchRecord> }): SimGame =>
  parseSimGame({
    playerName: "PlayerA#1",
    oppPlayerName: "PlayerB#2",
    turnOrder: 0,
    result: "Won",
    ...opts.match,
    combatLog: [
      "RZ1|HDR|1.42c|2|RZ1",
      ...opts.ply,
      ...(opts.pre ?? []),
      "[PlayerA#1] Chose to go First",
      "RZ1|1|2|OP00-010|0|49|1|0|0|1|0|0|0",
      "RZ1|CHK|1|2|49|1|0|0|10|0|0|0|1|0",
      "[PlayerA#1] Draw 1 Don",
    ].join("\n"),
  });

describe("OPTCGSim combat log reader (#1030)", () => {
  it("who went first follows the Chose-to-go line and turnOrder 0 means the recording player (#1030)", () => {
    const a = parseSimGame(FIRST);
    expect(a.firstPlayer).toBe("me");
    expect(a.turns[0].active).toBe("me");
    expect(a.turns[1].active).toBe("opp");
    const b = parseSimGame(SECOND);
    expect(b.firstPlayer).toBe("opp");
    expect(b.turns[0].active).toBe("opp");
    expect(b.turns[1].active).toBe("me");
  });

  it("without a Chose-to-go line turnOrder alone decides: 0 me first, 1 me second (#1030)", () => {
    const log = ["RZ1|PLY|1|PlayerA#1|OP00-001", "RZ1|PLY|2|PlayerB#2|OP00-002", "[PlayerA#1] Draw 1 Don"].join("\n");
    const rec = { playerName: "PlayerA#1", oppPlayerName: "PlayerB#2", combatLog: log };
    expect(parseSimGame({ ...rec, turnOrder: 0 }).turns[0].active).toBe("me");
    expect(parseSimGame({ ...rec, turnOrder: 1 }).turns[0].active).toBe("opp");
  });

  it("names lose the zero-width space and the winner comes from the JSON result (#1030)", () => {
    const g = parseSimGame(FIRST);
    expect(FIRST.playerName).toContain("\u200b");
    expect(g.me.name).toBe("PlayerA#1");
    expect(g.opp.name).toBe("PlayerB#2");
    expect(g.winner).toBe("me");
    expect(parseSimGame(SECOND).winner).toBe("opp");
  });

  it("rebuilt zone counts agree with every CHK line of the fixtures (#1030)", () => {
    for (const rec of [FIRST, SECOND]) {
      const g = parseSimGame(rec);
      expect(g.chkChecked).toBeGreaterThan(100);
      expect(g.chkMismatches).toEqual([]);
    }
  });

  it("a CHK that disagrees with the moves is reported as a mismatch (#1030)", () => {
    const g = synth({ ply: ["RZ1|PLY|1|PlayerB#2|OP00-002", "RZ1|PLY|2|PlayerA#1|OP00-001"] });
    expect(g.chkMismatches).toEqual([]);
    const bad = parseSimGame({
      playerName: "PlayerA#1",
      oppPlayerName: "PlayerB#2",
      combatLog: [
        "RZ1|PLY|1|PlayerB#2|OP00-002",
        "RZ1|PLY|2|PlayerA#1|OP00-001",
        "RZ1|1|2|OP00-010|0|49|1|0|0|1|0|0|0",
        "RZ1|CHK|1|2|49|2|0|0|10|0|0|0|1|0",
      ].join("\n"),
    });
    expect(bad.chkMismatches).toEqual([{ seq: 1, side: "me", field: "hand", expected: 1, actual: 2 }]);
  });

  it("the turn-1 snapshot sees the first player's single DON!! and the second player's untouched board (#1030)", () => {
    const s = parseSimGame(FIRST).turns[0].snapshot;
    expect(s.me).toMatchObject({ donActive: 1, donRested: 0, donDeckCount: 9, lifeCount: 4, handCount: 5, deckCount: 41 });
    expect(s.me.leader).toEqual({ id: FIRST.playerLeader, attachedDon: 0, rested: false });
    expect(s.opp).toMatchObject({ handCount: 5, donActive: 0, donDeckCount: 10, characters: [] });
  });

  it("the snapshot is taken after the DON!! phase and before anything the active player does (#1030)", () => {
    const g = parseSimGame({
      playerName: "PlayerA#1",
      oppPlayerName: "PlayerB#2",
      turnOrder: 0,
      combatLog: [
        "RZ1|PLY|1|PlayerA#1|OP00-001",
        "RZ1|PLY|2|PlayerB#2|OP00-002",
        "RZ1|1|1|Don|4|9|5|0|1|1|0|0|0",
        "[PlayerA#1] Draw 1 Don",
        "RZ1|2|1|OP00-011|0|49|1|0|0|1|0|0|0",
        "[PlayerA#1] Deploy Someone [<mark><link=\"OP00-010\">OP00-010</link></mark>]",
        "RZ1|3|1|OP00-010|1|0|2|0|1|1|0|0|0",
      ].join("\n"),
    });
    expect(g.turns[0].snapshot.me).toMatchObject({ donActive: 1, donRested: 0, donDeckCount: 9, handCount: 0 });
    expect(g.turns[0].events.map((e) => e.kind)).toEqual(["drawDon", "play"]);
  });

  it("refresh readies the active player's DON!! at their next turn start (#1030)", () => {
    // Fixture: PlayerA spends DON!! in turn 1 and turn 3 opens with all 3 active again.
    const g = parseSimGame(FIRST);
    expect(g.turns[2].active).toBe("me");
    expect(g.turns[2].snapshot.me).toMatchObject({ donActive: 3, donRested: 0 });
    // The waiting player keeps the DON!! they rested on their own turn.
    expect(g.turns[4].snapshot.opp).toMatchObject({ donActive: 1, donRested: 4 });
  });

  it("a Character that attacked stays rested on the waiting side's snapshot (#1030)", () => {
    const g = parseSimGame(FIRST);
    expect(g.turns[3].active).toBe("opp");
    expect(g.turns[3].snapshot.me.leader.rested).toBe(true);
    expect(g.turns[3].snapshot.me.characters.map((c) => [c.id, c.rested])).toEqual([
      ["OP16-109", false],
      ["OP09-095", true],
    ]);
  });

  it("attached DON!! counts show on the waiting side's leader and Characters (#1030)", () => {
    const g = parseSimGame(FIRST);
    expect(g.turns[5].snapshot.me.leader.attachedDon).toBe(1);
    expect(g.turns[7].snapshot.me.leader.attachedDon).toBe(2);
    expect(g.turns[3].snapshot.me.leader.attachedDon).toBe(0);
  });

  it("hidden opponent hand ids stay out of knownHandIds while the recording player's hand is fully known (#1030)", () => {
    const s = parseSimGame(FIRST).turns[1].snapshot;
    expect(s.me.knownHandIds).toHaveLength(s.me.handCount);
    expect(s.opp.handCount).toBeGreaterThan(0);
    expect(s.opp.knownHandIds).toEqual([]);
  });

  it("combat events carry attacker, target, power, block, counter, damage and K.O. (#1030)", () => {
    const g = parseSimGame(FIRST);
    const all = g.turns.flatMap((t) => t.events);
    const kinds = (k: string) => all.filter((e) => e.kind === k).length;
    expect(kinds("attack")).toBe(8);
    expect(kinds("battle")).toBe(8);
    expect(kinds("block")).toBe(2);
    expect(kinds("counter")).toBe(1);
    expect(kinds("damage")).toBe(4);
    expect(kinds("ko")).toBe(2);
    expect(kinds("attachDon")).toBe(4);
    expect(kinds("endTurn")).toBe(9);
    const atk = all.find((e) => e.kind === "attack");
    const battle = all.find((e) => e.kind === "battle");
    expect(atk).toMatchObject({ side: "me", attackerId: FIRST.playerLeader });
    expect(battle).toMatchObject({ attackerId: FIRST.playerLeader });
    for (const t of g.turns) for (const e of t.events) if (e.kind === "attack") expect(e.side).toBe(t.active);
  });

  it("a mulligan line marks only the player who took it (#1030)", () => {
    const g = parseSimGame(SECOND);
    expect(g.me.mulligan).toBe(true);
    expect(g.opp.mulligan).toBe(false);
    expect(g.preEvents.some((e) => e.kind === "setup" && e.what === "mulligan")).toBe(true);
  });

  it("RZ1 owner numbers map to players by PLY name, whichever number is whose (#1030)", () => {
    const meOwner2 = synth({ ply: ["RZ1|PLY|1|PlayerB#2|OP00-002", "RZ1|PLY|2|PlayerA#1|OP00-001"] });
    expect(meOwner2.turns[0].snapshot.me.handCount).toBe(1);
    expect(meOwner2.turns[0].snapshot.opp.handCount).toBe(0);
    const meOwner1 = synth({ ply: ["RZ1|PLY|1|PlayerA#1|OP00-001", "RZ1|PLY|2|PlayerB#2|OP00-002"] });
    expect(meOwner1.turns[0].snapshot.me.handCount).toBe(0);
    expect(meOwner1.turns[0].snapshot.opp.handCount).toBe(1);
  });

  it("a stale PLY name leaves the other owner number to the other side (#1030)", () => {
    const g = synth({ ply: ["RZ1|PLY|1|PlayerA#1|OP00-001", "RZ1|PLY|2|SomeoneFromThePreviousGame#9|OP00-002"] });
    expect(g.turns[0].snapshot.opp.handCount).toBe(1);
    expect(g.turns[0].snapshot.me.handCount).toBe(0);
  });

  it("machine lines from the previous game's tail are ignored (#1030)", () => {
    const g = synth({
      ply: ["RZ1|PLY|1|PlayerA#1|OP00-001", "RZ1|PLY|2|PlayerB#2|OP00-002"],
      pre: [
        "RZ1|1|1|OP00-099|0|49|1|0|0|1|0|0|0",
        "RZ1|CHK|1|1|30|9|2|1|0|9|8|0|1|1",
        "Setting up a Relay Room...",
        "RZ1|CHK|2|1|50|0|0|0|10|0|0|0|1|0",
      ],
    });
    expect(g.chkMismatches).toEqual([]);
    expect(g.turns[0].snapshot.me.handCount).toBe(0);
    expect(g.turns[0].snapshot.opp.handCount).toBe(1);
  });

  it("unknown text lines are kept as raw events and never throw (#1030)", () => {
    const g = parseSimGame({
      playerName: "PlayerA#1",
      oppPlayerName: "PlayerB#2",
      combatLog: [
        "RZ1|PLY|1|PlayerA#1|OP00-001",
        "RZ1|PLY|2|PlayerB#2|OP00-002",
        "RZ1|bogus",
        "RZ1|CHK|x",
        "[PlayerA#1] Draw 1 Don",
        "[PlayerA#1] Does a brand new thing [<mark><link=\"OP00-010\">OP00-010</link></mark>] 3 times",
      ].join("\n"),
    });
    expect(g.unknownLines).toEqual(["Does a brand new thing [OP00-010] 3 times"].map((t) => `[PlayerA#1] ${t}`));
    expect(g.turns[0].events.at(-1)).toMatchObject({ kind: "unknown" });
  });

  it("parseSimExport skips games without a combat log and reports totals (#1030)", () => {
    const { games, report } = parseSimExport([FIRST, { ...SECOND, combatLog: null }, { playerName: "x" }, SECOND]);
    expect(games).toHaveLength(2);
    expect(report).toMatchObject({
      gamesInput: 4,
      gamesParsed: 2,
      gamesSkippedNoLog: 2,
      unknownLineCount: 0,
      chkMismatchCount: 0,
    });
    expect(report.turns).toBe(games[0].turns.length + games[1].turns.length);
    expect(report.eventsByKind.attack).toBe(19);
  });
});
