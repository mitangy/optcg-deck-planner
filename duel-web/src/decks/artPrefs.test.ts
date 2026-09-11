import { afterEach, describe, expect, it } from "vitest";
import { resolveCardImageUrl } from "./artPrefs";
import {
  _resetSeatArtPrefsForTests,
  replaceSeatArtPrefs,
  setSeatArtPref,
} from "./seatArtPrefs";

describe("resolveCardImageUrl seat scoping", () => {
  afterEach(() => {
    _resetSeatArtPrefsForTests();
  });

  it("uses different alt arts per seat for the same defId", () => {
    replaceSeatArtPrefs(0, { "ST01-006": "p1" });
    replaceSeatArtPrefs(1, { "ST01-006": "p2" });

    const seat0 = resolveCardImageUrl("ST01-006", { ownerSeat: 0 });
    const seat1 = resolveCardImageUrl("ST01-006", { ownerSeat: 1 });

    expect(seat0).toBe("/cards/ST01-006_p1.webp");
    expect(seat1).toBe("/cards/ST01-006_p2.webp");
    expect(seat0).not.toBe(seat1);
  });

  it("updates all copies for a seat when that seat's pref changes", () => {
    replaceSeatArtPrefs(0, {});
    replaceSeatArtPrefs(1, {});
    setSeatArtPref(0, "ST01-006", "p1");

    const a = resolveCardImageUrl("ST01-006", { ownerSeat: 0 });
    const b = resolveCardImageUrl("ST01-006", { ownerSeat: 0 });
    expect(a).toBe("/cards/ST01-006_p1.webp");
    expect(b).toBe(a);

    // Opponent seat unchanged (standard / default atlas art = TCGplayer CDN).
    const opp = resolveCardImageUrl("ST01-006", { ownerSeat: 1 });
    expect(opp).toMatch(/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+/);
  });

  it("clearing a seat pref restores standard art for that seat only", () => {
    replaceSeatArtPrefs(0, { "ST01-006": "p1" });
    replaceSeatArtPrefs(1, { "ST01-006": "p2" });
    setSeatArtPref(0, "ST01-006", null);

    expect(resolveCardImageUrl("ST01-006", { ownerSeat: 0 })).toMatch(
      /tcgplayer-cdn\.tcgplayer\.com\/product\/\d+/,
    );
    expect(resolveCardImageUrl("ST01-006", { ownerSeat: 1 })).toBe(
      "/cards/ST01-006_p2.webp",
    );
  });
});
