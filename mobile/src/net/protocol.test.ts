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
      hand: [{ id: "h1", defId: "ST01-003" }],
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
    (view.opponent as { hand?: unknown }).hand = [{ id: "x", defId: "ST01-003" }];
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
    expect(() => assertNoOpponentHand(sampleView(true))).toThrow(/privacy|leak/i);
  });

  it("parses spectator welcome with empty hands", () => {
    const view = sampleView();
    view.spectator = true;
    view.you.hand = [];
    view.you.handCount = 5;
    view.legalIntents = [];
    const msg = parseWelcome({
      protocolVersion: PROTOCOL_VERSION,
      matchId: "m-spec",
      seat: 0,
      role: "spectator",
      view,
    });
    expect(msg.role).toBe("spectator");
    expect(msg.view.you.hand).toEqual([]);
    expect(msg.view.you.handCount).toBe(5);
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

  it("labels intents with atlas names when view is provided", () => {
    const view = sampleView();
    expect(intentLabel({ type: "end_turn" })).toBe("End turn");
    expect(intentLabel({ type: "play_card", handIndex: 0 }, view)).toMatch(/Karoo|ST01-003/);
    expect(intentLabel({ type: "activate_leader", targetId: "L0" }, view)).toMatch(
      /Activate Leader/,
    );
    expect(intentLabel({ type: "mulligan", doMulligan: false })).toMatch(/Keep/i);
  });
});

describe("card atlas", () => {
  it("resolves curated real ids with art urls", () => {
    expect(listAtlasIds()).toEqual(
      expect.arrayContaining([
        "ST01-001",
        "ST01-003",
        "ST01-006",
        "ST01-008",
        "ST01-009",
        "ST01-014",
      ]),
    );
    expect(listAtlasIds()).not.toContain("OP01-013");
    const luffy = lookupCard("ST01-001");
    expect(luffy.name).toMatch(/Luffy/i);
    expect(luffy.imageUrl).toMatch(/^https?:\/\//);
    expect(lookupCard("ST01-014").name).toMatch(/Guard Point/i);
  });
});
