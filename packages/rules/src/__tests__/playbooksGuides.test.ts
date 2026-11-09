import { describe, expect, it } from "vitest";
import { chooseBotIntent, type BotOptions } from "../bot/index.js";
import { PLAYBOOKS } from "../bot/playbooks/index.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, PendingChoice, Seat } from "../types.js";
import type { TurnMemory } from "../bot/main.js";

/** Hints taken from deck guides (#1204): Xebec, Luffy (OP13), Enel, Rosinante, Hancock, Sabo, Kaido. */

const L = "OP01-001";
const ROCKS = "OP17-039";
const LUFFY13 = "OP13-001";
const ENEL = "OP05-098";
const ROSINANTE = "OP12-061";
const HANCOCK = "OP14-041";
const SABO = "OP13-004";
const KAIDO = "OP17-058";

const BORSALINO = "EB04-058"; // cost 5, 6000
const MIHAWK = "OP09-048"; // cost 6, 7000
const SAKAZUKI = "OP16-065"; // cost 7, 8000
const WEAK_BLOCKER = "EB01-017"; // cost 2, 2000
const LAW_6000 = "P-093"; // cost 4, 6000
const BIG_7000 = "EB01-002"; // cost 5, 7000
const MID_6000 = "OP07-033"; // cost 5, 6000
const TEN_COST = "OP17-062"; // Kaido, cost 10

type Opts = Partial<BotOptions>;
const normal = (h: Harness, seat: Seat, opts: Opts = {}): Intent => chooseBotIntent(h.view(seat), { level: "normal", ...opts })!;
const fillers = (n: number): string[] => Array.from({ length: n }, () => FILLER);
const MEMORY = null as unknown as TurnMemory;
const pb = (leader: string) => PLAYBOOKS[leader]!;
/** The play bonus the leader's playbook gives `defId` in the position of seat 0 (seat 1 is the opponent). */
const bonus = (leader: string, h: Harness, defId: string): number => pb(leader).playBonus!(h.view(0), defId);
const confirm = (optional = true): PendingChoice => ({ id: "c", seat: 0, kind: "effect", cardDefId: "x", optional, prompt: "", request: { type: "confirm" } }) as PendingChoice;
const accept = { type: "resolve_pending_choice", accept: true };
const decline = { type: "resolve_pending_choice", accept: false };

describe("guide hints: Rocks.D.Xebec (#1204)", () => {
  function attacking(handSize: number): Harness {
    const h = new Harness({ leaders: [ROCKS, L] });
    h.don(0, 0);
    h.hand(0, ...fillers(handSize));
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice).toMatchObject({ seat: 0, cardDefId: ROCKS, request: { type: "confirm" } });
    return h;
  }

  it("Rocks keeps its last card instead of trashing it for the reveal, but pays with 2 or 3 cards in hand (#1204)", () => {
    expect(normal(attacking(1), 0)).toEqual(decline);
    expect(normal(attacking(1), 0, { playbooks: false })).toEqual(accept);
    expect(normal(attacking(2), 0)).toEqual(accept);
    expect(normal(attacking(3), 0)).toEqual(accept);
  });

  it("Rocks plays the 10-cost finisher only once 10 DON!! are out (#1204)", () => {
    const at = (don: number) => { const h = new Harness({ leaders: [ROCKS, L] }); h.don(0, don); return bonus(ROCKS, h, "OP17-118"); };
    expect([at(10), at(9)]).toEqual([2, 0]);
  });

  it("Rocks plays its two removal cards only when there is a target they reach (#1204)", () => {
    const vs = (...opp: string[]) => { const h = new Harness({ leaders: [ROCKS, L] }); h.field(1, ...opp); return h; };
    // OP17-046 (removal up to cost 5): +2 on a 5000+ power cost <= 5 target, -2 otherwise.
    expect([bonus(ROCKS, vs(BORSALINO), "OP17-046"), bonus(ROCKS, vs(WEAK_BLOCKER), "OP17-046"), bonus(ROCKS, vs(MIHAWK), "OP17-046"), bonus(ROCKS, vs(), "OP17-046")]).toEqual([2, -2, -2, -2]);
    // OP17-054 (removal up to cost 6): +2 on a 5000+ power cost <= 6 target, else nothing.
    expect([bonus(ROCKS, vs(MIHAWK), "OP17-054"), bonus(ROCKS, vs(SAKAZUKI), "OP17-054"), bonus(ROCKS, vs(WEAK_BLOCKER), "OP17-054")]).toEqual([2, 0, 0]);
  });

  it("Rocks plays Buckin (OP08-051) later than its other cards (#1204)", () => {
    const h = new Harness({ leaders: [ROCKS, L] });
    h.don(0, 3);
    h.hand(0, "OP08-051", WEAK_BLOCKER);
    expect(bonus(ROCKS, h, "OP08-051")).toBeLessThan(0);
    expect(bonus(ROCKS, h, WEAK_BLOCKER)).toBe(0);
  });
});

