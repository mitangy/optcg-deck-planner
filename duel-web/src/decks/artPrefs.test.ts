import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canUseEachArt, EACH_ART_ID, resolveCardImageUrl, resolveDeckAltId, resolveDeckArtChoice, setDeckArtChoice } from "./artPrefs";
import { getSavedDeck, saveDeck, setArtPref } from "./storage";
import {
  _resetSeatArtPrefsForTests,
  replaceSeatArtPrefs,
  setSeatArtPref,
} from "./seatArtPrefs";

const ALT_ST01_006_P1 = "https://tcgplayer-cdn.tcgplayer.com/product/485267_400w.jpg";
const STANDARD_ST01_006 = "https://tcgplayer-cdn.tcgplayer.com/product/288235_400w.jpg";

describe("resolveCardImageUrl seat scoping", () => {
  afterEach(() => {
    _resetSeatArtPrefsForTests();
  });

  it("uses different alt arts per seat for the same defId", () => {
    replaceSeatArtPrefs(0, { "ST01-006": "p1" });
    replaceSeatArtPrefs(1, { "ST01-006": "p2" });

    const seat0 = resolveCardImageUrl("ST01-006", { ownerSeat: 0 });
    const seat1 = resolveCardImageUrl("ST01-006", { ownerSeat: 1 });

    expect(seat0).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/485267_400w.jpg",
    );
    expect(seat1).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/501749_400w.jpg",
    );
    expect(seat0).not.toBe(seat1);
  });

  it("updates all copies for a seat when that seat's pref changes", () => {
    replaceSeatArtPrefs(0, {});
    replaceSeatArtPrefs(1, {});
    setSeatArtPref(0, "ST01-006", "p1");

    const a = resolveCardImageUrl("ST01-006", { ownerSeat: 0 });
    const b = resolveCardImageUrl("ST01-006", { ownerSeat: 0 });
    expect(a).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/485267_400w.jpg",
    );
    expect(b).toBe(a);

    // Opponent seat unchanged (standard art).
    const opp = resolveCardImageUrl("ST01-006", { ownerSeat: 1 });
    expect(opp).toBe(STANDARD_ST01_006);
  });

  it("clearing a seat pref restores standard art for that seat only", () => {
    replaceSeatArtPrefs(0, { "ST01-006": "p1" });
    replaceSeatArtPrefs(1, { "ST01-006": "p2" });
    setSeatArtPref(0, "ST01-006", null);

    expect(resolveCardImageUrl("ST01-006", { ownerSeat: 0 })).toBe(STANDARD_ST01_006);
    expect(resolveCardImageUrl("ST01-006", { ownerSeat: 1 })).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/501749_400w.jpg",
    );
  });
});

describe("deck editor art follows the global pref (#1002)", () => {
  const memory = new Map<string, string>();
  beforeEach(() => {
    memory.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => {
        memory.set(k, String(v));
      },
      removeItem: (k) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      key: () => null,
      get length() {
        return memory.size;
      },
    };
  });

  function newDeck() {
    return saveDeck({ name: "t", leaderId: "ST01-001", cards: ["ST01-006"] });
  }

  it("the Artwork label follows an alt picked in a game when the deck has no pref (#1002)", () => {
    const deck = newDeck();
    setArtPref("ST01-006", "p1");
    expect(deck.artPrefs?.["ST01-006"]).toBeUndefined();
    expect(resolveDeckAltId("ST01-006", deck)).toBe("p1");
    expect(resolveCardImageUrl("ST01-006", deck)).toBe(ALT_ST01_006_P1);
  });

  it("a deck pref wins over the global pref for the label (#1002)", () => {
    const deck = newDeck();
    setArtPref("ST01-006", "p1");
    const saved = setDeckArtChoice(deck.id, "ST01-006", "p2")!;
    expect(resolveDeckAltId("ST01-006", saved)).toBe("p2");
  });

  it("choosing Standard in a deck beats a global alt for the label and the image (#1002)", () => {
    const deck = newDeck();
    setArtPref("ST01-006", "p1");
    const saved = setDeckArtChoice(deck.id, "ST01-006", null)!;
    expect(resolveDeckAltId("ST01-006", saved)).toBe("");
    expect(resolveCardImageUrl("ST01-006", getSavedDeck(deck.id))).toBe(STANDARD_ST01_006);
  });
});

describe("One of each art (#1292)", () => {
  const SLEEPTIDS = "OP18-093"; // any number of copies; standard art plus two alternates
  const LOKI = "OP17-119"; // 4-copy card that also has alternate arts

  afterEach(() => {
    _resetSeatArtPrefsForTests();
  });

  it("spreads 8 copies over 3 arts as 3 / 3 / 2, standard art first (#1292)", () => {
    replaceSeatArtPrefs(0, { [SLEEPTIDS]: EACH_ART_ID });
    const urls = Array.from({ length: 8 }, (_, copy) => resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 0, artCopy: copy })!);
    const counts = new Map<string, number>();
    for (const u of urls) counts.set(u, (counts.get(u) ?? 0) + 1);
    expect([...counts.values()]).toEqual([3, 3, 2]);
    expect(urls[0]).not.toBe(urls[1]);
    expect(urls[1]).not.toBe(urls[2]);
    expect(urls[3]).toBe(urls[0]);
    // The standard art is the one with the three copies that lead.
    expect(urls[0]).toBe(resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 1 }));
  });

  it("shows the same art for every copy when a single alt is picked (#1292)", () => {
    replaceSeatArtPrefs(0, { [SLEEPTIDS]: "p2" });
    const urls = [0, 1, 2, 3].map((artCopy) => resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 0, artCopy }));
    expect(new Set(urls).size).toBe(1);
    expect(urls[0]).not.toBe(resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 1 }));
  });

  it("falls back to standard art for a copy with no rank (#1292)", () => {
    replaceSeatArtPrefs(0, { [SLEEPTIDS]: EACH_ART_ID });
    expect(resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 0 })).toBe(resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 1 }));
  });

  it("only offers it for a card that allows any number of copies and has alternate arts (#1292)", () => {
    expect(canUseEachArt(SLEEPTIDS)).toBe(true);
    expect(canUseEachArt(LOKI)).toBe(false);
    expect(canUseEachArt("ST01-003")).toBe(false);
    const deck = { id: "d", name: "d", leaderId: "ST01-001", cards: [], updatedAt: 1, artPrefs: { [SLEEPTIDS]: EACH_ART_ID, [LOKI]: EACH_ART_ID } };
    expect(resolveDeckArtChoice(SLEEPTIDS, deck)).toBe(EACH_ART_ID);
    expect(resolveDeckArtChoice(LOKI, deck)).toBe("");
  });
});
