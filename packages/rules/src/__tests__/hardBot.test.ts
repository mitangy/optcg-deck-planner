import { describe, expect, it } from "vitest";
import { actingSeat, chooseBotIntent, chooseBotIntentFromState, determinize } from "../bot/index.js";
import { assertInvariants, getPlayerView } from "../engine.js";
import { replayMatch } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { emptyTally, playBotGame, runSelfPlay, tallyIntent } from "../sim/selfPlay.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, MatchState, PendingChoice, Seat } from "../types.js";
import metaDecks from "./fixtures/meta-decks.json";

const META = metaDecks as { name: string; leaderId: string; deck: string[] }[];
const PUDDING = "OP08-058"; // [When Attacking] You may turn 2 Life cards face-up: add 1 DON!! rested
const L = "OP01-001"; // Leader, 5000
const STRONG_LEADER = "OP02-001"; // 6000
const RAFFLESIA = "OP01-028"; // Counter Event, cost 1: give 1 of the opponent's Leader or Characters -2000 power this turn
const CHOPPER = "OP04-010"; // cost 3, [On Play] play an {Animal} Character with 3000 power or less from hand
const ANIMAL = "OP17-028"; // cost 4, 3000, {Animal}

/** Fixed knobs that make the search independent of the clock. */
const exact = { level: "hard", budgetMs: Infinity, samples: 2, maxEvals: 10 } as const;
const rng = (seed = 7) => createSeededRng(seed);

/** Positions (state + the seat to move) from a normal-vs-normal game on two meta decks. */
function positions(seed: number, every: number): { state: MatchState; seat: Seat }[] {
  const game = playBotGame({ seed, players: [META[seed % META.length]!, META[(seed * 5 + 3) % META.length]!], levels: ["normal", "normal"] });
  const out: { state: MatchState; seat: Seat }[] = [];
  let n = 0;
  replayMatch(game.replay, (step) => {
    n += 1;
    if (n % every === 0 && step.state.winner === null && step.state.phase !== "mulligan") out.push({ state: step.state, seat: actingSeat(step.state) });
  });
  return out;
}

/** The same match with every card `seat` cannot see dealt differently (written without `determinize`, on purpose). */
function hiddenDealtDifferently(state: MatchState, seat: Seat, seed: number): MatchState {
  const copy = structuredClone(state);
  const r = createSeededRng(seed);
  for (const s of [0, 1] as Seat[]) {
    const p = copy.players[s];
    const slots: { get(): string; set(d: string): void }[] = [];
    p.deck.forEach((_, i) => slots.push({ get: () => p.deck[i]!, set: (d) => { p.deck[i] = d; } }));
    p.life.forEach((_, i) => { if (!p.faceUpLife[i]) slots.push({ get: () => p.life[i]!, set: (d) => { p.life[i] = d; } }); });
    if (s !== seat) for (const c of p.hand) if (!(p.revealedHandIds ?? []).includes(c.id)) slots.push({ get: () => c.defId, set: (d) => { c.defId = d; } });
    const pool = r.shuffle(slots.map((x) => x.get()));
    slots.forEach((x, i) => x.set(pool[i]!));
  }
  return copy;
}

const ownsPendingChoice = (state: MatchState, seat: Seat): boolean => state.pendingChoices.some((c) => c.seat === seat || c.privateToSeat === seat);

