import { describe, expect, it } from "vitest";
import type { EvalRun } from "./adminApi";
import { canBanUser, canDeleteUser, evalVerdict, percent, tabsForRole } from "./adminLogic";

const run = (run_at: string, correct: number, groups: EvalRun["groups"] = {}): EvalRun => ({ run_at, label: "r", model: "m", correct, total: 50, groups, spend_usd: null, notes: "" });

describe("admin tabs per role (#667)", () => {
  it("shows the admin all four tabs, a moderator only Users, and anyone else none (#667)", () => {
    expect(tabsForRole("admin").map((t) => t.id)).toEqual(["players", "bots", "hosting", "users"]);
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
