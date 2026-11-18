import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const BELLAMY = "OP01-076";
const JAMBE = "OP02-046";
const PISTOL = "OP10-060";
const BENN = "OP09-009";
const HEAVENLY_FIRE = "OP04-117";
const GONER = "EB01-029";
const WATER_STREAM = "OP06-019";
const HAMLET = "OP08-090";
const DOBON = "OP02-080";

const rows: CardScenario[] = [
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

  {
    card: "OP09-080", name: "adds a rested DON!! when the opponent's effect K.O.s your {Straw Hat Crew} Character (#524)",
    me: { stage: "OP09-080", field: [{ card: ROBIN, rested: true }], don: { active: 0 } },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [ROBIN] }, { accept: true }],
    expect: { me: { field: [], don: { active: 0, rested: 1 } } },
  },

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
