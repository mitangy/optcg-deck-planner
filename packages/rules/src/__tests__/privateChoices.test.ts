import { describe, expect, it } from "vitest";
import { applyIntent, createMatch, getPlayerView, getSpectatorView, listLegalIntents, skipMulligans } from "../engine.js";
import { MATCH_REPLAY_SCHEMA, replayMatch, type MatchReplay } from "../matchReplay.js";
import { projectGameEvents } from "../engine/views.js";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import { createSeededRng } from "../rng.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { GameEvent, Intent, Seat } from "../types.js";

// What the opponent of the choosing seat is shown must not depend on the hidden cards (#369).

const TRIGGER_CARD = "ST01-014";
const KAROO = "ST01-003"; // red, 1 cost
const VIVI = "ST01-009"; // red, 2 cost
const MOHJI = "OP02-060"; // blue, 1 cost
const ACCEPT: Intent = { type: "resolve_pending_choice", accept: true };
const DECLINE: Intent = { type: "resolve_pending_choice", accept: false };

/** Everything seat `viewer` can see of the match right now. */
function seen(h: Harness, viewer: Seat) {
  return { player: getPlayerView(h.state, viewer), spectator: getSpectatorView(h.state, viewer), legal: listLegalIntents(h.state, viewer) };
}

function step(h: Harness, seat: Seat, intent: Intent): GameEvent[] {
  const r = h.try(seat, intent);
  if (!r.ok) throw new Error(`${intent.type} rejected: ${r.error?.message}`);
  h.state = r.state;
  return r.events;
}

