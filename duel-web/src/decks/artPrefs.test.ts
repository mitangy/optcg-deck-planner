import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCardImageUrl, resolveDeckAltId, setDeckArtChoice } from "./artPrefs";
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
