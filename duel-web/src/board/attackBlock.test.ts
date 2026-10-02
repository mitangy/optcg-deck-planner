import { describe, expect, it } from "vitest";
import { cantAttackReason, type AttackBlockContext } from "./attackBlock";

const base: AttackBlockContext = { phase: "main", busy: false, turnsStarted: 3, intents: [] };

describe("cantAttackReason", () => {
  it("is silent when the server lists an attack for the card (#256)", () => {
    const intents = [{ type: "declare_attack", attackerId: "c1", target: { kind: "leader" } }];
    expect(cantAttackReason({ id: "c1", rested: true }, { ...base, intents })).toBeNull();
  });

  it("is silent outside the main phase or while a battle / prompt is open (#256)", () => {
    expect(cantAttackReason({ id: "c1", rested: true }, { ...base, phase: "counter" })).toBeNull();
    expect(cantAttackReason({ id: "c1", rested: true }, { ...base, busy: true })).toBeNull();
  });

  it("only another card's attack does not count for this one (#256)", () => {
    const intents = [{ type: "declare_attack", attackerId: "other", target: { kind: "leader" } }];
    expect(cantAttackReason({ id: "c1", rested: true }, { ...base, intents })).toMatch(/^Rested/);
  });

  it("names the reason: first turn, rested, summoning sick, effect (#256)", () => {
    expect(cantAttackReason({ id: "c" }, { ...base, turnsStarted: 1 })).toMatch(/first turn/);
    expect(cantAttackReason({ id: "c", rested: true }, base)).toMatch(/^Rested/);
    expect(cantAttackReason({ id: "c", summoningSick: true }, base)).toMatch(/^Summoning sick/);
    expect(cantAttackReason({ id: "c", statusLabels: ["Summoning sick"] }, base)).toMatch(/^Summoning sick/);
    expect(cantAttackReason({ id: "c", statusLabels: ["Cannot attack"] }, base)).toMatch(/effect/);
    expect(cantAttackReason({ id: "c" }, base)).toMatch(/right now/);
  });

  it("the first-turn rule beats a card-level reason (#256)", () => {
    expect(cantAttackReason({ id: "c", summoningSick: true }, { ...base, turnsStarted: 1 })).toMatch(/first turn/);
  });
});
