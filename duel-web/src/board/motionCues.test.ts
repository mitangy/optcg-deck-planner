import { describe, expect, it } from "vitest";
import type { CardView, PlayerView } from "../net/protocol";
import { MAX_CUES, motionCues, type MotionCue } from "./motionCues";

function card(id: string, defId = "ST01-003", power = 3000): CardView {
  return { id, defId, power, printedPower: power, statusLabels: [] };
}

function baseView(): PlayerView {
  return {
    seat: 0,
    you: {
      leader: card("y-leader", "ST01-001", 5000),
      characters: [card("y-c1")],
      stage: null,
      hand: [
        { id: "h1", defId: "ST01-006" },
        { id: "h2", defId: "ST01-014" },
      ],
      deckCount: 30,
      trash: [],
      lifeCount: 4,
      donDeckCount: 6,
      costArea: [{ id: "d1", rested: false }],
      activeDonCount: 1,
      mulliganDone: true,
    },
    opponent: {
      leader: card("o-leader", "ST01-001", 5000),
      characters: [card("o-c1", "ST01-008")],
      stage: null,
      handCount: 5,
      deckCount: 30,
      trash: [],
      lifeCount: 4,
      donDeckCount: 6,
      costAreaCount: 1,
      activeDonCount: 1,
      mulliganDone: true,
    },
    activeSeat: 0,
    phase: "main",
    turnNumber: 3,
    battle: null,
    pendingTrigger: null,
    winner: null,
    winReason: null,
    legalIntents: [],
  };
}

type You = PlayerView["you"];
type Opp = PlayerView["opponent"];
function edit(v: PlayerView, you: (y: You) => Partial<You> = () => ({}), opp: (o: Opp) => Partial<Opp> = () => ({})): PlayerView {
  return { ...v, you: { ...v.you, ...you(v.you) }, opponent: { ...v.opponent, ...opp(v.opponent) } };
}
const kinds = (cues: MotionCue[]) => cues.map((c) => `${c.side}:${c.kind}`);