describe("hard bot: determinization (#631)", () => {
  it("keeps zone sizes, instance ids, boards, trash, face-up Life and the seat's own hand, and moves only hidden cards (#631)", () => {
    let movedOpponent = 0;
    let movedOwnDeck = 0;
    for (const seed of [1, 2, 3]) {
      for (const { state, seat } of positions(seed, 9)) {
        const opp: Seat = seat === 0 ? 1 : 0;
        const d = determinize(state, seat, rng(seed));
        assertInvariants(d);
        for (const s of [0, 1] as Seat[]) {
          const a = state.players[s];
          const b = d.players[s];
          expect(b.zoneInstanceIds).toEqual(a.zoneInstanceIds);
          expect(b.hand.map((c) => c.id)).toEqual(a.hand.map((c) => c.id));
          expect(b.characters).toEqual(a.characters);
          expect(b.trash).toEqual(a.trash);
          expect(b.faceUpLife).toEqual(a.faceUpLife);
          a.life.forEach((defId, i) => { if (a.faceUpLife[i]) expect(b.life[i]).toBe(defId); });
        }
        expect(d.players[seat].hand).toEqual(state.players[seat].hand);
        const pool = (s: Seat, st: MatchState) => [...st.players[s].deck, ...st.players[s].life.filter((_, i) => !st.players[s].faceUpLife[i])].sort();
        expect(pool(seat, d)).toEqual(pool(seat, state));
        const oppPool = (st: MatchState) => [...st.players[opp].hand.map((c) => c.defId), ...pool(opp, st)].sort();
        expect(oppPool(d)).toEqual(oppPool(state));
        if (d.players[opp].hand.some((c, i) => c.defId !== state.players[opp].hand[i]!.defId)) movedOpponent += 1;
        if (d.players[seat].deck.some((x, i) => x !== state.players[seat].deck[i])) movedOwnDeck += 1;
      }
    }
    // The reshuffle really happens.
    expect(movedOpponent).toBeGreaterThan(5);
    expect(movedOwnDeck).toBeGreaterThan(5);
  }, 60_000);

  it("leaves face-up Life, cards the opponent revealed from hand, and cards the seat's own pending choice points at (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    const names = ["OP01-006", "OP01-007", "OP01-008", "OP01-009", "OP01-010", "OP01-011"];
    h.hand(1, ...names.slice(0, 3));
    h.life(1, ...names.slice(3, 6));
    const opp = h.state.players[1];
    opp.faceUpLife = [true, false, false];
    opp.revealedHandIds = [opp.hand[0]!.id];
    // Fill the opponent's deck with other cards so a reshuffle has somewhere to move things.
    opp.deck = Array.from({ length: 10 }, (_, i) => `OP01-0${20 + i}`);
    opp.zoneInstanceIds.deck = opp.deck.map((_, i) => `od${i}`);
    // The seat is resolving a search that shows its own deck cards od-like ids: pin two of them.
    const own = h.state.players[0];
    own.deck = Array.from({ length: 10 }, (_, i) => `OP02-0${20 + i}`);
    own.zoneInstanceIds.deck = own.deck.map((_, i) => `wd${i}`);
    const choice: PendingChoice = {
      id: "ch1", seat: 0, kind: "effect", cardDefId: FILLER, optional: false, prompt: "Choose", privateToSeat: 0,
      request: { type: "select", min: 0, max: 1, options: [{ id: "o0", defId: own.deck[2]!, zone: "deck", ownerSeat: 0, eligible: true }, { id: "o1", defId: own.deck[5]!, zone: "deck", ownerSeat: 0, eligible: true }] },
      bindings: { o0: "wd2", o1: "wd5" },
    };
    h.state.pendingChoices.push(choice);
    let sawMoved = false;
    for (let seed = 1; seed <= 6; seed += 1) {
      const d = determinize(h.state, 0, rng(seed));
      assertInvariants(d);
      expect(d.players[1].life[0]).toBe(opp.life[0]); // face-up
      expect(d.players[1].hand[0]!.defId).toBe(opp.hand[0]!.defId); // revealed
      expect(d.players[0].deck[2]).toBe(own.deck[2]);
      expect(d.players[0].deck[5]).toBe(own.deck[5]);
      if (d.players[1].hand[1]!.defId !== opp.hand[1]!.defId || d.players[1].deck.some((x, i) => x !== opp.deck[i])) sawMoved = true;
    }
    expect(sawMoved).toBe(true);
  });

  it("makes the same choice when only the cards hidden from the seat differ: opponent hand and deck, own deck order (#631)", () => {
    let compared = 0;
    for (const seed of [4, 5, 6, 7]) {
      for (const { state, seat } of positions(seed, 6)) {
        if (ownsPendingChoice(state, seat)) continue;
        const other = hiddenDealtDifferently(state, seat, seed * 31);
        // Both copies look identical to the seat ...
        expect(getPlayerView(other, seat)).toEqual(getPlayerView(state, seat));
        // ... so its choice must be identical too.
        const a = chooseBotIntentFromState(state, seat, { ...exact, rng: rng() });
        const b = chooseBotIntentFromState(other, seat, { ...exact, rng: rng() });
        expect(b).toEqual(a);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(40);
  }, 120_000);
});

describe("hard bot: lines (#631)", () => {
  it("accepts the Pudding [When Attacking] ramp when it adds a DON!! (#631)", () => {
    const h = new Harness({ leaders: [PUDDING, L] });
    h.don(0, 3);
    expect(h.state.players[0].donDeck.length).toBeGreaterThan(0);
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice).toMatchObject({ seat: 0, kind: "effect", cardDefId: PUDDING });
    expect(chooseBotIntentFromState(h.state, 0, { ...exact, rng: rng() })).toEqual({ type: "resolve_pending_choice", accept: true });
  });

  it("declines the Pudding ramp when no DON!! is left to add, instead of showing two Life cards for nothing (#631)", () => {
    const h = new Harness({ leaders: [PUDDING, L] });
    h.don(0, 10);
    expect(h.state.players[0].donDeck.length).toBe(0);
    h.attack(h.state.players[0].leader, "leader");
    expect(h.choice).toMatchObject({ seat: 0, kind: "effect", cardDefId: PUDDING });
    // Normal says yes to every "may"; hard looks at what the answer buys.
    expect(chooseBotIntent(getPlayerView(h.state, 0), { level: "normal", rng: rng() })).toEqual({ type: "resolve_pending_choice", accept: true });
    expect(chooseBotIntentFromState(h.state, 0, { ...exact, rng: rng() })).toEqual({ type: "resolve_pending_choice", accept: false });
  });

  /** Seat 0's Leader (6000 + 1 DON!! = 7000) attacks seat 1's 5000 Leader, which has no Life left. */
  function lethalAttack(setup: (h: Harness) => void): Harness {
    const h = new Harness({ leaders: [STRONG_LEADER, L] });
    h.life(1);
    h.don(1, 2);
    h.attach(0, h.state.players[0].leader, 1);
    setup(h);
    h.attack(h.state.players[0].leader, "leader");
    h.act(1, { type: "pass_block" });
    return h;
  }

  it("plays a Counter Event that shrinks the attacker, then a Character Counter, to survive lethal (#631)", () => {
    const h = lethalAttack((x) => x.hand(1, FILLER, RAFFLESIA));
    expect(h.state.phase).toBe("counter");
    // Normal sees only the +1000 Counter on the Character, which is not enough, and takes the hit.
    expect(chooseBotIntent(getPlayerView(h.state, 1), { level: "normal", rng: rng() })).toEqual({ type: "pass_counter" });

    const first = chooseBotIntentFromState(h.state, 1, { ...exact, rng: rng() });
    expect(first).toEqual({ type: "counter_event", handIndex: 1 });
    h.act(1, first!);
    // Rafflesia asks for its target before the battle goes on.
    while (h.choice) h.act(1, chooseBotIntentFromState(h.state, 1, { ...exact, rng: rng() })!);
    const second = chooseBotIntentFromState(h.state, 1, { ...exact, rng: rng() });
    expect(second).toMatchObject({ type: "counter_from_hand" });
    h.act(1, second!);
    h.act(1, chooseBotIntentFromState(h.state, 1, { ...exact, rng: rng() })!);
    expect(h.state.winner).toBeNull();
  });

  it("plays Chopper, whose [On Play] puts a 4-cost Character into play for free, instead of paying 4 DON!! for that Character (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 4);
    h.hand(0, ANIMAL, CHOPPER);
    // Normal buys the most expensive card it can pay for.
    const normal = chooseBotIntent(getPlayerView(h.state, 0), { level: "normal", rng: rng() }) as Extract<Intent, { type: "play_card" }>;
    expect(h.state.players[0].hand[normal.handIndex]!.defId).toBe(ANIMAL);
    // Hard sees that Chopper (3 DON!!) brings the {Animal} along.
    const hard = chooseBotIntentFromState(h.state, 0, { ...exact, rng: rng() }) as Extract<Intent, { type: "play_card" }>;
    expect(hard.type).toBe("play_card");
    expect(h.state.players[0].hand[hard.handIndex]!.defId).toBe(CHOPPER);
  });

  it("with no time to search plays exactly what normal plays (#631)", () => {
    let differs = 0;
    let compared = 0;
    for (const seed of [8, 9]) {
      for (const { state, seat } of positions(seed, 5)) {
        const hard = chooseBotIntentFromState(state, seat, { level: "hard", rng: rng(), budgetMs: 0 });
        const normal = chooseBotIntentFromState(state, seat, { level: "normal", rng: rng() });
        if (JSON.stringify(hard) !== JSON.stringify(normal)) differs += 1;
        compared += 1;
        // The same positions with all the time in the world do change some answers, so the clock is what decided above.
        void compared;
      }
    }
    expect(differs).toBe(0);
  }, 60_000);

  it("a search with time to spare changes some of normal's answers (#631)", () => {
    let differs = 0;
    for (const { state, seat } of positions(8, 5)) {
      const hard = chooseBotIntentFromState(state, seat, { ...exact, rng: rng() });
      const normal = chooseBotIntentFromState(state, seat, { level: "normal", rng: rng() });
      if (JSON.stringify(hard) !== JSON.stringify(normal)) differs += 1;
    }
    expect(differs).toBeGreaterThan(0);
  }, 60_000);

  it("easy and normal through chooseBotIntentFromState are the plain view-based bots (#631)", () => {
    for (const { state, seat } of positions(10, 11)) {
      for (const level of ["easy", "normal"] as const) {
        const viaState = chooseBotIntentFromState(state, seat, { level, rng: rng() });
        const viaView = chooseBotIntent(getPlayerView(state, seat), { level, rng: rng() });
        expect(viaState).toEqual(viaView);
      }
    }
  });

  it("answers null when it is not the seat's move (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    expect(chooseBotIntentFromState(h.state, 1, { ...exact, rng: rng() })).toBeNull();
  });
});

