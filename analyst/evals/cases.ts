/**
 * The Log Pose eval cases: 50 scored (A rulings 15, B interactions 12, C legality and odds 13, D matchup and
 * build 10) plus two gated extras (E). Questions are written in our own words; never paste a FAQ question or
 * answer here. Official rows are referenced by card id and `qh` (shortHash of the FAQ question).
 */
import type { CardScenario, EvalCase } from "./types";

// ——— decks (OPTCGSim text, as a player would paste them) ———

const x = (n: number, id: string) => `${n}x${id}`;
const fours = (prefix: string, nums: string[]) => nums.map((n) => x(4, `${prefix}-${n}`));
const lines = (...parts: (string | string[])[]) => parts.flat().join("\n");

const OP01_FOURS = fours("OP01", ["004", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014", "015"]);

/** OP01-001 Roronoa Zoro (red) with 50 red OP01 cards: 12 at 4 copies and 2 Nami. 16 cards with +2000 counter. */
export const ZORO = lines(x(1, "OP01-001"), OP01_FOURS, x(2, "OP01-016"));
export const ZORO_5X = lines(x(1, "OP01-001"), x(5, "OP01-004"), OP01_FOURS.slice(1), x(1, "OP01-016"));
export const ZORO_49 = lines(x(1, "OP01-001"), OP01_FOURS, x(1, "OP01-016"));
export const ZORO_OFF = lines(x(1, "OP01-001"), OP01_FOURS, x(2, "OP01-040"));
export const RAYLEIGH_OK = lines(x(1, "OP12-001"), OP01_FOURS, x(2, "OP01-016"));
export const RAYLEIGH_BAD = lines(x(1, "OP12-001"), OP01_FOURS, x(2, "EB01-002"));
const IMU_FOURS = fours("OP13", ["086", "094", "085", "087", "092", "093", "095", "083", "089", "081", "088", "080"]);
export const IMU_OK = lines(x(1, "OP13-079"), IMU_FOURS, x(2, "OP13-096"));
export const IMU_BAD = lines(x(1, "OP13-079"), IMU_FOURS, x(2, "EB01-051"));
export const PACIFISTA = lines(x(1, "OP01-060"), x(10, "OP01-075"), fours("OP01", ["077", "064", "076", "082", "083", "085", "072", "073", "079", "080"]));
export const LUFFY_PAIR = lines(
  x(1, "OP11-040"),
  x(4, "OP11-067"),
  fours("OP11", ["048", "049", "057", "065", "070", "077", "063", "042", "050", "056", "069"]),
  x(2, "OP11-072"),
);

// ——— engine scenario rows for group B (copied from packages/rules/src/__tests__/scenarios) ———

const KAROO = "ST01-003"; // vanilla 1-cost 3000, red
const VIVI = "ST01-009"; // vanilla 2-cost 4000, red
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const BIG = "EB02-001"; // vanilla 5-cost 7000
const CHOPPER = "ST01-006"; // 1-cost 1000 [Blocker]
const SANJI = "OP04-104"; // 5000-power [Blocker]

const mine = (card: string) => ({ seat: 0 as const, card });
const theirs = (card: string) => ({ seat: 1 as const, card });

const KAIDO_ONCE: CardScenario = {
  card: "OP01-061", name: "triggers only once per turn",
  leaders: { me: "OP01-061" },
  me: { field: [VIVI, ROBIN], don: { active: 0 }, leaderDon: 1 },
  opp: { field: [{ card: KAROO, rested: true }, { card: CHOPPER, rested: true }] },
  steps: [{ attack: mine(VIVI), at: theirs(KAROO) }, { passBattle: true }, { attack: mine(ROBIN), at: theirs(CHOPPER) }, { passBattle: true }],
  expect: { opp: { field: [] }, me: { don: { active: 1, deck: 8 } } },
};
const KING_NINE: CardScenario = {
  card: "OP01-091", name: "gives no power change with 9 DON!!",
  leaders: { me: "OP01-091" },
  me: { don: { active: 9 } },
  opp: { field: [KAROO, VIVI] },
  expect: { opp: { power: { [KAROO]: 3000, [VIVI]: 4000 } } },
};
const SMILEY_THREE: CardScenario = {
  card: "OP01-072", name: "gains +1000 per hand card with 1 DON!! attached",
  me: { hand: [KAROO, KAROO, KAROO], field: [{ card: "OP01-072", don: 1 }] },
  expect: { me: { power: { "OP01-072": 5000 } } },
};
const USOPP_BLOCKERS: CardScenario = {
  card: "ST01-002", name: "stops a 5000-power Blocker but not a 1000-power one",
  me: { field: [{ card: "ST01-002", don: 2 }] },
  opp: { field: [SANJI, CHOPPER] },
  steps: [{ attack: mine("ST01-002"), at: "leader" }],
  expect: { opp: { blockers: [CHOPPER] } },
};
const FRANKY_ACTIVE: CardScenario = {
  card: "OP01-021", name: "with 1 DON!! attacks an active Character",
  me: { field: [{ card: "OP01-021", don: 1 }] },
  opp: { field: [KAROO] },
  steps: [{ attack: mine("OP01-021"), at: theirs(KAROO) }, { passBattle: true }],
  expect: { opp: { field: [], trash: [KAROO] } },
};
const MORIA_FIVE: CardScenario = {
  card: "OP01-068", name: "has Double Attack with 5 cards in hand",
  me: { hand: [KAROO, KAROO, KAROO, KAROO, KAROO], field: ["OP01-068"] },
  expect: { me: { keywords: { "OP01-068": ["double_attack"] } } },
};
const BURGESS_SURVIVES: CardScenario = {
  card: "OP09-086", name: "survives an opposing K.O. effect",
  me: { hand: ["OP01-054"], don: { active: 5 } },
  opp: { field: [{ card: "OP09-086", rested: true }] },
  steps: [{ play: "OP01-054" }, { pick: ["OP09-086"] }],
  expect: { opp: { field: ["OP09-086"], trash: [] } },
};
const IVANKOV_HAND: CardScenario = {
  card: "OP02-049", name: "does not draw at end of turn with a card in hand",
  leaders: { me: "OP02-049" },
  me: { hand: [KAROO], deckTop: [VIVI, ROBIN] },
  steps: [{ endTurn: true }],
  expect: { me: { hand: [KAROO], deckDelta: 0 } },
};
const BEAM_TWO_LIFE: CardScenario = {
  card: "OP01-029", name: "gives +4000 with 2 Life",
  me: { hand: ["OP01-029"], don: { active: 1 }, life: [KAROO, KAROO] },
  opp: { field: [ROBIN] },
  steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP01-029" }, { pick: ["ST01-001"] }],
  expect: { me: { power: { "ST01-001": 9000 } } },
};
const RAYLEIGH_MONO: CardScenario = {
  card: "OP14-108", name: "does nothing with a single-color Leader",
  me: { hand: ["OP14-108"], don: { active: 6 } },
  opp: { field: [BIG, "EB01-041"], life: [KAROO, KAROO, KAROO] },
  steps: [{ play: "OP14-108" }],
  expect: { opp: { field: [BIG, "EB01-041"] }, pending: "none" },
};
const DOCQ_BLACKBEARD: CardScenario = {
  card: "OP16-109", name: "with a Blackbeard Pirates Leader, draws and K.O.s two cost-1 Characters",
  leaders: { me: "OP09-081" },
  me: { field: [{ card: "OP16-109", rested: true }], deckTop: [VIVI] },
  opp: { field: [VIVI, KAROO, CHOPPER, ROBIN] },
  steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine("OP16-109") }, { passBattle: true }, { pick: [KAROO, CHOPPER] }],
  expect: { me: { hand: [VIVI], deckDelta: -1 }, opp: { field: [VIVI, ROBIN], trash: [KAROO, CHOPPER] } },
};
const CARIBOU_KOS: CardScenario = {
  card: "OP01-007", name: "when K.O.'d in battle, K.O.s a 3000-power Character but not a 7000 one",
  me: { field: [{ card: "OP01-007", rested: true }] },
  opp: { field: [ROBIN, KAROO, BIG] },
  steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine("OP01-007") }, { passBattle: true }, { pick: [KAROO] }],
  expect: { me: { field: [], trash: ["OP01-007"] }, opp: { field: [ROBIN, BIG], trash: [KAROO] } },
};

