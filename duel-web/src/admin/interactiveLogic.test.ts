import { describe, expect, it } from "vitest";
import type { EvalRun } from "./adminApi";
import {
  type LeaderRow,
  dayLabel,
  externalUrl,
  nextSort,
  sortLeaders,
  sortedRunRows,
  tipPlacement,
  toggleSeries,
  tooltipFor,
  tooltipText,
  visibleMax,
  visibleTotals,
} from "./adminLogic";

const series = [
  { key: "ranked", label: "Ranked" },
  { key: "casual", label: "Casual" },
];
const values = { ranked: [4, 0, 2], casual: [2, 9, 1] };

describe("chart series toggles (#691)", () => {
  it("totals and the axis max follow only the series that are shown (#691)", () => {
    expect(visibleTotals(3, series, values, new Set())).toEqual([6, 9, 3]);
    expect(visibleMax(visibleTotals(3, series, values, new Set()))).toBe(9);
    // Hiding casual drops the 9-high day: the axis comes down to the ranked maximum.
    expect(visibleTotals(3, series, values, new Set(["casual"]))).toEqual([4, 0, 2]);
    expect(visibleMax(visibleTotals(3, series, values, new Set(["casual"])))).toBe(4);
    expect(visibleMax([0, 0])).toBe(1);
  });

  it("hides and re-shows a series but never the last visible one (#691)", () => {
    const keys = ["ranked", "casual"];
    const one = toggleSeries(new Set(), "casual", keys);
    expect([...one]).toEqual(["casual"]);
    expect([...toggleSeries(one, "ranked", keys)]).toEqual(["casual"]);
    expect([...toggleSeries(one, "casual", keys)]).toEqual([]);
  });

  it("writes a day's tooltip with its date, each shown series and their total (#691)", () => {
    const all = tooltipFor("2026-10-19", 0, series, values, new Set());
    expect(all).toEqual({
      title: "Mon, Oct 19",
      rows: [
        { key: "ranked", label: "Ranked", value: 4 },
        { key: "casual", label: "Casual", value: 2 },
      ],
      total: 6,
    });
    expect(tooltipText("2026-10-19", all)).toBe("2026-10-19: 4 ranked, 2 casual (6 total)");
    const some = tooltipFor("2026-10-20", 1, series, values, new Set(["ranked"]));
    expect(some.rows.map((r) => r.key)).toEqual(["casual"]);
    expect(some.total).toBe(9);
  });

  it("labels a day with its weekday, month and date (#691)", () => {
    expect(dayLabel("2026-10-19")).toBe("Mon, Oct 19");
    expect(dayLabel("2026-01-01")).toBe("Thu, Jan 1");
  });

  it("keeps a tooltip inside the chart by leaning it away from the near edge (#691)", () => {
    expect(tipPlacement(3).h).toBe("left");
    expect(tipPlacement(50).h).toBe("center");
    expect(tipPlacement(97).h).toBe("right");
    expect(tipPlacement(50, 90).v).toBe("below");
    expect(tipPlacement(50, 20).v).toBe("above");
  });
});

