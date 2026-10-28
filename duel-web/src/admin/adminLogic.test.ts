import { describe, expect, it } from "vitest";
import type { EvalRun } from "./adminApi";
import { canBanUser, canCommitSeed, canDrawEvent, sortParticipants, canDeleteUser, changeFrom, chartScale, evalVerdict, feedbackMatchPath, groupBySuite, headlineOf, percent, suiteSummary, tabsForRole, withChanges } from "./adminLogic";

const run = (run_at: string, correct: number, groups: EvalRun["groups"] = {}): EvalRun => ({
  suite: "main", run_at, label: "r", model: "m", correct, total: 50, metric_name: null, metric_value: null, lower_is_better: false, groups, spend_usd: null, notes: "",
});
/** A review-facts run: wrong claims per review, lower is better. */
const facts = (run_at: string, wrongPerReview: number, over: Partial<EvalRun> = {}): EvalRun => ({
  ...run(run_at, 0), suite: "review_facts", correct: null, total: null, metric_name: "Wrong claims per review", metric_value: wrongPerReview, lower_is_better: true, ...over,
});

describe("admin tabs per role (#667)", () => {
  it("shows the admin all five tabs, a moderator only Users, and anyone else none (#667)", () => {
    expect(tabsForRole("admin").map((t) => t.id)).toEqual(["players", "bots", "hosting", "event", "users"]);
    expect(tabsForRole("moderator").map((t) => t.id)).toEqual(["users"]);
    expect(tabsForRole("user")).toEqual([]);
    expect(tabsForRole(undefined)).toEqual([]);
  });
});

describe("bot games eval verdict (#667)", () => {
  const baseline = run("2026-10-08T00:45:00Z", 43.5, { D: { correct: 4, total: 10 }, A: { correct: 15, total: 15 } });
  const improved = run("2026-10-08T01:30:00Z", 48.5, { D: { correct: 9, total: 10 }, A: { correct: 15, total: 15 } });

  it("asks for a new eval when none ran after the first bot game (#667)", () => {
    const v = evalVerdict([baseline, improved], "2026-10-19T02:00:00Z");
    expect(v.kind).toBe("no-eval-since");
    expect(v.text).toBe("No eval since bot games started on 2026-10-19; run one to compare.");
  });

  it("compares the latest eval before bot games with the latest after, overall and per group (#667)", () => {
    const after = run("2026-10-21T09:00:00Z", 50, { D: { correct: 10, total: 10 }, A: { correct: 15, total: 15 } });
    const v = evalVerdict([baseline, improved, after], "2026-10-19T02:00:00Z");
    if (v.kind !== "compared") throw new Error("expected a comparison");
    // Against the later pre-bot run (97.0%), not the baseline.
    expect(v.text).toBe("Log Pose accuracy improved: 97.0% before bot games, 100.0% after (+3.0 points).");
    expect(v.groups.map((g) => [g.group, g.before, g.after])).toEqual([
      ["A", "100.0%", "100.0%"],
      ["D", "90.0%", "100.0%"],
    ]);
    expect(v.groups.map((g) => Math.round(g.points))).toEqual([0, 10]);
  });

  it("reports a drop, and counts a run at the first game's own timestamp as after it (#667)", () => {
    const worse = run("2026-10-19T02:00:00Z", 40);
    const v = evalVerdict([improved, worse], "2026-10-19T02:00:00Z");
    expect(v.kind).toBe("compared");
    expect(v.text).toBe("Log Pose accuracy dropped: 97.0% before bot games, 80.0% after (-17.0 points).");
  });

  it("says so when there are no bot games, or no eval from before them (#667)", () => {
    expect(evalVerdict([baseline], null).kind).toBe("no-bot-games");
    expect(evalVerdict([run("2026-10-20T00:00:00Z", 45)], "2026-10-19T02:00:00Z").kind).toBe("no-baseline");
  });
});

describe("percent (#667)", () => {
  it("formats a score to one decimal and shows a dash when nothing was scored (#667)", () => {
    expect(percent(43.5, 50)).toBe("87.0%");
    expect(percent(1, 3)).toBe("33.3%");
    expect(percent(0, 0)).toBe("—");
  });
});