const faq = (...also: string[]) => ({ all: [["{faq}", ...also]] });
const card = (id: string) => ({ all: [[`card:${id}`]] });
const deck = { all: [["{deck}"]] };

export const CASES: EvalCase[] = [
  // ——— A: rulings with official answers ———
  { id: "A01", group: "A", question: "King (OP01-091) checks for 10 DON!! cards on my field. I have 8 in my cost area and 2 given to my Leader. Does that count as 10?", faq: { card: "OP01-091", qh: "e21c04d1" }, verdict: "yes", cites: faq() },
  { id: "A02", group: "A", question: "I'm on Kaido leader (OP17-058). I didn't use his On Your Opponent's Attack the first time they attacked this turn. Can I use it when their next Character attacks?", faq: { card: "OP17-058", qh: "6c867055" }, verdict: "yes", cites: faq() },
  { id: "A03", group: "A", question: "Smiley (OP01-072) is attacking. My opponent's Counter changes how many cards I hold. Does Smiley's power change before the damage is decided?", faq: { card: "OP01-072", qh: "3a9d22a2" }, verdict: "yes", cites: faq() },
  { id: "A04", group: "A", question: "Alvida (OP01-064) bounces my opponent's Character with her When Attacking. Can they use that card's Counter from hand in the same battle?", faq: { card: "OP01-064", qh: "ad2f0da3" }, verdict: "yes", cites: faq() },
  { id: "A05", group: "A", question: "My DON!! deck is empty. Can I still play Elephant's Marchoo (OP01-115) just for the K.O.?", faq: { card: "OP01-115", qh: "6222a08f" }, verdict: "yes", cites: faq() },
  { id: "A06", group: "A", question: "A Character says [DON!! x1] and I've given it 2 DON!!. Is the effect still on?", faq: { general: "e5f37301" }, verdict: "yes", cites: faq() },
  { id: "A07", group: "A", question: "After I block with a [Blocker], can I still use Counters to pump that blocker?", faq: { general: "cc7af16d" }, verdict: "yes", cites: faq() },
  { id: "A08", group: "A", question: "Has Pica (OP05-032) had an official errata? If so, when?", faq: { errata: "OP05-032", k: 1 }, verdict: "yes", date: "December 8, 2023", cites: faq() },
  { id: "A09", group: "A", question: "My Kaido leader (OP01-061) has exactly one DON!! given. I pay a DON!! −1 cost with that DON!!, and the effect K.O.s an opposing Character. Does Kaido still add a DON!!?", faq: { card: "OP01-061", qh: "d9fe88b5" }, verdict: "no", cites: faq() },
  { id: "A10", group: "A", question: "If Enel (OP15-058) is my leader, do I still bring a 10-card DON!! deck?", faq: { card: "OP15-058", qh: "1c93a3cc" }, verdict: "no", cites: faq() },
  { id: "A11", group: "A", question: "Rayleigh leader (OP12-001) can't run cards costing 5 or more. Can I play a 5-cost card whose cost an effect can lower to 4?", faq: { card: "OP12-001", qh: "0cf64493" }, verdict: "no", cites: faq() },
  { id: "A12", group: "A", question: "With Boa Hancock leader (OP14-041), I play a Character on my opponent's turn but I'm close to decking out. Can I skip the draw?", faq: { card: "OP14-041", qh: "8635998e" }, verdict: "no", cites: faq() },
  { id: "A13", group: "A", question: "Can a rested Character with [Blocker] still block?", faq: { general: "99d5d707" }, verdict: "no", cites: faq("rule:10-1-4") },
  { id: "A14", group: "A", question: "My opponent is at 1 Life and my attacker has [Double Attack]. If it connects, do I win right there?", faq: { general: "c53ae4f4" }, verdict: "no", cites: faq() },
  { id: "A15", group: "A", question: "Is there an official ruling on Sanji (OP01-013): can I use his Activate: Main with 0 Life cards to get +2000?", faq: { noRuling: "OP01-013" }, verdict: "no_ruling", cites: { all: [["card:OP01-013"]], none: ["ruling:OP01-013#<n>"] } },

  // ——— B: interactions the engine verifies ———
  { id: "B01", group: "B", question: "Kaido leader (OP01-061) with 1 DON!! given. On my turn I K.O. two of my opponent's Characters in battle. How many DON!! does Kaido add?", scenario: KAIDO_ONCE, number: 1, cites: card("OP01-061") },
  { id: "B02", group: "B", question: "I'm on King (OP01-091) with 9 DON!! on my field. What's the power of my opponent's Karoo (ST01-003) on my turn?", scenario: KING_NINE, number: 3000, cites: card("OP01-091") },
  { id: "B03", group: "B", question: "Smiley (OP01-072) has 1 DON!! given and I hold 3 cards. What's its power on my turn?", scenario: SMILEY_THREE, number: 5000, cites: card("OP01-072") },
  { id: "B04", group: "B", question: "Usopp (ST01-002) attacks with 2 DON!! given. My opponent has Sanji (OP04-104, 5000-power Blocker) and Tony Tony.Chopper (ST01-006). Which of them can block?", scenario: USOPP_BLOCKERS, can: [CHOPPER], cannot: [SANJI], cites: card("ST01-002") },
  { id: "B05", group: "B", question: "Franky (OP01-021) has 1 DON!! given. Can he attack my opponent's *active* Character?", scenario: FRANKY_ACTIVE, verdict: "yes", cites: card("OP01-021") },
  { id: "B06", group: "B", question: "On my turn I hold 5 cards. Does Gecko Moria (OP01-068) have Double Attack?", scenario: MORIA_FIVE, verdict: "yes", cites: card("OP01-068") },
  { id: "B07", group: "B", question: "My opponent plays X.Drake (OP01-054) and targets my rested Jesus Burgess (OP09-086) with its On Play K.O. Does Burgess survive?", scenario: BURGESS_SURVIVES, verdict: "yes", cites: card("OP09-086") },
  { id: "B08", group: "B", question: "Ivankov leader (OP02-049): I end my turn holding 1 card. Do I draw 2?", scenario: IVANKOV_HAND, verdict: "no", cites: card("OP02-049") },
  { id: "B09", group: "B", question: "I'm at 2 Life. I Counter with Radical Beam!! (OP01-029) on my Luffy leader (ST01-001, 5000) during my opponent's attack. What's my leader's power in that battle?", scenario: BEAM_TWO_LIFE, number: 9000, cites: card("OP01-029") },
  { id: "B10", group: "B", question: "I play Silvers Rayleigh (OP14-108) with a one-color Leader, and my opponent is at 3 Life. Does his On Play K.O. anything?", scenario: RAYLEIGH_MONO, verdict: "no", cites: card("OP14-108") },
  { id: "B11", group: "B", question: "I'm on Teach (OP09-081). My Doc Q (OP16-109) is K.O.'d in battle. What do I get?", scenario: DOCQ_BLACKBEARD, number: 2, mustSay: [{ re: "draw(s|ing)?\\s+(1|one|a)\\b", example: "You draw 1 card." }], cites: card("OP16-109") },
  { id: "B12", group: "B", question: "Caribou (OP01-007) is K.O.'d in battle. Can his On K.O. take out my opponent's Karoo (ST01-003, 3000 power)?", scenario: CARIBOU_KOS, verdict: "yes", cites: card("OP01-007") },

  // ——— C: deck legality and odds with exact answers ———
  { id: "C01", group: "C", question: "Is this deck legal?", deck: ZORO, tool: "analyze_deck", args: { text: ZORO }, expect: { kind: "legality", legal: true }, cites: deck },
  { id: "C02", group: "C", question: "Is this deck legal?", deck: ZORO_5X, tool: "analyze_deck", args: { text: ZORO_5X }, expect: { kind: "legality", legal: false, hint: "copies", offending: ["OP01-004"] }, cites: deck },
  { id: "C03", group: "C", question: "Is this list ready for a tournament?", deck: ZORO_49, tool: "analyze_deck", args: { text: ZORO_49 }, expect: { kind: "legality", legal: false, hint: "count", mention: 49 }, cites: deck },
  { id: "C04", group: "C", question: "Is this deck legal?", deck: ZORO_OFF, tool: "analyze_deck", args: { text: ZORO_OFF }, expect: { kind: "legality", legal: false, hint: "offcolor", offending: ["OP01-040"] }, cites: deck },
  { id: "C05", group: "C", question: "Is my Rayleigh deck legal?", deck: RAYLEIGH_BAD, tool: "analyze_deck", args: { text: RAYLEIGH_BAD }, expect: { kind: "legality", legal: false, hint: "leader-rule:max_cost:4", offending: ["EB01-002"] }, cites: deck },
  { id: "C06", group: "C", question: "Is my Imu deck legal?", deck: IMU_BAD, tool: "analyze_deck", args: { text: IMU_BAD }, expect: { kind: "legality", legal: false, hint: "leader-rule:no_events_cost_ge:2", offending: ["EB01-051"] }, cites: deck },
  { id: "C07", group: "C", question: "Can I run 10 Pacifista in this Doflamingo deck?", deck: PACIFISTA, tool: "analyze_deck", args: { text: PACIFISTA }, expect: { kind: "legality", legal: true }, cites: deck },
  { id: "C08", group: "C", question: "Is this Luffy deck legal?", deck: LUFFY_PAIR, tool: "analyze_deck", args: { text: LUFFY_PAIR }, live: true, expect: { kind: "legality", legal: false, bannedPair: ["OP11-040", "OP11-067"], offending: ["OP11-040", "OP11-067"] }, cites: { all: [["{deck}", "ruling:OP11-067#ban"]] } },
  { id: "C09", group: "C", question: "Can I use Dracule Mihawk (OP14-020) as my leader at a tournament on 2026-10-15?", tool: "card_rulings", args: { ids: ["OP14-020"] }, live: true, expect: { kind: "ban_status", matches: "^banned" }, cites: { all: [["ruling:OP14-020#ban"]] } },
  { id: "C10", group: "C", question: "50-card deck, 4 copies of my key card. What's the chance it's in my opening hand going first?", tool: "draw_odds", args: { deckSize: 50, hits: 4, goingFirst: true, turns: 1 }, expect: { kind: "odds", turn: 1, percent: 35.3 }, cites: { all: [["odds:d50h4x1f"]] } },
  { id: "C11", group: "C", question: "I run 8 copies of my searchers in 50 cards. What's my chance to see at least one by my turn 3 going second, no mulligan?", tool: "draw_odds", args: { deckSize: 50, hits: 8, goingFirst: false, turns: 3 }, expect: { kind: "odds", turn: 3, percent: 78 }, cites: { all: [["odds:d50h8x1s"]] } },
  { id: "C12", group: "C", question: "Same 50 cards and 8 searchers, going second, but I mulligan any opening hand without one. Chance to see one by my turn 3?", tool: "draw_odds", args: { deckSize: 50, hits: 8, goingFirst: false, mulligan: true, turns: 3 }, expect: { kind: "odds", turn: 3, percent: 91.2 }, cites: { all: [["odds:d50h8x1sm"]] } },
  { id: "C15", group: "C", question: "How many +2000 counters does this deck run, and what are the odds I hold at least 2 by my turn 3 going second?", deck: ZORO, tool: "draw_odds", args: { text: ZORO, kind: "counter2000", atLeast: 2, goingFirst: false, turns: 3 }, expect: { kind: "odds", turn: 3, percent: 80.6, hits: 16 }, cites: { all: [["{deck}"], ["odds:d50h16x2s"]] } },

  // ——— D: matchup and build questions, judged and graded by Miko ———
  { id: "D01", group: "D", question: "I'm on Sabo (OP13-004) into Enel (OP15-058). Who's favoured, what decides it, and should I go first?", focus: ["Flags the playbook note as a draft.", "Quotes the number of games and the interval.", "Says the win rates come from optcgduel.app games, not tournaments.", "Names Enel's 6-card DON!! deck and at least 2 cards."], cites: { all: [["playbook:OP13-004~OP15-058"], ["stats:OP13-004~OP15-058"]] } },
  { id: "D02", group: "D", question: "Give me a mulligan guide for Nico Robin (OP09-062) going second.", focus: ["Gives keep or ship rules that name cards.", "Flags the playbook note as a draft."], cites: { all: [["playbook:OP09-062"]] } },
  { id: "D03", group: "D", question: "Give me 4 changes (+N/-N) to strengthen the early game.", deck: ZORO, checks: ["edits_legal"], focus: ["Lists the changes as +N/-N lines with card numbers.", "Offers export_deck.", "Cites the deck check."], cites: deck },
  { id: "D04", group: "D", question: "Kaido (OP17-058) vs Luffy (OP17-079): what are the key turns from Kaido's side?", focus: ["Gives a turn-specific plan.", "Labels its judgement.", "Uses the notes from both sides of the matchup."], cites: { all: [["playbook:OP17-058~OP17-079"]] } },
  { id: "D05", group: "D", question: "Is Boa Hancock (OP14-041) any good right now? What's her win rate?", focus: ["Quotes games and the interval.", "Says the source is optcgduel.app, not tournaments.", "Gives no blended or estimated rate."], cites: { all: [["stats:OP14-041"]] } },
  { id: "D06", group: "D", question: "What's Enel's (OP15-058) cheese or OTK line, and when is it live?", focus: ["Cites the card text it relies on.", "Says when the line is unavailable.", "Flags the playbook note as a draft."], cites: { all: [["playbook:OP15-058"], ["card:*"]] } },
  { id: "D07", group: "D", question: "Tune this for the Ace (OP16-001) matchup.", deck: RAYLEIGH_OK, checks: ["edits_legal"], focus: ["Every suggestion costs 4 or less, as the Rayleigh leader requires.", "Lists the changes as +N/-N lines.", "Labels the matchup reasoning as judgement."], cites: { all: [["{deck}"], ["playbook:OP16-001", "playbook:OP12-001"]] } },
  { id: "D08", group: "D", question: "Xebec (OP17-039) into Robin (OP09-062), going second: how do I play turns 2-4?", focus: ["Goes turn by turn.", "Names cards.", "Flags the playbook note as a draft."], cites: { all: [["playbook:OP17-039~OP09-062"]] } },
  { id: "D09", group: "D", question: "Add 4 more events for removal.", deck: IMU_OK, checks: ["edits_legal"], focus: ["Says only cost-1 events fit this leader, or picks legal ones.", "Lists the changes as +N/-N lines."], cites: deck },
  { id: "D10", group: "D", question: "What's Ace's (OP16-001) win rate against Kaido (OP17-058)?", checks: ["no_invented_rate"], focus: ["Says there are too few games (3).", "Gives any judgement clearly labeled.", "Invents no number."], cites: { all: [["stats:OP16-001~OP17-058"]] } },

  // ——— E: gated on tools the chat may not offer (not counted in the 50) ———
  { id: "E01", group: "E", question: "How does Sabo (OP13-004) do in recent tournaments, and how does that compare with ladder games?", requiresTools: ["tournament_stats"], focus: ["Keeps tournament results and optcgduel.app games separate.", "Quotes the sample sizes."], cites: { all: [["tourney:OP13-004"], ["stats:OP13-004"]] } },
  { id: "E02", group: "E", question: "How often does this deck have a 2-3-4 curve by turn 4 going first?", deck: ZORO, requiresTools: ["simulate"], focus: ["Says it is a simulation.", "Gives the sample size."], cites: { all: [["sim:*"]] } },
];

/** The text sent as the player's message: the question, then the pasted deck list when the case has one. */
export function messageOf(c: EvalCase): string {
  return c.deck ? `${c.question}\n\n${c.deck}` : c.question;
}
