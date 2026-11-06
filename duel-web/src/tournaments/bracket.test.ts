import { describe, expect, it } from "vitest";
import type { Friend } from "../friends/friendsApi";
import {
  formatLabel,
  groupByRound,
  invitableFriends,
  matchStatusLabel,
  myNextMatch,
  opponentOf,
  roundLabel,
  startBlocker,
} from "./bracket";
import type { TournamentMatch, TournamentPlayer } from "./tournamentApi";

const P = (id: number) => ({ user_id: id, username: `p${id}` });
function match(over: Partial<TournamentMatch> & { id: number; round: number; slot: number }): TournamentMatch {
  return { a: null, b: null, winner_id: null, status: "waiting", decided_by: null, room_open: false, host_id: null, result_match_id: null, ...over };
}
const player = (id: number, status: "joined" | "invited" = "joined"): TournamentPlayer => ({ ...P(id), status, seed: null });

describe("tournament bracket helpers (#997)", () => {
  it("names rounds counting back from the final (#997)", () => {
    expect(roundLabel(3, 3)).toBe("Final");
    expect(roundLabel(2, 3)).toBe("Semifinals");
    expect(roundLabel(1, 3)).toBe("Quarterfinals");
    expect(roundLabel(1, 4)).toBe("Round of 16");
    expect(roundLabel(1, 5)).toBe("Round 1");
  });

  it("labels each format with its size only for a bracket (#997)", () => {
    expect(formatLabel({ format: "single_elim", size: 8 })).toBe("Single elimination · 8 players · Bo1");
    expect(formatLabel({ format: "round_robin", size: 6 })).toBe("Round robin · Bo1");
  });

  it("blocks Start until a bracket has more than half its seats filled, counting only joined players (#997)", () => {
    const t = (n: number, invited = 0) => ({
      format: "single_elim" as const,
      size: 8,
      players: [...Array.from({ length: n }, (_, i) => player(i + 1)), ...Array.from({ length: invited }, (_, i) => player(100 + i, "invited"))],
    });
    expect(startBlocker(t(4, 3))).toBe("Need at least 5 players.");
    expect(startBlocker(t(5))).toBeNull();
    expect(startBlocker({ format: "round_robin", size: 8, players: [player(1), player(2)] })).toBe("Need at least 3 players.");
    expect(startBlocker({ format: "round_robin", size: 8, players: [player(1), player(2), player(3)] })).toBeNull();
  });

  it("groups matches by round, rounds and slots in order (#997)", () => {
    const g = groupByRound([
      match({ id: 3, round: 2, slot: 0 }),
      match({ id: 2, round: 1, slot: 1 }),
      match({ id: 1, round: 1, slot: 0 }),
    ]);
    expect(g.map((r) => [r.round, r.matches.map((m) => m.id)])).toEqual([
      [1, [1, 2]],
      [2, [3]],
    ]);
  });

  it("shows your ready match before one you are only waiting on, and nothing once it is over (#997)", () => {
    const waiting = match({ id: 5, round: 2, slot: 0, a: P(1), status: "waiting" });
    const ready = match({ id: 6, round: 3, slot: 0, a: P(1), b: P(2), status: "ready" });
    const others = match({ id: 7, round: 1, slot: 0, a: P(8), b: P(9), status: "ready" });
    expect(myNextMatch({ status: "running", matches: [waiting, ready, others] }, 1)?.id).toBe(6);
    expect(myNextMatch({ status: "running", matches: [waiting, others] }, 1)?.id).toBe(5);
    expect(myNextMatch({ status: "running", matches: [others] }, 1)).toBeNull();
    expect(myNextMatch({ status: "running", matches: [{ ...ready, status: "done" }] }, 1)).toBeNull();
    expect(myNextMatch({ status: "finished", matches: [ready] }, 1)).toBeNull();
  });

  it("finds the other player of a match from either seat (#997)", () => {
    const m = match({ id: 1, round: 1, slot: 0, a: P(1), b: P(2) });
    expect(opponentOf(m, 1)?.user_id).toBe(2);
    expect(opponentOf(m, 2)?.user_id).toBe(1);
    expect(opponentOf(m, 3)).toBeNull();
  });

  it("offers only friends who are not already invited or joined (#997)", () => {
    const f = (id: number) => ({ user_id: id, username: `p${id}`, status: "online", room_id: null, ranked: false }) as Friend;
    expect(invitableFriends([f(1), f(2), f(3)], [player(1), player(2, "invited")]).map((x) => x.user_id)).toEqual([3]);
  });

  it("says a bye is a bye and a walkover is an awarded win (#997)", () => {
    expect(matchStatusLabel(match({ id: 1, round: 1, slot: 0, status: "done", decided_by: "bye" }))).toBe("Bye");
    expect(matchStatusLabel(match({ id: 1, round: 1, slot: 0, status: "done", decided_by: "walkover" }))).toBe("Win awarded");
    expect(matchStatusLabel(match({ id: 1, round: 1, slot: 0, status: "ready", room_open: true }))).toBe("Room open");
  });
});
