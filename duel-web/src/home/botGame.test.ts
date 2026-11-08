import { describe, expect, it } from "vitest";
import {
  BOT_DECK_RANDOM,
  BOT_DECK_RANDOM_META,
  BOT_LEVELS,
  DEFAULT_BOT_LEVEL,
  botCreateOptions,
  isBotMetaValue,
  metaDeckValue,
  pickRandomDeck,
  resolveBotDeck,
} from "./botGame";
import type { SavedDeck } from "../decks/storage";
import { BOT_META_DECKS } from "@optcg/rules/botMetaDecks";

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

  describe("Bot's deck: meta decks (#1180)", () => {
    const first = () => 0;
    const last = () => 0.9999;

    it("a meta pick plays that meta list: its Leader and all 50 cards (#1180)", () => {
      const pick = BOT_META_DECKS[3]!;
      const got = resolveBotDeck([a, b], metaDeckValue(pick.leaderId));
      expect(got.leaderId).toBe(pick.leaderId);
      expect(got.cards).toEqual(pick.deck);
      expect(got.cards).toHaveLength(50);
      expect(botCreateOptions("normal", got).bot?.deck).toEqual({ leaderId: pick.leaderId, deck: pick.deck });
    });

    it("random meta draws from all ten meta decks, first to last, never from your decks (#1180)", () => {
      expect(BOT_META_DECKS).toHaveLength(10);
      expect(resolveBotDeck([a, b], BOT_DECK_RANDOM_META, first).leaderId).toBe(BOT_META_DECKS[0]!.leaderId);
      expect(resolveBotDeck([a, b], BOT_DECK_RANDOM_META, last).leaderId).toBe(BOT_META_DECKS[9]!.leaderId);
    });

    it("one of your saved decks is played as it is (#1180)", () => {
      expect(resolveBotDeck([a, b], "a")).toBe(a);
      expect(resolveBotDeck([a, b], "b")).toBe(b);
    });

    it("a pick that no longer exists falls back to a random meta deck, not to yours (#1180)", () => {
      expect(resolveBotDeck([a, b], "deleted", first).leaderId).toBe(BOT_META_DECKS[0]!.leaderId);
      expect(resolveBotDeck([a, b], "meta:NOT-A-LEADER", last).leaderId).toBe(BOT_META_DECKS[9]!.leaderId);
      expect(resolveBotDeck([], "")).toSatisfy((d: SavedDeck) => BOT_META_DECKS.some((m) => m.leaderId === d.leaderId));
    });

    it("knows which picker values need no saved deck behind them (#1180)", () => {
      expect(isBotMetaValue(BOT_DECK_RANDOM_META)).toBe(true);
      expect(isBotMetaValue(metaDeckValue("OP13-001"))).toBe(true);
      expect(isBotMetaValue("a")).toBe(false);
    });
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
      expect(pickRandomDeck([short, f1, f2], first)).toBe(f1);
      expect(pickRandomDeck([short, f1, f2], last)).toBe(f2);
    });

    it("random falls back to every deck when none is complete, and to nothing without decks (#994)", () => {
      expect(pickRandomDeck([short, a], last)).toBe(a);
      expect(pickRandomDeck([], first)).toBeNull();
    });

    it("random picks the last candidate when the roll is just under 1 (#994)", () => {
      expect(pickRandomDeck([f1, f2, f3], last)).toBe(f3);
      expect(pickRandomDeck([f1, f2, f3], () => 1)).toBe(f3);
    });
  });
});
