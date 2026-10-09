import { describe, expect, it } from "vitest";
import { listAtlasIds, lookupCard } from "../cards/atlas";
import {
  PROTOCOL_VERSION,
  assertNoOpponentHand,
  intentLabel,
  parseError,
  parseMatchOver,
  parseRematchState,
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

  it("rejects private choice options sent to the wrong viewer", () => {
    const view = sampleView();
    const look = {
      id: "look_1",
      seat: 1 as const,
      kind: "effect" as const,
      cardDefId: "OP09-095",
      optional: false,
      prompt: "Look",
      privateToSeat: 1 as const,
      request: {
        type: "look" as const,
        options: [{ id: "o0", defId: "OP09-086", zone: "deck" as const, eligible: true }],
        minSelect: 0,
        maxSelect: 1,
        groups: [{ label: "Up to 1: add to hand", max: 1, eligibleIds: ["o0"] }],
        rest: "deck_bottom" as const,
        restLabel: "bottom",
      },
    };
    view.pendingChoices = [look];
    expect(() => assertNoOpponentHand(view)).toThrow(/private choice/i);
    view.pendingChoices = [{ ...look, request: { ...look.request, options: [{ id: "o0", defId: "HIDDEN", eligible: false }] } }];
    expect(() => assertNoOpponentHand(view)).not.toThrow();
    // Public field targets (they carry an instanceId) may be visible even in the other player's private choice.
    view.pendingChoices = [{ ...look, request: { type: "select", min: 0, max: 1, options: [{ id: "o0", defId: "OP09-086", zone: "character", instanceId: "c1", eligible: true }] } }];
    expect(() => assertNoOpponentHand(view)).not.toThrow();
    // The choosing player sees their own private options.
    view.pendingChoices = [{ ...look, seat: 0, privateToSeat: 0 as unknown as 1 }];
    expect(() => assertNoOpponentHand(view)).not.toThrow();
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
    expect(intentLabel({ type: "play_card", handIndex: 0 }, view)).toBe("Play Karoo");
    expect(intentLabel({ type: "activate_leader", targetId: "L0" }, view)).toBe(
      "Activate Leader → Monkey.D.Luffy",
    );
    expect(
      intentLabel(
        {
          type: "activate_ability",
          sourceId: "L0",
          abilityId: "leader_give_rested_don",
          targetId: "L0",
        },
        view,
      ),
    ).toMatch(/Activate .* →/);
    expect(intentLabel({ type: "mulligan", doMulligan: false })).toMatch(/Keep/i);
  });

  it("labels resolve_pending_choice with the front choice's card name", () => {
    const view = sampleView();
    view.pendingChoices = [
      {
        id: "c1",
        seat: 0,
        kind: "on_play",
        cardDefId: "ST01-005",
        optional: true,
        prompt: "Usopp — On Play: draw 1 card?",
      },
    ];
    expect(intentLabel({ type: "resolve_pending_choice", accept: true }, view)).toMatch(
      /^Accept — .*Jinbe/,
    );
    expect(intentLabel({ type: "resolve_pending_choice", accept: false }, view)).toMatch(
      /^Decline — .*Jinbe/,
    );
    expect(intentLabel({ type: "resolve_pending_choice", accept: true })).toBe(
      "Accept — ability",
    );
  });
});

describe("card atlas", () => {
  it("resolves curated real ids with art urls and includes cosmetics catalog", () => {
    const ids = listAtlasIds();
    expect(ids).toEqual(
      expect.arrayContaining([
        "ST01-001",
        "ST01-003",
        "ST01-006",
        "ST01-008",
        "ST01-009",
        "ST01-014",
        "OP01-013",
        "OP16-080",
      ]),
    );
    expect(ids.length).toBeGreaterThan(2000);
    const luffy = lookupCard("ST01-001");
    expect(luffy.name).toMatch(/Luffy/i);
    expect(luffy.imageUrl).toMatch(/^(\/cards\/|https?:\/\/)/);
    expect(lookupCard("ST01-014").name).toMatch(/Guard Point/i);
    expect(lookupCard("OP16-080").name).toMatch(/Teach/i);
  });
});

describe("welcome brief ticket (#401)", () => {
  const ticket = { ticket: "mb1.body.sig", leaderId: "OP01-001", opponentId: "ST01-001", deck: ["OP01-016", "ST01-006"] };
  const base = { protocolVersion: PROTOCOL_VERSION, matchId: "m1", seat: 0 as const };

  it("parseWelcome keeps a brief ticket and the ranked flag, drops a malformed ticket and any ticket sent to a spectator (#401)", () => {
    const ok = parseWelcome({ ...base, view: sampleView(), ranked: false, brief: ticket });
    expect(ok.ranked).toBe(false);
    expect(ok.brief).toEqual(ticket);

    // An older server says nothing about ranked.
    expect(parseWelcome({ ...base, view: sampleView() }).ranked).toBeUndefined();
    expect(parseWelcome({ ...base, view: sampleView(), ranked: "no" }).ranked).toBeUndefined();

    // Every part must be the right shape.
    for (const bad of [
      { ...ticket, ticket: 5 },
      { ...ticket, leaderId: undefined },
      { ...ticket, opponentId: null },
      { ...ticket, deck: "OP01-016" },
      { ...ticket, deck: ["OP01-016", 7] },
      "mb1.body.sig",
    ]) {
      expect(parseWelcome({ ...base, view: sampleView(), ranked: false, brief: bad }).brief, JSON.stringify(bad)).toBeUndefined();
    }

    // A spectator never gets one, even if a server sent it.
    const spec = sampleView();
    const specView = { ...spec, spectator: true, you: { ...spec.you, hand: [], handCount: 5 } } as unknown as PlayerView;
    const watched = parseWelcome({ ...base, role: "spectator", view: specView, ranked: false, brief: ticket });
    expect(watched.brief).toBeUndefined();
    expect(watched.ranked).toBe(false);
  });
});

describe("parseRematchState", () => {
  it("reads which seats are bringing a new deck, and treats a missing field as none (#479)", () => {
    const base = { protocolVersion: PROTOCOL_VERSION, available: true, requested: [true, false], declinedBy: null, chooser: null };
    expect(parseRematchState({ ...base, newDeck: [false, true] }).newDeck).toEqual([false, true]);
    expect(parseRematchState(base).newDeck).toEqual([false, false]);
  });
});
