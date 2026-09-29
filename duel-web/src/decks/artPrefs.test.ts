import { afterEach, describe, expect, it } from "vitest";
import { resolveCardImageUrl } from "./artPrefs";
import {
  _resetSeatArtPrefsForTests,
  replaceSeatArtPrefs,
  setSeatArtPref,
} from "./seatArtPrefs";

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
