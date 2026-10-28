import type { Seat } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { checkClaim, resolveCard } from "./check";
import type { Claim } from "./extract";
import { gameFacts, nameOfCard, type GameFacts, type TurnFacts } from "./facts";
import { fixtureReplay } from "./game";

const catalog = loadCatalog();
const replay = fixtureReplay();
const facts = gameFacts(replay);

// In the fixture seat 0 went first and lost; seat 1 won on turn 10.
// The default quote states the card and target by name, as a review would (a card the quote lacks counts as inferred, #687).
const claim = (c: Partial<Claim> & Pick<Claim, "kind">): Claim => ({ quote: [c.card, c.target].filter(Boolean).join(" ") || "q", actor: null, turn: null, card: null, target: null, number: null, ...c });
const verdict = (c: Partial<Claim> & Pick<Claim, "kind">, seat: Seat = 0) => checkClaim(claim(c), facts, seat, catalog);

describe("checking a claim against the replay", () => {
  it("supports a play on the turn it happened, for either seat's view (#675)", () => {
    expect(verdict({ kind: "played", actor: "you", turn: 3, card: "Pearl" }).verdict).toBe("supported");
    expect(verdict({ kind: "played", actor: "opponent", turn: 3, card: "Pearl" }, 1).verdict).toBe("supported");
    expect(verdict({ kind: "played", actor: "you", turn: 3, card: "Roronoa Zoro" }, 1).verdict).toBe("contradicted");
  });

  it("calls the same play on another turn wrong_turn and names the real turn (#675)", () => {
    const r = verdict({ kind: "played", actor: "you", turn: 5, card: "Pearl" });
    expect(r.verdict).toBe("wrong_turn");
    expect(r.reason).toContain("turn 3");
  });

  it("contradicts a card that was in the decks but never played (#675)", () => {
    expect(verdict({ kind: "played", actor: "you", card: "Roronoa Zoro" }).verdict).toBe("contradicted");
    expect(verdict({ kind: "played", actor: "you", turn: 3, card: "Roronoa Zoro" }).verdict).toBe("contradicted");
  });

  it("contradicts a real card that is in neither deck, but leaves a name it cannot place unverifiable (#675)", () => {
    const outside = [...catalog.cards.values()].find((c) => !facts.universe.some((id) => nameOfCard(id) === c.name))!;
    expect(verdict({ kind: "played", actor: "you", card: outside.name })).toMatchObject({ verdict: "contradicted", reason: expect.stringContaining("neither deck") });
    expect(verdict({ kind: "played", actor: "you", card: "Captain Zxqvbn" }).verdict).toBe("unverifiable");
  });

  it("leaves a partial card name that fits two cards unverifiable, and takes one that fits one (#675)", () => {
    // "Zoro" is both Roronoa Zoro and Zoro-Juurou in this game; "Garp" is only Monkey.D.Garp.
    expect(resolveCard("Zoro", facts, catalog).status).toBe("ambiguous");
    // Neither Zoro was played by you, so every reading is wrong (#687).
    expect(verdict({ kind: "played", actor: "you", card: "Zoro" }).verdict).toBe("contradicted");
    expect(verdict({ kind: "played", actor: "opponent", turn: 2, card: "Garp" }).verdict).toBe("supported");
    expect(verdict({ kind: "played", actor: "opponent", turn: 2, card: "Monkey D. Garp" }).verdict).toBe("supported");
  });

  it("reads a card number as that card's name (#675)", () => {
    expect(verdict({ kind: "played", actor: "you", turn: 3, card: "OP03-031" }).verdict).toBe("supported");
  });

  it("contradicts the wrong winner and checks the way it ended (#675)", () => {
    expect(verdict({ kind: "result", actor: "you" }).verdict).toBe("contradicted");
    expect(verdict({ kind: "result", actor: "opponent" }).verdict).toBe("supported");
    expect(verdict({ kind: "result", actor: "you" }, 1).verdict).toBe("supported");
    expect(verdict({ kind: "result", actor: "opponent", target: "life" }).verdict).toBe("supported");
    expect(verdict({ kind: "result", actor: "opponent", target: "deck_out" }).verdict).toBe("contradicted");
  });

  it("contradicts a Life total outside what the player had that turn (#675)", () => {
    // Turn 7: you were at 4 the whole turn; turn 8: you fell from 4 to 2.
    expect(verdict({ kind: "life_total", actor: "you", turn: 7, number: 2 }).verdict).toBe("contradicted");
    expect(verdict({ kind: "life_total", actor: "you", turn: 8, number: 2 }).verdict).toBe("supported");
    expect(verdict({ kind: "life_total", actor: "opponent", turn: 8, number: 1 }).verdict).toBe("supported");
  });

  it("compares a final Life total to where the game ended, and any other to every total the player had (#675)", () => {
    expect(verdict({ kind: "life_total", actor: "opponent", number: 1, quote: "You finished the game with the opponent on 1 Life" }).verdict).toBe("supported");
    expect(verdict({ kind: "life_total", actor: "opponent", number: 3, quote: "You finished the game with the opponent on 3 Life" }).verdict).toBe("contradicted");
    expect(verdict({ kind: "life_total", actor: "opponent", number: 3, quote: "the opponent dropped to 3 Life" }).verdict).toBe("supported");
    expect(verdict({ kind: "life_total", actor: "opponent", number: 5, quote: "the opponent dropped to 5 Life" }).verdict).toBe("contradicted");
  });

  it("checks who went first and who mulliganed (#675)", () => {
    expect(verdict({ kind: "went_first", actor: "you" }).verdict).toBe("supported");
    expect(verdict({ kind: "went_first", actor: "you" }, 1).verdict).toBe("contradicted");
    expect(verdict({ kind: "mulligan", actor: "you", number: 0 }).verdict).toBe("supported");
    expect(verdict({ kind: "mulligan", actor: "you", number: 1 }).verdict).toBe("contradicted");
  });

  it("checks attacks by attacker and target, and the turn they happened on (#675)", () => {
    expect(verdict({ kind: "attacked", actor: "you", turn: 3, card: "Luffy & Ace", target: "leader" }).verdict).toBe("supported");
    expect(verdict({ kind: "attacked", actor: "opponent", turn: 8, card: "Older Brother Marine", target: "Diamante" }).verdict).toBe("supported");
    // Marine hit Diamante on turn 8 and went for the Leader on turn 10.
    expect(verdict({ kind: "attacked", actor: "opponent", turn: 8, card: "Older Brother Marine", target: "leader" }).verdict).toBe("wrong_turn");
    expect(verdict({ kind: "attacked", actor: "you", turn: 3, card: "Luffy & Ace", target: "Pearl" }).verdict).toBe("contradicted");
  });

  it("puts a counter on the player who defended, not the attacker (#675)", () => {
    const counter = nameOfCard("OP06-014");
    expect(verdict({ kind: "countered", actor: "you", turn: 10, card: counter }).verdict).toBe("supported");
    expect(verdict({ kind: "countered", actor: "opponent", turn: 10, card: counter }).verdict).toBe("unverifiable");
  });

  it("puts a block on the player who defended, not the attacker (#675)", () => {
    const blocker = nameOfCard("OP03-031");
    expect(verdict({ kind: "blocked", actor: "you", turn: 8, card: blocker }).verdict).toBe("supported");
    expect(verdict({ kind: "blocked", actor: "opponent", turn: 8, card: blocker }).verdict).toBe("unverifiable");
  });

  it("puts a K.O. on the card's owner and checks a stated count (#675)", () => {
    expect(verdict({ kind: "ko", actor: "you", turn: 8, card: "Pearl" }).verdict).toBe("supported");
    expect(verdict({ kind: "ko", actor: "opponent", turn: 8, card: "Pearl" }).verdict).toBe("unverifiable");
    expect(verdict({ kind: "ko", actor: "you", turn: 8, number: 2 }).verdict).toBe("supported");
    expect(verdict({ kind: "ko", actor: "you", turn: 8, number: 3 }).verdict).toBe("contradicted");
  });

  it("counts the Life cards taken in a turn when the claim gives a number (#675)", () => {
    expect(verdict({ kind: "life_taken", actor: "you", turn: 10, number: 2 }).verdict).toBe("supported");
    expect(verdict({ kind: "life_taken", actor: "you", turn: 10, number: 3 }).verdict).toBe("contradicted");
    expect(verdict({ kind: "life_taken", actor: "you", turn: 4 }).verdict).toBe("wrong_turn");
    expect(verdict({ kind: "life_taken", actor: "you", card: "Usopp" }).verdict).toBe("contradicted");
  });

  it("matches a Trigger to the Life card that was taken (#675)", () => {
    expect(verdict({ kind: "trigger", actor: "opponent", turn: 3, card: "Captains Assembled" }).verdict).toBe("supported");
    expect(verdict({ kind: "trigger", actor: "you", turn: 10, card: "Emporio Energy Hormone" }).verdict).toBe("supported");
    expect(verdict({ kind: "trigger", actor: "you", turn: 3, card: "Emporio Energy Hormone" }).verdict).toBe("wrong_turn");
  });

  it("leaves a claim that names no event unverifiable (#675)", () => {
    expect(verdict({ kind: "other" }).verdict).toBe("unverifiable");
  });

  it("does not call a claim contradicted when the replay stopped before it could happen (#675)", () => {
    const stopped = { ...facts, divergedAt: "Replay diverged at intent 50" };
    expect(checkClaim(claim({ kind: "played", actor: "you", turn: 9, card: "Roronoa Zoro" }), stopped, 0, catalog).verdict).toBe("unverifiable");
  });
});

