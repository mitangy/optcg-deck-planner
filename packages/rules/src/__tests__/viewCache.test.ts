import { afterEach, describe, expect, it } from "vitest";
import { addModifier } from "../engine/modifiers.js";
import { setQueryCacheEnabled } from "../engine/queries.js";
import { getPlayerView, getSpectatorView } from "../engine/views.js";
import { benchGame } from "../scripts/benchViews.js";
import type { MatchState } from "../types.js";

function allViews(state: MatchState): string {
  return JSON.stringify([getPlayerView(state, 0), getPlayerView(state, 1), getSpectatorView(state, 0, { revealHands: true }), getSpectatorView(state, 1)]);
}

describe("view query cache", () => {
  afterEach(() => setQueryCacheEnabled(true));

  it("player and spectator views are byte-identical with and without the query cache over real-deck games (#389)", () => {
    let steps = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const { state } of benchGame(seed, 150)) {
        setQueryCacheEnabled(false);
        const uncached = allViews(state);
        setQueryCacheEnabled(true);
        const cached = allViews(state);
        if (cached !== uncached) expect({ seed, step: steps, cached: JSON.parse(cached) }).toEqual({ seed, step: steps, cached: JSON.parse(uncached) });
        steps += 1;
      }
    }
    expect(steps).toBeGreaterThan(500);
  }, 60_000);

  it("a view built after the state is changed in place shows the change (#389)", () => {
    let state: MatchState | undefined;
    for (const step of benchGame(2, 40)) state = step.state;
    const before = getPlayerView(state!, 0);
    expect(before.you.leader.statusLabels).not.toContain("Effects negated");
    const leader = state!.players[0].leader;
    addModifier(state!, 0, undefined, { kind: "card", id: leader.id }, { type: "power", amount: 1000 }, { kind: "permanent" });
    addModifier(state!, 0, undefined, { kind: "card", id: leader.id }, { type: "negate" }, { kind: "permanent" });
    const after = getPlayerView(state!, 0);
    expect(after.you.leader.power).toBe(before.you.leader.power + 1000);
    expect(after.you.leader.statusLabels).toContain("Effects negated");
  });
});
