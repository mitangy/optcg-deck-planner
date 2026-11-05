import { describe, expect, it } from "vitest";
import {
  BOT_DECK_MIRROR,
  BOT_DECK_RANDOM,
  BOT_LEVELS,
  DEFAULT_BOT_LEVEL,
  botCreateOptions,
  pickRandomDeck,
  resolveBotDeck,
} from "./botGame";
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

  describe("Random deck (#994)", () => {
    const full = (id: string) => deck(id, "ST01-001", Array.from({ length: 50 }, () => "ST01-003"));
    const short = deck("short", "ST01-001", ["ST01-003"]);
    const f1 = full("f1");
    const f2 = full("f2");
    const f3 = full("f3");
    const first = () => 0;
    const last = () => 0.9999;

    it("random skips incomplete decks even when one is first in the list (#994)", () => {
      expect(pickRandomDeck([short, f1, f2], null, first)).toBe(f1);
      expect(pickRandomDeck([short, f1, f2], null, last)).toBe(f2);
    });

    it("random falls back to every deck when none is complete, and to nothing without decks (#994)", () => {
      expect(pickRandomDeck([short, a], null, last)).toBe(a);
      expect(pickRandomDeck([], null, first)).toBeNull();
    });

    it("random picks the last candidate when the roll is just under 1 (#994)", () => {
      expect(pickRandomDeck([f1, f2, f3], null, last)).toBe(f3);
      expect(pickRandomDeck([f1, f2, f3], null, () => 1)).toBe(f3);
    });

    it("random avoids the deck to avoid when another complete deck exists, and keeps it when it is the only one (#994)", () => {
      expect(pickRandomDeck([f1, f2, f3], "f1", first)).toBe(f2);
      expect(pickRandomDeck([f1, short], "f1", first)).toBe(f1);
    });

    it("the bot's Random picks a deck other than yours, not a mirror (#994)", () => {
      const decks = [f1, f2, short];
      expect(resolveBotDeck(decks, f1, BOT_DECK_RANDOM, first)).toBe(f2);
      expect(resolveBotDeck(decks, f2, BOT_DECK_RANDOM, first)).toBe(f1);
      expect(resolveBotDeck([short], short, BOT_DECK_RANDOM, first)).toBe(short);
    });
  });
});