// Synthetic games for the #687 rules: small enough that the data can tell the right answer from the wrong one.
const NONE = { active: [5, 5], rested: [0, 0], attached: [0, 0], area: [5, 5], field: [5, 5] } as TurnFacts["don"][0];
const synth = (turns: Partial<TurnFacts>[], universe: string[] = []): GameFacts => ({
  ...facts,
  divergedAt: undefined,
  universe: [...facts.universe, ...universe],
  turns: turns.map((t, i) => ({
    turn: i + 1,
    activeSeat: 0,
    plays: [],
    attacks: [],
    kos: [],
    lifeTaken: [],
    triggersAccepted: [],
    lifeAtStart: [5, 5],
    lifeAtEnd: [5, 5],
    lifeRange: [[5, 5], [5, 5]],
    lifeLost: [0, 0],
    don: [NONE, NONE],
    handRange: [[5, 5], [5, 5]],
    onBoard: [[], []],
    trashed: [[], []],
    ...t,
  })),
});
const on = (f: GameFacts, c: Partial<Claim> & Pick<Claim, "kind">, seat: Seat = 0) => checkClaim(claim(c), f, seat, catalog);
const PEARL = "OP03-031";
const MAGURA = "OP02-016";
const SMOKER = "OP11-005";
const NAMI = "P-102";
const LUFFY_ACE = "ST30-001";
const play = (seat: Seat, card: string) => ({ seat, card, name: nameOfCard(card) });
const hit = (seat: Seat, card: string) => ({ seat, card, name: nameOfCard(card) });

