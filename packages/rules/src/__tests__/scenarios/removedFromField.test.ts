/**
 * "Removed from the field by an effect" covers every way an effect takes a Character off the field: a K.O., or a move to
 * the hand, deck, trash or Life (#524). A battle K.O. and the Character trashed to make room for a 6th are not effects.
 * One occurrence triggers each ability once, and "This effect can be activated" is the player's choice.
 */
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000, {Animal} {Alabasta}
const ROBIN = "ST01-008"; // vanilla 3-cost 5000, {Straw Hat Crew}
const BELLAMY = "OP01-076"; // {Dressrosa} vanilla 2-cost 4000
const JAMBE = "OP02-046"; // [Main] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.
const PISTOL = "OP10-060"; // [Main] Place up to 1 of your opponent's Characters with 6000 power or less at the bottom of the owner's deck.
const BENN = "OP09-009"; // 7-cost, [On Play] Trash up to 1 of your opponent's Characters with 6000 power or less.
const HEAVENLY_FIRE = "OP04-117"; // [Main] Add up to 1 of your opponent's Characters with a cost of 3 or less to the top or bottom of your opponent's Life cards face-up.
const GONER = "EB01-029"; // [Trigger] Return up to 1 Character with a cost of 8 or less to the owner's hand.
const WATER_STREAM = "OP06-019"; // [Trigger] K.O. up to 1 of your opponent's Characters with 4000 power or less.
const HAMLET = "OP08-090"; // [On Play] Play up to 1 {SMILE} type Character card with a cost of 2 or less from your trash.
const DOBON = "OP02-080"; // {SMILE} vanilla 2-cost 4000

const rows: CardScenario[] = [
  // OP07-038 Boa Hancock: [Your Turn] [Once Per Turn] This effect can be activated when a Character is removed from the field by your effect. If you have 5 or less cards in your hand, draw 1 card.
  {
    card: "OP07-038", name: "draws when your effect K.O.s the opponent's Character (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [JAMBE], don: { active: 2 }, deckTop: [ROBIN] },
    opp: { field: [{ card: KAROO, rested: true }] },
    steps: [{ play: JAMBE }, { pick: [KAROO] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "draws when your effect places the opponent's Character at the bottom of the deck (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [PISTOL], don: { active: 5 }, deckTop: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ play: PISTOL }, { pick: [KAROO] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [], deckBottom: KAROO }, pending: "none" },
  },
  {
    card: "OP07-038", name: "draws when your effect adds the opponent's Character to their Life cards (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [HEAVENLY_FIRE], don: { active: 1 }, deckTop: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ play: HEAVENLY_FIRE }, { pick: [KAROO] }, { pick: ["Top"] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [], life: 6 }, pending: "none" },
  },
  {
    card: "OP07-038", name: "can be declined once and still used for a later removal the same turn (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [JAMBE, JAMBE], don: { active: 4 }, deckTop: [ROBIN] },
    opp: { field: [{ card: KAROO, rested: true }, { card: ROBIN, rested: true }] },
    steps: [{ play: JAMBE }, { pick: [KAROO] }, { decline: true }, { play: JAMBE }, { pick: [ROBIN] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "does not draw when the opponent's [Trigger] K.O.s your Character (#524)",
    leaders: { me: "OP07-038" },
    me: { field: [ROBIN, KAROO] },
    opp: { life: [WATER_STREAM, KAROO] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [KAROO] }],
    expect: { me: { hand: [], field: [ROBIN] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "does not draw when the opponent's [Trigger] returns your Character to your hand (#524)",
    leaders: { me: "OP07-038" },
    me: { field: [ROBIN, KAROO] },
    opp: { life: [GONER, KAROO] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [KAROO] }],
    expect: { me: { hand: [KAROO], field: [ROBIN] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "does not draw when a 6th Character is played and one is trashed to make room (#524)",
    leaders: { me: "OP07-038" },
    me: { field: [KAROO, KAROO, KAROO, KAROO], hand: [HAMLET], trash: [DOBON], don: { active: 3 }, deckTop: [ROBIN] },
    steps: [{ play: HAMLET }, { pick: [DOBON] }, { pick: [KAROO] }],
    expect: { me: { hand: [], field: [KAROO, KAROO, KAROO, HAMLET, DOBON] }, pending: "none" },
  },

  // OP08-046 Shakuyaku: [Your Turn] [Once Per Turn] When a Character is removed from the field by your effect, if your opponent has 5 or more cards in their hand, your opponent places 1 card from their hand at the bottom of their deck. Then, rest this Character.
  {
    card: "OP08-046", name: "rests itself and makes the opponent place a card when your effect K.O.s a Character (#524)",
    me: { field: ["OP08-046"], hand: [JAMBE], don: { active: 2 } },
    opp: { field: [{ card: KAROO, rested: true }], hand: [ROBIN, ROBIN, ROBIN, ROBIN, ROBIN] },
    steps: [{ play: JAMBE }, { pick: [KAROO] }, { pick: [ROBIN] }],
    expect: { me: { rested: ["OP08-046"] }, opp: { deckBottom: ROBIN, hand: [ROBIN, ROBIN, ROBIN, ROBIN] }, pending: "none" },
  },
  {
    card: "OP08-046", name: "does nothing when the opponent's [Trigger] returns a Character (#524)",
    me: { field: ["OP08-046", ROBIN] },
    opp: { life: [GONER, KAROO], hand: [ROBIN, ROBIN, ROBIN, ROBIN, ROBIN] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [ROBIN] }],
    expect: { me: { rested: [] }, pending: "none" },
  },

  // OP09-080 Thousand Sunny: [Opponent's Turn] You may rest this Stage: When your {Straw Hat Crew} type Character is removed from the field by your opponent's effect, add up to 1 DON!! card from your DON!! deck and rest it.
  {
    card: "OP09-080", name: "adds a rested DON!! when the opponent's effect K.O.s your {Straw Hat Crew} Character (#524)",
    me: { stage: "OP09-080", field: [{ card: ROBIN, rested: true }], don: { active: 0 } },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [ROBIN] }, { accept: true }],
    expect: { me: { field: [], don: { active: 0, rested: 1 } } },
  },

  // OP10-042 Usopp: [Opponent's Turn] [Once Per Turn] This effect can be activated when your {Dressrosa} type Character is removed from the field by your opponent's effect or K.O.'d. If you have 5 or less cards in your hand, draw 1 card.
  {
    card: "OP10-042", name: "draws exactly once when the opponent's effect K.O.s your {Dressrosa} Character (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: BELLAMY, rested: true }], deckTop: [KAROO] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], trash: [BELLAMY] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "is offered once, not twice, when the opponent's effect K.O.s your {Dressrosa} Character (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: BELLAMY, rested: true }], deckTop: [KAROO] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [BELLAMY] }, { decline: true }],
    expect: { me: { hand: [], field: [], trash: [BELLAMY] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "draws when the opponent's effect trashes your {Dressrosa} Character without a K.O. (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [BELLAMY], deckTop: [KAROO] },
    opp: { hand: [BENN], don: { active: 7 } },
    steps: [{ endTurn: true }, { play: BENN }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], trash: [BELLAMY] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "draws when the opponent's effect places your {Dressrosa} Character at the bottom of the deck (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [BELLAMY], deckTop: [KAROO] },
    opp: { hand: [PISTOL], don: { active: 5 } },
    steps: [{ endTurn: true }, { play: PISTOL }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], deckBottom: BELLAMY }, pending: "none" },
  },
];

runScenarios("removed from the field by an effect (#524)", rows);
