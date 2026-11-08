import { afterEach, describe, expect, it } from "vitest";
import { chooseBotIntent, chooseBotIntentFromState, type BotOptions } from "../bot/index.js";
import { PLAYBOOKS, type LeaderPlaybook } from "../bot/playbooks/index.js";
import { ROCKS_DECLINE_HAND_AT_OR_BELOW } from "../bot/playbooks/rocks.js";
import { createMatch, getPlayerView } from "../engine.js";
import { buildTestDeck } from "../cards/definitions.js";
import { createSeededRng } from "../rng.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, Seat } from "../types.js";

const L = "OP01-001"; // plain 5000 Leader without an Activate: Main
const STRONG_LEADER = "OP02-001"; // 6000
const ROSINANTE = "OP12-061";
const KAIDO = "OP17-058";
const SABO = "OP13-004";
const ROCKS = "OP17-039";
const BUGGY = "OP09-042";
const LAW = "ST10-010"; // Trafalgar Law, cost 4, 5000
const ROSINANTE_AND_LAW = "EB04-038"; // cost 6, also counts as Trafalgar Law
const ROSI_CHAR = "OP12-108"; // Donquixote Rosinante, cost 1
const BORSALINO = "EB04-058"; // cost 5, 6000
const ALVIDA_9 = "EB05-021"; // cost 9, Cross Guild
const CROC_MIHAWK = "ST25-003"; // cost 8, Cross Guild
const MIHAWK = "OP09-048"; // cost 6, Cross Guild
const LAW_6000 = "P-093"; // cost 4, 6000
const SAKAZUKI = "OP16-065"; // cost 7, 8000
const WEAK_BLOCKER = "EB01-017"; // cost 2
const RAFFLESIA = "OP01-028"; // Counter Event, cost 1
const REBECCA = "OP04-039"; // Leader with a cheap [Activate: Main] (rest 1 DON!!)
const PUDDING = "OP08-058"; // [When Attacking] optional: turn 2 Life face-up
const CHOPPER = "OP04-010"; // [On Play] choose an {Animal}
const ANIMAL = "OP17-028";

type Opts = Partial<BotOptions>;
const normal = (h: Harness, seat: Seat, opts: Opts = {}): Intent => chooseBotIntent(h.view(seat), { level: "normal", rng: createSeededRng(1), ...opts })!;

/** Play the bot's moves for `seat` until it ends the turn, has no move, or `steps` run out. Returns the intents sent. */
function drive(h: Harness, seat: Seat, opts: Opts = {}, steps = 30): Intent[] {
  const rng = createSeededRng(1);
  const sent: Intent[] = [];
  for (let k = 0; k < steps; k += 1) {
    const i = chooseBotIntent(h.view(seat), { level: "normal", rng, ...opts });
    if (!i || i.type === "end_turn") break;
    sent.push(i);
    h.act(seat, i);
  }
  return sent;
}
const fieldOf = (h: Harness, seat: Seat): string[] => h.state.players[seat].characters.map((c) => c.defId);
const activations = (sent: Intent[], abilityId: string): number => sent.filter((i) => i.type === "activate_ability" && i.abilityId === abilityId).length;
const fillers = (n: number): string[] => Array.from({ length: n }, () => FILLER);