describe("motionCues", () => {
  it("names the drawn card when the deck shrinks and a card joins your hand", () => {
    const prev = baseView();
    const next = edit(prev, (y) => ({ deckCount: 29, hand: [...y.hand, { id: "h3", defId: "ST01-004" }] }));
    expect(motionCues(prev, next)).toEqual([{ kind: "draw", side: "you", count: 1, ids: ["h3"] }]);
  });

  it("sends a new hand card from life, not the deck, when life drops", () => {
    const prev = baseView();
    const next = edit(prev, (y) => ({ lifeCount: 3, hand: [...y.hand, { id: "l1", defId: "ST01-005" }] }));
    expect(motionCues(prev, next)).toEqual([
      { kind: "life_to_hand", side: "you", count: 1, ids: ["l1"] },
      { kind: "life_lost", side: "you", count: 1 },
    ]);
  });

  it("counts opponent draws and life cards from their hand size", () => {
    const prev = baseView();
    const drew = edit(prev, undefined, () => ({ deckCount: 28, handCount: 7 }));
    expect(motionCues(prev, drew)).toEqual([{ kind: "draw", side: "opp", count: 2, ids: [] }]);
    const hit = edit(prev, undefined, () => ({ lifeCount: 3, handCount: 6 }));
    expect(kinds(motionCues(prev, hit))).toEqual(["opp:life_to_hand", "opp:life_lost"]);
  });

  it("plays a Character from your hand without calling it a discard", () => {
    const prev = baseView();
    const next = edit(prev, (y) => ({
      hand: y.hand.filter((c) => c.id !== "h1"),
      characters: [...y.characters, card("h1", "ST01-006")],
      // An older copy of the same card already in the trash must not read as a discard.
      trash: ["ST01-006"],
    }));
    expect(motionCues(prev, next)).toEqual([{ kind: "play", side: "you", id: "h1", fromHand: true }]);
  });

  it("plays an opponent Character from hand only when their hand shrank", () => {
    const prev = baseView();
    const fromHand = edit(prev, undefined, (o) => ({ handCount: 4, characters: [...o.characters, card("o-c2")] }));
    expect(motionCues(prev, fromHand)).toEqual([{ kind: "play", side: "opp", id: "o-c2", fromHand: true }]);
    const fromDeck = edit(prev, undefined, (o) => ({ deckCount: 29, characters: [...o.characters, card("o-c2")] }));
    expect(motionCues(prev, fromDeck)).toEqual([{ kind: "play", side: "opp", id: "o-c2", fromHand: false }]);
  });

  it("sends a KO'd Character to the trash only when the trash grew", () => {
    const prev = baseView();
    const ko = edit(prev, undefined, () => ({ characters: [], trash: ["ST01-008"] }));
    expect(motionCues(prev, ko)).toEqual([
      { kind: "leave_field", side: "opp", id: "o-c1", defId: "ST01-008", toTrash: true },
    ]);
    const bounced = edit(prev, undefined, () => ({ characters: [], handCount: 6 }));
    expect(motionCues(prev, bounced)).toContainEqual({
      kind: "leave_field",
      side: "opp",
      id: "o-c1",
      defId: "ST01-008",
      toTrash: false,
    });
  });

  it("discards a counter from your hand into the trash", () => {
    const prev = baseView();
    const next = edit(prev, (y) => ({ hand: y.hand.filter((c) => c.id !== "h2"), trash: ["ST01-014"] }));
    expect(motionCues(prev, next)).toEqual([{ kind: "discard", side: "you", id: "h2", defId: "ST01-014" }]);
  });

  it("shuffles on a mulligan but not when a kept hand is swapped later", () => {
    const pre = edit(baseView(), () => ({ mulliganDone: false }));
    const swapped = edit(pre, () => ({
      mulliganDone: true,
      hand: [
        { id: "m1", defId: "ST01-003" },
        { id: "m2", defId: "ST01-004" },
      ],
    }));
    expect(motionCues(pre, swapped)).toEqual([
      { kind: "shuffle", side: "you" },
      { kind: "draw", side: "you", count: 2, ids: ["m1", "m2"] },
    ]);
    const midGame = edit(baseView(), () => ({ hand: swapped.you.hand }));
    expect(kinds(motionCues(baseView(), midGame))).not.toContain("you:shuffle");
  });

  it("reports DON!! arrivals with where the active run ends", () => {
    const prev = baseView();
    const next = edit(prev, (y) => ({
      donDeckCount: 4,
      costArea: [...y.costArea, { id: "d2", rested: false }, { id: "d3", rested: false }],
      activeDonCount: 3,
    }));
    expect(motionCues(prev, next)).toEqual([{ kind: "don", side: "you", count: 2, activeAfter: 3 }]);
  });

  it("tells a power rise from a power drop", () => {
    const prev = baseView();
    const next = edit(
      prev,
      (y) => ({ leader: { ...y.leader, power: 6000 } }),
      (o) => ({ characters: [{ ...o.characters[0]!, power: 2000 }] }),
    );
    expect(motionCues(prev, next)).toEqual([
      { kind: "power", side: "you", id: "y-leader", up: true },
      { kind: "power", side: "opp", id: "o-c1", up: false },
    ]);
  });

  it("stays still across a seat switch, an undo, or a resync burst", () => {
    const prev = baseView();
    const drew = edit(prev, (y) => ({ deckCount: 29, hand: [...y.hand, { id: "h3", defId: "ST01-004" }] }));
    expect(motionCues(prev, { ...drew, seat: 1 })).toEqual([]);
    expect(motionCues(prev, { ...drew, turnNumber: 2 })).toEqual([]);
    const burst = edit(prev, (y) => ({
      characters: Array.from({ length: MAX_CUES + 1 }, (_, i) => card(`new-${i}`)),
      leader: y.leader,
    }));
    expect(motionCues(prev, burst)).toEqual([]);
  });

  it("deals the opening hand on a fresh match but not on a resume", () => {
    const fresh = edit(baseView(), () => ({ mulliganDone: false }));
    expect(kinds(motionCues(null, { ...fresh, turnNumber: 0 }))).toEqual([
      "you:shuffle",
      "opp:shuffle",
      "you:draw",
      "opp:draw",
    ]);
    expect(motionCues(null, baseView())).toEqual([]);
  });

  it("does not guess spectators' hand cards", () => {
    const prev = { ...baseView(), spectator: true, you: { ...baseView().you, hand: [], handCount: 5 } };
    const next = edit(prev, () => ({ deckCount: 29, handCount: 6 }));
    expect(motionCues(prev, next)).toEqual([{ kind: "draw", side: "you", count: 1, ids: [] }]);
  });
});
