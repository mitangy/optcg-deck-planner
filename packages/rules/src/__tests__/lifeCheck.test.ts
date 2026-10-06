import { describe, expect, it } from "vitest";
import { applyIntent, createMatch, getPlayerView, getSpectatorView, listLegalIntents, projectGameEvents, skipMulligans } from "../engine.js";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import { describeEvents } from "../describeEvents.js";
import { MATCH_REPLAY_SCHEMA, replayMatch, type MatchReplay } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { GameEvent, Intent, Seat } from "../types.js";

const TRIGGER_CARD = "ST01-014";

/** Attacker's leader hits seat 1's Leader; returns what each step emitted. The Life check is left open. */
function hit(lifeCard: string, opts: { legacy?: boolean } = {}) {
  const h = new Harness();
  if (opts.legacy) delete h.state.lifeCheckEveryHit;
  h.life(1, lifeCard, FILLER);
  h.attack(h.state.players[0].leader, "leader");
  h.act(1, { type: "pass_block" });
  const r = h.try(1, { type: "pass_counter" });
  if (!r.ok) throw new Error(r.error?.message);
  h.state = r.state;
  return { h, events: r.events };
}

describe("every Life hit is a private Life check (#352)", () => {
  it("a Life card without [Trigger] opens a life_trigger check where only declining is legal (#352)", () => {
    const { h, events } = hit(FILLER);
    const choice = h.choice!;
    expect(choice).toMatchObject({ kind: "life_trigger", seat: 1, noTrigger: true, optional: true, privateToSeat: 1, hideCardDefFromOthers: true });
    expect(choice.prompt).toContain("has no [Trigger]");
    expect(h.state.players[1].life.length).toBe(2);
    expect(h.state.players[1].hand.length).toBe(0);
    expect(events).toContainEqual({ type: "life_taken", seat: 1, defId: FILLER, toHand: false });
    expect(h.legal(1)).toEqual([{ type: "resolve_pending_choice", accept: false }]);
    const bad = h.try(1, { type: "resolve_pending_choice", accept: true });
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("INVALID_CHOICE");
    expect(h.state.players[1].life.length).toBe(2);
    h.decline(1);
    expect(h.state.players[1].life).toEqual([FILLER]);
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual([FILLER]);
    expect(h.state.phase).toBe("main");
  });

  it("a [Trigger] Life card still offers both answers and is not marked noTrigger (#352)", () => {
    const { h } = hit(TRIGGER_CARD);
    expect(h.choice?.kind).toBe("life_trigger");
    expect(h.choice?.noTrigger).toBeUndefined();
    expect(h.legal(1)).toEqual([{ type: "resolve_pending_choice", accept: true }, { type: "resolve_pending_choice", accept: false }]);
  });

  it("effect damage opens the same Life check for a card without [Trigger] (#352)", () => {
    const h = new Harness();
    const [robin] = h.field(1, "EB03-055");
    robin!.rested = true;
    h.life(0, FILLER, FILLER);
    h.attach(0, h.state.players[0].leader, 4);
    h.attack(h.state.players[0].leader, robin!).passBattle();
    h.accept(1);
    expect(h.choice).toMatchObject({ kind: "life_trigger", seat: 0, noTrigger: true });
    expect(h.legal(0)).toEqual([{ type: "resolve_pending_choice", accept: false }]);
    expect(h.state.players[0].hand.length).toBe(0);
    h.decline(0);
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual([FILLER]);
  });

  it("Double Attack's second hit waits for the first Life check (#352)", () => {
    const h = new Harness();
    const [p028] = h.field(0, "P-028");
    h.life(1, FILLER, FILLER, FILLER);
    h.attack(p028!, "leader").passBattle({ resolveLifeChecks: false });
    expect(h.state.players[1].life.length).toBe(3);
    h.decline(1);
    expect(h.choice?.kind).toBe("life_trigger");
    expect(h.state.players[1].life.length).toBe(2);
    h.decline(1);
    expect(h.state.players[1].life.length).toBe(1);
    expect(h.state.players[1].hand.length).toBe(2);
  });

  it("the opponent's events and views are identical whether or not the Life card has a [Trigger] (#352)", () => {
    const a = hit(TRIGGER_CARD);
    const b = hit(FILLER);
    const opponent: Seat = 0;
    expect(projectGameEvents(a.events, opponent)).toEqual(projectGameEvents(b.events, opponent));
    expect(a.events.map((e) => e.type)).not.toContain("trigger_available");
    for (const view of [(h: Harness) => getPlayerView(h.state, opponent), (h: Harness) => getSpectatorView(h.state, opponent)]) {
      const va = view(a.h);
      const vb = view(b.h);
      expect(va.pendingChoices).toEqual(vb.pendingChoices);
      expect(va.pendingChoices[0]).not.toHaveProperty("noTrigger");
      expect(va.pendingTrigger).toEqual(vb.pendingTrigger);
      expect(va.legalIntents).toEqual(vb.legalIntents);
    }
    // The owner alone is told.
    expect(getPlayerView(b.h.state, 1).pendingChoices[0]!.noTrigger).toBe(true);
    expect(getPlayerView(a.h.state, 1).pendingChoices[0]!.noTrigger).toBeUndefined();
    // The narration the analyst reads is the same too.
    expect(describeEvents(projectGameEvents(a.events, opponent))).toEqual(describeEvents(projectGameEvents(b.events, opponent)));
    // Declining looks the same too.
    const decline: Intent = { type: "resolve_pending_choice", accept: false };
    const ra = applyIntent(a.h.state, decline, { seat: 1, rng: a.h.rng });
    const rb = applyIntent(b.h.state, decline, { seat: 1, rng: b.h.rng });
    if (!ra.ok || !rb.ok) throw new Error("decline rejected");
    expect(projectGameEvents(ra.events, opponent)).toEqual(projectGameEvents(rb.events, opponent));
    expect(describeEvents(projectGameEvents(ra.events, opponent))).toEqual(describeEvents(projectGameEvents(rb.events, opponent)));
    expect(describeEvents(projectGameEvents(ra.events, opponent))).toContain("Seat 1 adds the Life card to hand");
  });

  it("narration never hints at a Trigger for a hidden Life card, including old logs (#352)", () => {
    expect(describeEvents([{ type: "life_taken", seat: 1, defId: "HIDDEN", toHand: false }, { type: "life_taken", seat: 1, defId: "HIDDEN", toHand: true }]))
      .toEqual(["Seat 1 takes Life", "Seat 1 takes Life"]);
    expect(describeEvents([{ type: "trigger_available", seat: 1, defId: "HIDDEN" }])).toEqual([]);
    expect(describeEvents([{ type: "trigger_resolved", seat: 1, accepted: false }])).toEqual(["Seat 1 adds the Life card to hand"]);
  });
});