describe("ban and delete buttons follow the server's rules (#667)", () => {
  const admin = { id: 1, role: "admin" as const };
  const mod = { id: 2, role: "moderator" as const };

  it("lets a moderator ban plain users only, and nobody ban themselves or the admin (#667)", () => {
    expect(canBanUser(mod, { id: 9, role: "user" })).toBe(true);
    expect(canBanUser(mod, { id: 3, role: "moderator" })).toBe(false);
    expect(canBanUser(mod, { id: 1, role: "admin" })).toBe(false);
    expect(canBanUser(admin, { id: 3, role: "moderator" })).toBe(true);
    expect(canBanUser(admin, { id: 1, role: "admin" })).toBe(false);
    expect(canBanUser(mod, { id: 2, role: "user" })).toBe(false);
    expect(canBanUser(admin, { id: 1, role: "user" })).toBe(false);
    expect(canBanUser(admin, { id: 5, role: "admin" })).toBe(false);
  });

  it("lets only the admin delete, and not themselves (#667)", () => {
    expect(canDeleteUser(admin, { id: 9, role: "user" })).toBe(true);
    expect(canDeleteUser(mod, { id: 9, role: "user" })).toBe(false);
    expect(canDeleteUser(admin, { id: 1, role: "user" })).toBe(false);
    expect(canDeleteUser(admin, { id: 5, role: "admin" })).toBe(false);
  });
});

describe("eval history per suite (#679)", () => {
  it("groups runs by suite in a fixed order, oldest first, and treats a run with no suite as the main one (#679)", () => {
    const old = { ...run("2026-10-08T00:45:00Z", 40), suite: undefined } as unknown as EvalRun;
    const groups = groupBySuite([facts("2026-10-12T00:00:00Z", 1.2), run("2026-10-10T00:00:00Z", 45), facts("2026-10-11T00:00:00Z", 0.9), old]);
    expect(groups.map((g) => [g.suite.id, g.runs.map((r) => r.run_at.slice(5, 10))])).toEqual([
      ["main", ["10-08", "10-10"]],
      ["review_facts", ["10-11", "10-12"]],
    ]);
  });

  it("calls a lower metric better when the suite says lower is better, and a higher one better otherwise (#679)", () => {
    expect(changeFrom(facts("2026-10-11T00:00:00Z", 1.2), facts("2026-10-12T00:00:00Z", 0.9))).toEqual({ direction: "better", text: "Better -0.30" });
    expect(changeFrom(facts("2026-10-11T00:00:00Z", 0.9), facts("2026-10-12T00:00:00Z", 1.2))).toEqual({ direction: "worse", text: "Worse +0.30" });
    const up = (v: number, at: string) => facts(at, v, { lower_is_better: false });
    expect(changeFrom(up(0.5, "2026-10-11T00:00:00Z"), up(0.8, "2026-10-12T00:00:00Z")).direction).toBe("better");
    expect(changeFrom(up(0.8, "2026-10-11T00:00:00Z"), up(0.5, "2026-10-12T00:00:00Z")).direction).toBe("worse");
  });

  it("compares scores in points, calls a move under a tenth of a point the same, and the first run first (#679)", () => {
    const a = run("2026-10-08T00:00:00Z", 43.5);
    expect(changeFrom(a, run("2026-10-09T00:00:00Z", 48.5))).toEqual({ direction: "better", text: "Better +10.0 pts" });
    expect(changeFrom(run("2026-10-09T00:00:00Z", 48.5), a)).toEqual({ direction: "worse", text: "Worse -10.0 pts" });
    expect(changeFrom(a, run("2026-10-09T00:00:00Z", 43.52)).direction).toBe("same");
    expect(changeFrom(null, a).direction).toBe("first");
    expect(withChanges([a, run("2026-10-09T00:00:00Z", 48.5)]).map((r) => r.change.direction)).toEqual(["first", "better"]);
  });

  it("does not compare a score with a metric, whichever way the suite changed (#679)", () => {
    expect(changeFrom(run("2026-10-08T00:00:00Z", 40), facts("2026-10-09T00:00:00Z", 1)).direction).toBe("first");
  });

  it("headlines the metric when a run has one and the score otherwise, and nothing when it has neither (#679)", () => {
    expect(headlineOf(facts("2026-10-12T00:00:00Z", 0.854))).toMatchObject({ kind: "metric", text: "0.85", lowerIsBetter: true });
    expect(headlineOf(run("2026-10-12T00:00:00Z", 43.5))).toMatchObject({ kind: "pct", text: "87.0%" });
    expect(headlineOf({ ...run("2026-10-12T00:00:00Z", 0), correct: null, total: null })).toBeNull();
  });

  it("summarises the latest run against the one before, saying lower is better (#679)", () => {
    expect(suiteSummary([facts("2026-10-11T00:00:00Z", 1.2), facts("2026-10-12T00:00:00Z", 0.9)])).toBe(
      "Wrong claims per review: 0.9 (lower is better). Better -0.30 than the run before",
    );
    expect(suiteSummary([run("2026-10-11T00:00:00Z", 40)])).toBe("Score: 80.0%");
  });

  it("keeps the bot-games verdict to the main suite (#679)", () => {
    // A review-facts run after the first bot game, with a supported/checkable score, is not a main eval run.
    const v = evalVerdict([run("2026-10-08T00:00:00Z", 40), facts("2026-10-20T00:00:00Z", 0.5, { correct: 45, total: 50 })], "2026-10-19T02:00:00Z");
    expect(v.kind).toBe("no-eval-since");
  });

  it("scales a score to its data in 10-point steps and a metric from 0 to a round number above its top (#679)", () => {
    expect(chartScale([87, 97], "pct")).toEqual({ min: 80, max: 100 });
    expect(chartScale([0.85, 1.2, 0.4], "metric")).toEqual({ min: 0, max: 2 });
    expect(chartScale([0.04], "metric")).toEqual({ min: 0, max: 0.05 });
    expect(chartScale([0], "metric")).toEqual({ min: 0, max: 1 });
  });
});

