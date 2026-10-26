import { describe, expect, it } from "vitest";
import { evalCond, evalCount, evalValue, ctxFor, isNegated } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { GameEvent, Seat } from "../types.js";

// Behavior pinned from the 2026-10-26 weekly Stryker run (#PRNUM).

const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}
const ALVIDA = "OP03-023"; // vanilla 1-cost {East Blue}

function ids(h: Harness, seat: Seat): string[] {
  return h.state.players[seat].characters.map((c) => c.defId);
}

/** Answer the front prompt like `Harness.pick`, but keep the events the answer produced. */
function resolveWithEvents(h: Harness, ...keys: string[]): GameEvent[] {
  const choice = h.choice!;
  const r = choice.request as { options: { id: string; defId?: string; label?: string }[] };
  const used = new Set<string>();
  const selectedOptionIds = keys.map((k) => {
    const o = r.options.find((x) => !used.has(x.id) && (x.defId === k || x.label === k));
    if (!o) throw new Error(`No option ${k}`);
    used.add(o.id);
    return o.id;
  });
  const res = h.try(choice.seat, { type: "resolve_pending_choice", accept: true, selectedOptionIds });
  if (!res.ok) throw new Error(res.error?.message);
  h.state = res.state;
  return res.events;
}

describe("a Stage played over another Stage", () => {
  const MINI_MERRY = "EB01-011"; // Stage, 1 cost
  const LAND_OF_WANO = "OP02-048"; // Stage, 1 cost

  it("trashes the Stage already on the field (#PRNUM)", () => {
    const h = new Harness();
    h.stage(0, LAND_OF_WANO);
    h.hand(0, MINI_MERRY);
    h.don(0, 2);
    h.play(0, MINI_MERRY);
    expect(h.state.players[0].stage?.defId).toBe(MINI_MERRY);
    expect(h.state.players[0].trash).toEqual([LAND_OF_WANO]);
  });
});

describe("a delayed effect that does not name the source card", () => {
  const BONNEY = "EB02-015"; // 7-cost. [On Play] ... set up to 1 of your DON!! cards as active at the end of this turn.

  it("still fires at the end of the turn after its source left the field (#PRNUM)", () => {
    const h = new Harness();
    h.field(0, KAROO, KAROO, KAROO, KAROO);
    h.hand(0, BONNEY, ALVIDA);
    h.don(0, 10);
    h.play(0, BONNEY);
    h.forced();
    // A 6th Character: Bonney is the one trashed to make room.
    h.play(0, ALVIDA, { trashCharacterId: h.find(0, BONNEY)!.id });
    expect(ids(h, 0)).not.toContain(BONNEY);
    const rested = () => h.state.players[0].costArea.filter((d) => d.rested).length;
    const before = rested();
    expect(before).toBe(8);
    h.act(0, { type: "end_turn" });
    expect(rested()).toBe(before - 1);
  });
});

describe("picking a Character to play by an effect", () => {
  const LUFFY = "OP02-041"; // [On Play] Play up to 1 {FILM} or {Straw Hat Crew} type Character card with a cost of 4 or less from your hand.
  const ZORO = "OP12-036"; // 4-cost {Straw Hat Crew}. This card in your hand cannot be played by effects.
  const ROBIN = "ST01-008"; // vanilla 3-cost {Straw Hat Crew}
  const GERD = "OP17-081"; // [On Play] You may trash 1 card from your hand: Add up to 1 Character card with a cost of 8 or less other than [Gerd] from your trash to your hand.

  const optionDefs = (h: Harness) => (h.choice!.request as { options: { defId?: string }[] }).options.map((o) => o.defId);

  it("does not offer a card that cannot be played by effects (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, LUFFY, ZORO, ROBIN);
    h.don(0, 7);
    h.play(0, LUFFY);
    expect(optionDefs(h)).toEqual([ROBIN]);
  });

  it("offers that same card when the effect only adds it to the hand (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, GERD, KAROO);
    h.trash(0, ZORO);
    h.don(0, 2);
    h.play(0, GERD).accept().pick(KAROO);
    expect(optionDefs(h)).toContain(ZORO);
  });
});

