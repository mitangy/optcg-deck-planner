import { describe, expect, it } from "vitest";
import type { PlayerView } from "../net/protocol";
import { waitingOnOpponent } from "./waitingOnOpponent";

function view(over: Record<string, unknown> = {}): PlayerView {
  return {
    spectator: false,
    winner: null,
    phase: "main",
    activeSeat: 0,
    battle: null,
    legalIntents: [],
    pendingChoices: [],
    you: { mulliganDone: true },
    opponent: { mulliganDone: true },
    ...over,
  } as unknown as PlayerView;
}

const myAttack = { attackerSeat: 0, attackerId: "y-leader", target: { kind: "leader" } };
const choice = (seat: number, kind: string) => ({ id: "c", seat, kind, prompt: "p" });

describe("waitingOnOpponent", () => {
  it("says they are choosing a blocker or a counter during your attack (#PR_G)", () => {
    const block = waitingOnOpponent(view({ phase: "block", battle: myAttack }), 0);
    expect(block?.kind).toBe("block");
    expect(block?.detail).toMatch(/blocker/i);
    const counter = waitingOnOpponent(view({ phase: "counter", battle: myAttack }), 0);
    expect(counter?.kind).toBe("counter");
    expect(counter?.detail).toMatch(/counter/i);
  });

  it("separates an opponent Life trigger from another effect choice (#PR_G)", () => {
    expect(waitingOnOpponent(view({ pendingChoices: [choice(1, "life_trigger")] }), 0)?.kind).toBe("trigger");
    expect(waitingOnOpponent(view({ pendingChoices: [choice(1, "effect")] }), 0)?.kind).toBe("effect");
  });

  it("does not wait when the front choice is yours (#PR_G)", () => {
    expect(waitingOnOpponent(view({ pendingChoices: [choice(0, "effect")] }), 0)).toBeNull();
  });

  it("does not wait while you have something to do (#PR_G)", () => {
    const legalIntents = [{ type: "pass_counter" }];
    expect(
      waitingOnOpponent(view({ phase: "counter", battle: { ...myAttack, attackerSeat: 1 }, legalIntents }), 0),
    ).toBeNull();
    expect(waitingOnOpponent(view({ activeSeat: 1, legalIntents }), 0)).toBeNull();
  });

  it("waits through a mulligan only once you have decided and they have not (#PR_G)", () => {
    const you = (mulliganDone: boolean) => ({ mulliganDone });
    expect(
      waitingOnOpponent(view({ phase: "mulligan", you: you(true), opponent: you(false) }), 0)?.kind,
    ).toBe("mulligan");
    expect(
      waitingOnOpponent(view({ phase: "mulligan", you: you(false), opponent: you(false) }), 0),
    ).toBeNull();
  });

  it("shows their turn calmly: not urgent, unlike a pending answer (#PR_G)", () => {
    const turn = waitingOnOpponent(view({ activeSeat: 1 }), 0);
    expect(turn?.kind).toBe("turn");
    expect(turn?.urgent).toBe(false);
    expect(waitingOnOpponent(view({ phase: "block", battle: myAttack }), 0)?.urgent).toBe(true);
  });

  it("is null for spectators and finished matches (#PR_G)", () => {
    expect(waitingOnOpponent(view({ activeSeat: 1, spectator: true }), 0)).toBeNull();
    expect(waitingOnOpponent(view({ activeSeat: 1, winner: 1 }), 0)).toBeNull();
    expect(waitingOnOpponent(view({ activeSeat: 1 }), null)).toBeNull();
  });
});