/** OP16-080 Teach: "You may trash 1 card with a [Trigger] from your hand" when attacked. Seat 1 owns it. */
function teachAttacked(hand: string[], opts: { legacy?: boolean } = {}) {
  const h = new Harness({ leaders: ["ST01-001", "OP16-080"] });
  if (opts.legacy) delete h.state.privateChoicesV2;
  h.hand(1, ...hand);
  const events = step(h, 0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
  return { h, events };
}

describe("optional costs that depend on hidden cards are always asked (#369)", () => {
  it("the opponent sees the same prompt, events and views whether or not the cost can be paid (#369)", () => {
    const can = teachAttacked([TRIGGER_CARD]);
    const cannot = teachAttacked([FILLER]);
    expect(can.h.choice).toBeDefined();
    expect(cannot.h.choice).toBeDefined();
    expect(projectGameEvents(cannot.events, 0)).toEqual(projectGameEvents(can.events, 0));
    expect(seen(cannot.h, 0)).toEqual(seen(can.h, 0));
    expect(getPlayerView(cannot.h.state, 0).pendingChoices[0]).not.toHaveProperty("unpayable");
    // Declining looks the same too.
    const declineCan = step(can.h, 1, DECLINE);
    const declineCannot = step(cannot.h, 1, DECLINE);
    expect(projectGameEvents(declineCannot, 0)).toEqual(projectGameEvents(declineCan, 0));
    expect(seen(cannot.h, 0)).toEqual(seen(can.h, 0));
  });

  it("only the owner is told the cost cannot be paid, and only declining is legal (#369)", () => {
    const can = teachAttacked([TRIGGER_CARD]);
    const cannot = teachAttacked([FILLER]);
    expect(getPlayerView(cannot.h.state, 1).pendingChoices[0]!.unpayable).toBe(true);
    expect(getPlayerView(can.h.state, 1).pendingChoices[0]!.unpayable).toBeUndefined();
    expect(cannot.h.legal(1)).toEqual([DECLINE]);
    expect(can.h.legal(1)).toEqual([ACCEPT, DECLINE]);
    const bad = cannot.h.try(1, ACCEPT);
    expect(bad.ok).toBe(false);
    expect(bad.error?.message).toBe("You cannot pay this cost");
    expect(cannot.h.state.players[1].hand.map((c) => c.defId)).toEqual([FILLER]);
  });

  it("without privateChoicesV2 an unpayable cost is still declined silently (#369)", () => {
    const { h } = teachAttacked([FILLER], { legacy: true });
    expect(h.choice).toBeUndefined();
    expect(h.state.phase).toBe("block");
    expect(teachAttacked([TRIGGER_CARD], { legacy: true }).h.choice).toBeDefined();
  });

  it("a cost that depends only on public information keeps the silent decline (#369)", () => {
    // OP01-011 Gordon: "place 1 card from your hand at the bottom of your deck". Hand size is public.
    const h = new Harness();
    h.hand(0, "OP01-011");
    h.don(0, 2);
    h.play(0, "OP01-011");
    expect(h.choice).toBeUndefined();
  });
});

describe("selects from a hidden zone are always asked (#369)", () => {
  /** After accepting Teach's cost, seat 1 picks a [Trigger] card to trash from a hand of two cards. */
  function afterAccept(hand: string[], opts: { legacy?: boolean } = {}) {
    const { h } = teachAttacked(hand, opts);
    const events = step(h, 1, ACCEPT);
    return { h, events };
  }

  it("a forced pick looks the same to the opponent as a real choice (#369)", () => {
    const forced = afterAccept([TRIGGER_CARD, FILLER]);
    const real = afterAccept([TRIGGER_CARD, TRIGGER_CARD]);
    const choice = forced.h.choice!;
    expect(choice).toMatchObject({ seat: 1, privateToSeat: 1 });
    expect(choice.request).toMatchObject({ type: "select", min: 1, max: 1 });
    expect(projectGameEvents(forced.events, 0)).toEqual(projectGameEvents(real.events, 0));
    expect(seen(forced.h, 0)).toEqual(seen(real.h, 0));
    expect(getPlayerView(forced.h.state, 0).pendingChoices[0]!.request).toEqual({ type: "select", min: 0, max: 0, options: [] });
    // The owner sees the real options: one candidate against two.
    expect((getPlayerView(forced.h.state, 1).pendingChoices[0]!.request as { options: unknown[] }).options).toHaveLength(1);
    expect((getPlayerView(real.h.state, 1).pendingChoices[0]!.request as { options: unknown[] }).options).toHaveLength(2);
    // Answering the forced one trashes the only candidate.
    forced.h.forced();
    expect(forced.h.state.players[1].trash).toEqual([TRIGGER_CARD]);
    expect(forced.h.state.players[1].hand.map((c) => c.defId)).toEqual([FILLER]);
  });

  it("without privateChoicesV2 a forced pick is bound without a prompt (#369)", () => {
    const { h } = afterAccept([TRIGGER_CARD, FILLER], { legacy: true });
    expect(h.state.players[1].trash).toEqual([TRIGGER_CARD]);
    expect(h.choice?.request?.type).not.toBe("select");
  });

  // EB01-020 Chambres: return 1 of your Characters, then play up to 1 Character from hand of a different color.
  function chambres(otherHandCard: string, opts: { legacy?: boolean } = {}) {
    const h = new Harness();
    if (opts.legacy) delete h.state.privateChoicesV2;
    h.hand(0, "EB01-020", otherHandCard);
    h.field(0, KAROO);
    h.don(0, 1);
    const events = step(h, 0, { type: "play_card", handIndex: 0 });
    return { h, events };
  }

  it("a pick with no candidates in hand is asked, and looks the same to the opponent as one with a candidate (#369)", () => {
    const none = chambres(VIVI); // red like the returned Karoo: nothing to play
    const some = chambres(MOHJI); // blue: one candidate
    const choice = none.h.choice!;
    expect(choice).toMatchObject({ seat: 0, privateToSeat: 0 });
    expect(choice.request).toMatchObject({ type: "select", min: 0, max: 0, options: [] });
    expect(none.h.legal(0)).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: [] }]);
    expect((some.h.choice!.request as { options: unknown[] }).options).toHaveLength(1);
    expect(projectGameEvents(none.events, 1)).toEqual(projectGameEvents(some.events, 1));
    expect(seen(none.h, 1)).toEqual(seen(some.h, 1));
    // Confirming "none" plays nothing and ends the effect.
    none.h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [] });
    expect(none.h.choice).toBeUndefined();
    expect(none.h.state.players[0].characters).toEqual([]);
    expect(none.h.state.players[0].hand.map((c) => c.defId).sort()).toEqual([KAROO, VIVI].sort());
  });

  it("without privateChoicesV2 a pick with no candidates is skipped (#369)", () => {
    const { h } = chambres(VIVI, { legacy: true });
    expect(h.choice).toBeUndefined();
  });
});

