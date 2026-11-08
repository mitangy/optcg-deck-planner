import { afterEach, describe, expect, it } from "vitest";
import { chooseBotIntent, chooseBotIntentFromState, type BotOptions } from "../bot/index.js";
import { PLAYBOOKS, type LeaderPlaybook } from "../bot/playbooks/index.js";
import { LUFFY79_ENABLER_BONUS } from "../bot/playbooks/luffy79.js";
import { LUFFY_ACE_BIG_PENALTY } from "../bot/playbooks/luffyAce.js";
import { buildTestDeck } from "../cards/definitions.js";
import { createMatch, getPlayerView } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, Seat } from "../types.js";

const L = "OP01-001";
const LUFFY13 = "OP13-001";
const HANCOCK = "OP14-041";
const ENEL = "OP05-098";
const LUFFY79 = "OP17-079";
const LUFFY_ACE = "ST30-001";
const WEAK_1000 = "OP14-109"; // Blocker, 1000
const NAMI = "OP01-016"; // Straw Hat Crew, 2000, cost 1
const DA_7000 = "OP18-106"; // vanilla Double Attack, 7000
const LAW_6000 = "P-093";
const WEAK_BLOCKER = "EB01-017";
const BORSALINO = "EB04-058"; // cost 5, 6000
const SAUL = "OP17-089"; // gains +12 cost
const GERD = "OP17-081"; // gains +12 cost if the Leader is Elbaph
const BIG_7000 = "EB01-002"; // cost 5, 7000
const MID_6000 = "OP07-033"; // cost 5, 6000
const LAW_4 = "ST10-010";
const LUFFY_3 = "OP14-034";
const LUFFY_4 = "OP12-015";
const LUFFY_5 = "OP07-033";
const LUFFY_6 = "EB02-061";
const NAMI_EB = "EB02-017";
const BONNEY = "EB04-002";
const SUNNY = "ST31-005";

type Opts = Partial<BotOptions>;
const normal = (h: Harness, seat: Seat, opts: Opts = {}): Intent => chooseBotIntent(h.view(seat), { level: "normal", rng: createSeededRng(1), ...opts })!;
const playedDef = (h: Harness, seat: Seat, i: Intent): string => (i.type === "play_card" ? h.state.players[seat].hand[i.handIndex]!.defId : i.type);
const giveToLeader = (h: Harness, seat: Seat, i: Intent): boolean => i.type === "give_don" && i.targetId === h.state.players[seat].leader.id;

/** Bot answers for seat `seat` until the battle and all prompts are settled. */
function settle(h: Harness, seat: Seat, opts: Opts = {}): void {
  const rng = createSeededRng(1);
  for (let k = 0; k < 20; k += 1) {
    const choice = h.choice;
    if (choice) { h.act(choice.seat, chooseBotIntent(h.view(choice.seat), { level: "normal", rng, ...(choice.seat === seat ? opts : {}) })!); continue; }
    if (h.state.phase === "block" || h.state.phase === "counter") { h.act(seat, chooseBotIntent(h.view(seat), { level: "normal", rng, ...opts })!); continue; }
    return;
  }
  throw new Error("battle did not settle");
}

describe("leader playbooks: end-of-turn DON!! for Luffy (OP13-001) and Hancock (#1178)", () => {
  /** Seat 0 with `active` DON!!, its 4th turn, and a Leader that already attacked (rested), so the generic policy has nothing left but to end the turn. */
  function leaderTurn(leader: string, active: number, hand: string[] = []): Harness {
    const h = new Harness({ leaders: [leader, L] });
    h.don(0, active);
    h.hand(0, ...hand);
    h.state.players[0].turnsStarted = 4;
    h.state.players[0].leader.rested = true;
    return h;
  }

  it("Luffy gives its Leader a DON!! instead of ending the turn, but only when it has none (#1178)", () => {
    const none = leaderTurn(LUFFY13, 2);
    expect(giveToLeader(none, 0, normal(none, 0))).toBe(true);
    expect(normal(none, 0, { playbooks: false })).toEqual({ type: "end_turn" });
    const has = leaderTurn(LUFFY13, 2);
    has.attach(0, has.state.players[0].leader, 1);
    expect(normal(has, 0)).toEqual({ type: "end_turn" });
  });

  it("Hancock gives its Leader a DON!! instead of ending the turn (#1178)", () => {
    const h = leaderTurn(HANCOCK, 1);
    expect(giveToLeader(h, 0, normal(h, 0))).toBe(true);
    expect(normal(h, 0, { playbooks: false })).toEqual({ type: "end_turn" });
  });
});