describe("checking a claim loosely where the audit found the checker wrong (#687)", () => {
  it("counts a stated number of K.O.s or Life hits as at least that many (#687)", () => {
    const f = synth([{ lifeTaken: [hit(0, PEARL), hit(0, MAGURA)], lifeLost: [2, 0], kos: [hit(0, PEARL), hit(0, MAGURA)] }]);
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, number: 1 }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, number: 3 }).verdict).toBe("contradicted");
    expect(on(f, { kind: "ko", actor: "you", turn: 1, number: 1 }).verdict).toBe("supported");
    expect(on(f, { kind: "ko", actor: "you", turn: 1, number: 3 }).verdict).toBe("contradicted");
  });

  it("counts Life an effect removed as Life taken, with no life_taken event (#687)", () => {
    // Four Life hits by effect only, and a turn where one battle hit came with two effect losses.
    const f = synth([{ lifeLost: [2, 0] }, { lifeTaken: [hit(0, PEARL)], lifeLost: [3, 0] }, {}]);
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1 }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, number: 2 }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, number: 3 }).verdict).toBe("contradicted");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 2, number: 3 }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 2, number: 4 }).verdict).toBe("contradicted");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 3 }).verdict).toBe("wrong_turn");
    expect(on(f, { kind: "life_taken", actor: "opponent", turn: 1 }).verdict).toBe("unverifiable");
  });

  it("compares a Life claim with a card named to the Life actually lost, not to the plays and attacks (#692)", () => {
    const smokerSwing = { seat: 1 as Seat, attacker: SMOKER, attackerName: "Smoker", target: "leader", targetName: "leader", attackerPower: 6000, defenderPower: 5000, counters: [], hit: true };
    const f = synth([{ plays: [play(1, SMOKER)], attacks: [smokerSwing], lifeTaken: [hit(0, PEARL)], lifeLost: [1, 0] }]);
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, card: "Smoker", number: 2 }).verdict).toBe("contradicted");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, card: "Smoker", number: 1 }).verdict).toBe("supported");
  });

  it("lets a Life claim name the card the other player played or attacked with that turn (#687)", () => {
    const f = synth([
      { plays: [play(1, NAMI), play(1, NAMI)], lifeLost: [2, 0] },
      { plays: [play(1, NAMI)], lifeLost: [0, 0] },
      { plays: [play(0, NAMI)], lifeLost: [2, 0] },
      { attacks: [{ seat: 1, attacker: SMOKER, attackerName: "Smoker", target: "leader", targetName: "leader", attackerPower: 6000, defenderPower: 5000, counters: [], hit: true }], lifeLost: [1, 0] },
    ]);
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, card: "Nami", number: 2 }).verdict).toBe("supported");
    // Nami was played, but no Life was lost that turn.
    expect(on(f, { kind: "life_taken", actor: "you", turn: 2, card: "Nami" }).verdict).toBe("wrong_turn");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 4, card: "Smoker" }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 4, card: "Magura" }).verdict).toBe("contradicted");
  });

  it("calls a K.O. or Trigger that only holds for the other player unverifiable, not wrong (#687)", () => {
    const f = synth([{ kos: [hit(1, MAGURA)], triggersAccepted: [{ seat: 0, card: "OP12-097", name: "Captains Assembled" }] }, { kos: [hit(1, PEARL)] }]);
    expect(on(f, { kind: "ko", actor: "you", turn: 1, card: "Magura" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "ko", actor: "opponent", turn: 1, card: "Magura" }).verdict).toBe("supported");
    expect(on(f, { kind: "trigger", actor: "opponent", turn: 1, card: "Captains Assembled" }).verdict).toBe("unverifiable");
    // Neither player lost it on that turn, or only on another turn for the other player: still wrong.
    expect(on(f, { kind: "ko", actor: "you", turn: 1, card: "Smoker" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "ko", actor: "you", turn: 1, card: "Pearl" }).verdict).toBe("contradicted");
  });

  it("keeps a card that nobody had wrong, whichever seat is named (#687)", () => {
    const f = synth([{ plays: [play(1, PEARL)] }]);
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Magura" }).verdict).toBe("contradicted");
  });

  it("does not hold a card against the claim when the quote never states it (#687)", () => {
    const attack = { seat: 0 as Seat, attacker: LUFFY_ACE, attackerName: "Luffy & Ace", target: "leader", targetName: "leader", attackerPower: 5000, defenderPower: 5000, counters: [], hit: true };
    const f = synth([{ attacks: [attack] }]);
    const inferred = { kind: "attacked" as const, actor: "you" as const, turn: 1, card: "Smoker", target: "leader" };
    expect(on(f, { ...inferred, quote: "You attacked the Leader." }).verdict).toBe("unverifiable");
    // The same claim with the card in the quote is wrong; and an attack that never happened stays wrong either way.
    expect(on(f, { ...inferred, quote: "Smoker attacked the Leader." }).verdict).toBe("contradicted");
    expect(on(f, { ...inferred, actor: "opponent", quote: "They attacked the Leader." }).verdict).toBe("contradicted");
    // A card number in the claim is stated when the quote has the number.
    const played = synth([{ plays: [play(1, PEARL)] }]);
    expect(on(played, { kind: "played", actor: "you", turn: 1, card: PEARL, quote: `You played ${PEARL}.` }).verdict).toBe("unverifiable");
  });

  it("looks up only the part of a name the quote writes (#687)", () => {
    const f = synth([{ plays: [play(0, LUFFY_ACE)] }]);
    // "a Luffy" could be Luffy & Ace, who was played; Monkey.D.Luffy was not.
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Monkey.D.Luffy", quote: "You played a Luffy with 5 DON!!" }).verdict).toBe("supported");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Monkey.D.Luffy", quote: "You played Monkey.D.Luffy with 5 DON!!" }).verdict).toBe("contradicted");
  });

  it("checks a name that fits several cards as each of them (#687)", () => {
    const f = synth([{ plays: [play(0, LUFFY_ACE)] }, {}]);
    expect(resolveCard("Luffy", f, catalog).status).toBe("ambiguous");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Luffy" }).verdict).toBe("supported");
    expect(on(f, { kind: "played", actor: "you", turn: 2, card: "Luffy" }).verdict).toBe("wrong_turn");
    expect(on(f, { kind: "played", actor: "opponent", turn: 1, card: "Luffy" }).verdict).toBe("unverifiable");
    // One reading cannot be decided (the target was not recorded) and the other is wrong.
    const odd = synth([{ attacks: [{ seat: 0, attacker: LUFFY_ACE, attackerName: "Luffy & Ace", target: "unknown", targetName: "unknown", attackerPower: 5000, defenderPower: 5000, counters: [], hit: true }] }]);
    expect(on(odd, { kind: "attacked", actor: "you", turn: 1, card: "Luffy", target: "Magura" }).verdict).toBe("unverifiable");
  });

  it("stays unverifiable for a name that fits too many cards to try each (#687)", () => {
    const f = synth([{}], ["OP01-083", "OP01-084", "OP01-085", "OP04-071", "OP04-072", "OP04-073"]);
    const r = resolveCard("Mr", f, catalog);
    expect(r).toMatchObject({ status: "ambiguous" });
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Mr" }).verdict).toBe("unverifiable");
  });

  it("keeps a digit as part of a name, so Mr.1 is not Mr.2 or Mr.3 (#687)", () => {
    const f = synth([{ plays: [play(0, "OP01-084")] }], ["OP01-083", "OP01-084", "OP01-085"]);
    expect(resolveCard("Mr.1", f, catalog)).toMatchObject({ status: "ok", name: "mr 1 daz bonez" });
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Mr.1" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Mr.2" }).verdict).toBe("supported");
  });

  it("splits a list of cards and needs every one to hold (#687)", () => {
    const f = synth([{ plays: [play(0, PEARL), play(0, MAGURA)] }, { plays: [play(0, SMOKER)] }]);
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Pearl, Magura" }).verdict).toBe("supported");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Pearl and Magura" }).verdict).toBe("supported");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Pearl and Kuro" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Pearl, Smoker" }).verdict).toBe("wrong_turn");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Pearl, Captain Zxqvbn", quote: "Pearl, Captain Zxqvbn" }).verdict).toBe("unverifiable");
  });

  it("takes an unnamed Character as any attack target that is not the Leader (#687)", () => {
    const atk = (target: string) => ({ seat: 0 as Seat, attacker: LUFFY_ACE, attackerName: "Luffy & Ace", target, targetName: target, attackerPower: 5000, defenderPower: 5000, counters: [], hit: true });
    const f = synth([{ attacks: [atk(MAGURA)] }, { attacks: [atk("leader")] }]);
    for (const target of ["character", "a Character", "Characters"]) {
      expect(on(f, { kind: "attacked", actor: "you", turn: 1, target }).verdict).toBe("supported");
      expect(on(f, { kind: "attacked", actor: "you", turn: 2, target }).verdict).toBe("wrong_turn");
    }
  });
});