describe("deck instance ids carry no information (#369)", () => {
  // Grouped like the client's decklist: four copies of each card in a row.
  const grouped = Array.from({ length: 10 }, (_, i) => `ST01-0${String(3 + i).padStart(2, "0")}`).flatMap((id) => [id, id, id, id]);
  const players = (): [{ leaderId: string; deck: string[] }, { leaderId: string; deck: string[] }] => [
    { leaderId: DEFAULT_LEADER_ID, deck: [...grouped] },
    { leaderId: DEFAULT_LEADER_ID, deck: [...grouped] },
  ];
  const idsByCard = (seed: number, v2: boolean, seat: Seat) => {
    const state = createMatch({ seed, players: players(), ...(v2 ? {} : { privateChoicesV2: false }) });
    const p = state.players[seat];
    const all = [...p.hand.map((c) => [c.defId, c.id] as const), ...p.deck.map((d, i) => [d, p.zoneInstanceIds.deck[i]!] as const), ...p.life.map((d, i) => [d, p.zoneInstanceIds.life[i]!] as const)];
    const out = new Map<string, number[]>();
    for (const [defId, id] of all) out.set(defId, [...(out.get(defId) ?? []), Number(id.split("_")[1])].sort((a, b) => a - b));
    return out;
  };

  it("the ids of one card's copies do not form a run that gives away the copy count (#369)", () => {
    for (const seed of [1, 2, 3]) {
      for (const seat of [0, 1] as Seat[]) {
        for (const ids of idsByCard(seed, true, seat).values()) expect(ids[ids.length - 1]! - ids[0]!).toBeGreaterThan(ids.length - 1);
      }
    }
    // Before the flag the copies were consecutive: the very thing being hidden.
    for (const ids of idsByCard(1, false, 0).values()) expect(ids[ids.length - 1]! - ids[0]!).toBe(ids.length - 1);
  });

  it("the ids are the same set and the same for the same seed, so replays stay deterministic (#369)", () => {
    const a = createMatch({ seed: 4, players: players() });
    const b = createMatch({ seed: 4, players: players() });
    const legacy = createMatch({ seed: 4, players: players(), privateChoicesV2: false });
    expect(a.players[0].zoneInstanceIds).toEqual(b.players[0].zoneInstanceIds);
    expect(a.players[0].hand.map((c) => c.id)).toEqual(b.players[0].hand.map((c) => c.id));
    const idSet = (s: typeof a) => [...s.players[1].zoneInstanceIds.deck, ...s.players[1].hand.map((c) => c.id), ...s.players[1].zoneInstanceIds.life].sort();
    expect(idSet(a)).toEqual(idSet(legacy));
    // Same cards in the same places: only the ids moved.
    expect(a.players[0].hand.map((c) => c.defId)).toEqual(legacy.players[0].hand.map((c) => c.defId));
    expect(a.rng).toEqual(legacy.rng);
  });
});

