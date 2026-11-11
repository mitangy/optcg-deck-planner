/**
 * 44 more OP18 cards added from the official English card pages (#1274). The rows cover the cards whose text needed
 * new grammar or engine support, plus the replacement / counting effects whose scope is easy to get wrong. Each row has a
 * case where the behaviour must not apply, so loosening it fails on its own scenario.
 */
import { describe, expect, it } from "vitest";
import { Harness } from "../../testing/harness.js";
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // 1-cost 3000 vanilla {Animal}{Alabasta}
const ROBIN = "ST01-008"; // 3-cost 5000 {Straw Hat Crew}
const VIVI = "ST01-009"; // 2-cost 4000
const KOMACHIYO = "OP01-010"; // 1-cost 3000 vanilla
const LUFFY_LEADER = "ST01-001"; // 5000 power
const TEACH_LEADER = "OP09-081"; // [Activate: Main] You may trash 1 card from your hand: ...
const SUGAR_LEADER = "OP10-003"; // {Donquixote Pirates}
const SPANDAM_LEADER = "OP18-079"; // {CP9}
const GECKO_MORIA = "OP01-068"; // 4-cost 5000 [Gecko Moria]
const JAMBE = "OP02-046"; // [Main] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.
const TEACH_CHARACTER = "OP09-092"; // [Activate: Main] You may rest this Character: ... draw 2 cards and trash 1 card from your hand.
const HANGER = "OP04-050"; // [Activate: Main] You may trash 1 card from your hand and rest this Character: Draw 1 card.
const BELLAMY = "OP05-035"; // 3-cost 5000 {Donquixote Pirates}
const BIG_VANILLA = "OP18-062"; // 8-cost 10000 vanilla
const IRON_BODY = "OP07-095"; // {CP9} Event, [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.
const PAPER_ART = "OP13-115"; // {CP0} Event, [Trigger] Draw 1 card.

