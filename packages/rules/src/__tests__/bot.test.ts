import { describe, expect, it } from "vitest";
import { chooseBotIntent, type BotLevel } from "../bot/index.js";
import { applyIntent, createMatch, getPlayerView } from "../engine.js";
import { replayMatch } from "../replay/matchReplay.js";
import { createSeededRng } from "../rng.js";
import { playBotGame, runSelfPlay } from "../sim/selfPlay.js";
import { randomDeck } from "../sim/fuzz.js";
import { buildTestDeck } from "../cards/definitions.js";
import { onKoValue } from "../bot/value.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent } from "../types.js";

const KAROO = FILLER; // cost 1, 3000, Counter 1000
const BIG_COUNTER = "EB02-055"; // cost 4, 5000, Counter 2000
const WEAK_BLOCKER = "EB01-017"; // cost 2, 2000, Blocker
const STRONG_BLOCKER = "EB03-019"; // cost 6, 7000, Blocker
const L = "OP01-001"; // 5000, no Activate: Main
const STRONG_LEADER = "OP02-001"; // 6000
const KO_EVENT = "ST08-015"; // [Main] K.O. up to 1 of your opponent's Characters with a cost of 2 or less.

const decks = (seed: number) => { const r = createSeededRng(seed); return [randomDeck(r), randomDeck(r)] as const; };

/** Seat 0's Leader attacks seat 1's Leader, which is at `life` Life; returns the bot's (seat 1) move at the block step. */
function underAttack(life: number, setup: (h: Harness) => void) {
  const h = new Harness({ leaders: [L, L] });
  h.life(1, ...Array.from({ length: life }, () => FILLER));
  setup(h);
  h.attack(h.state.players[0].leader, "leader");
  return h;
}
const bot = (h: Harness, seat: 0 | 1, level: BotLevel = "normal") => chooseBotIntent(h.view(seat), { level, rng: createSeededRng(1) });

describe("bot legality and strength (#631)", () => {
  it("every bot move is accepted by the engine and every game finishes, at both levels (#631)", () => {
    for (const levels of [["normal", "normal"], ["easy", "easy"], ["normal", "easy"]] as [BotLevel, BotLevel][]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const [a, b] = decks(seed);
        const r = playBotGame({ seed, players: [a, b], levels });
        expect(`${levels} seed ${seed}: ${r.stoppedEarly ?? "finished"}`).toBe(`${levels} seed ${seed}: finished`);
        // A rejected bot move would have been replaced by the engine default and counted here.
        expect(r.fallbacks).toBe(0);
      }
    }
  }, 120_000);

  it("returns null when it is not the bot's move and a legal intent when it is (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    expect(bot(h, 1)).toBeNull();
    const move = bot(h, 0);
    expect(h.view(0).legalIntents).toContainEqual(move);
  });

  it("the same view and rng state always give the same intent (#631)", () => {
    const [a, b] = decks(3);
    const game = playBotGame({ seed: 3, players: [a, b], levels: ["normal", "normal"] });
    let checked = 0;
    replayMatch(game.replay, (step) => {
      for (const seat of [0, 1] as const) {
        const view = getPlayerView(step.state, seat);
        if (!view.legalIntents.length) continue;
        const first = chooseBotIntent(view, { level: "normal", rng: createSeededRng(9) });
        const again = chooseBotIntent(view, { level: "normal", rng: createSeededRng(9) });
        expect(again).toEqual(first);
        checked += 1;
      }
    });
    expect(checked).toBeGreaterThan(50);
  }, 60_000);

  it("normal beats easy in a seeded batch (#631)", () => {
    const s = runSelfPlay({ games: 16, seed: 500, levels: ["normal", "easy"] });
    expect(s.finished).toBe(16);
    expect(s.winsByLevel.normal ?? 0).toBeGreaterThanOrEqual(13);
  }, 120_000);

  it("keeps a hand with two cheap Characters and mulligans one without (#631)", () => {
    const deck = buildTestDeck(20);
    const state = createMatch({ seed: 4, firstSeat: 0, players: [{ leaderId: "ST01-001", deck }, { leaderId: "ST01-001", deck }] });
    const hand = (...ids: string[]) => { state.players[0].hand = ids.map((defId, i) => ({ id: `m${i}`, defId, rested: false, attachedDonIds: [] })); };
    hand(KAROO, KAROO, STRONG_BLOCKER, STRONG_BLOCKER, STRONG_BLOCKER);
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual({ type: "mulligan", doMulligan: false });
    hand(KAROO, STRONG_BLOCKER, STRONG_BLOCKER, STRONG_BLOCKER, STRONG_BLOCKER);
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual({ type: "mulligan", doMulligan: true });
  });
});

