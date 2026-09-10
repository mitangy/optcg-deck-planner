import { describe, expect, it } from "vitest";
import { listAtlasIds, lookupCard } from "../cards/atlas";
import {
  PROTOCOL_VERSION,
  assertNoOpponentHand,
  intentLabel,
  parseError,
  parseMatchOver,
  parseView,
  parseWelcome,
  type PlayerView,
} from "./protocol";

function sampleView(withOpponentHand = false): PlayerView {
  const view: PlayerView = {
    seat: 0,
    you: {
      leader: { id: "L0", defId: "ST01-001", power: 5000 },
      characters: [],
      stage: null,
      hand: [{ id: "h1", defId: "ST01-002" }],
      deckCount: 10,
      trash: [],
      lifeCount: 5,
      donDeckCount: 8,
      costArea: [{ id: "d1", rested: false }],
      activeDonCount: 1,
    },
    opponent: {
      leader: { id: "L1", defId: "ST01-001", power: 5000 },
      characters: [],
      stage: null,
      handCount: 5,
      deckCount: 10,
      trash: [],
      lifeCount: 5,
      donDeckCount: 8,
      costAreaCount: 1,
      activeDonCount: 1,
    },
    activeSeat: 0,
    phase: "main",
    turnNumber: 1,
    battle: null,
    pendingTrigger: null,
    winner: null,
    winReason: null,
    legalIntents: [{ type: "end_turn" }],
  };
  if (withOpponentHand) {
    (view.opponent as { hand?: unknown }).hand = [{ id: "x", defId: "ST01-002" }];
  }
  return view;
}

describe("protocol parsers", () => {
  it("parses welcome and rejects opponent hand leaks", () => {
    const msg = parseWelcome({
      protocolVersion: PROTOCOL_VERSION,
      matchId: "m1",
      seat: 0,
      view: sampleView(),
    });
    expect(msg.matchId).toBe("m1");
    expect(msg.view.opponent.handCount).toBe(5);
    expect(() => assertNoOpponentHand(sampleView(true))).toThrow(/privacy/);
  });

  it("parses view, error, and match_over", () => {
    expect(
      parseView({ protocolVersion: PROTOCOL_VERSION, view: sampleView() }).view
        .legalIntents[0]?.type,
    ).toBe("end_turn");
    expect(
      parseError({
        protocolVersion: PROTOCOL_VERSION,
        code: "illegal_intent",
        message: "nope",
      }).code,
    ).toBe("illegal_intent");
    expect(
      parseMatchOver({
        protocolVersion: PROTOCOL_VERSION,
        result: { winner: 1, reason: "deck_out" },
      }).result.winner,
    ).toBe(1);
  });

  it("labels intents", () => {
    expect(intentLabel({ type: "end_turn" })).toBe("End turn");
    expect(intentLabel({ type: "mulligan", doMulligan: false })).toBe("Keep hand");
  });
});

describe("card atlas", () => {
  it("resolves curated real ids with art urls", () => {
    expect(listAtlasIds().length).toBeGreaterThanOrEqual(10);
    const luffy = lookupCard("ST01-001");
    expect(luffy.name).toMatch(/Luffy/i);
    expect(luffy.imageUrl).toMatch(/^https?:\/\//);
  });
});