describe("privateChoicesV2 flag (#369)", () => {
  const players: MatchReplay["players"] = [{ leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }, { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }];

  it("createMatch defaults to private choices and can opt out (#369)", () => {
    expect(createMatch({ seed: 1, players }).privateChoicesV2).toBe(true);
    expect(createMatch({ seed: 1, players, privateChoicesV2: false }).privateChoicesV2).toBeFalsy();
  });

  it("the ids follow neither the deck's shuffled draw order nor its decklist order (#369)", () => {
    for (const seed of [1, 2, 3]) {
      const p = createMatch({ seed, players }).players[0];
      const seq = [...p.hand.map((c) => c.id), ...p.zoneInstanceIds.deck].map((id) => Number(id.split("_")[1]));
      expect(seq).not.toEqual([...seq].sort((a, b) => a - b));
      expect(seq).not.toEqual([...seq].sort((a, b) => b - a));
    }
  });

  it("replayMatch replays an old recording (no flag) with legacy ids and a new one with permuted ids (#369)", () => {
    const seed = 17;
    const record = (privateChoicesV2: boolean): MatchReplay => {
      const rng = createSeededRng(seed);
      let state = skipMulligans(createMatch({ seed, firstSeat: 0, privateChoicesV2, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }), rng);
      const intents: MatchReplay["intents"] = [];
      for (let i = 0; i < 200; i++) {
        const seat = ([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0);
        if (seat === undefined) break;
        const legal = listLegalIntents(state, seat);
        const leaderId = state.players[seat].leader.id;
        const intent =
          legal.find((x) => x.type === "play_card") ??
          legal.find((x) => x.type === "declare_attack" && x.attackerId !== leaderId) ??
          legal.find((x) => x.type.startsWith("pass")) ??
          legal.find((x) => x.type === "end_turn") ??
          legal[legal.length - 1]!;
        const r = applyIntent(state, intent, { seat, rng });
        if (!r.ok) throw new Error(r.error?.message);
        state = r.state;
        intents.push({ seat, intent });
      }
      const base: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, lifeCheckEveryHit: true, players, intents };
      return privateChoicesV2 ? { ...base, privateChoicesV2 } : base;
    };
    const legacy = record(false);
    const modern = record(true);
    // The recorded moves name Characters by instance id, so the flag decides whether they replay.
    expect(modern.intents.some((x) => x.intent.type === "declare_attack" && x.intent.attackerId.startsWith("card_"))).toBe(true);
    expect(replayMatch(legacy).privateChoicesV2).toBeFalsy();
    expect(replayMatch(modern).privateChoicesV2).toBe(true);
    expect(() => replayMatch({ ...modern, privateChoicesV2: undefined })).toThrow(/Replay diverged/);
    expect(() => replayMatch({ ...legacy, privateChoicesV2: true })).toThrow(/Replay diverged/);
  });
});

describe("start-of-game Stage prompt (#369)", () => {
  const IMU = "OP13-079";
  const MARY_GEOISE = "OP05-097";
  const EMPTY_THRONE = "OP13-099";
  const imu = (stages: string[], flag = true) => createMatch({
    seed: 7, firstSeat: 0, ...(flag ? {} : { privateChoicesV2: false }),
    players: [{ leaderId: IMU, deck: [...buildTestDeck(20), ...stages] }, { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }],
  });

  it("a single eligible Stage is asked too, and looks the same to the opponent as two (#369)", () => {
    const one = imu([EMPTY_THRONE, EMPTY_THRONE, EMPTY_THRONE, EMPTY_THRONE]);
    const two = imu([MARY_GEOISE, MARY_GEOISE, EMPTY_THRONE, EMPTY_THRONE]);
    expect(one.pendingChoices).toHaveLength(1);
    const request = one.pendingChoices[0]!.request;
    expect(request?.type === "select" && request.options.map((o) => o.defId)).toEqual([EMPTY_THRONE]);
    expect(one.players[0].stage).toBeNull();
    expect(getPlayerView(one, 1).pendingChoices).toEqual(getPlayerView(two, 1).pendingChoices);
    expect(getSpectatorView(one, 1).pendingChoices).toEqual(getSpectatorView(two, 1).pendingChoices);
    expect(getPlayerView(one, 1).pendingChoices[0]!.request).toEqual({ type: "select", min: 0, max: 0, options: [] });
  });

  it("answering the single-Stage prompt plays that Stage and draws the opening hand (#369)", () => {
    let state = imu([EMPTY_THRONE, EMPTY_THRONE, EMPTY_THRONE, EMPTY_THRONE]);
    const choice = state.pendingChoices[0]!;
    const optionId = choice.request?.type === "select" ? choice.request.options[0]!.id : "";
    const r = applyIntent(state, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [optionId] }, { seat: 0, rng: createSeededRng(7) });
    expect(r.ok, r.error?.message).toBe(true);
    state = r.state;
    expect(state.players[0].stage?.defId).toBe(EMPTY_THRONE);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.pendingChoices).toHaveLength(0);
  });

  it("without privateChoicesV2 the only eligible Stage is played without a prompt (#369)", () => {
    const state = imu([EMPTY_THRONE, EMPTY_THRONE, EMPTY_THRONE, EMPTY_THRONE], false);
    expect(state.pendingChoices).toHaveLength(0);
    expect(state.players[0].stage?.defId).toBe(EMPTY_THRONE);
  });
});