const rows: CardScenario[] = [
  // OP18-080 Van Augur: [Your Turn] [Once Per Turn] When a card is trashed from your hand by your [Marshall.D.Teach] Leader's
  // effect, if you have no other [Van Augur], draw 1 card.
  {
    card: "OP18-080", name: "draws 1 when your [Marshall.D.Teach] Leader's effect trashes a card from your hand (#1274)",
    leaders: { me: TEACH_LEADER },
    me: { field: ["OP18-080"], hand: [VIVI], deckTop: [ROBIN] },
    steps: [{ activate: mine(TEACH_LEADER), ability: "op09-081#m1" }],
    expect: { me: { hand: [ROBIN], trash: [VIVI] } },
  },
  {
    card: "OP18-080", name: "does not draw when a Character's cost trashes the card (#1274)",
    leaders: { me: TEACH_LEADER },
    me: { field: ["OP18-080", HANGER], hand: [VIVI], deckTop: [ROBIN, KOMACHIYO] },
    steps: [{ activate: mine(HANGER), ability: "op04-050#0" }],
    expect: { me: { hand: [ROBIN], trash: [VIVI] } },
  },
  {
    card: "OP18-080", name: "does not draw when a [Marshall.D.Teach] Character, not a Leader, trashes the card (#1274)",
    me: { field: ["OP18-080", TEACH_CHARACTER], deckTop: [ROBIN, VIVI, KOMACHIYO] },
    opp: { hand: [KAROO, KAROO, KAROO, KAROO] },
    steps: [{ activate: mine(TEACH_CHARACTER), ability: "op09-092#0" }, { pick: [VIVI] }],
    expect: { me: { hand: [ROBIN], trash: [VIVI] } },
  },

  // OP18-081 Oars: If you have a [Gecko Moria] Character, this Character gains [Double Attack] and [Blocker].
  {
    card: "OP18-081", name: "gains [Double Attack] and [Blocker] while you have a [Gecko Moria] Character (#1274)",
    me: { field: ["OP18-081", GECKO_MORIA] },
    expect: { me: { keywords: { "OP18-081": ["blocker", "double_attack"] } } },
  },
  {
    card: "OP18-081", name: "has neither keyword without a [Gecko Moria], and your opponent's does not count (#1274)",
    me: { field: ["OP18-081", KOMACHIYO] },
    opp: { field: [GECKO_MORIA] },
    expect: { me: { keywords: { "OP18-081": [] } } },
  },

  // OP18-087 Stansen: This Character gains +12 cost. If you only have Characters with a cost of 12 or more, this Character gains +2000 power.
  {
    card: "OP18-087", name: "gains +2000 power while every Character you have costs 12 or more, its own +12 included (#1274)",
    me: { field: ["OP18-087", "OP18-087"] },
    opp: { field: [KAROO] },
    expect: { me: { power: { "OP18-087": 6000 } } },
  },
  {
    card: "OP18-087", name: "has no power bonus while you have a cheaper Character (#1274)",
    me: { field: ["OP18-087", KAROO] },
    expect: { me: { power: { "OP18-087": 4000 } } },
  },

  // OP18-071 Trebol: [Opponent's Turn] If your Leader is {Sugar}, this Characters gains [Blocker] and +2000 power.
  {
    card: "OP18-071", name: "is an 8000 power [Blocker] on your opponent's turn with a Sugar Leader (#1274)",
    leaders: { me: SUGAR_LEADER },
    me: { field: ["OP18-071"] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }],
    expect: { me: { power: { "OP18-071": 8000 }, blockers: ["OP18-071"] } },
  },
  {
    card: "OP18-071", name: "has no bonus on your opponent's turn when your Leader is not Sugar (#1274)",
    me: { field: ["OP18-071"] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }],
    expect: { me: { power: { "OP18-071": 6000 }, blockers: [] } },
  },
  {
    card: "OP18-071", name: "has no bonus on your own turn with a Sugar Leader (#1274)",
    leaders: { me: SUGAR_LEADER },
    me: { field: ["OP18-071"] },
    expect: { me: { power: { "OP18-071": 6000 }, keywords: { "OP18-071": [] } } },
  },
  // OP18-071 Trebol: [Once Per Turn] If your {Donquixote Pirates} type Character would be removed from the field by your
  // opponent's effect, you may DON!! -1 instead.
  {
    card: "OP18-071", name: "returns a DON!! instead of letting the opponent's effect K.O. your {Donquixote Pirates} Character (#1274)",
    me: { field: ["OP18-071", { card: BELLAMY, rested: true }], don: { active: 2 } },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [BELLAMY] }, { accept: true }, { pick: ["o0"] }],
    expect: { me: { field: ["OP18-071", BELLAMY], don: { active: 1, deck: 9 } } },
  },
  {
    card: "OP18-071", name: "lets the Character be K.O.'d when you decline (#1274)",
    me: { field: ["OP18-071", { card: BELLAMY, rested: true }], don: { active: 2 } },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [BELLAMY] }, { decline: true }],
    expect: { me: { field: ["OP18-071"], trash: [BELLAMY], don: { active: 2 } } },
  },
  {
    card: "OP18-071", name: "does not protect a Character without the {Donquixote Pirates} type (#1274)",
    me: { field: ["OP18-071", { card: KAROO, rested: true }], don: { active: 2 } },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [KAROO] }],
    expect: { me: { field: ["OP18-071"], trash: [KAROO], don: { active: 2 } }, pending: "none" },
  },

  // OP18-068 Senor Pink: [Once Per Turn] If this Character would be K.O.'d, you may DON!! -1 instead.
  {
    card: "OP18-068", name: "returns a DON!! instead of being K.O.'d in battle (#1274)",
    me: { field: [{ card: "OP18-068", rested: true }], don: { active: 2 } },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: mine("OP18-068") }, { passBattle: true }, { accept: true }, { pick: ["o0"] }],
    expect: { me: { field: ["OP18-068"], trash: [], don: { active: 1, deck: 9 } } },
  },
  {
    card: "OP18-068", name: "is K.O.'d when you decline the DON!! -1 (#1274)",
    me: { field: [{ card: "OP18-068", rested: true }], don: { active: 2 } },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: mine("OP18-068") }, { passBattle: true }, { decline: true }],
    expect: { me: { field: [], trash: ["OP18-068"], don: { active: 2 } } },
  },
  {
    card: "OP18-068", name: "is K.O.'d without a prompt when you have no DON!! to return (#1274)",
    me: { field: [{ card: "OP18-068", rested: true }], don: { active: 0 } },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: mine("OP18-068") }, { passBattle: true }],
    expect: { me: { field: [], trash: ["OP18-068"] }, pending: "none" },
  },

  // OP18-026 Sanji: If your {Straw Hat Crew} type Character would be removed from the field by your opponent's effect,
  // you may trash this Character instead.
  {
    card: "OP18-026", name: "is trashed instead of your {Straw Hat Crew} Character being K.O.'d by the opponent's effect (#1274)",
    me: { field: ["OP18-026", { card: ROBIN, rested: true }] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [ROBIN] }, { accept: true }],
    expect: { me: { field: [ROBIN], trash: ["OP18-026"] } },
  },
  {
    card: "OP18-026", name: "lets the Character be K.O.'d when you decline (#1274)",
    me: { field: ["OP18-026", { card: ROBIN, rested: true }] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [ROBIN] }, { decline: true }],
    expect: { me: { field: ["OP18-026"], trash: [ROBIN] } },
  },
  {
    card: "OP18-026", name: "does not protect a Character without the {Straw Hat Crew} type (#1274)",
    me: { field: ["OP18-026", { card: KAROO, rested: true }] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [KAROO] }],
    expect: { me: { field: ["OP18-026"], trash: [KAROO] }, pending: "none" },
  },
  {
    card: "OP18-026", name: "does not step in when the Character is K.O.'d in battle (#1274)",
    me: { field: ["OP18-026", { card: ROBIN, rested: true }] },
    opp: { field: [{ card: "OP02-007" }] },
    steps: [{ endTurn: true }, { attack: theirs("OP02-007"), at: mine(ROBIN) }, { passBattle: true }],
    expect: { me: { field: ["OP18-026"], trash: [ROBIN] }, pending: "none" },
  },
  // OP18-045 Mr.Prince: Also treat this card's name as [Sanji]. This Character gains +1000 power for every 5 Events in your trash.
  {
    card: "OP18-045", name: "gains +1000 power for every full 5 Events in your trash (#1274)",
    me: { field: ["OP18-045"], trash: [IRON_BODY, IRON_BODY, IRON_BODY, IRON_BODY, IRON_BODY, IRON_BODY, IRON_BODY, KAROO] },
    expect: { me: { power: { "OP18-045": 5000 } } },
  },
  {
    card: "OP18-045", name: "gets nothing from 4 Events, and non-Event cards do not count (#1274)",
    me: { field: ["OP18-045"], trash: [IRON_BODY, IRON_BODY, IRON_BODY, IRON_BODY, KAROO, KAROO, KAROO] },
    expect: { me: { power: { "OP18-045": 4000 } } },
  },
  {
    card: "OP18-045", name: "counts as [Sanji] for [Soba Mask]'s return of all your [Sanji] Characters (#1274)",
    me: { field: ["OP18-045", KAROO], hand: ["ST26-001"], don: { active: 7 } },
    steps: [{ play: "ST26-001" }],
    expect: { me: { field: ["ST26-001", KAROO], hand: ["OP18-045"] } },
  },

  // OP18-082 Catarina Devon: [When Attacking] This Character's base power becomes the same as your opponent's Leader's
  // power during this turn. [On K.O.] You may trash 1 card from your hand: If your Leader has the {Blackbeard Pirates} type,
  // play this Character card from your trash rested.
  {
    card: "OP18-082", name: "takes your opponent's Leader's power as its base power when attacking (#1274)",
    me: { field: ["OP18-082"] },
    steps: [{ attack: mine("OP18-082"), at: "leader" }],
    expect: { me: { power: { "OP18-082": 5000 } } },
  },
  {
    card: "OP18-082", name: "takes a 6000 power Leader's power, not a fixed value (#1274)",
    leaders: { opp: "OP02-001" },
    me: { field: ["OP18-082"] },
    steps: [{ attack: mine("OP18-082"), at: "leader" }],
    expect: { me: { power: { "OP18-082": 6000 } } },
  },
  {
    card: "OP18-082", name: "comes back rested from the trash when K.O.'d with a {Blackbeard Pirates} Leader and a card trashed (#1274)",
    leaders: { me: TEACH_LEADER },
    me: { field: [{ card: "OP18-082", rested: true }], hand: [VIVI] },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: mine("OP18-082") }, { passBattle: true }, { accept: true }],
    expect: { me: { field: ["OP18-082"], rested: ["OP18-082"], hand: [], trash: [VIVI] } },
  },
  {
    card: "OP18-082", name: "stays in the trash when your Leader is not {Blackbeard Pirates}, though the card is still trashed (#1274)",
    me: { field: [{ card: "OP18-082", rested: true }], hand: [VIVI] },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: mine("OP18-082") }, { passBattle: true }, { accept: true }],
    expect: { me: { field: [], hand: [], trash: ["OP18-082", VIVI] } },
  },
  {
    card: "OP18-082", name: "stays in the trash when you decline to trash a card (#1274)",
    leaders: { me: TEACH_LEADER },
    me: { field: [{ card: "OP18-082", rested: true }], hand: [VIVI] },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: mine("OP18-082") }, { passBattle: true }, { decline: true }],
    expect: { me: { field: [], hand: [VIVI], trash: ["OP18-082"] } },
  },

  // OP18-097 Abyss Pentagram: If your Leader has the {Celestial Dragons} type, the cost of playing {Holy Knights of God} or
  // {Five Elders} type Character cards with a cost of 2 or more from your hand will be reduced by 1.
  {
    card: "OP18-097", name: "makes a 4-cost {Five Elders} Character cost 3 with a {Celestial Dragons} Leader (#1274)",
    leaders: { me: "OP18-060" },
    me: { stage: "OP18-097", hand: ["OP13-083"], don: { active: 3 } },
    steps: [{ play: "OP13-083" }],
    expect: { me: { field: ["OP13-083"], don: { active: 0, rested: 3 } } },
  },
  {
    card: "OP18-097", name: "gives no discount when your Leader is not {Celestial Dragons} (#1274)",
    me: { stage: "OP18-097", hand: ["OP13-083"], don: { active: 3 } },
    steps: [{ play: "OP13-083", rejects: true }],
    expect: { me: { field: [], hand: ["OP13-083"] } },
  },
  {
    card: "OP18-097", name: "gives no discount to a Character without the {Holy Knights of God} or {Five Elders} type (#1274)",
    leaders: { me: "OP18-060" },
    me: { stage: "OP18-097", hand: [ROBIN], don: { active: 2 } },
    steps: [{ play: ROBIN, rejects: true }],
    expect: { me: { field: [], hand: [ROBIN] } },
  },
  // OP18-099 Kaku: [On Play] Add up to 1 card with a type including "CP" from your hand to the top or bottom of your Life
  // cards face-up. [Trigger] If your Leader's type includes "CP", draw 1 card and place up to 1 Character with a cost of 8
  // or less at the bottom of the owner's deck.
  {
    card: "OP18-099", name: "adds a {CP} card from your hand to the top of your Life face-up (#1274)",
    me: { hand: ["OP18-099", IRON_BODY, VIVI], don: { active: 7 }, life: [KAROO, KAROO] },
    steps: [{ play: "OP18-099" }, { pick: [IRON_BODY] }, { pick: ["Top"] }],
    expect: { me: { hand: [VIVI], life: [IRON_BODY, KAROO, KAROO], faceUp: [true, false, false] } },
  },
  {
    card: "OP18-099", name: "adds a {CP} card from your hand to the bottom of your Life face-up (#1274)",
    me: { hand: ["OP18-099", IRON_BODY, VIVI], don: { active: 7 }, life: [KAROO, KAROO] },
    steps: [{ play: "OP18-099" }, { pick: [IRON_BODY] }, { pick: ["Bottom"] }],
    expect: { me: { hand: [VIVI], life: [KAROO, KAROO, IRON_BODY], faceUp: [false, false, true] } },
  },
  {
    card: "OP18-099", name: "adds nothing when you choose no card (#1274)",
    me: { hand: ["OP18-099", IRON_BODY], don: { active: 7 }, life: [KAROO] },
    steps: [{ play: "OP18-099" }, { pick: [] }],
    expect: { me: { hand: [IRON_BODY], life: [KAROO] } },
  },
  {
    card: "OP18-099", name: "[Trigger] draws 1 and places a Character at the bottom of its owner's deck with a {CP} Leader (#1274)",
    leaders: { me: SPANDAM_LEADER },
    me: { life: ["OP18-099"], deckTop: [ROBIN] },
    opp: { field: [BIG_VANILLA, VIVI] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [VIVI] }],
    expect: { me: { hand: [ROBIN], trash: ["OP18-099"] }, opp: { field: [BIG_VANILLA], deckBottom: VIVI } },
  },
  {
    card: "OP18-099", name: "[Trigger] does nothing when your Leader's type does not include \"CP\" (#1274)",
    me: { life: ["OP18-099"], deckTop: [ROBIN] },
    opp: { field: [BIG_VANILLA, VIVI] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }],
    expect: { me: { hand: [], trash: ["OP18-099"] }, opp: { field: [BIG_VANILLA, VIVI] }, pending: "none" },
  },

  // OP18-105 Spandam: [Trigger] If your Leader's type includes "CP", reveal up to 1 card with a type including "CP" other than
  // [Spandam] from your hand. Activate the [Trigger] effect of the revealed card.
  {
    card: "OP18-105", name: "[Trigger] activates the [Trigger] of the {CP} card you reveal from your hand (#1274)",
    leaders: { me: SPANDAM_LEADER },
    me: { life: ["OP18-105", KAROO], hand: [PAPER_ART, VIVI], deckTop: [ROBIN] },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [PAPER_ART] }],
    expect: { me: { hand: [PAPER_ART, VIVI, ROBIN], trash: ["OP18-105"] } },
  },
  {
    card: "OP18-105", name: "[Trigger] activates nothing when you reveal no card (#1274)",
    leaders: { me: SPANDAM_LEADER },
    me: { life: ["OP18-105", KAROO], hand: [PAPER_ART, VIVI], deckTop: [ROBIN] },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [] }],
    expect: { me: { hand: [PAPER_ART, VIVI], trash: ["OP18-105"] } },
  },
  {
    card: "OP18-105", name: "[Trigger] does nothing when your Leader's type does not include \"CP\" (#1274)",
    me: { life: ["OP18-105", KAROO], hand: [PAPER_ART], deckTop: [ROBIN] },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }],
    expect: { me: { hand: [PAPER_ART], trash: ["OP18-105"] }, pending: "none" },
  },

  // OP18-109 Fukurou: [Trigger] If your Leader's type includes "CP", K.O. or rest up to 1 of your opponent's Characters with a
  // cost of 6 or less.
  {
    card: "OP18-109", name: "[Trigger] K.O.s the chosen Character when you pick K.O. (#1274)",
    leaders: { me: SPANDAM_LEADER },
    me: { life: ["OP18-109"] },
    opp: { field: [BIG_VANILLA, ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [ROBIN] }, { pick: ["K.O. it"] }],
    expect: { opp: { field: [BIG_VANILLA], trash: [ROBIN] } },
  },
  {
    card: "OP18-109", name: "[Trigger] rests the chosen Character when you pick rest (#1274)",
    leaders: { me: SPANDAM_LEADER },
    me: { life: ["OP18-109"] },
    opp: { field: [BIG_VANILLA, ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [ROBIN] }, { pick: ["Rest it"] }],
    expect: { opp: { field: [BIG_VANILLA, ROBIN], rested: [BIG_VANILLA, ROBIN], trash: [] } },
  },
  {
    card: "OP18-109", name: "[Trigger] does nothing when your Leader's type does not include \"CP\" (#1274)",
    me: { life: ["OP18-109"] },
    opp: { field: [BIG_VANILLA, ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }],
    expect: { opp: { field: [BIG_VANILLA, ROBIN], trash: [] }, pending: "none" },
  },

  // OP18-074 Can You Please Sail on the Ship I Made?!: [Trigger] DON!! -1: Add up to 2 Stage cards from your trash to your hand.
  {
    card: "OP18-074", name: "[Trigger] returns a DON!! to add up to 2 Stage cards from your trash to your hand (#1274)",
    me: { life: ["OP18-074"], trash: ["EB01-011", "OP18-097", "OP18-078", KAROO], don: { active: 2 } },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }, { accept: true }, { pick: ["o0"] }, { pick: ["EB01-011", "OP18-097"] }],
    expect: { me: { hand: ["EB01-011", "OP18-097"], trash: ["OP18-074", "OP18-078", KAROO], don: { active: 1, deck: 9 } } },
  },
  {
    card: "OP18-074", name: "[Trigger] adds no Stage cards when you have no DON!! to return (#1274)",
    me: { life: ["OP18-074"], trash: ["EB01-011"], don: { active: 0 } },
    opp: { field: [BIG_VANILLA] },
    steps: [{ endTurn: true }, { attack: theirs(BIG_VANILLA), at: "leader" }, { passBattle: true }, { accept: true }],
    expect: { me: { hand: [], trash: ["OP18-074", "EB01-011"] } },
  },
  // OP18-005 Kung Fu Jugon: [Your Turn] This Character gains +1000 power for every [Kung Fu Jugon].
  {
    card: "OP18-005", name: "gains +1000 power for every [Kung Fu Jugon] on your turn (#1274)",
    me: { field: ["OP18-005", "OP18-005", "OP18-005"] },
    expect: { me: { power: { "OP18-005": 3000 } } },
  },
  {
    card: "OP18-005", name: "has no bonus on your opponent's turn (#1274)",
    me: { field: ["OP18-005", "OP18-005", "OP18-005"] },
    steps: [{ endTurn: true }],
    expect: { me: { power: { "OP18-005": 0 } } },
  },
];

