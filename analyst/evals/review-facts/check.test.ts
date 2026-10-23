import type { Seat } from "@optcg/rules";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { checkClaim, resolveCard } from "./check";
import type { Claim } from "./extract";
import { gameFacts, nameOfCard } from "./facts";
import { fixtureReplay } from "./game";

const catalog = loadCatalog();
const replay = fixtureReplay();
const facts = gameFacts(replay);

// In the fixture seat 0 went first and lost; seat 1 won on turn 10.
const claim = (c: Partial<Claim> & Pick<Claim, "kind">): Claim => ({ quote: "q", actor: null, turn: null, card: null, target: null, number: null, ...c });
const verdict = (c: Partial<Claim> & Pick<Claim, "kind">, seat: Seat = 0) => checkClaim(claim(c), facts, seat, catalog);

describe("checking a claim against the replay", () => {
  it("supports a play on the turn it happened, for either seat's view (#675)", () => {
    expect(verdict({ kind: "played", actor: "you", turn: 3, card: "Pearl" }).verdict).toBe("supported");
    expect(verdict({ kind: "played", actor: "opponent", turn: 3, card: "Pearl" }, 1).verdict).toBe("supported");
    expect(verdict({ kind: "played", actor: "you", turn: 3, card: "Pearl" }, 1).verdict).toBe("contradicted");
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
    expect(verdict({ kind: "played", actor: "you", card: "Zoro" }).verdict).toBe("unverifiable");
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
    expect(verdict({ kind: "life_total", actor: "opponent", number: 1, quote: "You finished with the opponent on 1 Life" }).verdict).toBe("supported");
    expect(verdict({ kind: "life_total", actor: "opponent", number: 3, quote: "You finished with the opponent on 3 Life" }).verdict).toBe("contradicted");
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
    expect(verdict({ kind: "countered", actor: "opponent", turn: 10, card: counter }).verdict).toBe("contradicted");
  });

  it("puts a block on the player who defended, not the attacker (#675)", () => {
    const blocker = nameOfCard("OP03-031");
    expect(verdict({ kind: "blocked", actor: "you", turn: 8, card: blocker }).verdict).toBe("supported");
    expect(verdict({ kind: "blocked", actor: "opponent", turn: 8, card: blocker }).verdict).toBe("contradicted");
  });

  it("puts a K.O. on the card's owner and checks a stated count (#675)", () => {
    expect(verdict({ kind: "ko", actor: "you", turn: 8, card: "Pearl" }).verdict).toBe("supported");
    expect(verdict({ kind: "ko", actor: "opponent", turn: 8, card: "Pearl" }).verdict).toBe("contradicted");
    expect(verdict({ kind: "ko", actor: "you", turn: 8, number: 2 }).verdict).toBe("supported");
    expect(verdict({ kind: "ko", actor: "you", turn: 8, number: 1 }).verdict).toBe("contradicted");
  });

  it("counts the Life cards taken in a turn when the claim gives a number (#675)", () => {
    expect(verdict({ kind: "life_taken", actor: "you", turn: 10, number: 2 }).verdict).toBe("supported");
    expect(verdict({ kind: "life_taken", actor: "you", turn: 10, number: 1 }).verdict).toBe("contradicted");
    expect(verdict({ kind: "life_taken", actor: "you", turn: 4 }).verdict).toBe("wrong_turn");
    expect(verdict({ kind: "life_taken", actor: "you", card: "Pearl" }).verdict).toBe("contradicted");
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
