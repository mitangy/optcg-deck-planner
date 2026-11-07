import { describe, expect, it } from "vitest";
import { DECK_NAME_MAX, formatDeckRow, formatMetaDate, formatPercent, metaDeckName, ordinal } from "./metaFormat";

describe("meta deck naming and rows", () => {
  it("ordinals use th for 11-13 and st/nd/rd otherwise (#443)", () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "8th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });

  it("deck name is leader, placing ordinal, event; falls back to the leader id and drops a missing placing (#443)", () => {
    expect(metaDeckName("Silvers Rayleigh", "OP12-001", { placing: 1, event: "Weekly Cup" })).toBe("Silvers Rayleigh – 1st Weekly Cup");
    expect(metaDeckName("Silvers Rayleigh", "OP12-001", { placing: null, event: "Weekly Cup" })).toBe("Silvers Rayleigh – Weekly Cup");
    expect(metaDeckName("", "OP12-001", { placing: 12, event: "Weekly Cup" })).toBe("OP12-001 – 12th Weekly Cup");
  });

  it("deck name is trimmed to the API name limit (#443)", () => {
    const name = metaDeckName("Luffy", "OP01-001", { placing: 2, event: "x".repeat(500) });
    expect(name).toHaveLength(DECK_NAME_MAX);
    expect(name.startsWith("Luffy – 2nd x")).toBe(true);
  });

  it("a zero or negative placing is no placing (#443)", () => {
    expect(metaDeckName("Luffy", "OP01-001", { placing: 0, event: "Weekly Cup" })).toBe("Luffy – Weekly Cup");
    expect(metaDeckName("Luffy", "OP01-001", { placing: -1, event: "Weekly Cup" })).toBe("Luffy – Weekly Cup");
  });

  it("deck name does not end in a space when the cut lands after one (#443)", () => {
    const name = metaDeckName("L", "OP01-001", { placing: null, event: `${"x".repeat(DECK_NAME_MAX - 5)} tail` });
    expect(name.endsWith(" ")).toBe(false);
  });

  it("deck row reads placing of players, date, then record (#443)", () => {
    const record = { wins: 7, losses: 0, ties: 0 };
    expect(formatDeckRow({ placing: 1, players: 128, date: "2026-09-28", record })).toBe("1st of 128 · Sep 28 · 7-0-0");
    expect(formatDeckRow({ placing: null, players: 64, date: "2026-10-05", record: { wins: 4, losses: 2, ties: 1 } })).toBe("64 players · Oct 5 · 4-2-1");
  });

  it("deck row names the event only when asked (#443)", () => {
    const deck = { placing: 1, players: 64, event: "Weekly Cup", date: "2026-10-05", record: { wins: 6, losses: 1, ties: 2 } };
    expect(formatDeckRow(deck)).toBe("1st of 64 · Oct 5 · 6-1-2");
    expect(formatDeckRow(deck, { event: true })).toBe("1st of 64 · Weekly Cup · Oct 5 · 6-1-2");
  });

  it("dates read as the written month and day, and an unreadable date is shown as it came (#443)", () => {
    expect(formatMetaDate("2026-01-01")).toBe("Jan 1");
    expect(formatMetaDate("2026-12-31")).toBe("Dec 31");
    expect(formatMetaDate("2026-13-05")).toBe("2026-13-05");
    expect(formatMetaDate("soon")).toBe("soon");
  });

  it("percentages show one decimal and an em dash when there are no games (#443)", () => {
    expect(formatPercent(0.081)).toBe("8.1%");
    expect(formatPercent(0.5346)).toBe("53.5%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});
