import assert from "node:assert/strict";
import { buildTestDeck, createMatch, DEFAULT_LEADER_ID, type MatchState } from "@optcg/rules";
import { collectPublicDefIds, visibleArtPrefs } from "../src/publicArt.js";

function freshMatch(): MatchState {
  return createMatch({
    seed: 3,
    firstSeat: 0,
    players: [
      { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
      { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
    ],
  });
}

describe("public art prefs (#369)", () => {
  it("counts the Leader and face-up cards, never hand, deck or face-down Life (#369)", () => {
    const m = freshMatch();
    const p = m.players[0];
    p.trash = ["TRASHED-1"];
    p.life = ["LIFE-UP", "LIFE-DOWN"];
    p.faceUpLife = [true, false];
    p.deck = ["DECK-1"];
    p.hand = [{ id: "h1", defId: "HAND-1", rested: false, attachedDonIds: [] }];
    p.characters = [{ id: "c1", defId: "FIELD-1", rested: false, attachedDonIds: [] }];
    const pub = collectPublicDefIds(m, 0, []);
    assert.deepEqual([...pub].sort(), [DEFAULT_LEADER_ID, "FIELD-1", "LIFE-UP", "TRASHED-1"].sort());
  });

  it("keeps a card public after it leaves the table, but only for its own seat (#369)", () => {
    const m = freshMatch();
    const pub = collectPublicDefIds(
      m,
      0,
      [
        { type: "card_played", seat: 0, defId: "BOUNCED", instanceId: "x", costPaid: 1 },
        { type: "card_played", seat: 1, defId: "THEIRS", instanceId: "y", costPaid: 1 },
        { type: "card_moved", seat: 0, defId: "SECRET", from: "hand", to: "deck", hidden: true },
      ],
    );
    assert.ok(pub.has("BOUNCED"));
    assert.ok(!pub.has("THEIRS"));
    assert.ok(!pub.has("SECRET"));
  });

  it("filters a pref map down to public cards (#369)", () => {
    assert.deepEqual(visibleArtPrefs({ A: "a1", B: "b1" }, new Set(["B", "C"])), { B: "b1" });
  });
});
