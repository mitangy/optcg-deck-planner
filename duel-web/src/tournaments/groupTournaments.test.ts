import { describe, expect, it } from "vitest";
import { groupTournaments } from "./groupTournaments";
import type { TournamentSummary } from "./tournamentApi";

const t = (id: number, status: TournamentSummary["status"]): TournamentSummary =>
  ({
    id,
    code: `c${id}`,
    name: `T${id}`,
    format: "single_elim",
    size: 8,
    status,
    players_joined: 2,
    my_role: "joined",
    my_match_ready: false,
  });

describe("Your tournaments groups by status (#1385)", () => {
  it("running goes to Now, open to Signing up, finished to Finished, in list order (#1385)", () => {
    const g = groupTournaments([t(1, "finished"), t(2, "open"), t(3, "running"), t(4, "open"), t(5, "running")]);
    expect(g.now.map((x) => x.id)).toEqual([3, 5]);
    expect(g.signingUp.map((x) => x.id)).toEqual([2, 4]);
    expect(g.finished.map((x) => x.id)).toEqual([1]);
  });

  it("cancelled tournaments are not listed (#1385)", () => {
    const g = groupTournaments([t(1, "cancelled")]);
    expect(g.now.length + g.signingUp.length + g.finished.length).toBe(0);
  });
});
