import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSimGames, fetchSimGameCount, importSimGames } from "./historyApi";
import { addResults, batchGames, BATCH_GAMES, describeImport, logKey, logPlayers, logToGame, NO_RESULT, readSimUpload } from "./simImport";

const fixture = JSON.parse(readFileSync("../packages/rules/src/sim/optcgsim/__fixtures__/game-me-first-won.json", "utf8")) as { combatLog: string };
const LOG = fixture.combatLog;

describe("reading an OPTCGSim upload (#1030)", () => {
  it("takes the export array, a {games} wrapper or one game object as games (#1030)", () => {
    expect(readSimUpload('[{"a":1},{"a":2}]')).toEqual({ kind: "games", games: [{ a: 1 }, { a: 2 }] });
    expect(readSimUpload('{"games":[{"a":1}]}')).toEqual({ kind: "games", games: [{ a: 1 }] });
    expect(readSimUpload('{"a":1}')).toEqual({ kind: "games", games: [{ a: 1 }] });
  });

  it("takes text with player lines as one combat log and refuses anything else (#1030)", () => {
    expect(readSimUpload(`  ${LOG}\n`)).toMatchObject({ kind: "log" });
    expect(readSimUpload("hello there")).toMatchObject({ kind: "error" });
    expect(readSimUpload("   ")).toMatchObject({ kind: "error" });
    expect(readSimUpload("[1, 2")).toMatchObject({ kind: "error", message: expect.stringMatching(/could not be read/) });
    expect(readSimUpload("[]")).toMatchObject({ kind: "error" });
  });

  it("splits a big export into requests the server accepts (#1030)", () => {
    const games = Array.from({ length: BATCH_GAMES * 2 + 3 }, (_, i) => ({ i }));
    const batches = batchGames(games);
    expect(batches.map((b) => b.length)).toEqual([BATCH_GAMES, BATCH_GAMES, 3]);
    expect(batches.flat()).toEqual(games);
    const fat = Array.from({ length: 4 }, (_, i) => ({ i, log: "x".repeat(1_400_000) }));
    expect(batchGames(fat).map((b) => b.length)).toEqual([2, 2]);
  });

  it("adds batch results and says what was skipped and why (#1030)", () => {
    const sum = addResults({ imported: 2, skipped_duplicates: 1, skipped_invalid: 1, total: 4 }, { imported: 1, skipped_duplicates: 0, skipped_invalid: 2, total: 3 });
    expect(sum).toEqual({ imported: 3, skipped_duplicates: 1, skipped_invalid: 3, total: 7 });
    expect(describeImport(sum)).toBe("Imported 3, skipped 4 (1 already imported, 3 not usable).");
    expect(describeImport({ ...NO_RESULT, imported: 4, total: 4 })).toBe("Imported 4.");
  });
});

describe("a pasted combat log (#1030)", () => {
  it("names its two players in owner order, without the invisible character (#1030)", () => {
    expect(logPlayers(LOG)).toEqual([
      { name: "PlayerA#1", leaderId: "OP16-080" },
      { name: "PlayerB#2", leaderId: "OP16-060" },
    ]);
  });

  it("becomes a one-game record for whichever player is you (#1030)", () => {
    const first = logToGame(LOG, 0, true, "paste-k")!;
    expect(first).toMatchObject({ matchKey: "paste-k", playerName: "PlayerA#1", oppPlayerName: "PlayerB#2", playerLeader: "OP16-080", oppLeader: "OP16-060", result: "Won" });
    expect(first.combatLog).toBe(LOG);
    const second = logToGame(LOG, 1, false, "paste-k")!;
    expect(second).toMatchObject({ playerName: "PlayerB#2", playerLeader: "OP16-060", oppLeader: "OP16-080", result: "Lost" });
    // The cards each side took out of its deck, as copies of a card number.
    expect(first.decklist).toEqual(expect.arrayContaining([expect.stringMatching(/^\dxOP16-(104|109|119)$/)]));
    expect(first.decklist).not.toEqual(second.decklist);
  });

  it("is not a game when it names no second player (#1030)", () => {
    expect(logToGame("RZ1|PLY|1|Solo#1|OP01-001\n", 0, true, "k")).toBeNull();
  });

  it("keys the same log the same way and different logs differently (#1030)", async () => {
    expect(await logKey(LOG)).toBe(await logKey(LOG));
    expect(await logKey(LOG)).not.toBe(await logKey(LOG + "x"));
    expect((await logKey(LOG)).length).toBeGreaterThanOrEqual(8);
  });
});

describe("import requests (#1030)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("posts games, counts them and clears them with the session (#1030)", async () => {
    const calls: { path: string; method: string; body?: string; credentials?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname + new URL(url).search;
      calls.push({ path, method: init.method ?? "GET", body: init.body as string | undefined, credentials: init.credentials });
      return new Response(JSON.stringify(path.startsWith("/analyst/sim-games/import") ? { imported: 1, skipped_duplicates: 0, skipped_invalid: 0, total: 1 } : { total: 4, deleted: 4 }), { status: 200 });
    });
    await expect(importSimGames([{ a: 1 }])).resolves.toMatchObject({ imported: 1 });
    await expect(fetchSimGameCount()).resolves.toBe(4);
    await expect(clearSimGames()).resolves.toBe(4);
    expect(calls).toEqual([
      { path: "/analyst/sim-games/import", method: "POST", body: JSON.stringify({ games: [{ a: 1 }] }), credentials: "include" },
      { path: "/analyst/sim-games?limit=1", method: "GET", body: undefined, credentials: "include" },
      { path: "/analyst/sim-games", method: "DELETE", body: undefined, credentials: "include" },
    ]);
  });
});
