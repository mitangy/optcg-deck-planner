import { describe, expect, it } from "vitest";
import { BOT_DECK_MIRROR, BOT_LEVELS, DEFAULT_BOT_LEVEL, botCreateOptions, resolveBotDeck } from "./botGame";
import type { SavedDeck } from "../decks/storage";

const deck = (id: string, leaderId: string, cards: string[]): SavedDeck => ({ id, name: id, leaderId, cards, updatedAt: 1 });
const a = deck("a", "ST01-001", ["ST01-003", "ST01-003"]);
const b = deck("b", "OP01-001", ["OP01-006"]);

describe("Play vs Bot setup", () => {
  it("creates an unranked, timerless room that gives the bot its level and deck (#631)", () => {
    expect(botCreateOptions("easy", b)).toEqual({
      ranked: false,
      bot: { level: "easy", deck: { leaderId: "OP01-001", deck: ["OP01-006"] } },
      timer: {},
    });
  });

  it("offers Easy, Normal and Hard, starts on Normal, and sends the Hard level to the room (#631)", () => {
    expect(BOT_LEVELS.map((l) => l.level)).toEqual(["easy", "normal", "hard"]);
    expect(DEFAULT_BOT_LEVEL).toBe("normal");
    expect(botCreateOptions("hard", a).bot?.level).toBe("hard");
    expect(BOT_LEVELS.find((l) => l.level === "hard")?.hint).toMatch(/thinks ahead/i);
  });

  it("gives the bot a copy of your deck by default, or the saved deck picked, or yours if that deck is gone (#631)", () => {
    const decks = [a, b];
    expect(resolveBotDeck(decks, b, BOT_DECK_MIRROR)).toBe(b);
    expect(resolveBotDeck(decks, b, "a")).toBe(a);
    expect(resolveBotDeck(decks, b, "deleted")).toBe(b);
  });
});