describe("leader playbooks: Luffy (OP13-001) on defense (#1178)", () => {
  /** Seat 1 (Luffy, 5000, 1 DON!! attached, `active` active) is attacked by seat 0's `attacker`, on its Leader or on the rested Nami. */
  function attacked(attacker: string, target: "leader" | "nami" | "other", active = 4): Harness {
    const h = new Harness({ leaders: [L, LUFFY13] });
    h.don(1, active);
    h.attach(1, h.state.players[1].leader, 1);
    const [nami, other] = h.field(1, NAMI, WEAK_BLOCKER);
    nami!.rested = true;
    other!.rested = true;
    const [atk] = h.field(0, attacker);
    h.attack(atk!, target === "leader" ? "leader" : target === "nami" ? nami! : other!);
    expect(h.choice).toMatchObject({ seat: 1, cardDefId: LUFFY13 });
    return h;
  }
  /** The DON!! count the bot rests and the card it boosts, answering both prompts. */
  function answers(h: Harness, opts: Opts = {}): { rested: number; boosted: string | null } {
    const first = normal(h, 1, opts);
    if (first.type !== "resolve_pending_choice") throw new Error("not an answer");
    const rested = first.selectedOptionIds?.length ?? 0;
    h.act(1, first);
    if (!h.choice) return { rested, boosted: null };
    const second = normal(h, 1, opts);
    const r = h.choice.request;
    const picked = r?.type === "select" ? r.options.find((o) => o.id === (second.type === "resolve_pending_choice" ? second.selectedOptionIds?.[0] : undefined)) : undefined;
    return { rested, boosted: picked?.instanceId ?? null };
  }

  it("rests the fewest DON!! that make its Leader out-power the attacker (a tie loses) and boosts the Leader (#1178)", () => {
    // 5000 vs 7000: +2000 ties, +4000 wins.
    const h = attacked(DA_7000, "leader");
    expect(answers(h)).toEqual({ rested: 2, boosted: h.state.players[1].leader.id });
    // The generic answer rests nothing for this prompt.
    expect(answers(attacked(DA_7000, "leader"), { playbooks: false }).rested).toBe(0);
  });

  it("rests nothing when the attacker is already weaker than the attacked card (#1178)", () => {
    const h = attacked(WEAK_1000, "leader");
    expect(answers(h).rested).toBe(0);
  });

  it("boosts the attacked Straw Hat Character instead of the Leader (#1178)", () => {
    // Nami 2000 vs Law 6000: +4000 ties, +6000 wins.
    const h = attacked(LAW_6000, "nami");
    const nami = h.state.players[1].characters.find((c) => c.defId === NAMI)!;
    expect(answers(h)).toEqual({ rested: 3, boosted: nami.id });
  });

  it("rests nothing when the attacked Character is not a Straw Hat Crew one, which the ability cannot boost (#1178)", () => {
    expect(answers(attacked(LAW_6000, "other")).rested).toBe(0);
  });
});

describe("leader playbooks: Enel (OP05-098) lets a hit on its last Life through (#1178)", () => {
  /** Seat 1 (Enel) with `life` Life, a Blocker, counters in hand and a 7000 attacker (seat 0) hitting its Leader. */
  function enel(life: number, opts: { attacker?: string; deck?: number; target?: "leader" | "character" } = {}) {
    const h = new Harness({ leaders: [L, ENEL] });
    h.don(1, 3);
    h.life(1, ...Array.from({ length: life }, () => FILLER));
    h.hand(1, FILLER, FILLER);
    if (opts.deck !== undefined) {
      const p = h.state.players[1];
      p.deck = p.deck.slice(0, opts.deck);
      p.zoneInstanceIds.deck = p.zoneInstanceIds.deck.slice(0, opts.deck);
    }
    const [, prize] = h.field(1, WEAK_BLOCKER, BORSALINO);
    const [atk] = h.field(0, opts.attacker ?? LAW_6000);
    if (opts.target === "character") prize!.rested = true;
    h.attack(atk!, opts.target === "character" ? prize! : "leader");
    return h;
  }
  const defends = (h: Harness, playbooks = true): Intent => normal(h, 1, { playbooks });
  const passes = (i: Intent): boolean => i.type === "pass_block" || i.type === "pass_counter";

  it("passes at 1 Life, takes the hit and refills its Life from the deck, where the generic policy blocks (#1178)", () => {
    const h = enel(1);
    expect(passes(defends(h))).toBe(true);
    expect(defends(h, false).type).toBe("declare_block");
    settle(h, 1);
    const view = h.view(1);
    expect([view.you.lifeCount, view.you.leader.usedThisTurn]).toEqual([1, ["op05-098#m0"]]);
    expect(h.state.winner).toBeNull();
  });

  it("defends normally once the refill was used this turn (#1178)", () => {
    const h = enel(1);
    settle(h, 1);
    // A second attacker, same turn: the refill is spent, the single Life is at risk again.
    const [second] = h.field(0, LAW_6000);
    h.attack(second!, "leader");
    expect(defends(h).type).toBe("declare_block");
  });

  it("defends normally at 0 Life (#1178)", () => {
    expect(defends(enel(0)).type).toBe("declare_block");
  });

  it("defends normally against Double Attack, whose second point would hit 0 Life (#1178)", () => {
    expect(defends(enel(1, { attacker: DA_7000 })).type).toBe("declare_block");
  });

  it("defends normally when the refill would take the last card of the deck (#1178)", () => {
    expect(defends(enel(1, { deck: 1 })).type).toBe("declare_block");
    expect(passes(defends(enel(1, { deck: 2 })))).toBe(true);
  });

  it("only applies to attacks on the Leader (#1178)", () => {
    expect(defends(enel(1, { target: "character" })).type).toBe("declare_block");
  });
});

