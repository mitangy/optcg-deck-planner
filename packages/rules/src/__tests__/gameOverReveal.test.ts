import { describe, expect, it } from "vitest";
import { getPlayerView, getSpectatorView } from "../engine.js";
import { Harness } from "../testing/harness.js";

// Hidden cards are only sent once the match is over (#482).

function table() {
  const h = new Harness();
  h.clearHands();
  // Seats differ in hand and life so a swapped seat index fails.
  h.hand(0, "ST01-003", "ST01-006");
  h.hand(1, "ST01-009");
  h.life(0, "ST01-014", "ST01-003", "ST01-006");
  h.life(1, "ST01-009", "ST01-008");
  return h;
}

describe("game over reveals hidden cards (#482)", () => {
  it("sends no revealed hands or life while the match is live (#482)", () => {
    const h = table();
    for (const seat of [0, 1] as const) {
      const view = getPlayerView(h.state, seat);
      expect("revealedHands" in view).toBe(false);
      expect("revealedLife" in view).toBe(false);
    }
    const spectator = getSpectatorView(h.state, 0);
    expect("revealedHands" in spectator).toBe(false);
    expect("revealedLife" in spectator).toBe(false);
  });

  it("sends both seats' hands and Life to each player once there is a winner (#482)", () => {
    const h = table();
    h.state.winner = 1;
    for (const seat of [0, 1] as const) {
      const view = getPlayerView(h.state, seat);
      expect(view.revealedHands!.map((hand) => hand.map((c) => c.defId))).toEqual([["ST01-003", "ST01-006"], ["ST01-009"]]);
      expect(view.revealedHands![0].map((c) => c.id)).toEqual(h.state.players[0].hand.map((c) => c.id));
      expect(view.revealedLife).toEqual([["ST01-014", "ST01-003", "ST01-006"], ["ST01-009", "ST01-008"]]);
    }
  });

  it("gives a spectator the hands after the game even when hands are not revealed live (#482)", () => {
    const h = table();
    h.state.winner = 0;
    const view = getSpectatorView(h.state, 0, { revealHands: false });
    expect(view.revealedHands![1].map((c) => c.defId)).toEqual(["ST01-009"]);
    expect(view.revealedLife![0]).toEqual(["ST01-014", "ST01-003", "ST01-006"]);
  });
});