describe("guide hints: Monkey.D.Luffy OP13-001 (#1204)", () => {
  const GARP = "OP13-016", BONNEY = "EB05-001", OTAMA = "OP07-022";
  const verdict = (hand: string[]) => pb(LUFFY13).mulligan!(hand, true);

  it("Luffy mulligan keeps Garp and Bonney, or one of them with another 1-cost, and redraws with neither (#1204)", () => {
    const pad = (...ids: string[]) => [...ids, ...fillers(5 - ids.length)];
    expect(verdict(pad(GARP, BONNEY))).toBe("keep");
    expect(verdict(pad(GARP, OTAMA))).toBe("keep");
    expect(verdict(pad(BONNEY, "ST30-004"))).toBe("keep");
    expect(verdict(pad(GARP, GARP))).toBe("keep");
    expect(verdict(pad(GARP))).toBeUndefined();
    expect(verdict(pad(BONNEY, LAW_6000))).toBeUndefined();
    expect(verdict(pad(OTAMA))).toBe("mulligan");
    expect(verdict(pad())).toBe("mulligan");
  });

  /** Seat 1 holds `opp` Characters, each rested if listed in `rested`. */
  function vs(opp: string[], rested: string[], hand: string[] = []): Harness {
    const h = new Harness({ leaders: [LUFFY13, L] });
    h.clearHands();
    h.hand(0, ...hand);
    const cards = h.field(1, ...opp);
    cards.forEach((c, i) => { c.rested = rested.includes(opp[i]!); });
    return h;
  }

  it("Luffy holds the rest-based Characters and Event while there is nothing rested to hit (#1204)", () => {
    // OP06-036 needs a rested cost <= 4 target.
    expect([bonus(LUFFY13, vs([LAW_6000], [LAW_6000]), "OP06-036"), bonus(LUFFY13, vs([BORSALINO], [BORSALINO]), "OP06-036"), bonus(LUFFY13, vs([LAW_6000], []), "OP06-036")]).toEqual([0, -3, -3]);
    // OP06-033 needs any rested Character.
    expect([bonus(LUFFY13, vs([BORSALINO], [BORSALINO]), "OP06-033"), bonus(LUFFY13, vs([BORSALINO], []), "OP06-033")]).toEqual([0, -3]);
    // OP08-036: -3 with none rested, 0 with one, +2 with two.
    expect([bonus(LUFFY13, vs([BORSALINO], []), "OP08-036"), bonus(LUFFY13, vs([BORSALINO], [BORSALINO]), "OP08-036"), bonus(LUFFY13, vs([BORSALINO, LAW_6000], [BORSALINO, LAW_6000]), "OP08-036")]).toEqual([-3, 0, 2]);
  });

  it("Luffy plays Nami (OP14-031) and Shanks (OP17-022) a little earlier with a rest-based card in hand (#1204)", () => {
    for (const id of ["OP14-031", "OP17-022"]) {
      expect([bonus(LUFFY13, vs([], [], ["OP06-036"]), id), bonus(LUFFY13, vs([], [], ["OP08-036"]), id), bonus(LUFFY13, vs([], [], [FILLER]), id)]).toEqual([1, 1, 0]);
    }
  });

  it("Luffy plays Ivankov (ST30-004) earlier with two of its partners in hand (#1204)", () => {
    expect([bonus(LUFFY13, vs([], [], ["OP06-036", "OP12-023"]), "ST30-004"), bonus(LUFFY13, vs([], [], ["OP06-036", FILLER]), "ST30-004")]).toEqual([2, 0]);
  });
});

