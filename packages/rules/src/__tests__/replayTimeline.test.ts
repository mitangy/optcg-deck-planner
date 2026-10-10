import { describe, expect, it } from "vitest";
import { MATCH_REPLAY_SCHEMA, replayMatch, type MatchReplay } from "../matchReplay.js";
import { buildReplayTimeline, getReplayView, projectReplayEvents, timelineStateAt } from "../replayTimeline.js";
import { expandDeck, loadFixture } from "../testing/replay.js";
import type { MatchState, Seat } from "../types.js";

function golden(name = "purple-red-full-game"): MatchReplay {
  const f = loadFixture(name);
  return {
    schema: MATCH_REPLAY_SCHEMA,
    rulesVersion: "test",
    registryHash: "test",
    seed: f.seed,
    firstSeat: f.firstSeat,
    skipMulligans: true,
    lifeCheckEveryHit: true,
    privateChoicesV2: true,
    players: [
      { leaderId: f.players[0].leaderId, deck: expandDeck(f.players[0].deck) },
      { leaderId: f.players[1].leaderId, deck: expandDeck(f.players[1].deck) },
    ],
    intents: f.intents,
  };
}

const handIds = (state: MatchState, seat: Seat) => state.players[seat].hand.map((c) => c.id);

describe("replay timeline", () => {
  it("seeking from a checkpoint rebuilds the same state as replaying straight through, reseeds included (#476)", () => {
    // A reseed off a checkpoint boundary (every = 5), so seeks have to cross it.
    const replay: MatchReplay = { ...golden(), reseeds: [{ atIntent: 7, seed: 424242 }] };
    const straight: MatchState[] = [];
    replayMatch(replay, (s) => straight.push(s.state));
    const t = buildReplayTimeline(replay, { every: 5 });
    expect(t.diverged).toBeUndefined();
    expect(t.steps).toHaveLength(replay.intents.length);
    expect(t.checkpoints).toHaveLength(Math.floor(replay.intents.length / 5) + 1);
    expect(timelineStateAt(t, 0)).toEqual(t.start);
    straight.forEach((expected, i) => {
      expect(timelineStateAt(t, i + 1)).toEqual(expected);
    });
    // The reseed took effect: states after it run on the new seed.
    expect(timelineStateAt(t, 8).rng.seed).toBe(424242);
    expect(timelineStateAt(t, 7).rng.seed).toBe(replay.seed);
    // A state the caller already holds shortens the seek but never changes the answer,
    // and one ahead of the target is ignored.
    for (const step of [3, 9, 13, 23]) {
      const expected = straight[step - 1]!;
      const behind = { step: step - 2, state: straight[step - 3]! };
      expect(timelineStateAt(t, step, behind)).toEqual(expected);
      const ahead = { step: step + 2, state: straight[step + 1]! };
      expect(timelineStateAt(t, step, ahead)).toEqual(expected);
    }
  });

  it("a replay that diverges keeps every step before the bad intent and says where (#476)", () => {
    const replay = golden();
    const bad = 6;
    const wrongSeat = (1 - replay.intents[bad]!.seat) as Seat;
    const broken: MatchReplay = { ...replay, intents: replay.intents.map((x, i) => (i === bad ? { seat: wrongSeat, intent: { type: "end_turn" } } : x)) };
    const t = buildReplayTimeline(broken, { every: 4 });
    expect(t.diverged).toMatchObject({ atIntent: bad, intentType: "end_turn" });
    expect(t.diverged?.message).toMatch(/Replay diverged at intent 6/);
    expect(t.steps).toHaveLength(bad);
    const clean = buildReplayTimeline(replay, { every: 4 });
    expect(t.final).toEqual(timelineStateAt(clean, bad));
    expect(timelineStateAt(t, bad)).toEqual(t.final);
  });

  it("jump to turn lands on the first step of that turn (#476)", () => {
    const t = buildReplayTimeline(golden(), { every: 5 });
    expect(t.turnStarts.length).toBeGreaterThan(3);
    for (const { turn, step } of t.turnStarts) {
      expect(timelineStateAt(t, step).turnNumber).toBe(turn);
      if (step > 0) expect(timelineStateAt(t, step - 1).turnNumber).not.toBe(turn);
    }
  });

  const t = buildReplayTimeline(golden(), { every: 5 });
  const viewer: Seat = 0;
  const midGame = 40;

  it("What I saw never carries the opponent's hand, even with the camera flipped (#476)", () => {
    const state = timelineStateAt(t, midGame);
    const opp = handIds(state, 1);
    expect(opp.length).toBeGreaterThan(0);
    for (const cameraSeat of [0, 1] as Seat[]) {
      const view = getReplayView(state, { cameraSeat, viewerSeat: viewer, revealAll: false });
      const json = JSON.stringify(view);
      for (const id of opp) expect(json).not.toContain(`"${id}"`);
      // The hand keeps its size, face down.
      expect(view.revealedHands[1]).toHaveLength(opp.length);
      expect(view.revealedHands[1].every((c) => c.defId === "HIDDEN")).toBe(true);
      expect(view.revealedHands[0].map((c) => c.id)).toEqual(handIds(state, 0));
      expect(view.cameraSeat).toBe(cameraSeat);
    }
  });

  it("What I saw shows both hands once the game is over, and still hides them one step before (#476)", () => {
    const last = timelineStateAt(t, t.steps.length);
    expect(last.winner).not.toBeNull();
    const over = getReplayView(last, { cameraSeat: 0, viewerSeat: viewer, revealAll: false });
    expect(over.revealedHands[1].map((c) => c.id)).toEqual(handIds(last, 1));
    expect(over.revealedLife).toBeDefined();
    const before = timelineStateAt(t, t.steps.length - 1);
    expect(before.winner).toBeNull();
    const live = getReplayView(before, { cameraSeat: 0, viewerSeat: viewer, revealAll: false });
    expect(live.revealedHands[1].every((c) => c.defId === "HIDDEN")).toBe(true);
    expect(live.revealedLife).toBeUndefined();
  });

  it("Reveal all shows both hands (#476)", () => {
    const state = timelineStateAt(t, midGame);
    const view = getReplayView(state, { cameraSeat: 1, viewerSeat: viewer, revealAll: true });
    expect(view.revealedHands[0].map((c) => c.id)).toEqual(handIds(state, 0));
    expect(view.revealedHands[1].map((c) => c.id)).toEqual(handIds(state, 1));
  });

  it("Reveal all names the opponent's draws; What I saw does not (#476)", () => {
    const step = t.steps.find((s) => s.events.some((e) => e.type === "drew" && e.seat !== viewer && e.defIds?.length));
    expect(step).toBeDefined();
    const drewOf = (revealAll: boolean) => projectReplayEvents(step!.events, viewer, revealAll).find((e) => e.type === "drew" && e.seat !== viewer);
    expect(drewOf(false)).not.toHaveProperty("defIds");
    expect(drewOf(true)).toHaveProperty("defIds");
    // Your own draws are named either way.
    const own = t.steps.find((s) => s.events.some((e) => e.type === "drew" && e.seat === viewer && e.defIds?.length));
    expect(projectReplayEvents(own!.events, viewer, false).find((e) => e.type === "drew" && e.seat === viewer)).toHaveProperty("defIds");
  });
});