describe("leader playbooks: Rosinante (#1173)", () => {
  it("pays DON!! -1 so a Trafalgar Law that does not fit is played the same turn, and generic play never activates it (#1173)", () => {
    for (const [playbooks, expected] of [[true, [LAW]], [false, []]] as const) {
      const h = new Harness({ leaders: [ROSINANTE, L] });
      h.don(0, 3);
      h.hand(0, LAW);
      const sent = drive(h, 0, { playbooks });
      expect(`${playbooks}: ${fieldOf(h, 0)} after ${activations(sent, "op12-061#1")} activations`).toBe(`${playbooks}: ${expected} after ${expected.length} activations`);
    }
  });

  it("counts Rosinante & Law as a Trafalgar Law (#1173)", () => {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    h.don(0, 5);
    h.hand(0, ROSINANTE_AND_LAW);
    drive(h, 0);
    expect(fieldOf(h, 0)).toEqual([ROSINANTE_AND_LAW]);
  });

  it("keeps its DON!! when the Law fits anyway and the saved DON!! buys nothing (#1173)", () => {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    h.don(0, 4);
    h.hand(0, LAW);
    const sent = drive(h, 0);
    expect(activations(sent, "op12-061#1")).toBe(0);
    expect(fieldOf(h, 0)).toEqual([LAW]);
  });

  it("keeps its DON!! when the second card was affordable without the discount (#1173)", () => {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    h.don(0, 5);
    h.hand(0, LAW, FILLER);
    expect(activations(drive(h, 0), "op12-061#1")).toBe(0);
  });

  it("pays DON!! -1 when the saved DON!! lets a second card be played (#1173)", () => {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    h.don(0, 4);
    h.hand(0, LAW, ROSI_CHAR);
    const sent = drive(h, 0);
    expect(activations(sent, "op12-061#1")).toBe(1);
    expect(fieldOf(h, 0).sort()).toEqual([LAW, ROSI_CHAR].sort());
  });

  it("does not pay DON!! -1 when the discounted Law would still be out of reach (#1173)", () => {
    const h = new Harness({ leaders: [ROSINANTE, L] });
    h.don(0, 2);
    h.hand(0, LAW);
    // 4 - 2 = 2 DON!! needed, but only 1 is left after DON!! -1.
    expect(activations(drive(h, 0), "op12-061#1")).toBe(0);
  });

  it("plays the discounted Law first, ahead of a pricier card the generic scoring prefers (#1173)", () => {
    for (const [playbooks, expected] of [[true, LAW], [false, BORSALINO]] as const) {
      const h = new Harness({ leaders: [ROSINANTE, L] });
      h.don(0, 6);
      h.hand(0, LAW, BORSALINO);
      h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op12-061#1" });
      while (h.choice) h.act(0, normal(h, 0));
      expect(h.view(0).you.hand[0]).toMatchObject({ defId: LAW, playCost: 2 });
      const move = normal(h, 0, { playbooks }) as Extract<Intent, { type: "play_card" }>;
      expect(h.state.players[0].hand[move.handIndex]!.defId).toBe(expected);
    }
  });
});