describe("guide hints: Enel OP05-098 (#1204)", () => {
  function enel(life: number, active = 8, hand: string[] = [], turn = 3): Harness {
    const h = new Harness({ leaders: [ENEL, L] });
    h.clearHands();
    h.hand(0, ...hand);
    h.don(0, active);
    h.life(0, ...fillers(life));
    h.state.turnNumber = turn;
    return h;
  }

  it("Enel plays Life-adding cards earlier the lower its Life is (#1204)", () => {
    expect([0, 1, 2, 3].map((life) => bonus(ENEL, enel(life), "OP16-119"))).toEqual([3, 2, 1, 0]);
    expect(bonus(ENEL, enel(2), "EB04-058")).toBe(2); // 1 for Life 2, +1 for the cheap Borsalino rule
    expect(bonus(ENEL, enel(3), "EB04-058")).toBe(0);
  });

  it("Enel waits to play the Life adders that rest 2 DON!! until 2 stay up, and OP15-113 until its hand has 3 cards (#1204)", () => {
    for (const id of ["OP17-106", "OP17-114"]) {
      const cost = id === "OP17-106" ? 5 : 6;
      expect([bonus(ENEL, enel(3, cost + 2), id), bonus(ENEL, enel(3, cost + 1), id)]).toEqual([0, -2]);
    }
    expect([bonus(ENEL, enel(3, 8, ["OP15-113", FILLER]), "OP15-113"), bonus(ENEL, enel(3, 8, ["OP15-113", FILLER, FILLER]), "OP15-113")]).toEqual([-2, 0]);
  });

  it("Enel plays Pudding (OP17-109) early, up to turn 4 (#1204)", () => {
    expect([bonus(ENEL, enel(3, 8, [], 4), "OP17-109"), bonus(ENEL, enel(3, 8, [], 5), "OP17-109")]).toEqual([1, 0]);
  });
});

describe("guide hints: Donquixote Rosinante OP12-061 (#1204)", () => {
  /** Rosinante with a P-093 (cost 4, so 2 with the discount) in hand, `mine` DON!! of its own against `theirs`. */
  function deficit(mine: number, theirs: number): Harness {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    h.clearHands();
    h.hand(0, LAW_6000);
    h.don(0, mine);
    h.don(1, theirs);
    return h;
  }

  it("Rosinante pays DON!! -1 for the Law discount when that leaves it level on DON!! with the opponent, even if the Law fits anyway (#1204)", () => {
    // 5 vs 4: ahead by 1, activating makes it level. Without the playbook the Law is simply cast.
    expect(normal(deficit(5, 4), 0)).toMatchObject({ type: "activate_ability", abilityId: "op12-061#1" });
    expect(normal(deficit(5, 4), 0, { playbooks: false }).type).toBe("play_card");
    // Ahead by 2 (activating would still leave it ahead), level or behind: just cast the Law.
    for (const theirs of [3, 5, 6]) expect(normal(deficit(5, theirs), 0).type).toBe("play_card");
  });

  it("Rosinante pays the Life cost of its optional effect only above 1 Life, and at 2 only with Rosinante & Law out (#1204)", () => {
    const answer = (life: number, field: string[] = []) => {
      const h = new Harness({ leaders: [ROSINANTE, L] });
      h.life(0, ...fillers(life));
      h.field(0, ...field);
      return pb(ROSINANTE).answerChoice!(h.view(0), confirm());
    };
    expect([answer(1), answer(2), answer(2, ["EB04-038"]), answer(3), answer(5)]).toEqual([decline, decline, accept, accept, accept]);
  });

  it("Rosinante leaves choices that are not yes/no to the generic answer (#1204)", () => {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    const select = { ...confirm(), request: { type: "select", min: 0, max: 1, options: [] } } as PendingChoice;
    expect(pb(ROSINANTE).answerChoice!(h.view(0), select)).toBeUndefined();
  });

  it("Rosinante plays Borsalino (EB04-058) at 2 Life or less (#1204)", () => {
    const at = (life: number, id = BORSALINO) => { const h = new Harness({ leaders: [ROSINANTE, L] }); h.life(0, ...fillers(life)); return bonus(ROSINANTE, h, id); };
    expect([at(1), at(2), at(3), at(1, MID_6000)]).toEqual([3, 3, 0, 0]);
  });
});

