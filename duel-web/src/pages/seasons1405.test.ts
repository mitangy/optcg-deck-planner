import { describe, expect, it } from "vitest";
import { pastSeasonFromParam, seasonOptions } from "./leaderboardModel";

const past = [
  { number: 2, name: "Wano" },
  { number: 1, name: "Season 1" },
];

describe("leaderboard season picker (#1405)", () => {
  it("opens a past season from ?season= and falls back to the current one for anything else", () => {
    expect(pastSeasonFromParam("1", past)).toBe(1);
    expect(pastSeasonFromParam("2", past)).toBe(2);
    expect(pastSeasonFromParam("3", past)).toBeNull(); // the running season, or one that never happened
    expect(pastSeasonFromParam("0", past)).toBeNull();
    for (const odd of ["1abc", "1e0", "0x1", " 1", "1.0", "-1"]) expect(pastSeasonFromParam(odd, past)).toBeNull();
    expect(pastSeasonFromParam("", past)).toBeNull();
    expect(pastSeasonFromParam(null, past)).toBeNull();
  });

  it("lists the running season first, marked current, then ended seasons newest first", () => {
    expect(seasonOptions({ name: "Season 3" }, past)).toEqual([
      { value: "current", label: "Season 3 (current)" },
      { value: "2", label: "Wano" },
      { value: "1", label: "Season 1" },
    ]);
  });
});