describe("bot defense (#631)", () => {
  it("spends the smallest Counter that saves its last Life (#631)", () => {
    const h = underAttack(1, (x) => x.hand(1, BIG_COUNTER, KAROO));
    h.act(1, { type: "pass_block" });
    expect(h.state.phase).toBe("counter");
    // Needs +1000 to beat the 5000 attack: Karoo (1000, hand index 1), not the 2000 card.
    expect(bot(h, 1)).toEqual({ type: "counter_from_hand", handIndex: 1 });
  });

  it("takes the hit at high Life and keeps its hand (#631)", () => {
    const h = underAttack(4, (x) => x.hand(1, BIG_COUNTER, KAROO));
    h.act(1, { type: "pass_block" });
    expect(bot(h, 1)).toEqual({ type: "pass_counter" });
  });

  it("passes the counter step when the attack cannot connect (#631)", () => {
    const h = underAttack(1, (x) => x.hand(1, BIG_COUNTER, KAROO, KAROO));
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    expect(bot(h, 1)).toEqual({ type: "pass_counter" });
  });

  it("blocks with a Blocker, however weak, to stay off zero Life (#631)", () => {
    const h = underAttack(1, (x) => x.field(1, WEAK_BLOCKER));
    expect(bot(h, 1)).toEqual({ type: "declare_block", blockerId: h.state.players[1].characters[0]!.id });
  });

  it("does not sacrifice a weak Blocker for a hit at high Life (#631)", () => {
    const h = underAttack(4, (x) => x.field(1, WEAK_BLOCKER));
    expect(bot(h, 1)).toEqual({ type: "pass_block" });
  });

  it("blocks at high Life when the Blocker survives the attack (#631)", () => {
    const h = underAttack(4, (x) => x.field(1, WEAK_BLOCKER, STRONG_BLOCKER));
    expect(bot(h, 1)).toEqual({ type: "declare_block", blockerId: h.state.players[1].characters[1]!.id });
  });
});

describe("bot main phase (#631)", () => {
  it("attacks the opposing Leader when its power connects (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 0);
    expect(bot(h, 0)).toEqual({ type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
  });

  it("powers its Leader up with DON!! to reach a stronger Leader, then attacks (#631)", () => {
    const h = new Harness({ leaders: [L, STRONG_LEADER] }); // 5000 vs 6000
    h.don(0, 1);
    const give = bot(h, 0);
    expect(give).toMatchObject({ type: "give_don", targetId: h.state.players[0].leader.id });
    h.act(0, give!);
    expect(bot(h, 0)).toEqual({ type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
  });

  it("ends its turn instead of attacking a Leader it cannot beat (#631)", () => {
    const h = new Harness({ leaders: [L, STRONG_LEADER] });
    h.don(0, 0);
    expect(bot(h, 0)).toEqual({ type: "end_turn" });
  });

  it("K.O.s a strong rested Character rather than hitting a high-Life Leader (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    const [big] = h.field(1, BIG_COUNTER);
    big!.rested = true;
    h.don(0, 0);
    expect(bot(h, 0)).toEqual({ type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "character", instanceId: big!.id } });
  });

  it("plays the most expensive card that fits its DON!! (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.hand(0, KAROO, BIG_COUNTER, STRONG_BLOCKER);
    h.don(0, 5);
    expect(bot(h, 0)).toEqual({ type: "play_card", handIndex: 1 });
  });

  it("targets the opponent's strongest eligible Character with a K.O. effect (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.hand(0, KO_EVENT);
    h.field(1, KAROO, WEAK_BLOCKER);
    h.don(0, 3);
    h.play(0, KO_EVENT);
    const answer = bot(h, 0) as Extract<Intent, { type: "resolve_pending_choice" }>;
    const request = h.choice!.request!;
    if (request.type !== "select") throw new Error("expected a select");
    const blockerOption = request.options.find((o) => o.defId === WEAK_BLOCKER)!;
    expect(answer.selectedOptionIds).toEqual([blockerOption.id]);
    expect(applyIntent(h.state, answer, { seat: 0 }).ok).toBe(true);
  });
});