describe("guide hints: Boa Hancock OP14-041 (#1204)", () => {
  const ST17_004 = "ST17-004", NAMI = "EB03-053";
  function hancock(opts: { oppLife?: number; attached?: number; hand?: string[]; oppHand?: number; don?: number } = {}): Harness {
    const h = new Harness({ leaders: [HANCOCK, L] });
    h.clearHands();
    h.hand(0, ...(opts.hand ?? []));
    h.hand(1, ...fillers(opts.oppHand ?? 5));
    h.life(1, ...fillers(opts.oppLife ?? 3));
    h.don(0, opts.don ?? 10);
    if (opts.attached) h.attach(0, h.state.players[0].leader, opts.attached);
    return h;
  }

  it("Hancock plays Boa Hancock (ST17-004) and Nami first while its Leader has no DON!! (#1204)", () => {
    expect([bonus(HANCOCK, hancock(), ST17_004), bonus(HANCOCK, hancock({ attached: 1 }), ST17_004)]).toEqual([2, 0]);
    expect([bonus(HANCOCK, hancock({ oppLife: 2 }), NAMI), bonus(HANCOCK, hancock({ oppLife: 2, attached: 1 }), NAMI)]).toEqual([2, 0]);
  });

  it("Hancock holds Shakuyaku (OP14-107) while the opponent has 4+ Life and pushes it at 3 or less (#1204)", () => {
    expect([4, 5, 3, 1].map((oppLife) => bonus(HANCOCK, hancock({ oppLife }), "OP14-107"))).toEqual([-3, -3, 2, 2]);
  });

  it("Hancock plays Gorgon Sisters (OP14-105) only with 3 other Kuja Pirates / Amazon Lily cards in hand (#1204)", () => {
    const crew = [ST17_004, "EB05-028", "OP14-112"];
    expect([bonus(HANCOCK, hancock({ hand: ["OP14-105", ...crew] }), "OP14-105"), bonus(HANCOCK, hancock({ hand: ["OP14-105", ...crew.slice(0, 2), FILLER] }), "OP14-105")]).toEqual([0, -2]);
  });

  it("Hancock plays Nami (EB03-053) with the opponent at 3+ Life (#1204)", () => {
    expect([3, 2].map((oppLife) => bonus(HANCOCK, hancock({ oppLife, attached: 1 }), NAMI))).toEqual([2, 0]);
  });

  it("Hancock holds Boa Hancock (EB05-028) unless the opponent holds 9+ cards (#1204)", () => {
    expect([8, 9].map((oppHand) => bonus(HANCOCK, hancock({ oppHand }), "EB05-028"))).toEqual([-2, 0]);
  });

  it("Hancock plays the 9-cost Boa Hancock (OP14-112) once 9 DON!! are out (#1204)", () => {
    expect([9, 8].map((don) => bonus(HANCOCK, hancock({ don }), "OP14-112"))).toEqual([3, 0]);
  });
});

describe("guide hints: Sabo OP13-004 (#1204)", () => {
  function sabo(active: number): Harness {
    const h = new Harness({ leaders: [SABO, L] });
    h.don(0, active);
    return h;
  }

  it("Sabo holds Brook (ST01-011) back (#1204)", () => {
    expect([bonus(SABO, sabo(3), "ST01-011"), bonus(SABO, sabo(3), WEAK_BLOCKER)]).toEqual([-3, 0]);
  });

  it("Sabo holds Zoro (OP17-095) and Nami (OP17-086) once 4+ DON!! are active (#1204)", () => {
    for (const id of ["OP17-095", "OP17-086"]) expect([bonus(SABO, sabo(4), id), bonus(SABO, sabo(3), id)]).toEqual([-2, 0]);
  });
});