describe("leader playbooks: Luffy (OP17-079) plays a +12 cost enabler first (#1178)", () => {
  function luffy(hand: string[], field: string[] = []): Harness {
    const h = new Harness({ leaders: [LUFFY79, L] });
    h.don(0, 5);
    h.hand(0, ...hand);
    h.field(0, ...field);
    return h;
  }

  it("plays Saul (cost 4, 12+ on the field) ahead of a better 7000 Character, which the generic score prefers (#1178)", () => {
    const h = luffy([SAUL, BIG_7000]);
    expect(playedDef(h, 0, normal(h, 0))).toBe(SAUL);
    expect(playedDef(h, 0, normal(h, 0, { playbooks: false }))).toBe(BIG_7000);
  });

  it("stops preferring enablers once a 12+ cost Character is out (#1178)", () => {
    const h = luffy([SAUL, BIG_7000], [SAUL]);
    expect(h.view(0).you.characters[0]!.fieldCost).toBeGreaterThanOrEqual(12);
    expect(playedDef(h, 0, normal(h, 0))).toBe(BIG_7000);
  });

  it("reads a conditional +12 cost (Gerd needs an Elbaph Leader) from the card's abilities (#1178)", () => {
    const bonus = PLAYBOOKS[LUFFY79]!.playBonus!;
    expect(bonus(luffy([GERD]).view(0), GERD)).toBe(LUFFY79_ENABLER_BONUS);
    const other = new Harness({ leaders: [L, L] });
    expect(PLAYBOOKS[LUFFY79]!.playBonus!(other.view(0), GERD)).toBe(0);
    expect(bonus(luffy([BIG_7000]).view(0), BIG_7000)).toBe(0);
  });
});

describe("leader playbooks: Luffy & Ace (ST30-001) (#1178)", () => {
  function ace(hand: string[], leaderRested = false): Harness {
    const h = new Harness({ leaders: [LUFFY_ACE, L] });
    h.don(0, 5);
    h.hand(0, ...hand);
    h.state.players[0].leader.rested = leaderRested;
    return h;
  }

  it("holds back a 7000+ Character while the Leader can still attack, and plays it once the Leader cannot (#1178)", () => {
    const h = ace([BIG_7000, MID_6000]);
    expect(LUFFY_ACE_BIG_PENALTY).toBeGreaterThan(0);
    expect(playedDef(h, 0, normal(h, 0))).toBe(MID_6000);
    expect(playedDef(h, 0, normal(h, 0, { playbooks: false }))).toBe(BIG_7000);
    const rested = ace([BIG_7000, MID_6000], true);
    expect(playedDef(rested, 0, normal(rested, 0))).toBe(BIG_7000);
  });

  const verdict = (hand: string[]) => PLAYBOOKS[LUFFY_ACE]!.mulligan!(hand, true);
  it("mulligan: keeps a cost 4-5 Luffy with a cost-1 searcher, redraws with neither, else generic (#1178)", () => {
    expect(verdict([LUFFY_4, NAMI_EB, FILLER, FILLER, FILLER])).toBe("keep");
    expect(verdict([LUFFY_5, SUNNY, FILLER, FILLER, FILLER])).toBe("keep");
    expect(verdict([LUFFY_4, BONNEY, FILLER, FILLER, FILLER])).toBe("keep");
    expect(verdict([FILLER, FILLER, FILLER, FILLER, FILLER])).toBe("mulligan");
    expect(verdict([LUFFY_4, FILLER, FILLER, FILLER, FILLER])).toBeUndefined();
    expect(verdict([NAMI, FILLER, FILLER, FILLER, FILLER])).toBeUndefined();
    // A cost 4 Character that is not a Luffy does not count.
    expect(verdict([LAW_4, NAMI_EB, FILLER, FILLER, FILLER])).toBeUndefined();
    // A Luffy outside the 4-5 cost range is not the one this plan wants.
    expect(verdict([LUFFY_3, NAMI_EB, FILLER, FILLER, FILLER])).toBeUndefined();
    expect(verdict([LUFFY_6, NAMI_EB, FILLER, FILLER, FILLER])).toBeUndefined();
  });

  it("mulligan: the verdict reaches the bot's keep/mulligan answer (#1178)", () => {
    const state = createMatch({ seed: 4, firstSeat: 0, players: [{ leaderId: LUFFY_ACE, deck: buildTestDeck(20) }, { leaderId: L, deck: buildTestDeck(20) }] });
    // Two cheap Characters: the generic rule keeps this hand, the playbook (no Luffy, no searcher) redraws it.
    state.players[0].hand = [FILLER, WEAK_BLOCKER, "OP04-010", "ST10-010", "EB04-058"].map((defId, i) => ({ id: `m${i}`, defId, rested: false, attachedDonIds: [] }));
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual({ type: "mulligan", doMulligan: true });
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal", playbooks: false })).toEqual({ type: "mulligan", doMulligan: false });
  });
});