describe("a selection with a total limit or distinct names", () => {
  const LOKI = "OP17-119"; // [On Play] K.O. your opponent's Characters with a total cost of 4 or less.
  const SABO = "OP05-007"; // [On Play] K.O. up to 2 of your opponent's Characters with a total power of 4000 or less.
  const XEBEC = "OP17-118"; // [On Play] Draw 1 card and play up to 2 {Rocks Pirates} type cards with different card names and a total cost of 9 or less from your hand.
  const STUSSY = "EB05-006"; // 2-cost {Rocks Pirates}
  const GLORIOSA = "EB05-052"; // 4-cost {Rocks Pirates}
  const KYO = "OP17-045"; // 2-cost {Rocks Pirates}
  const SAI = "OP01-012"; // vanilla 2-cost 4000
  const WIRE = "OP01-053"; // vanilla 2-cost

  const request = (h: Harness) => h.choice!.request as unknown as Record<string, unknown>;

  it("tells the chooser the total cost limit (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, LOKI);
    h.don(0, 10);
    h.field(1, SAI, WIRE, ALVIDA);
    h.play(0, LOKI);
    expect(request(h).totalCostAtMost).toBe(4);
    expect(request(h).totalPowerAtMost).toBeUndefined();
  });

  it("tells the chooser the total power limit (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, SABO);
    h.don(0, 10);
    h.field(1, SAI, WIRE);
    h.play(0, SABO);
    expect(request(h).totalPowerAtMost).toBe(4000);
    expect(request(h).totalCostAtMost).toBeUndefined();
  });

  it("tells the chooser the cards must have different names, and the total cost limit (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, XEBEC, STUSSY, GLORIOSA, KYO);
    h.don(0, 10);
    h.play(0, XEBEC);
    expect(request(h).distinctNames).toBe(true);
    expect(request(h).totalCostAtMost).toBe(9);
  });

  it("does not claim distinct names for a selection that has no such rule (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, LOKI);
    h.don(0, 10);
    h.field(1, SAI, WIRE, ALVIDA);
    h.play(0, LOKI);
    expect(request(h).distinctNames).toBeUndefined();
  });
});

describe("putting a Character into Life by an effect", () => {
  const GASTINO = "EB01-053"; // [On Play] Place up to 1 of your opponent's Characters with a cost of 3 or less at the top or bottom of your opponent's Life cards face-up.
  const SHIRYU = "OP16-108"; // [On Play] You may trash 1 card from your hand: Add up to 1 {Blackbeard Pirates} type card with a cost of 6 or less from your trash to the top of your Life cards face-up.
  const PIZARRO = "OP09-082"; // vanilla 4-cost {Blackbeard Pirates}
  const LUFFY_LEADER = "ST13-003"; // [DON!! x2] [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: If you have 0 Life cards, add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up.
  const MOUNTAIN_GOD = "EB01-018"; // vanilla 5-cost
  const BUGGY = "OP16-041"; // Leader. [DON!! x1] [Once Per Turn] This effect can be activated when your {Impel Down} type Character card is removed from the field. Play up to 1 [Prisoner of Impel Down] card from your hand.
  const PRISONER = "OP16-042"; // 6-cost
  const BLUGORI = "OP02-084"; // vanilla 1-cost {Impel Down}

  function gastinoOn(target: string, end: "Top" | "Bottom") {
    const h = new Harness();
    h.field(1, target);
    h.life(1, KAROO, KAROO, KAROO);
    h.hand(0, GASTINO);
    h.don(0, 3);
    h.play(0, GASTINO).pick(target);
    return { h, events: resolveWithEvents(h, end) };
  }

  it("Top puts the Character on top of the owner's Life, face-up, and says it came from the field (#PRNUM)", () => {
    const { h, events } = gastinoOn(ALVIDA, "Top");
    expect(ids(h, 1)).toEqual([]);
    expect(h.state.players[1].life).toEqual([ALVIDA, KAROO, KAROO, KAROO]);
    expect(h.state.players[1].faceUpLife).toEqual([true, false, false, false]);
    expect(events).toContainEqual({ type: "life_added", seat: 1, defId: ALVIDA, source: "field", faceUp: true });
  });

  it("Bottom puts the Character under the owner's Life (#PRNUM)", () => {
    const { h } = gastinoOn(ALVIDA, "Bottom");
    expect(h.state.players[1].life).toEqual([KAROO, KAROO, KAROO, ALVIDA]);
    expect(h.state.players[1].faceUpLife).toEqual([false, false, false, true]);
  });

  it("a Character leaving the field this way triggers the owner's \"removed from the field\" ability (#PRNUM)", () => {
    const h = new Harness({ leaders: ["ST01-001", BUGGY] });
    h.field(1, BLUGORI);
    h.hand(1, PRISONER);
    h.attach(1, h.state.players[1].leader, 1);
    h.hand(0, GASTINO);
    h.don(0, 3);
    h.play(0, GASTINO).pick(BLUGORI);
    h.pick("Top");
    expect(h.choice?.seat).toBe(1);
    h.accept().pick(PRISONER);
    expect(h.state.players[1].life[0]).toBe(BLUGORI);
    expect(ids(h, 1)).toEqual([PRISONER]);
  });

  it("a card added from the trash says it came from the trash (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, SHIRYU, KAROO);
    h.trash(0, PIZARRO);
    h.don(0, 6);
    h.play(0, SHIRYU).accept().pick(KAROO);
    const events = resolveWithEvents(h, PIZARRO);
    expect(h.state.players[0].life[0]).toBe(PIZARRO);
    expect(h.state.players[0].trash).toEqual([KAROO]);
    expect(events).toContainEqual({ type: "life_added", seat: 0, defId: PIZARRO, source: "trash", faceUp: true });
  });

  it("a card added from the hand says it came from the hand (#PRNUM)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, "ST01-001"] });
    h.life(0);
    h.attach(0, h.state.players[0].leader, 2);
    h.hand(0, KAROO, MOUNTAIN_GOD);
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "st13-003#0" });
    h.pick(KAROO);
    const events = resolveWithEvents(h, MOUNTAIN_GOD);
    expect(h.state.players[0].life).toEqual([MOUNTAIN_GOD]);
    expect(h.state.players[0].hand).toEqual([]);
    expect(events).toContainEqual({ type: "life_added", seat: 0, defId: MOUNTAIN_GOD, source: "hand", faceUp: true });
  });
});