describe("guide hints: Kaido OP17-058 (#1204)", () => {
  function kaido(opts: { active?: number; field?: string[]; opp?: string[]; hand?: string[]; life?: number } = {}): Harness {
    const h = new Harness({ leaders: [KAIDO, L] });
    h.clearHands();
    h.hand(0, ...(opts.hand ?? []));
    h.field(0, ...(opts.field ?? []));
    h.field(1, ...(opts.opp ?? []));
    h.don(0, opts.active ?? 0);
    if (opts.life !== undefined) h.life(0, ...fillers(opts.life));
    return h;
  }

  it("Kaido (hint 1) uses Queen's DON!! ability before ending the turn, with 2+ active DON!! (#1204)", () => {
    const at = (active: number) => pb(KAIDO).beforeEndTurn!(kaido({ active, field: ["EB04-032"] }).view(0), MEMORY);
    expect(at(2)).toMatchObject({ type: "activate_ability", abilityId: "eb04-032#1" });
    expect(at(1)).toBeUndefined();
    expect(pb(KAIDO).beforeEndTurn!(kaido({ active: 3 }).view(0), MEMORY)).toBeUndefined();
  });

  const verdict = (hand: string[]) => pb(KAIDO).mulligan!(hand, true);
  const pad = (...ids: string[]) => [...ids, ...fillers(5 - ids.length)];
  it("Kaido (hint 2) mulligan keeps King with a mate or two mates, and redraws a hand of mostly 9-10 cost cards (#1204)", () => {
    expect(verdict(pad("EB04-031", "OP17-074"))).toBe("keep");
    expect(verdict(pad("OP17-074", "EB04-032"))).toBe("keep");
    expect(verdict(pad("OP17-074"))).toBeUndefined();
    expect(verdict(pad("EB04-031"))).toBeUndefined();
    expect(verdict(pad("OP17-061", "OP17-065", TEN_COST))).toBe("mulligan");
    expect(verdict(pad("OP17-061", "OP17-065"))).toBeUndefined();
  });

  it("Kaido (hint 3) plays King at 6+ active DON!!, the DON!! makers early, the big Kaido late and holds Sugar (#1204)", () => {
    expect([6, 5].map((active) => bonus(KAIDO, kaido({ active }), "EB04-031"))).toEqual([3, 0]);
    for (const id of ["OP17-074", "EB04-032"]) expect([4, 5].map((active) => bonus(KAIDO, kaido({ active }), id))).toEqual([2, 0]);
    expect([10, 9].map((active) => bonus(KAIDO, kaido({ active }), TEN_COST))).toEqual([2, 0]);
    // EB05-034 needs 9 DON!! on the field and an opposing Character.
    expect([bonus(KAIDO, kaido({ active: 9, opp: [BORSALINO] }), "EB05-034"), bonus(KAIDO, kaido({ active: 9 }), "EB05-034"), bonus(KAIDO, kaido({ active: 8, opp: [BORSALINO] }), "EB05-034")]).toEqual([0, -5, -5]);
  });

  /** On my own turn (no battle) with Kaido (OP17-062) on the field and its refund `used` or not, answering an optional yes/no. */
  const refund = (used: boolean, field = [TEN_COST]) => {
    const h = kaido({ field });
    if (used) h.state.players[0].characters[0]!.usedAbilities = { "op17-062#1": h.state.turnNumber };
    return pb(KAIDO).answerChoice!(h.view(0), confirm());
  };
  it("Kaido (hint 4) pays the -1 DON!! on its own turn while OP17-062's refund is unused, since the DON!! come back (#1204)", () => {
    expect([refund(false), refund(true), refund(false, [])]).toEqual([accept, decline, decline]);
  });

  it("Kaido (hint 4) aims that -2000 at the strongest opposing Character (#1204)", () => {
    const h = kaido({ field: [TEN_COST], opp: [WEAK_BLOCKER, SAKAZUKI, BORSALINO] });
    const opp = h.state.players[1].characters;
    const options = opp.map((c) => ({ id: `o-${c.id}`, label: c.defId, eligible: true, instanceId: c.id }));
    const select = { ...confirm(), request: { type: "select", min: 0, max: 1, options } } as PendingChoice;
    expect(pb(KAIDO).answerChoice!(h.view(0), select)).toEqual({ type: "resolve_pending_choice", accept: true, selectedOptionIds: [`o-${opp[1]!.id}`] });
  });

  /** Their 6000 attacker hits my Leader; the -2000 is decisive, so the generic answer pays. */
  function attacked(opts: { active: number; hand: string[]; life: number }): Harness {
    const h = new Harness({ leaders: [L, KAIDO] });
    h.clearHands();
    h.hand(1, ...opts.hand);
    h.don(1, opts.active);
    h.life(1, ...fillers(opts.life));
    const [atk] = h.field(0, MID_6000);
    h.attack(atk!, "leader");
    return h;
  }
  it("Kaido (hint 5) declines a decisive -1 DON!! that would leave it short of 10 DON!! for a 10-cost in hand, unless its Life is low (#1204)", () => {
    const answer = (opts: { active: number; hand: string[]; life: number }) => {
      const h = attacked(opts);
      const view = h.view(1);
      expect(view.battle).toBeTruthy();
      return pb(KAIDO).answerChoice!(view, confirm());
    };
    const base = { active: 5, hand: [TEN_COST], life: 4 };
    // Without a 10-cost in hand the same position pays, so the decline below comes from the hint.
    expect(answer({ ...base, hand: [FILLER] })).toEqual(accept);
    expect(answer(base)).toEqual(decline);
    expect(answer({ ...base, life: 2 })).toEqual(accept);
    expect(answer({ ...base, active: 8 })).toEqual(accept);
  });

  it("Kaido (hint 6) uses Lead Performers' (OP17-061) ability first when it is rested and King or Queen is in hand (#1204)", () => {
    const main = (h: Harness) => pb(KAIDO).main!(h.view(0), MEMORY);
    const rested = (hand: string[], isRested = true) => {
      const h = kaido({ active: 3, field: ["OP17-061"], hand });
      h.state.players[0].characters[0]!.rested = isRested;
      return h;
    };
    expect(main(rested(["EB04-031"]))).toMatchObject({ type: "activate_ability", abilityId: "op17-061#1" });
    expect(main(rested(["OP17-065"]))).toMatchObject({ type: "activate_ability", abilityId: "op17-061#1" });
    expect(main(rested([FILLER]))).toBeUndefined();
    expect(main(rested(["EB04-031"], false))).toBeUndefined();
  });
});