describe("games started before the Life check keep the legacy flow (#352)", () => {
  it("without lifeCheckEveryHit a Life card without [Trigger] goes straight to hand (#352)", () => {
    const { h, events } = hit(FILLER, { legacy: true });
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual([FILLER]);
    expect(events).toContainEqual({ type: "life_taken", seat: 1, defId: FILLER, toHand: true });
  });

  it("without lifeCheckEveryHit a [Trigger] card still emits trigger_available (#352)", () => {
    const { events } = hit(TRIGGER_CARD, { legacy: true });
    expect(events.map((e) => e.type)).toContain("trigger_available");
  });

  it("createMatch defaults to the Life check and can opt out (#352)", () => {
    const players: MatchReplay["players"] = [{ leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }, { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }];
    expect(createMatch({ seed: 1, players }).lifeCheckEveryHit).toBe(true);
    expect(createMatch({ seed: 1, players, lifeCheckEveryHit: false }).lifeCheckEveryHit).toBeFalsy();
  });

  it("replayMatch replays an old recording (no flag) without Life checks and a new one with them (#352)", () => {
    const players: MatchReplay["players"] = [{ leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }, { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) }];
    const seed = 17;
    const record = (lifeCheckEveryHit: boolean): MatchReplay => {
      const rng = createSeededRng(seed);
      let state = skipMulligans(createMatch({ seed, firstSeat: 0, lifeCheckEveryHit, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] }), rng);
      const intents: MatchReplay["intents"] = [];
      for (let i = 0; i < 300; i++) {
        const seat = ([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0)!;
        const legal = listLegalIntents(state, seat);
        const intent = legal.find((x) => x.type.includes("attack")) ?? legal.find((x) => x.type.startsWith("pass")) ?? legal.find((x) => x.type === "end_turn") ?? legal[legal.length - 1]!;
        const r = applyIntent(state, intent, { seat, rng });
        if (!r.ok) throw new Error(r.error?.message);
        state = r.state;
        intents.push({ seat, intent });
        if (state.players.some((p) => p.hand.length > 6)) break;
      }
      const base: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed, firstSeat: 0, skipMulligans: true, players, intents };
      return lifeCheckEveryHit ? { ...base, lifeCheckEveryHit } : base;
    };
    const legacy = record(false);
    const modern = record(true);
    const events = (replay: MatchReplay) => { const out: GameEvent[] = []; replayMatch(replay, (s) => out.push(...s.events)); return out; };
    expect(events(legacy).some((e) => e.type === "life_taken" && e.toHand)).toBe(true);
    expect(events(modern).some((e) => e.type === "life_taken" && e.toHand)).toBe(false);
    expect(events(modern).some((e) => e.type === "pending_choice_added" && e.kind === "life_trigger")).toBe(true);
    // The same moves are illegal under the other flow: the recorded flag decides.
    expect(() => replayMatch({ ...modern, lifeCheckEveryHit: undefined })).toThrow(/Replay diverged/);
  });
});