describe("top leaders sorting (#691)", () => {
  const rows: LeaderRow[] = [
    { leader_id: "A-1", name: "Alpha", games: 10, wins: 5 },
    { leader_id: "B-1", name: "Bravo", games: 2, wins: 2 },
    { leader_id: "C-1", name: "Charlie", games: 100, wins: 40 },
    { leader_id: "D-1", name: "Delta", games: 10, wins: 5 },
  ];
  const ids = (sort: Parameters<typeof sortLeaders>[1]) => sortLeaders(rows, sort).map((r) => r.leader_id);

  it("sorts by games, wins, win rate or name in either direction, with a stable tie-break (#691)", () => {
    expect(ids({ key: "games", dir: "desc" })).toEqual(["C-1", "A-1", "D-1", "B-1"]);
    expect(ids({ key: "games", dir: "asc" })).toEqual(["B-1", "A-1", "D-1", "C-1"]);
    expect(ids({ key: "wins", dir: "desc" })).toEqual(["C-1", "A-1", "D-1", "B-1"]);
    // Win rate is wins over games, not wins: Bravo is 100% with only 2 wins.
    expect(ids({ key: "rate", dir: "desc" })).toEqual(["B-1", "A-1", "D-1", "C-1"]);
    expect(ids({ key: "rate", dir: "asc" })).toEqual(["C-1", "A-1", "D-1", "B-1"]);
    expect(ids({ key: "name", dir: "asc" })).toEqual(["A-1", "B-1", "C-1", "D-1"]);
    expect(ids({ key: "name", dir: "desc" })).toEqual(["D-1", "C-1", "B-1", "A-1"]);
  });

  it("does not reorder the list it was given (#691)", () => {
    const before = rows.map((r) => r.leader_id);
    sortLeaders(rows, { key: "name", dir: "desc" });
    expect(rows.map((r) => r.leader_id)).toEqual(before);
  });

  it("flips direction on the same header and starts a new one in the direction asked (#691)", () => {
    expect(nextSort({ key: "games", dir: "desc" }, "games")).toEqual({ key: "games", dir: "asc" });
    expect(nextSort({ key: "games", dir: "asc" }, "games")).toEqual({ key: "games", dir: "desc" });
    expect(nextSort({ key: "games", dir: "desc" }, "name", "asc")).toEqual({ key: "name", dir: "asc" });
  });
});

describe("eval run table sorting (#691)", () => {
  const run = (run_at: string, correct: number, spend: number | null): EvalRun => ({
    suite: "main", run_at, label: run_at.slice(5, 10), model: "m", correct, total: 50, metric_name: null, metric_value: null, lower_is_better: false, groups: {}, spend_usd: spend, notes: "",
  });
  // Oldest first: 80% -> 90% -> 84%.
  const runs = [run("2026-10-01T00:00:00Z", 40, 1), run("2026-10-02T00:00:00Z", 45, null), run("2026-10-03T00:00:00Z", 42, 0.5)];
  const labels = (rows: { run: EvalRun }[]) => rows.map((r) => r.run.label);

  it("sorts by date, score or spend, and puts runs without the figure last in either direction (#691)", () => {
    const rows = runs;
    expect(labels(sortedRunRows(rows, { key: "date", dir: "asc" }))).toEqual(["10-01", "10-02", "10-03"]);
    expect(labels(sortedRunRows(rows, { key: "date", dir: "desc" }))).toEqual(["10-03", "10-02", "10-01"]);
    expect(labels(sortedRunRows(rows, { key: "score", dir: "desc" }))).toEqual(["10-02", "10-03", "10-01"]);
    expect(labels(sortedRunRows(rows, { key: "spend", dir: "asc" }))).toEqual(["10-03", "10-01", "10-02"]);
    expect(labels(sortedRunRows(rows, { key: "spend", dir: "desc" }))).toEqual(["10-01", "10-03", "10-02"]);
  });

  it("keeps each row's change from the run before it in time, not the one above it (#691)", () => {
    const sorted = sortedRunRows(runs, { key: "score", dir: "desc" });
    const byLabel = Object.fromEntries(sorted.map((r) => [r.run.label, r.change.text]));
    expect(byLabel).toEqual({ "10-01": "First run", "10-02": "Better +10.0 pts", "10-03": "Worse -6.0 pts" });
  });
});

describe("hosting links (#691)", () => {
  it("opens http and https links, adds https to a bare host and gives nothing for a missing or unsafe one (#691)", () => {
    expect(externalUrl("https://optcg-api.onrender.com")).toBe("https://optcg-api.onrender.com");
    expect(externalUrl("http://example.test/a")).toBe("http://example.test/a");
    expect(externalUrl("optcg-web-abc.vercel.app")).toBe("https://optcg-web-abc.vercel.app");
    expect(externalUrl(null)).toBeNull();
    expect(externalUrl("  ")).toBeNull();
    expect(externalUrl("javascript:alert(1)")).toBeNull();
  });
});
