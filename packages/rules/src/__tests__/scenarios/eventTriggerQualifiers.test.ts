import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const BELLAMY = "OP01-076";
const MUGGY_BALL = "OP09-058";
const GONER = "EB01-029";
const GIRL = "P-096";
const ICE_TIME = "EB04-028";
const DOBON = "OP02-080";
const HAMLET = "OP08-090";

const rows: CardScenario[] = [
  {
    card: "OP10-042", name: "draws 1 when your {Dressrosa} Character is K.O.'d in battle on the opponent's turn (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: BELLAMY, rested: true }], deckTop: [KAROO] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(BELLAMY) }, { passBattle: true }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], trash: [BELLAMY] } },
  },
  {
    card: "OP10-042", name: "draws nothing when a Character that is not {Dressrosa} is K.O.'d (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: KAROO, rested: true }], deckTop: [ROBIN] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(KAROO) }, { passBattle: true }],
    expect: { me: { hand: [], field: [], trash: [KAROO] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "still draws 1 when the opponent's effect returns your {Dressrosa} Character to your hand (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [BELLAMY], deckTop: [KAROO] },
    opp: { hand: [MUGGY_BALL], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: MUGGY_BALL }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [BELLAMY, KAROO], field: [] } },
  },

  {
    card: "OP14-045", name: "gains [Rush] when an effect trashes a card from your hand (#524)",
    me: { field: ["OP14-045"], hand: [GIRL, ROBIN], don: { active: 2 }, deckTop: [KAROO] },
    steps: [{ play: GIRL }, { pick: [ROBIN] }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-045": ["rush"] } } },
  },
  {
    card: "OP14-045", name: "gains [Rush] when the cost of an Event trashes a card from your hand (#524)",
    me: { field: ["OP14-045"], hand: [ICE_TIME, ROBIN], don: { active: 5 } },
    steps: [{ play: ICE_TIME }, { accept: true }],
    expect: { me: { trash: [ICE_TIME, ROBIN], keywords: { "OP14-045": ["rush"] } } },
  },
  {
    card: "OP14-045", name: "does not gain [Rush] when you trash a Character from your hand as a Counter (#524)",
    me: { field: ["OP14-045"], hand: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counterCharacter: ROBIN }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-045": [] } } },
  },
  {
    card: "OP14-049", name: "does not gain [Rush] when you trash a Character from your hand as a Counter (#524)",
    me: { field: ["OP14-049"], hand: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counterCharacter: ROBIN }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-049": [] } } },
  },
  {
    card: "OP14-049", name: "gains [Rush] when an effect trashes a card from your hand (#524)",
    me: { field: ["OP14-049"], hand: [GIRL, ROBIN], don: { active: 2 }, deckTop: [KAROO] },
    steps: [{ play: GIRL }, { pick: [ROBIN] }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-049": ["rush"] } } },
  },

  {
    card: "EB02-023", name: "looks at 3 cards when your effect returns the opponent's Character to their hand (#524)",
    me: { field: ["EB02-023"], hand: [MUGGY_BALL], don: { active: 2 } },
    opp: { field: [ROBIN] },
    steps: [{ play: MUGGY_BALL }, { pick: [ROBIN] }],
    expect: { opp: { hand: [ROBIN], field: [] }, pending: "look" },
  },
  {
    card: "EB02-023", name: "does nothing when the opponent's own effect returns their Character on your turn (#524)",
    me: { field: ["EB02-023", ROBIN] },
    opp: { field: [KAROO], life: [GONER, KAROO] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [KAROO] }],
    expect: { opp: { hand: [KAROO], field: [] }, pending: "none" },
  },

  {
    card: "OP02-026", name: "sets 2 DON!! active when you play a Character with no base effect from your hand (#524)",
    leaders: { me: "OP02-026" },
    me: { hand: [DOBON], don: { active: 2, rested: 1 } },
    steps: [{ play: DOBON }],
    expect: { me: { field: [DOBON], don: { active: 2, rested: 1 } } },
  },
  {
    card: "OP02-026", name: "does nothing when an effect plays a Character with no base effect from your trash (#524)",
    leaders: { me: "OP02-026" },
    me: { hand: [HAMLET], trash: [DOBON], don: { active: 3, rested: 2 } },
    steps: [{ play: HAMLET }, { pick: [DOBON] }],
    expect: { me: { field: [HAMLET, DOBON], don: { active: 0, rested: 5 } } },
  },
];

runScenarios("event trigger qualifiers (#524)", rows);