describe("Log Pose feedback rows (#679)", () => {
  it("link a review rating to its game and a chat answer to nothing (#679)", () => {
    expect(feedbackMatchPath({ kind: "review", match_id: "m 1" })).toBe("/history/m%201");
    expect(feedbackMatchPath({ kind: "chat", match_id: null })).toBeNull();
    expect(feedbackMatchPath({ kind: "chat", match_id: "m1" })).toBeNull();
    expect(feedbackMatchPath({ kind: "review", match_id: null })).toBeNull();
  });
});

describe("giveaway event tab (#794)", () => {
  const p = (user_id: number, name: string, games: number, opponents: number, eligible: boolean) =>
    ({ user_id, name, email: `${name}@x.test`, games, opponents, eligible, excluded: null }) as const;
  const rows = [p(1, "Zed", 5, 3, true), p(2, "Amy", 2, 1, false), p(3, "Bo", 4, 2, true), p(4, "Cy", 9, 1, false)];

  it("lists eligible players first, then the most games (#794)", () => {
    expect(sortParticipants(rows, { key: "eligible", dir: "desc" }).map((r) => r.name)).toEqual(["Zed", "Bo", "Cy", "Amy"]);
  });

  it("sorts by a chosen column in either direction (#794)", () => {
    expect(sortParticipants(rows, { key: "games", dir: "desc" }).map((r) => r.name)).toEqual(["Cy", "Zed", "Bo", "Amy"]);
    expect(sortParticipants(rows, { key: "name", dir: "asc" }).map((r) => r.name)).toEqual(["Amy", "Bo", "Cy", "Zed"]);
  });

  it("offers the seed commit only before the start and the draw only after the end, once (#794)", () => {
    expect(canCommitSeed({ status: "upcoming", draw: null })).toBe(true);
    expect(canCommitSeed({ status: "upcoming", draw: {} })).toBe(false);
    expect(canCommitSeed({ status: "live", draw: null })).toBe(false);
    expect(canDrawEvent({ status: "ended", draw: { drawn_at: null } })).toBe(true);
    expect(canDrawEvent({ status: "ended", draw: null })).toBe(false);
    expect(canDrawEvent({ status: "live", draw: { drawn_at: null } })).toBe(false);
    expect(canDrawEvent({ status: "drawn", draw: { drawn_at: "2026-11-23T00:00:00Z" } })).toBe(false);
  });
});