describe("bot redirects an attack with a Leader's [On Your Opponent's Attack] effect (#1169)", () => {
  /** Seat 0's Leader attacks Teach (seat 1); returns the bot's (seat 1) answer to the redirect select. */
  function redirectAnswer(field: string[]) {
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    const cards = field.length ? h.field(1, ...field) : [];
    h.hand(1, "ST01-014");
    h.attack(h.state.players[0].leader, "leader");
    h.accept(1).forced();
    const r = h.choice!.request!;
    if (r.type !== "select") throw new Error("expected a select");
    const answer = bot(h, 1) as Extract<Intent, { type: "resolve_pending_choice" }>;
    const chosen = r.options.find((o) => o.id === answer.selectedOptionIds![0])!;
    return { chosen, cards, h, answer };
  }

  it("bot redirects Teach's attack to a Blackbeard Pirates Character, not the Leader already attacked (#1169)", () => {
    const { chosen, cards, h, answer } = redirectAnswer(["OP09-095"]);
    expect(chosen.instanceId).toBe(cards[0]!.id);
    expect(applyIntent(h.state, answer, { seat: 1 }).ok).toBe(true);
  });

  it("bot prefers a redirect target that survives the attack (#1169)", () => {
    // Laffitte (1000) would be the cheapest to lose, but the 5000 attacker only trades with the 5000 Character.
    const { chosen, cards } = redirectAnswer(["OP09-095", "OP09-086"]);
    expect(chosen.instanceId).toBe(cards[1]!.id);
  });

  it("bot moves an attack on a Character off that Character, even when it is the one that survives (#1169)", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    const [strong, weak] = h.field(1, "OP09-086", "OP09-095");
    strong!.rested = true;
    h.hand(1, "ST01-014");
    h.attack(h.state.players[0].leader, strong!);
    h.accept(1).forced();
    const r = h.choice!.request!;
    if (r.type !== "select") throw new Error("expected a select");
    const answer = bot(h, 1) as Extract<Intent, { type: "resolve_pending_choice" }>;
    expect(r.options.find((o) => o.id === answer.selectedOptionIds![0])!.instanceId).toBe(weak!.id);
  });

  it("bot declines a redirect cost when nothing else could be the target (#1169)", () => {
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    h.hand(1, "ST01-014");
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice?.request?.type).toBe("confirm");
    expect(bot(h, 1)).toEqual({ type: "resolve_pending_choice", accept: false });
  });
});

describe("bots count a Character's [On K.O.] when choosing which one to lose (#1172)", () => {
  /** Seat 0 (the bot) plays EB05-048, whose cost K.O.s one of its {Baroque Works} Characters; returns the card it gives up. */
  function koCostPick(field: string[]) {
    const h = new Harness({ leaders: [L, L] });
    const cards = h.field(0, ...field);
    h.hand(0, "EB05-048");
    h.don(0, 3);
    h.play(0, "EB05-048");
    if (h.choice!.request?.type !== "select") h.accept();
    const r = h.choice!.request!;
    if (r.type !== "select") throw new Error("expected a select");
    const answer = bot(h, 0) as Extract<Intent, { type: "resolve_pending_choice" }>;
    const chosen = r.options.find((o) => o.id === answer.selectedOptionIds![0])!;
    return { chosen, cards, h, answer, prompt: h.choice!.prompt };
  }

  it("bot gives up the Character with [On K.O.] when a cost K.O.s one of its own, over an equal one without (#1172)", () => {
    // Both are worth 5 (cost 3, 4000); OP01-080 draws a card when K.O.'d and sits second so option order cannot pick it by accident.
    const { chosen, cards, h, answer, prompt } = koCostPick(["OP01-084", "OP01-080"]);
    expect(prompt).toMatch(/\bto K\.O\./);
    expect(chosen.instanceId).toBe(cards[1]!.id);
    expect(applyIntent(h.state, answer, { seat: 0 }).ok).toBe(true);
  });

  it("bot keeps the plain Character over a dearer one whose [On K.O.] pays it back when it must give one up (#1172)", () => {
    // Taking OP01-080 (5) minus its bonus (2) = 3 beats OP01-085 (3.5, [On Play] only); by board value alone OP01-085 would go.
    const { chosen, cards } = koCostPick(["OP01-085", "OP01-080"]);
    expect(chosen.instanceId).toBe(cards[1]!.id);
  });

  it("an [Opponent's Turn] [On K.O.] counts for the bot on the opponent's turn only (#1172)", () => {
    const h = new Harness({ leaders: [L, L] });
    const [c] = h.field(1, "OP16-103");
    const value = () => onKoValue(h.view(1), h.view(1).you.characters.find((x) => x.id === c!.id)!);
    h.state.activeSeat = 0;
    expect(value()).toBeGreaterThan(0);
    h.state.activeSeat = 1;
    expect(value()).toBe(0);
  });

  it("a Character whose effects are negated gets no [On K.O.] bonus (#1172)", () => {
    const h = new Harness({ leaders: [L, L] });
    const [c] = h.field(0, "OP01-080");
    const card = h.view(0).you.characters.find((x) => x.id === c!.id)!;
    expect(onKoValue(h.view(0), card)).toBeGreaterThan(0);
    expect(onKoValue(h.view(0), { ...card, statusLabels: [...card.statusLabels, "Effects negated"] })).toBe(0);
  });

  it("a [DON!! x2] [On K.O.] counts only with 2 DON!! attached (#1172)", () => {
    const h = new Harness({ leaders: [L, L] });
    const [c] = h.field(0, "OP14-051");
    const card = h.view(0).you.characters.find((x) => x.id === c!.id)!;
    expect(onKoValue(h.view(0), { ...card, attachedDonCount: 1 })).toBe(0);
    expect(onKoValue(h.view(0), { ...card, attachedDonCount: 2 })).toBeGreaterThan(0);
  });

  it("bot redirects an attack to the Character with [On K.O.] rather than a cheaper one that loses the same way (#1172)", () => {
    // Seat 0's 5000 Leader beats both; Usopp-style OP16-102 (2.3) is dearer than OP09-095 (1.5) but pays back when K.O.'d.
    const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
    const cards = h.field(1, "OP09-095", "OP16-102");
    h.hand(1, "ST01-014");
    h.attack(h.state.players[0].leader, "leader");
    h.accept(1).forced();
    const r = h.choice!.request!;
    if (r.type !== "select") throw new Error("expected a select");
    const answer = bot(h, 1) as Extract<Intent, { type: "resolve_pending_choice" }>;
    expect(r.options.find((o) => o.id === answer.selectedOptionIds![0])!.instanceId).toBe(cards[1]!.id);
  });
});

