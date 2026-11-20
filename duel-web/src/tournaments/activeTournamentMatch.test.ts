// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearActiveTournamentMatch,
  getActiveTournamentMatch,
  setActiveTournamentMatch,
  tournamentReturnFor,
} from "./activeTournamentMatch";

afterEach(() => clearActiveTournamentMatch());

const game = { spectating: false, isReplay: false };

describe("active tournament match (#1385)", () => {
  it("remembers the match until a non-tournament launch clears it (#1385)", () => {
    setActiveTournamentMatch({ code: "ab12", matchId: 7 });
    expect(getActiveTournamentMatch()).toEqual({ code: "ab12", matchId: 7 });
    clearActiveTournamentMatch();
    expect(getActiveTournamentMatch()).toBeNull();
  });

  it("Match over offers the way back only to a player of that tournament game (#1385)", () => {
    const active = { code: "ab12", matchId: 7 };
    expect(tournamentReturnFor(active, game)).toBe("ab12");
    expect(tournamentReturnFor(null, game)).toBeNull();
    expect(tournamentReturnFor(active, { ...game, spectating: true })).toBeNull();
    expect(tournamentReturnFor(active, { ...game, isReplay: true })).toBeNull();
  });
});