describe("leader playbooks: Kaido (#1173)", () => {
  /** Seat 0 (Kaido, 5000) attacks `target`; opposing Characters `rested` are rested. Returns the pending [When Attacking] cost prompt's harness. */
  function attacking(opp: { id: string; rested: boolean }[], target: "leader" | number) {
    const h = new Harness({ leaders: [KAIDO, L] });
    h.don(0, 3);
    const cards = h.field(1, ...opp.map((o) => o.id));
    cards.forEach((c, i) => { c.rested = opp[i]!.rested; });
    h.attack(h.state.players[0].leader, target === "leader" ? "leader" : cards[target]!);
    expect(h.choice).toMatchObject({ seat: 0, cardDefId: KAIDO, request: { type: "confirm" } });
    return { h, cards };
  }
  /**
   * Let seat `seat`'s bot answer the Leader's prompts until it is asked which Character to shrink; returns that Character's
   * instance id, or null when the bot declined (or was never asked).
   */
  function shrunk(h: Harness, seat: Seat, opts: Opts = {}): string | null {
    for (let k = 0; k < 6 && h.choice; k += 1) {
      const answer = normal(h, seat, opts);
      if (answer.type !== "resolve_pending_choice") return null;
      if (!answer.accept) return null;
      const r = h.choice.request;
      const picked = r?.type === "select" ? r.options.find((o) => o.id === answer.selectedOptionIds?.[0]) : undefined;
      if (picked?.instanceId && [0, 1].some((s) => h.state.players[s as Seat].characters.some((c) => c.id === picked.instanceId))) return picked.instanceId;
      h.act(seat, answer);
    }
    return null;
  }

  it("pays for -2000 when it lets its attacker beat the Character it attacks, and shrinks that Character (#1173)", () => {
    const opp = [{ id: SAKAZUKI, rested: true }, { id: LAW_6000, rested: true }];
    const { h, cards } = attacking(opp, 1);
    expect(shrunk(h, 0)).toBe(cards[1]!.id);
    const off = attacking(opp, 1);
    // Generic: always pays, and shrinks the most valuable Character.
    expect(shrunk(off.h, 0, { playbooks: false })).toBe(off.cards[0]!.id);
  });

  it("declines when -2000 changes nothing about the battle or the board (#1173)", () => {
    const { h } = attacking([{ id: LAW, rested: true }], 0);
    expect(normal(h, 0)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(normal(h, 0, { playbooks: false })).toEqual({ type: "resolve_pending_choice", accept: true });
  });

  it("while attacking the Leader, shrinks a rested Character that -2000 brings into reach of its attackers (#1173)", () => {
    const { h, cards } = attacking([{ id: SAKAZUKI, rested: true }, { id: LAW_6000, rested: true }], "leader");
    // 8000 is out of reach even at -2000; 6000 - 2000 = 4000 is not.
    expect(shrunk(h, 0)).toBe(cards[1]!.id);
  });

  it("does not spend DON!! on a Character that is not rested, since an attack cannot K.O. it (#1173)", () => {
    const { h } = attacking([{ id: LAW_6000, rested: false }], "leader");
    expect(normal(h, 0)).toEqual({ type: "resolve_pending_choice", accept: false });
  });

  /** Seat 0's Character `attacker` attacks seat 1's Kaido Leader (5000) with seat 1 holding the cost prompt. */
  function defending(attacker: string, others: string[] = []) {
    const h = new Harness({ leaders: [L, KAIDO] });
    h.don(1, 3);
    const cards = h.field(0, attacker, ...others);
    h.attack(cards[0]!, "leader");
    return { h, cards };
  }

  it("shrinks the attacker when -2000 stops it beating Kaido, and only then (#1173)", () => {
    const { h, cards } = defending(LAW_6000, [SAKAZUKI]);
    expect(h.choice).toMatchObject({ seat: 1, cardDefId: KAIDO, request: { type: "confirm" } });
    expect(shrunk(h, 1)).toBe(cards[0]!.id);
    // At 7000 - 2000 = 5000 an attacker still ties the Leader, so the shrink saves nothing: only a drop below 5000 does.
    expect(normal(defending(ALVIDA_9).h, 1)).toEqual({ type: "resolve_pending_choice", accept: false });
    // An attacker that does not reach the Leader anyway is left alone.
    const weak = defending(FILLER);
    expect(normal(weak.h, 1)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(normal(weak.h, 1, { playbooks: false })).toEqual({ type: "resolve_pending_choice", accept: true });
  });
});

describe("leader playbooks: Sabo (#1173)", () => {
  /** Sabo with one active DON!! and a Counter Event in hand (so the generic spare-DON!! rule keeps its DON!! home). */
  function sabo(chars: string[], leaderDon = 0) {
    const h = new Harness({ leaders: [SABO, L] });
    h.don(0, 1);
    // Under 4 Life Sabo's own -1000 is off, so the Leader needs no DON!! to reach the opposing Leader.
    h.life(0, FILLER, FILLER, FILLER);
    h.hand(0, RAFFLESIA);
    const field = h.field(0, ...chars);
    if (leaderDon) h.attach(0, h.state.players[0].leader, leaderDon);
    return { h, field };
  }
  const gives = (i: Intent) => i.type === "give_don" && i.targetId === "leader_1";

  it("gives its Leader a DON!! first when it has a cost 8+ Character and can attack (#1173)", () => {
    const { h } = sabo([CROC_MIHAWK]);
    expect(gives(normal(h, 0))).toBe(true);
    expect(gives(normal(h, 0, { playbooks: false }))).toBe(false);
  });

  it("keeps the DON!! without a cost 8+ Character (#1173)", () => {
    const { h } = sabo([MIHAWK]);
    expect(gives(normal(h, 0))).toBe(false);
  });

  it("does not stack a second DON!! on a Leader that already has one (#1173)", () => {
    const { h } = sabo([CROC_MIHAWK], 1);
    expect(normal(h, 0).type).not.toBe("give_don");
  });

  it("keeps the DON!! when nothing can attack this turn (#1173)", () => {
    const { h, field } = sabo([CROC_MIHAWK]);
    field[0]!.rested = true;
    h.state.players[0].leader.rested = true;
    expect(h.view(0).legalIntents.some((i) => i.type === "give_don")).toBe(true);
    expect(normal(h, 0).type).not.toBe("give_don");
  });
});

describe("leader playbooks: Rocks.D.Xebec (#1173)", () => {
  function attacking(handSize: number): Harness {
    const h = new Harness({ leaders: [ROCKS, L] });
    h.don(0, 0);
    h.hand(0, ...fillers(handSize));
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice).toMatchObject({ seat: 0, cardDefId: ROCKS, request: { type: "confirm" } });
    return h;
  }
  const accept = { type: "resolve_pending_choice", accept: true };
  const decline = { type: "resolve_pending_choice", accept: false };

  it("keeps a small hand instead of trashing a card for the reveal, but pays with a bigger one (#1173)", () => {
    expect(normal(attacking(ROCKS_DECLINE_HAND_AT_OR_BELOW), 0)).toEqual(decline);
    expect(normal(attacking(ROCKS_DECLINE_HAND_AT_OR_BELOW + 1), 0)).toEqual(accept);
    expect(normal(attacking(ROCKS_DECLINE_HAND_AT_OR_BELOW), 0, { playbooks: false })).toEqual(accept);
  });
});

describe("leader playbooks: Buggy (#1173)", () => {
  function buggy(active: number, hand: string[]): Harness {
    const h = new Harness({ leaders: [BUGGY, L] });
    h.don(0, active);
    h.hand(0, ...hand);
    return h;
  }

  it("rests 5 DON!! to put in the priciest Cross Guild Character it cannot afford, trashing its weakest card (#1173)", () => {
    for (const [playbooks, expected] of [[true, true], [false, false]] as const) {
      const h = buggy(5, [CROC_MIHAWK, ALVIDA_9, FILLER, FILLER]);
      drive(h, 0, { playbooks });
      expect(fieldOf(h, 0).includes(ALVIDA_9)).toBe(expected);
      if (expected) {
        // Neither Cross Guild Character was paid for with a trashed hand card.
        expect(h.state.players[0].trash.filter((d) => d === FILLER).length).toBeGreaterThan(0);
        expect(h.state.players[0].trash).not.toContain(CROC_MIHAWK);
      }
    }
  });

  it("hard-casts a Cross Guild Character it can afford instead of using the Leader (#1173)", () => {
    const h = buggy(8, [CROC_MIHAWK, FILLER]);
    expect(activations(drive(h, 0), "op09-042#0")).toBe(0);
    expect(fieldOf(h, 0)).toContain(CROC_MIHAWK);
  });

  it("does not rest 5 DON!! for a Cross Guild Character under cost 7 (#1173)", () => {
    expect(activations(drive(buggy(5, [MIHAWK, FILLER]), 0), "op09-042#0")).toBe(0);
  });

  it("does not trash its only card to play it (#1173)", () => {
    expect(activations(drive(buggy(5, [ALVIDA_9]), 0), "op09-042#0")).toBe(0);
  });
});

describe("leader playbook plumbing (#1173)", () => {
  afterEach(() => { delete PLAYBOOKS[L]; delete PLAYBOOKS[REBECCA]; delete PLAYBOOKS[PUDDING]; });
  const register = (pb: Partial<LeaderPlaybook> & { leaderId: string }): void => { PLAYBOOKS[pb.leaderId] = { name: "test", ...pb }; };

  it("a DON!! reserve keeps plays and DON!! gives from spending it (#1173)", () => {
    const h = new Harness({ leaders: [L, STRONG_LEADER] });
    h.don(0, 3);
    h.hand(0, WEAK_BLOCKER, FILLER);
    const costOf = (i: Intent) => (i.type === "play_card" ? h.view(0).you.hand[i.handIndex]!.playCost : -1);
    expect(costOf(normal(h, 0))).toBe(2);
    register({ leaderId: L, donReserve: () => 2 });
    expect(costOf(normal(h, 0))).toBeLessThanOrEqual(1);
    delete PLAYBOOKS[L];
    // Two active DON!! with a reserve of 2: a give would break it.
    const g = new Harness({ leaders: [L, STRONG_LEADER] });
    g.don(0, 2);
    expect(normal(g, 0).type).toBe("give_don");
    register({ leaderId: L, donReserve: () => 2 });
    expect(normal(g, 0).type).not.toBe("give_don");
    // Nothing needs the DON!! to connect: the generic spare-DON!! give honours the reserve too.
    const spare = new Harness({ leaders: [L, L] });
    spare.don(0, 2);
    expect(normal(spare, 0).type).not.toBe("give_don");
    delete PLAYBOOKS[L];
    expect(normal(spare, 0).type).toBe("give_don");
  });

  it("a playbook can veto the generic use of the Leader's own ability (#1173)", () => {
    const h = new Harness({ leaders: [REBECCA, L] });
    h.don(0, 3);
    expect(normal(h, 0).type).toBe("activate_ability");
    register({ leaderId: REBECCA, allowLeaderActivate: () => false });
    expect(normal(h, 0).type).not.toBe("activate_ability");
    expect(normal(h, 0, { playbooks: [] }).type).toBe("activate_ability");
  });

  it("an answer is used for the Leader's own prompt only, never for another card's (#1173)", () => {
    const seen: string[] = [];
    register({ leaderId: PUDDING, answerChoice: (_v, c) => { seen.push(c.cardDefId); return { type: "resolve_pending_choice", accept: false }; } });
    const pudding = new Harness({ leaders: [PUDDING, L] });
    pudding.don(0, 3);
    pudding.attack(pudding.state.players[0].leader, "leader");
    expect(normal(pudding, 0)).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(normal(pudding, 0, { playbooks: false })).toEqual({ type: "resolve_pending_choice", accept: true });
    expect(seen).toEqual([PUDDING]);
    seen.length = 0;
    // Chopper's [On Play] prompt belongs to Chopper, not to the Leader.
    const other = new Harness({ leaders: [PUDDING, L] });
    other.don(0, 3);
    other.hand(0, CHOPPER, ANIMAL);
    other.play(0, CHOPPER);
    expect(other.choice).toMatchObject({ cardDefId: CHOPPER });
    normal(other, 0);
    expect(seen).toEqual([]);
  });

  it("ignores a main-phase hint that is not a legal move, and honours one that is (#1173)", () => {
    const h = new Harness({ leaders: [L, STRONG_LEADER] });
    h.don(0, 3);
    h.hand(0, FILLER);
    register({ leaderId: L, main: () => ({ type: "play_card", handIndex: 9 }) });
    expect(h.view(0).legalIntents).toContainEqual(normal(h, 0));
    register({ leaderId: L, main: () => ({ type: "end_turn" }) });
    expect(normal(h, 0)).toEqual({ type: "end_turn" });
  });

  it("applies the playbooks setting: true = all, false = none, a list = those leaders (#1173)", () => {
    let calls = 0;
    register({ leaderId: L, main: () => { calls += 1; return undefined; } });
    const h = new Harness({ leaders: [L, STRONG_LEADER] });
    const count = (opts: Opts): number => { calls = 0; normal(h, 0, opts); return calls; };
    expect([count({}), count({ playbooks: true }), count({ playbooks: false }), count({ playbooks: [ROSINANTE] }), count({ playbooks: [L] })]).toEqual([1, 1, 0, 0, 1]);
  });

  it("easy never consults a playbook (#1173)", () => {
    let calls = 0;
    register({ leaderId: PUDDING, main: () => { calls += 1; return undefined; }, answerChoice: () => { calls += 1; return { type: "resolve_pending_choice", accept: false }; } });
    const h = new Harness({ leaders: [PUDDING, L] });
    h.don(0, 3);
    h.attack(h.state.players[0].leader, "leader");
    for (let seed = 1; seed <= 12; seed += 1) chooseBotIntent(h.view(0), { level: "easy", rng: createSeededRng(seed) });
    expect(calls).toBe(0);
    // Normal does ask it, so the zero above is not an unused hook.
    normal(h, 0);
    expect(calls).toBe(1);
  });

  it("a playbook's mulligan verdict beats the generic rule, with the first-player flag, for normal and hard (#1173)", () => {
    const deck = buildTestDeck(20);
    const seen: boolean[] = [];
    const mulliganState = (first: Seat) => {
      const state = createMatch({ seed: 4, firstSeat: first, players: [{ leaderId: L, deck }, { leaderId: L, deck }] });
      // Two cheap Characters (and a good curve for the simulation): both keep this hand without a playbook.
      state.players[0].hand = [FILLER, WEAK_BLOCKER, CHOPPER, LAW, BORSALINO].map((defId, i) => ({ id: `m${i}`, defId, rested: false, attachedDonIds: [] }));
      return state;
    };
    const keep = { type: "mulligan", doMulligan: false };
    const mull = { type: "mulligan", doMulligan: true };
    const state = mulliganState(0);
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual(keep);
    register({ leaderId: L, mulligan: (_hand, first) => { seen.push(first); return "mulligan"; } });
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual(mull);
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal", playbooks: false })).toEqual(keep);
    expect(chooseBotIntentFromState(state, 0, { level: "hard", mulligan: "sim", rng: createSeededRng(1) })).toEqual(mull);
    expect(chooseBotIntentFromState(mulliganState(1), 0, { level: "hard", mulligan: "sim", rng: createSeededRng(1) })).toEqual(mull);
    expect(seen).toEqual([true, true, true, false, false]);
  });

  it("hard's rollouts and its normal baseline use the same playbook setting (#1173)", () => {
    let calls = 0;
    register({ leaderId: L, main: () => { calls += 1; return undefined; } });
    const h = new Harness({ leaders: [L, STRONG_LEADER] });
    h.don(0, 3);
    h.hand(0, FILLER, "ST01-004", RAFFLESIA);
    const hard = (playbooks: boolean): number => {
      calls = 0;
      chooseBotIntentFromState(h.state, 0, { level: "hard", playbooks, budgetMs: Infinity, samples: 1, maxEvals: 4, rng: createSeededRng(3) });
      return calls;
    };
    expect(hard(false)).toBe(0);
    // One call for the baseline pick, more for the rollouts that follow each candidate.
    expect(hard(true)).toBeGreaterThan(2);
  });
});