describe("leader playbook hooks: beforeEndTurn, defense, playBonus (#1178)", () => {
  afterEach(() => { delete PLAYBOOKS[L]; });
  const register = (pb: Partial<LeaderPlaybook>): void => { PLAYBOOKS[L] = { leaderId: L, name: "test", ...pb }; };

  it("a beforeEndTurn hint replaces end_turn only when it is a legal move (#1178)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 0);
    h.state.players[0].leader.rested = true;
    expect(normal(h, 0)).toEqual({ type: "end_turn" });
    register({ beforeEndTurn: () => ({ type: "give_don", donId: "nowhere", targetId: "nowhere" }) });
    expect(normal(h, 0)).toEqual({ type: "end_turn" });
    h.don(0, 1);
    register({ beforeEndTurn: (v) => v.legalIntents.find((i) => i.type === "give_don") });
    expect(normal(h, 0).type).toBe("give_don");
  });

  it("a beforeEndTurn hint is not asked while the generic policy still has a move (#1178)", () => {
    let calls = 0;
    register({ beforeEndTurn: () => { calls += 1; return undefined; } });
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 3);
    h.hand(0, WEAK_BLOCKER);
    expect(normal(h, 0).type).toBe("play_card");
    expect(calls).toBe(0);
  });

  it("a defense hint is used when legal, and ignored when not (#1178)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(1, 3);
    h.hand(1, FILLER);
    h.life(1, FILLER);
    const [atk] = h.field(0, LAW_6000);
    h.field(1, WEAK_BLOCKER);
    h.attack(atk!, "leader");
    const asDefender = (): Intent => normal(h, 1);
    expect(asDefender().type).toBe("declare_block");
    register({ defense: () => ({ type: "pass_block" }) });
    expect(asDefender()).toEqual({ type: "pass_block" });
    register({ defense: () => ({ type: "pass_counter" }) });
    expect(asDefender().type).toBe("declare_block");
  });

  it("hard's baseline pick gets the defense and playBonus hooks too (#1178)", () => {
    const hard = (h: Harness, seat: Seat, playbooks: boolean): Intent => chooseBotIntentFromState(h.state, seat, { level: "hard", playbooks, budgetMs: Infinity, samples: 1, maxEvals: 1, rng: createSeededRng(3) })!;
    const defender = new Harness({ leaders: [L, ENEL] });
    defender.don(1, 3);
    defender.life(1, FILLER);
    defender.hand(1, FILLER, FILLER);
    defender.field(1, WEAK_BLOCKER);
    defender.attack(defender.field(0, LAW_6000)[0]!, "leader");
    expect(hard(defender, 1, true).type).toBe("pass_block");
    expect(hard(defender, 1, false).type).toBe("declare_block");
    const player = new Harness({ leaders: [LUFFY79, L] });
    player.don(0, 5);
    player.hand(0, SAUL, BIG_7000);
    expect(playedDef(player, 0, hard(player, 0, true))).toBe(SAUL);
    expect(playedDef(player, 0, hard(player, 0, false))).toBe(BIG_7000);
  });
});

describe("view: once-per-turn usage (#1178)", () => {
  it("lists the once-per-turn abilities a card used this turn, and only those (#1178)", () => {
    const h = new Harness({ leaders: [ENEL, L] });
    expect(h.view(0).you.leader.usedThisTurn).toBeUndefined();
    const turn = h.state.turnNumber;
    h.state.players[0].leader.usedAbilities = { "now#0": turn, "before#0": turn - 1 };
    expect(h.view(0).you.leader.usedThisTurn).toEqual(["now#0"]);
  });
});
