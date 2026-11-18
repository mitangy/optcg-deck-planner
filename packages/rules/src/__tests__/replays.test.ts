import { describe, expect, it } from "vitest";
import { listReplayNames, loadFixture, playReplay, readGolden } from "../testing/replay.js";

describe("golden replays", () => {
  const names = listReplayNames();

  it.each(names)("replays %s exactly as narrated in its golden", (name) => {
    const golden = readGolden(name);
    if (golden === null) throw new Error(`replays/${name}.golden.txt is missing; run \`npm run replay:bless -- ${name}\` and review it`);
    const actual = playReplay(name, loadFixture(name));
    // Compare line arrays so a mismatch prints a line-level diff.
    expect(actual.split("\n")).toEqual(golden.split("\n"));
  });
});