runScenarios("OP18 cards added from English pages (#1274)", rows);

describe("OP18-114 Wanze", () => {
  // [On Play] Look at all of your Life cards and place them back in your Life area in any order.
  it("puts your Life cards back in the order you choose (#1274)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, LUFFY_LEADER] });
    h.hand(0, "OP18-114");
    h.don(0, 3, 0);
    h.life(0, KAROO, ROBIN, VIVI);
    h.play(0, "OP18-114");
    const request = h.choice!.request;
    if (request?.type !== "order") throw new Error("expected an order prompt");
    expect(request.options.map((o) => o.defId)).toEqual([KAROO, ROBIN, VIVI]);
    const byCard = (defId: string) => request.options.find((o) => o.defId === defId)!.id;
    h.act(0, { type: "resolve_pending_choice", accept: true, orderedOptionIds: [byCard(VIVI), byCard(KAROO), byCard(ROBIN)], topOptionIds: [] });
    expect(h.state.players[0].life).toEqual([VIVI, KAROO, ROBIN]);
  });
});

describe("OP18 cards that pick from a restricted set (#1274)", () => {
  const optionDefIds = (h: Harness): string[] => {
    const request = h.choice!.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    return request.options.map((o) => o.defId!);
  };
  const lifeTrigger = (leader: string, life: string, setup: (h: Harness) => void): Harness => {
    const h = new Harness({ leaders: [leader, LUFFY_LEADER] });
    h.life(0, life);
    h.field(1, BIG_VANILLA);
    setup(h);
    h.act(0, { type: "end_turn" });
    h.attack(h.find(1, BIG_VANILLA)!, "leader");
    h.passBattle();
    h.accept();
    return h;
  };

  it("OP18-105 Spandam only offers other cards with a type including \"CP\" to reveal (#1274)", () => {
    const h = lifeTrigger(SPANDAM_LEADER, "OP18-105", (x) => x.hand(0, PAPER_ART, VIVI, "OP18-105", IRON_BODY));
    expect(optionDefIds(h).sort()).toEqual([IRON_BODY, PAPER_ART].sort());
  });

  it("OP18-109 Fukurou only offers Characters with a cost of 6 or less (#1274)", () => {
    const h = lifeTrigger(SPANDAM_LEADER, "OP18-109", (x) => x.field(1, ROBIN, "OP18-073"));
    // OP18-073 T-Bone costs 5; the 8-cost attacker is the only one out of reach.
    expect(optionDefIds(h).sort()).toEqual([ROBIN, "OP18-073"].sort());
  });

  it("OP18-099 Kaku only offers cards with a type including \"CP\" from your hand (#1274)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, LUFFY_LEADER] });
    h.hand(0, "OP18-099", IRON_BODY, VIVI, PAPER_ART);
    h.don(0, 7, 0);
    h.play(0, "OP18-099");
    expect(optionDefIds(h).sort()).toEqual([IRON_BODY, PAPER_ART].sort());
  });
});

