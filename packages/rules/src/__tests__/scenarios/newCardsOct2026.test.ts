/**
 * Grammar learned for the October 2026 TCGPlayer imports: a keyword choice ("gains [A], [B], or [C]"), the
 * "{T} type Character card or Character card with a [Trigger]" filter, and "would be removed from the field by your
 * opponent" (any removal by the opponent, battle included). Each has a row for the case where it must not apply.
 */
import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../../testing/harness.js";
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const BRICK_FIST = "OP02-067"; // [Main] Return up to 1 Character with a cost of 4 or less to the owner's hand.
const JAMBE = "OP02-046"; // [Main] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.
const SHAMROCK = "OP18-119"; // Saint Shamrock, 8-cost 9000
const EGGHEAD_LEADER = "OP07-097"; // Vegapunk, {Egghead}
const DOLL = "EB04-046"; // {Egghead} 2-cost, no [Trigger]
const KAWAMATSU = "OP01-037"; // 2-cost, [Trigger] Play this card.

const rows: CardScenario[] = [
  // OP18-085 Cerberus: You may return this Character to the owner's hand: Up to 1 of your [Saint Shamrock] Characters gains [Rush], [Banish], or [Unblockable] during this turn.
  {
    card: "OP18-085", name: "grants only the chosen keyword to the chosen [Saint Shamrock] after returning itself",
    me: { field: ["OP18-085", SHAMROCK] },
    steps: [{ activate: mine("OP18-085"), ability: "op18-085#0" }, { pick: [SHAMROCK] }, { pick: ["Gain [Banish]"] }],
    expect: { me: { field: [SHAMROCK], hand: ["OP18-085"], keywords: { [SHAMROCK]: ["banish"] } }, pending: "none" },
  },
  {
    card: "OP18-085", name: "grants the last listed keyword when it is chosen",
    me: { field: ["OP18-085", SHAMROCK] },
    steps: [{ activate: mine("OP18-085"), ability: "op18-085#0" }, { pick: [SHAMROCK] }, { pick: ["Gain [Unblockable]"] }],
    expect: { me: { keywords: { [SHAMROCK]: ["unblockable"] } }, pending: "none" },
  },

  // P-118 Lilith: If your Leader has the {Egghead} type, play up to 1 {Egghead} type Character card or Character card with a [Trigger], with a cost of 5 or less from your hand.
  {
    card: "P-118", name: "plays a Character with a [Trigger] that is not an {Egghead}",
    leaders: { me: EGGHEAD_LEADER },
    me: { hand: ["P-118", KAWAMATSU, DOLL, KAROO], don: { active: 6 } },
    steps: [{ play: "P-118" }, { pick: [KAWAMATSU] }],
    expect: { me: { field: ["P-118", KAWAMATSU], hand: [DOLL, KAROO] } },
  },
  {
    card: "P-118", name: "plays an {Egghead} Character without a [Trigger]",
    leaders: { me: EGGHEAD_LEADER },
    me: { hand: ["P-118", KAWAMATSU, DOLL, KAROO], don: { active: 6 } },
    steps: [{ play: "P-118" }, { pick: [DOLL] }],
    expect: { me: { field: ["P-118", DOLL], hand: [KAWAMATSU, KAROO] } },
  },
  {
    card: "P-118", name: "offers nothing when the hand has only a Character that is neither an {Egghead} nor has a [Trigger]",
    leaders: { me: EGGHEAD_LEADER },
    me: { hand: ["P-118", KAROO], don: { active: 6 } },
    steps: [{ play: "P-118" }],
    expect: { me: { field: ["P-118"], hand: [KAROO] }, pending: "none" },
  },

  // EB05-061 Nami: [Once Per Turn] If one of your Characters with 6000 base power or less would be removed from the field by your opponent, you may add 1 card from the top of your Life cards to your hand instead.
  {
    card: "EB05-061", name: "keeps a Character the opponent K.O.s in battle and adds the top Life card to the hand",
    me: { field: ["EB05-061", { card: KAROO, rested: true }] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(KAROO) }, { passBattle: true }, { accept: true }],
    expect: { me: { field: ["EB05-061", KAROO], life: 4, hand: [FILLER] }, pending: "none" },
  },
  {
    card: "EB05-061", name: "keeps a Character the opponent's effect K.O.s and adds the top Life card to the hand",
    me: { field: ["EB05-061", { card: KAROO, rested: true }] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [KAROO] }, { accept: true }],
    expect: { me: { field: ["EB05-061", KAROO], life: 4, hand: [FILLER] }, pending: "none" },
  },
  {
    card: "EB05-061", name: "does not replace a removal the player's own effect causes",
    me: { field: ["EB05-061", KAROO], hand: [BRICK_FIST], don: { active: 2 } },
    steps: [{ play: BRICK_FIST }, { pick: [KAROO] }],
    expect: { me: { field: ["EB05-061"], life: 5, hand: [KAROO] }, pending: "none" },
  },

];

runScenarios("new cards (October 2026)", rows);

// OP09-056: reveal up to 1 {Cross Guild} type card or card with a type including "Baroque Works" other than [Mr.3(Galdino)].
// The name keeps its parenthesis, so every printing of Mr.3(Galdino) is excluded and another Baroque Works card is not.
describe("OP09-056 excludes [Mr.3(Galdino)] by its full name", () => {
  it("offers a Baroque Works card but not Mr.3(Galdino)", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    h.don(0, 6, 0);
    h.hand(0, "OP09-056");
    h.deckTop(0, "OP01-085", "OP14-091", KAROO, KAROO); // Mr.3(Galdino), Mr.2.Bon.Kurei(Bentham) {Baroque Works}
    h.play(0, "OP09-056");
    const request = h.choice?.request;
    if (request?.type !== "look") throw new Error("expected a look prompt");
    expect(request.options.map((o) => [o.defId, o.eligible])).toEqual([["OP01-085", false], ["OP14-091", true], [KAROO, false], [KAROO, false]]);
  });
});
