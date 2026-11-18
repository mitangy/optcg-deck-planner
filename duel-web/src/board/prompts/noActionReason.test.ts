import { describe, expect, it } from "vitest";
import type { CardView, PlayerView } from "../../net/protocol";
import { DEMO_VIEW } from "../fixtures/demoViews";
import { stubCard } from "../fixtures/stubCard";
import { noActionReason } from "./noActionReason";

const char = (over: Partial<CardView> = {}): CardView =>
  stubCard({ id: "c1", defId: "ST01-008", power: 5000, printedPower: 5000, rested: false, statusLabels: [], ...over });

function mainView(over: Partial<PlayerView> = {}, you: Partial<PlayerView["you"]> = {}): PlayerView {
  return {
    ...DEMO_VIEW,
    phase: "main",
    activeSeat: 0,
    seat: 0,
    firstSeat: 1,
    turnNumber: 4,
    battle: null,
    pendingChoices: [],
    you: { ...DEMO_VIEW.you, activeDonCount: 1, characters: [char()], hand: [{ id: "h1", defId: "ST01-008", playCost: 5 }], ...you },
    ...over,
  };
}

const hand = { handIndex: 0, boardId: null };
const board = { handIndex: null, boardId: "c1" };

describe("noActionReason (#1343)", () => {
  it("says how many DON!! a hand card needs when you cannot pay (#1343)", () => {
    expect(noActionReason(mainView(), hand)).toBe("Needs 5 DON!! (you have 1 active)");
    expect(noActionReason(mainView({}, { activeDonCount: 5 }), hand)).toBeNull();
  });

  it("says a Counter-only Event is played when you are attacked, even with DON!! to spare (#1343)", () => {
    const view = mainView({}, { activeDonCount: 5, hand: [{ id: "h1", defId: "ST01-014" }] });
    expect(noActionReason(view, hand)).toBe("Counter: play this when you are attacked");
  });

  it("gives the effect's reason when a restriction blocks the card (#1343)", () => {
    const view = mainView({}, { hand: [{ id: "h1", defId: "ST01-008", playCost: 1, blocked: "characters" }] });
    expect(noActionReason(view, hand)).toMatch(/Character cards this turn/);
  });

  it("says Not your turn on the opponent's turn (#1343)", () => {
    expect(noActionReason(mainView({ activeSeat: 1 }), hand)).toBe("Not your turn");
    expect(noActionReason(mainView({ activeSeat: 1 }), board)).toBe("Not your turn");
  });

  it("says a rested Character already attacked (#1343)", () => {
    const view = mainView({}, { characters: [char({ rested: true })] });
    expect(noActionReason(view, board)).toBe("This Character already attacked or is rested");
    expect(noActionReason(mainView(), board)).toBeNull();
  });

  it("says a Character cannot attack the turn it is played (#1343)", () => {
    const view = mainView({}, { characters: [char({ summoningSick: true })] });
    expect(noActionReason(view, board)).toBe("Can't attack the turn it is played");
  });

  it("names the Leader when a rested Leader is selected (#1343)", () => {
    const view = mainView({}, { leader: { ...DEMO_VIEW.you.leader, rested: true } });
    expect(noActionReason(view, { handIndex: null, boardId: view.you.leader.id })).toBe("This Leader already attacked or is rested");
  });

  it("says the first player cannot attack on turn 1 (#1343)", () => {
    expect(noActionReason(mainView({ firstSeat: 0, turnNumber: 1 }), board)).toBe("The first player can't attack on turn 1");
    expect(noActionReason(mainView({ firstSeat: 1, turnNumber: 2 }), board)).toBeNull();
  });

  it("asks to answer an open prompt first (#1343)", () => {
    const view = mainView({ pendingChoices: DEMO_VIEW.pendingChoices.length ? DEMO_VIEW.pendingChoices : [{ id: "p" } as never] });
    expect(noActionReason(view, hand)).toBe("Answer the prompt first");
  });

  it("returns null when nothing is selected, and once the match is over (#1343)", () => {
    expect(noActionReason(mainView(), { handIndex: null, boardId: null })).toBeNull();
    expect(noActionReason(mainView({ winner: 0 }), hand)).toBeNull();
  });
});
