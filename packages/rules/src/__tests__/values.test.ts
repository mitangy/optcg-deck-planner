import { describe, expect, it } from "vitest";
import { ctxFor, evalCond, evalCount, evalValue } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Seat } from "../types.js";

// Effect value and condition evaluation: counts, sums and conditions over picked cards.

const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}

function ids(h: Harness, seat: Seat): string[] {
  return h.state.players[seat].characters.map((c) => c.defId);
}

describe("count values", () => {
  const LOKI = "OP17-119"; // This Character gains +12 cost; 6-cost 8000
  const SAI = "OP01-012"; // vanilla 2-cost 4000
  // KAROO: vanilla 1-cost 3000

  const count = (h: Harness, expr: Parameters<typeof evalCount>[2], vars: Record<string, string[]> = {}) => evalCount(h.state, ctxFor(0, h.state.players[0].leader, vars), expr);

  it("a total over the field uses current cost and power, over the hand the printed ones (#753)", () => {
    const h = new Harness();
    const [karoo] = h.field(0, KAROO);
    h.field(0, LOKI, SAI);
    h.attach(0, karoo!, 2);
    h.hand(0, LOKI, KAROO, SAI);
    const field = { player: "you", zone: "character" } as const;
    const hand = { player: "you", zone: "hand" } as const;
    // Loki is 18 on the field; each DON!! on your own turn is +1000 power.
    expect(count(h, { of: "total", selector: field, field: "cost" })).toBe(1 + 18 + 2);
    expect(count(h, { of: "total", selector: hand, field: "cost" })).toBe(6 + 1 + 2);
    expect(count(h, { of: "total", selector: field, field: "power" })).toBe(3000 + 2000 + 8000 + 4000);
    expect(count(h, { of: "total", selector: hand, field: "power" })).toBe(8000 + 3000 + 4000);
  });

  it("a sum over listed ids uses current values on the field and printed values elsewhere, and skips ids that are gone (#753)", () => {
    const h = new Harness();
    const [karoo, loki] = h.field(0, KAROO, LOKI);
    h.attach(0, karoo!, 1);
    const [handSai] = h.hand(0, SAI);
    const vars = { _r: [loki!.id, karoo!.id, handSai!.id, "no_such_card"] };
    expect(count(h, { of: "var_sum", name: "_r", field: "cost" }, vars)).toBe(18 + 1 + 2);
    expect(count(h, { of: "var_sum", name: "_r", field: "power" }, vars)).toBe(8000 + 4000 + 4000);
  });

  it("a difference never goes below 0 (#753)", () => {
    const h = new Harness();
    h.don(0, 2);
    h.don(1, 5);
    const you = { of: "don_field", player: "you" } as const;
    const opponent = { of: "don_field", player: "opponent" } as const;
    expect(count(h, { of: "diff", left: you, right: opponent })).toBe(0);
    expect(count(h, { of: "diff", left: opponent, right: you })).toBe(3);
  });

  it("a sum adds its parts (#753)", () => {
    const h = new Harness();
    h.life(0, KAROO, KAROO, KAROO);
    h.hand(0, KAROO, KAROO);
    expect(count(h, { of: "sum", exprs: [{ of: "life", player: "you" }, { of: "hand", player: "you" }] })).toBe(5);
  });

  it("a value is count / per, times times, plus plus (#753)", () => {
    const h = new Harness();
    h.hand(0, KAROO, KAROO, KAROO, KAROO, KAROO);
    const ctx = ctxFor(0, h.state.players[0].leader);
    const hand = { of: "hand", player: "you" } as const;
    expect(evalValue(h.state, ctx, { count: hand, per: 2, times: 1000, plus: 500 })).toBe(2500);
    expect(evalValue(h.state, ctx, { count: hand, times: 3, plus: 1 })).toBe(16);
  });

  it("battle power reads the attacker or the defender, whether it is a Leader or a Character (#753)", () => {
    const h = new Harness();
    const [attacker] = h.field(0, KAROO);
    const [defender] = h.field(1, SAI);
    h.attach(0, attacker!, 2);
    defender!.rested = true;
    h.attack(attacker!, defender!);
    expect(count(h, { of: "battle_power", role: "attacker" })).toBe(5000);
    expect(count(h, { of: "battle_power", role: "defender" })).toBe(4000);
    const g = new Harness();
    const [attacker2] = g.field(0, KAROO);
    g.attack(attacker2!, "leader");
    expect(count(g, { of: "battle_power", role: "defender" })).toBe(5000);
    expect(count(g, { of: "battle_power", role: "attacker" })).toBe(3000);
  });

  it("DON!! attached, the source's power and its base power are read from the source card (#753)", () => {
    const h = new Harness();
    const [karoo, sai] = h.field(0, KAROO, SAI);
    h.attach(0, karoo!, 2);
    h.attach(0, sai!, 1);
    const at = (src: typeof karoo, expr: Parameters<typeof evalCount>[2]) => evalCount(h.state, ctxFor(0, src!), expr);
    expect(at(karoo, { of: "don_attached_self" })).toBe(2);
    expect(at(sai, { of: "don_attached_self" })).toBe(1);
    expect(at(karoo, { of: "don_attached_total", player: "you" })).toBe(3);
    expect(at(karoo, { of: "don_attached_total", player: "opponent" })).toBe(0);
    expect(at(karoo, { of: "self_power" })).toBe(5000);
    expect(at(karoo, { of: "self_base_power" })).toBe(3000);
    expect(at(sai, { of: "self_power" })).toBe(5000);
  });

  it("distinct names counts each name once (#753)", () => {
    const h = new Harness();
    h.field(0, KAROO, KAROO, SAI);
    expect(count(h, { of: "distinct_names", selector: { player: "you", zone: "character" } })).toBe(2);
  });
});

describe("conditions on a list of picked cards", () => {
  it("all-match needs at least one card and every card to match; any-match needs one match (#753)", () => {
    const h = new Harness();
    const [karoo, sai] = h.field(0, KAROO, "OP01-012"); // 1-cost and 2-cost vanilla
    const cond = (c: "var_all_match" | "var_any_match", ids: string[]) => evalCond(h.state, ctxFor(0, h.state.players[0].leader, { _p: ids }), { c, name: "_p", filter: { cost: { op: "<=", value: 1 } } });
    expect(cond("var_all_match", [karoo!.id])).toBe(true);
    expect(cond("var_all_match", [karoo!.id, sai!.id])).toBe(false);
    expect(cond("var_all_match", [])).toBe(false);
    expect(cond("var_any_match", [sai!.id, karoo!.id])).toBe(true);
    expect(cond("var_any_match", [sai!.id])).toBe(false);
    expect(cond("var_any_match", [])).toBe(false);
  });
});
