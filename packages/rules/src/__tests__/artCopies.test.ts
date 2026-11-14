import { describe, expect, it } from "vitest";
import { getSpectatorView } from "../engine.js";
import { Harness } from "../testing/harness.js";

// "One of each art": the view tells every client which copy of an any-number card each instance is (#1292).

const SLEEPTIDS = "OP18-093"; // any number of copies allowed in a deck
const KAROO = "ST01-003"; // ordinary vanilla card

describe("art copy ranks in the player view", () => {
  it("number every Sleeptids copy across hand, field, deck and trash and keep the number when one is played (#1292)", () => {
    const h = new Harness();
    h.don(0, 10);
    const [inHand] = h.hand(0, SLEEPTIDS);
    const [onField] = h.field(0, SLEEPTIDS);
    h.deckTop(0, SLEEPTIDS);
    h.trash(0, SLEEPTIDS);
    // Ranked by instance id across every zone: hand and field "c_t…" (hand first) < deck "d_t…" < trash "t_t…".
    expect(h.view(0).you.hand[0]!.artCopy).toBe(0);
    expect(h.view(0).you.characters[0]!.artCopy).toBe(1);
    expect(h.view(0).you.trashCopies).toEqual([3]);
    h.play(0, SLEEPTIDS);
    const field = h.view(0).you.characters;
    expect(field.map((c) => [c.id, c.artCopy])).toEqual([[onField!.id, 1], [inHand!.id, 0]]);
  });

  it("give the opponent and a spectator the same ranks, counted per owner (#1292)", () => {
    const h = new Harness();
    h.field(0, SLEEPTIDS, SLEEPTIDS, SLEEPTIDS);
    h.field(1, SLEEPTIDS);
    h.hand(1, SLEEPTIDS);
    const own = h.view(0).you.characters.map((c) => c.artCopy);
    expect(own).toEqual([0, 1, 2]);
    expect(h.view(1).opponent.characters.map((c) => c.artCopy)).toEqual(own);
    expect(h.view(0).opponent.characters.map((c) => c.artCopy)).toEqual([0]);
    expect(getSpectatorView(h.state, 0).opponent.characters.map((c) => c.artCopy)).toEqual([0]);
    expect(getSpectatorView(h.state, 0, { revealHands: true }).revealedHands![1].map((c) => c.artCopy)).toEqual([1]);
  });

  it("number face-up Life cards by the same copy order as everything else (#1292)", () => {
    const h = new Harness();
    h.field(0, SLEEPTIDS);
    h.life(0, KAROO, SLEEPTIDS);
    h.state.players[0].faceUpLife = [false, true];
    const row = h.view(0).you.faceUpLife[0]!;
    expect(row.defId).toBe(SLEEPTIDS);
    // Character "c_t…" sorts before life "l_t…", so the Life copy is the second one.
    expect(row.artCopy).toBe(1);
  });

  it("leave ordinary cards without an art copy field (#1292)", () => {
    const h = new Harness();
    h.field(0, KAROO);
    h.hand(0, KAROO);
    h.trash(0, KAROO);
    const you = h.view(0).you;
    expect(Object.keys(you.characters[0]!)).not.toContain("artCopy");
    expect(Object.keys(you.hand[0]!)).not.toContain("artCopy");
    expect(Object.keys(you)).not.toContain("trashCopies");
  });

  it("give the opponent and a spectator a played copy's rank that ignores how many copies sit in the hidden deck (#1301)", () => {
    const rankSeenByOthers = (hiddenCopies: number) => {
      const h = new Harness();
      for (let i = 0; i < hiddenCopies; i++) h.deckTop(1, SLEEPTIDS);
      h.hand(1, SLEEPTIDS);
      h.life(1, SLEEPTIDS, KAROO);
      h.field(1, SLEEPTIDS);
      return {
        opponent: h.view(0).opponent.characters.map((c) => c.artCopy),
        spectator: getSpectatorView(h.state, 0).opponent.characters.map((c) => c.artCopy),
        spectatorOther: getSpectatorView(h.state, 1).you.characters.map((c) => c.artCopy),
        own: h.view(1).you.characters.map((c) => c.artCopy),
      };
    };
    const few = rankSeenByOthers(1);
    const many = rankSeenByOthers(19);
    expect(few.opponent).toEqual([0]);
    expect(many.opponent).toEqual([0]);
    expect(many.spectator).toEqual([0]);
    expect(many.spectatorOther).toEqual([0]);
  });

  it("rank a played copy among public copies only: field and trash count, deck, hand and face-down Life do not (#1301)", () => {
    const h = new Harness();
    h.deckTop(1, SLEEPTIDS, SLEEPTIDS);
    h.hand(1, SLEEPTIDS);
    h.life(1, SLEEPTIDS);
    h.trash(1, SLEEPTIDS);
    h.field(1, SLEEPTIDS);
    const opp = h.view(0).opponent;
    // Field "c_t…" sorts before trash "t_t…", so with only those two public copies the field one is rank 0.
    expect(opp.characters.map((c) => c.artCopy)).toEqual([0]);
    expect(opp.trashCopies).toEqual([1]);
    // The owner's own view keeps the full rank: the field copy comes after the hand copy that was dealt first.
    expect(h.view(1).you.characters.map((c) => c.artCopy)).toEqual([1]);
    expect(h.view(1).you.trashCopies).toEqual([5]);
  });
});