describe("checking DON!!, hand, board and trash claims (#687)", () => {
  const range = (a: [number, number], r: [number, number], at: [number, number], area: [number, number], field: [number, number]) => ({ active: a, rested: r, attached: at, area, field });
  const f = synth([
    { don: [range([4, 5], [0, 1], [0, 2], [5, 5], [5, 7]), range([1, 1], [3, 3], [0, 0], [4, 4], [4, 4])], handRange: [[4, 5], [2, 2]], onBoard: [[MAGURA], [PEARL]], trashed: [[PEARL], []] },
    { don: [range([9, 9], [0, 0], [0, 0], [9, 9], [9, 9]), NONE], handRange: [[0, 3], [5, 5]], onBoard: [[], []], trashed: [[], [SMOKER]] },
  ]);

  it("compares a DON!! count to the range that player had that turn, by kind (#687)", () => {
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 4, target: "active" }).verdict).toBe("supported");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 6, target: "active" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 4, target: "rested" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 1, target: "rested" }).verdict).toBe("supported");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 2, target: "attached" }).verdict).toBe("supported");
    // "On the field" is the cost area, or the cost area plus DON!! given to cards.
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 5, target: "total" }).verdict).toBe("supported");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 7, target: "total" }).verdict).toBe("supported");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 8, target: "total" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 7, target: null }).verdict).toBe("supported");
  });

  it("reads a DON!! count for the player named, and for any turn when none is given (#687)", () => {
    expect(on(f, { kind: "don", actor: "opponent", turn: 1, number: 1, target: "active" }).verdict).toBe("supported");
    expect(on(f, { kind: "don", actor: "you", turn: 1, number: 1, target: "active" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "don", actor: "you", number: 9, target: "active" }).verdict).toBe("supported");
    expect(on(f, { kind: "don", actor: "you", number: 8, target: "active" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "don", actor: "you", turn: 9, number: 5, target: "active" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "don", actor: "you", turn: 1, target: "active" }).verdict).toBe("unverifiable");
  });

  it("compares a hand size to the range that player had that turn (#687)", () => {
    expect(on(f, { kind: "hand_size", actor: "you", turn: 2, number: 0 }).verdict).toBe("supported");
    expect(on(f, { kind: "hand_size", actor: "you", turn: 1, number: 0 }).verdict).toBe("contradicted");
    expect(on(f, { kind: "hand_size", actor: "you", turn: 1, number: 6 }).verdict).toBe("contradicted");
    expect(on(f, { kind: "hand_size", actor: "opponent", turn: 1, number: 2 }).verdict).toBe("supported");
    expect(on(f, { kind: "hand_size", actor: "you", turn: 1, number: 2 }).verdict).toBe("contradicted");
  });

  it("checks a card was on that player's field during the turn (#687)", () => {
    expect(on(f, { kind: "on_board", actor: "you", turn: 1, card: "Magura" }).verdict).toBe("supported");
    expect(on(f, { kind: "on_board", actor: "opponent", turn: 1, card: "Magura" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "on_board", actor: "opponent", turn: 1, card: "Pearl" }).verdict).toBe("supported");
    expect(on(f, { kind: "on_board", actor: "you", turn: 2, card: "Magura" }).verdict).toBe("wrong_turn");
    expect(on(f, { kind: "on_board", actor: "you", turn: 1 }).verdict).toBe("unverifiable");
  });

  it("checks a card went to that player's trash during the turn (#687)", () => {
    expect(on(f, { kind: "trashed", actor: "you", turn: 1, card: "Pearl" }).verdict).toBe("supported");
    expect(on(f, { kind: "trashed", actor: "opponent", turn: 1, card: "Pearl" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "trashed", actor: "opponent", turn: 2, card: "Smoker" }).verdict).toBe("supported");
    expect(on(f, { kind: "trashed", actor: "opponent", turn: 1, card: "Smoker" }).verdict).toBe("wrong_turn");
  });
});