describe("self-play recorder (#631)", () => {
  it("a saved replay re-runs to the same winner and records how it ended (#631)", () => {
    for (const seed of [11, 12, 13]) {
      const [a, b] = decks(seed);
      const game = playBotGame({ seed, players: [a, b], levels: ["normal", "normal"] });
      expect(game.winner).not.toBeNull();
      const replayed = replayMatch(JSON.parse(JSON.stringify(game.replay)));
      expect(replayed.winner).toBe(game.winner);
      expect(game.replay.end).toEqual({ winner: game.winner, reason: replayed.winReason });
    }
  }, 60_000);
});

describe("bot goes for lethal on board (#1192)", () => {
  const KAWAMATSU = "OP12-023"; // 6000
  const ZORO = "OP01-025"; // 5000
  const NEWGATE = "ST30-003"; // cost 8, 6000: worth more than a Leader hit (11 vs 10) once rested
  const JOZU = "OP16-007"; // 8000 [Blocker]
  /** Seat 0 (Leader 5000 + `mine`) attacks seat 1, which has 2 Life, a rested Newgate and `theirs` besides. */
  function board(mine: string[], theirs: string[]) {
    const h = new Harness({ leaders: [L, L] });
    h.clearHands();
    h.don(0, 0);
    h.field(0, ...mine);
    h.life(1, FILLER, FILLER);
    const [rested] = h.field(1, NEWGATE, ...theirs);
    rested!.rested = true;
    return h;
  }
  const target = (h: Harness) => {
    const move = chooseBotIntent(h.view(0), { level: "normal", rng: createSeededRng(1) });
    return move?.type === "declare_attack" ? move.target.kind : move?.type;
  };

  it("Normal attacks the Leader when its attackers outnumber the opponent's Life and active Blockers, instead of K.O.ing rested Characters (#1192)", () => {
    expect(target(board([KAWAMATSU, ZORO], []))).toBe("leader"); // Leader + 2 Characters vs 2 Life
    expect(target(board([KAWAMATSU, ZORO, ZORO], [JOZU]))).toBe("leader"); // 4 attackers vs 2 Life + 1 active Blocker
  });

  it("Normal still K.O.s the rested Character when one attacker is short of lethal or a Blocker stops the count (#1192)", () => {
    expect(target(board([KAWAMATSU], []))).toBe("character"); // 2 attackers vs 2 Life
    expect(target(board([KAWAMATSU, ZORO], [JOZU]))).toBe("character"); // 3 attackers vs 2 Life + 1 active Blocker
  });
});