describe("hard bot: self-play line tally (#631)", () => {
  it("counts a Character put into play by an effect, not the one played from hand, with the card that did it (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 4);
    h.hand(0, CHOPPER, ANIMAL);
    const before = h.state;
    const handIndex = before.players[0].hand.findIndex((c) => c.defId === CHOPPER);
    const intent: Intent = { type: "play_card", handIndex };
    const result = h.try(0, intent);
    expect(result.ok).toBe(true);
    let state = result.state;
    const events = [...result.events];
    // The On Play asks which {Animal} to play.
    const tally = emptyTally();
    const last: string[] = [];
    tallyIntent(tally, before, 0, intent, result.events, last);
    h.state = state;
    while (h.choice) {
      const answer = chooseBotIntent(getPlayerView(h.state, 0), { level: "normal", rng: rng() })!;
      const r = h.try(0, answer);
      tallyIntent(tally, h.state, 0, answer, r.events, last);
      events.push(...r.events);
      h.state = r.state;
    }
    state = h.state;
    expect(state.players[0].characters.map((c) => c.defId).sort()).toEqual([ANIMAL, CHOPPER].sort());
    expect(tally.cheatOuts).toEqual({ [`${ANIMAL} via ${CHOPPER}`]: 1 });
  });

  it("records the Pudding ramp as an accepted optional effect in a real game (#631)", () => {
    const pudding = META.find((d) => d.leaderId === PUDDING)!;
    const rival = META.find((d) => d.leaderId === "OP17-039")!;
    let accepts = 0;
    for (const seed of [1, 2, 3, 4]) {
      const r = playBotGame({ seed, players: [pudding, rival], levels: ["normal", "normal"] });
      accepts += r.lines[0].optionalAccepts[PUDDING] ?? 0;
      expect(r.lines[1].optionalAccepts[PUDDING] ?? 0).toBe(0);
    }
    expect(accepts).toBeGreaterThan(0);
  }, 60_000);
});

describe("hard bot strength (#631)", () => {
  it("beats normal on the meta decks in a seeded batch with the seats and decks swapped (#631)", () => {
    const s = runSelfPlay({ games: 16, seed: 700, levels: ["hard", "normal"], decks: META, paired: true, budgetMs: Infinity, maxEvals: 12, samples: 2 });
    expect(s.finished).toBe(16);
    expect(s.winsByLevel.hard ?? 0).toBeGreaterThan(s.winsByLevel.normal ?? 0);
  }, 300_000);
});