describe("a static \"have their effects negated\" on a selector", () => {
  const ROGER = "OP13-064"; // Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated.

  it("negates your Leader and your other Characters, but not a Roger Pirates Character or the opponent's cards (#PRNUM)", () => {
    const h = new Harness();
    const [mine, roger] = h.field(0, KAROO, ROGER);
    const [theirs] = h.field(1, KAROO);
    expect(isNegated(h.state, mine!)).toBe(true);
    expect(isNegated(h.state, h.state.players[0].leader)).toBe(true);
    expect(isNegated(h.state, roger!)).toBe(false);
    expect(isNegated(h.state, theirs!)).toBe(false);
    expect(isNegated(h.state, h.state.players[1].leader)).toBe(false);
  });
});

describe("count values", () => {
  const LOKI = "OP17-119"; // This Character gains +12 cost; 6-cost 8000
  const SAI = "OP01-012"; // vanilla 2-cost 4000
  // KAROO: vanilla 1-cost 3000

  const count = (h: Harness, expr: Parameters<typeof evalCount>[2], vars: Record<string, string[]> = {}) => evalCount(h.state, ctxFor(0, h.state.players[0].leader, vars), expr);

  it("a total over the field uses current cost and power, over the hand the printed ones (#PRNUM)", () => {
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

  it("a sum over listed ids uses current values on the field and printed values elsewhere, and skips ids that are gone (#PRNUM)", () => {
    const h = new Harness();
    const [karoo, loki] = h.field(0, KAROO, LOKI);
    h.attach(0, karoo!, 1);
    const [handSai] = h.hand(0, SAI);
    const vars = { _r: [loki!.id, karoo!.id, handSai!.id, "no_such_card"] };
    expect(count(h, { of: "var_sum", name: "_r", field: "cost" }, vars)).toBe(18 + 1 + 2);
    expect(count(h, { of: "var_sum", name: "_r", field: "power" }, vars)).toBe(8000 + 4000 + 4000);
  });

  it("a difference never goes below 0 (#PRNUM)", () => {
    const h = new Harness();
    h.don(0, 2);
    h.don(1, 5);
    const you = { of: "don_field", player: "you" } as const;
    const opponent = { of: "don_field", player: "opponent" } as const;
    expect(count(h, { of: "diff", left: you, right: opponent })).toBe(0);
    expect(count(h, { of: "diff", left: opponent, right: you })).toBe(3);
  });

  it("a sum adds its parts (#PRNUM)", () => {
    const h = new Harness();
    h.life(0, KAROO, KAROO, KAROO);
    h.hand(0, KAROO, KAROO);
    expect(count(h, { of: "sum", exprs: [{ of: "life", player: "you" }, { of: "hand", player: "you" }] })).toBe(5);
  });

  it("a value is count / per, times times, plus plus (#PRNUM)", () => {
    const h = new Harness();
    h.hand(0, KAROO, KAROO, KAROO, KAROO, KAROO);
    const ctx = ctxFor(0, h.state.players[0].leader);
    const hand = { of: "hand", player: "you" } as const;
    expect(evalValue(h.state, ctx, { count: hand, per: 2, times: 1000, plus: 500 })).toBe(2500);
    expect(evalValue(h.state, ctx, { count: hand, times: 3, plus: 1 })).toBe(16);
  });

  it("battle power reads the attacker or the defender, whether it is a Leader or a Character (#PRNUM)", () => {
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

  it("DON!! attached, the source's power and its base power are read from the source card (#PRNUM)", () => {
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

  it("distinct names counts each name once (#PRNUM)", () => {
    const h = new Harness();
    h.field(0, KAROO, KAROO, SAI);
    expect(count(h, { of: "distinct_names", selector: { player: "you", zone: "character" } })).toBe(2);
  });
});

describe("conditions on a list of picked cards", () => {
  it("all-match needs at least one card and every card to match; any-match needs one match (#PRNUM)", () => {
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

describe("hand rows in the player view", () => {
  const SHANKS = "OP13-028"; // 10-cost. [On Play] Set all of your DON!! cards as active. Then, you cannot play cards from your hand during this turn.
  const GUARD_POINT = "ST01-014"; // 1-cost Event

  function afterShanks() {
    const h = new Harness();
    h.hand(0, SHANKS, KAROO, GUARD_POINT);
    h.don(0, 10);
    h.play(0, SHANKS);
    return h;
  }

  it("say a hand lock blocks every card in hand, Characters and Events alike (#PRNUM)", () => {
    const h = afterShanks();
    expect(h.view(0).you.hand.map((c) => [c.defId, c.playCost, c.blocked])).toEqual([[KAROO, 1, "from_hand"], [GUARD_POINT, 1, "from_hand"]]);
  });

  it("show no play cost and no block while the opponent is the one in their main phase (#PRNUM)", () => {
    const h = afterShanks();
    h.hand(1, KAROO);
    expect(h.view(1).you.hand.map((c) => [c.playCost, c.blocked])).toEqual([[undefined, undefined]]);
  });

  it("show no play cost and no block outside the main phase (#PRNUM)", () => {
    const h = afterShanks();
    const [attacker] = h.field(0, KAROO);
    h.attack(attacker!, "leader");
    expect(h.state.phase).not.toBe("main");
    expect(h.view(0).you.hand.map((c) => [c.playCost, c.blocked])).toEqual([[undefined, undefined], [undefined, undefined]]);
  });
});

describe("static results read through the query cache", () => {
  const INAZUMA = "OP05-003"; // 3-cost: [Rush] if you have another Character with 7000 power or more. Its check looks at every Character of yours, Yamato included.
  const YAMATO = "EB05-046"; // 4-cost 5000: if your opponent has a Character with 8000 base power or more, this Character gains [Blocker] and +3000 power.
  const LOKI = "OP17-119"; // 8000 base power

  it("a Character keeps its own static bonuses in the view after another card's condition has looked at it (#PRNUM)", () => {
    const h = new Harness();
    h.field(0, INAZUMA, YAMATO);
    h.field(1, LOKI);
    const yamato = h.view(0).you.characters.find((c) => c.defId === YAMATO)!;
    expect(yamato.power).toBe(5000 + 3000);
    expect(yamato.keywords).toContain("blocker");
  });
});