describe("checking a claim against the second audit's mistakes (#695)", () => {
  const swing = (seat: Seat, counters: string[]) => ({ seat, attacker: SMOKER, attackerName: "Smoker", target: "leader", targetName: "leader", attackerPower: 6000, defenderPower: 5000, counters, hit: false });

  it("calls an event that only holds for the other player unverifiable for every kind (#695)", () => {
    const f = synth([
      {
        plays: [play(1, PEARL)],
        attacks: [swing(1, [NAMI])],
        kos: [hit(1, MAGURA)],
        lifeTaken: [hit(1, SMOKER)],
        lifeLost: [0, 1],
        onBoard: [[], [LUFFY_ACE]],
        trashed: [[], ["OP01-025"]],
      },
    ]);
    // The attacker is the opponent, so the counter was yours to use only if you defended: "you countered" holds for seat 0.
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Pearl" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "attacked", actor: "you", turn: 1, card: "Smoker", target: "leader" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "countered", actor: "opponent", turn: 1, card: "Nami" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, card: "Smoker" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "on_board", actor: "you", turn: 1, card: "Luffy & Ace" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "trashed", actor: "you", turn: 1, card: "Roronoa Zoro" }).verdict).toBe("unverifiable");
    // Neither player did it: still wrong.
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Magura" }).verdict).toBe("contradicted");
  });

  it("counts the counters a defender used as played cards by the defender (#695)", () => {
    const f = synth([{ attacks: [swing(0, [NAMI, NAMI])] }]);
    expect(on(f, { kind: "played", actor: "opponent", turn: 1, card: "Nami" }).verdict).toBe("supported");
    expect(on(f, { kind: "played", actor: "opponent", card: "Nami" }).verdict).toBe("supported");
    expect(on(f, { kind: "played", actor: "you", turn: 1, card: "Nami" }).verdict).toBe("unverifiable");
    expect(on(f, { kind: "played", actor: "opponent", turn: 2, card: "Nami" }).verdict).toBe("wrong_turn");
  });

  it("compares an end-of-turn Life total with every Life the player had, and only a game-end claim with the final Life (#695)", () => {
    const f = synth([{ lifeRange: [[5, 5], [1, 5]] }, { lifeRange: [[5, 5], [0, 1]] }]);
    const seen = { ...f, finalLife: [5, 0] as [number, number], lifeSeen: [[5], [5, 1, 0]] as [number[], number[]] };
    const life = (quote: string) => on(seen, { kind: "life_total", actor: "opponent", number: 1, quote }).verdict;
    expect(life("they ended on 1 Life")).toBe("supported");
    expect(life("they ended the game on 1 Life")).toBe("contradicted");
    expect(life("they finished with 1 Life")).toBe("supported");
    expect(life("their final Life was 1")).toBe("contradicted");
    expect(life("at the end they had 1 Life")).toBe("contradicted");
    expect(life("the game ended with them on 1 Life")).toBe("contradicted");
    expect(life("they dropped to 1 Life")).toBe("supported");
  });

  it("lets a Life claim name a card either player played or attacked with, or one on its own field, that turn (#695)", () => {
    const f = synth([
      { plays: [play(0, NAMI)], lifeLost: [2, 0] },
      { attacks: [{ ...swing(0, []), attacker: SMOKER }], lifeLost: [1, 0] },
      { onBoard: [[PEARL], [MAGURA]], lifeLost: [1, 0] },
      { onBoard: [[PEARL], []], lifeLost: [0, 0] },
    ]);
    expect(on(f, { kind: "life_taken", actor: "you", turn: 1, card: "Nami" }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 2, card: "Smoker" }).verdict).toBe("supported");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 3, card: "Pearl" }).verdict).toBe("supported");
    // A card that only sat on the other player's field did not cause the loss.
    expect(on(f, { kind: "life_taken", actor: "you", turn: 3, card: "Magura" }).verdict).toBe("contradicted");
    expect(on(f, { kind: "life_taken", actor: "you", turn: 4, card: "Pearl" }).verdict).toBe("wrong_turn");
  });
});
