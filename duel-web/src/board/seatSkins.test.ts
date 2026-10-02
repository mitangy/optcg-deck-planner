import { describe, expect, it } from "vitest";
import { sideSkins } from "./seatSkins";

const own = { playmat: "own-mat", cardBack: "own-back" };
const seatSkins = [
  { playmat: "seat0-mat", cardBack: "seat0-back" },
  { playmat: "seat1-mat", cardBack: "seat1-back" },
] as const;

describe("sideSkins", () => {
  it("spectating shows each seated player's playmat and card back, not the viewer's (#250)", () => {
    const s = sideSkins({ own, seatSkins, nearSeat: 1, farSeat: 0, hotseat: false, spectating: true });
    expect(s.near).toEqual({ playmat: "seat1-mat", cardBack: "seat1-back" });
    expect(s.far).toEqual({ playmat: "seat0-mat", cardBack: "seat0-back" });
  });

  it("spectating a seat with no shared art falls back to the default, not the viewer's (#250)", () => {
    const s = sideSkins({ own, seatSkins: [null, null], nearSeat: 0, farSeat: 1, hotseat: false, spectating: true });
    expect(s.near).toEqual({ playmat: null, cardBack: null });
  });

  it("playing online keeps your own art on your half and the opponent's on theirs (#250)", () => {
    const s = sideSkins({ own, seatSkins, nearSeat: 0, farSeat: 1, hotseat: false, spectating: false });
    expect(s.near).toEqual(own);
    expect(s.far).toEqual({ playmat: "seat1-mat", cardBack: "seat1-back" });
  });

  it("practice shows your art on both halves (#250)", () => {
    const s = sideSkins({ own, seatSkins, nearSeat: 0, farSeat: 1, hotseat: true, spectating: false });
    expect(s.far).toEqual(own);
  });
});