describe("OP18-080 Van Augur with a second copy", () => {
  it("OP18-080 does not draw while you have another [Van Augur] (#1274)", () => {
    const h = new Harness({ leaders: [TEACH_LEADER, LUFFY_LEADER] });
    h.field(0, "OP18-080", "OP18-080");
    h.hand(0, VIVI);
    h.deckTop(0, ROBIN);
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "op09-081#m1" });
    h.forced();
    // Both copies queue; the order prompt is the only thing left to answer.
    if (h.choice?.unorderedChoices) h.act(0, { type: "order_pending_effects", orderedIds: h.choice.unorderedChoices.map((c) => c.id) });
    h.forced();
    expect(h.state.players[0].hand.map((c) => c.defId)).toEqual([]);
    expect(h.state.players[0].trash).toEqual([VIVI]);
  });
});

describe("OP18-074 picks only Stage cards (#1274)", () => {
  it("OP18-074 only offers Stage cards from the trash (#1274)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, LUFFY_LEADER] });
    h.life(0, "OP18-074");
    h.trash(0, "EB01-011", KAROO, ROBIN);
    h.don(0, 2, 0);
    h.field(1, BIG_VANILLA);
    h.act(0, { type: "end_turn" });
    h.attack(h.find(1, BIG_VANILLA)!, "leader");
    h.passBattle();
    h.accept();
    h.accept();
    h.pick("o0");
    const request = h.choice!.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    expect(request.options.map((o) => o.defId)).toEqual(["EB01-011"]);
  });
});
