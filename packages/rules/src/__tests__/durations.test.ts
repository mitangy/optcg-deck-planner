import { describe, expect, it } from "vitest";
import { powerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Effect durations: when "until ..." modifiers expire.

const RAYLEIGH = "OP08-118"; // 8-cost, [On Play] gives 1 of your opponent's Characters -3000 power until the end of your opponent's next turn.
const KEEP_OUT = "OP07-018"; // 1-cost Event, [Counter] +2000 power to a {Revolutionary Army} Character until the end of your next turn.
const REVOLUTIONARY = "OP05-012"; // {Revolutionary Army} Character, no [Trigger]
const UTA = "OP02-120"; // 8-cost, [On Play] DON!! -2: Your Leader and all of your Characters gain +1000 power until the start of your next turn.

function leaderPower(h: Harness, seat: Seat): number {
  return powerOf(h.state, seat, h.state.players[seat].leader);
}

/** End the active seat's turn; the other seat's turn begins. */
function endTurn(h: Harness): void {
  h.act(h.state.activeSeat, { type: "end_turn" });
}

/** Advance to the start of `seat`'s next turn. */
function toTurnOf(h: Harness, seat: Seat): void {
  while (h.state.activeSeat !== seat) endTurn(h);
}

describe("duration expiry", () => {
  for (const seat of [0, 1] as const) {
    it(`"until the start of your next turn" lasts through the opponent's turn and ends at the start of seat ${seat}'s next turn (#561)`, () => {
      const h = new Harness();
      toTurnOf(h, seat);
      const base = leaderPower(h, seat);
      h.hand(seat, UTA);
      h.don(seat, 10);
      h.play(seat, UTA).accept().pick("o0", "o1");
      expect(leaderPower(h, seat)).toBe(base + 1000);
      endTurn(h);
      // The opponent's whole turn: still buffed.
      expect(h.state.activeSeat).toBe(seat === 0 ? 1 : 0);
      expect(leaderPower(h, seat)).toBe(base + 1000);
      endTurn(h);
      // The seat's own next turn has begun: the buff is gone already, not at its end.
      expect(h.state.activeSeat).toBe(seat);
      expect(leaderPower(h, seat)).toBe(base);
    });
  }

  for (const seat of [0, 1] as const) {
    it(`"until the end of your opponent's next turn" applied by seat ${seat} ends after the other seat's turn (#561)`, () => {
      const h = new Harness();
      toTurnOf(h, seat);
      const opp: Seat = seat === 0 ? 1 : 0;
      const [target] = h.field(opp, UTA);
      const base = powerOf(h.state, opp, target!);
      h.hand(seat, RAYLEIGH);
      h.don(seat, 10);
      h.play(seat, RAYLEIGH).pick(UTA);
      expect(powerOf(h.state, opp, target!)).toBe(base - 3000);
      endTurn(h);
      // The opponent's turn is the one that ends it: still reduced during it.
      expect(powerOf(h.state, opp, target!)).toBe(base - 3000);
      endTurn(h);
      // Back on the applying seat's turn the reduction is gone; it must not last through that turn too.
      expect(h.state.activeSeat).toBe(seat);
      expect(powerOf(h.state, opp, target!)).toBe(base);
    });

    it(`"until the end of your next turn" lasts through seat ${seat}'s next turn and ends with it (#561)`, () => {
      const h = new Harness();
      const opp: Seat = seat === 0 ? 1 : 0;
      toTurnOf(h, opp);
      const [ally] = h.field(seat, REVOLUTIONARY);
      const [attacker] = h.field(opp, REVOLUTIONARY);
      const base = powerOf(h.state, seat, ally!);
      h.hand(seat, KEEP_OUT);
      h.don(seat, 2);
      h.attack(attacker!, "leader");
      h.act(seat, { type: "pass_block" });
      h.act(seat, { type: "counter_event", handIndex: 0 }).pick(REVOLUTIONARY);
      h.act(seat, { type: "pass_counter" });
      h.resolveLifeChecks();
      endTurn(h);
      expect(h.state.activeSeat).toBe(seat);
      // The seat's own next turn has begun: the buff still applies until that turn ends.
      expect(powerOf(h.state, seat, ally!)).toBe(base + 2000);
      endTurn(h);
      expect(powerOf(h.state, seat, ally!)).toBe(base);
    });
  }
});
