import { describe, expect, it } from "vitest";
import { sideSkins } from "./seatSkins";

const own = { playmat: "own-mat", cardBack: "own-back", donArt: 111 };
const seatSkins = [
  { playmat: "seat0-mat", cardBack: "seat0-back", donArt: 200 },
  { playmat: "seat1-mat", cardBack: "seat1-back", donArt: 201 },
] as const;

describe("sideSkins", () => {
  it("spectating shows each seated player's playmat and card back, not the viewer's (#250)", () => {
    const s = sideSkins({ own, seatSkins, nearSeat: 1, farSeat: 0, hotseat: false, spectating: true });
    expect(s.near).toEqual({ playmat: "seat1-mat", cardBack: "seat1-back", donArt: 201 });
    expect(s.far).toEqual({ playmat: "seat0-mat", cardBack: "seat0-back", donArt: 200 });
  });

  it("spectating a seat with no shared art falls back to the default, not the viewer's (#250)", () => {
    const s = sideSkins({ own, seatSkins: [null, null], nearSeat: 0, farSeat: 1, hotseat: false, spectating: true });
    expect(s.near).toEqual({ playmat: null, cardBack: null, donArt: null });
  });

  it("playing online keeps your own art on your half and the opponent's on theirs (#250)", () => {
    const s = sideSkins({ own, seatSkins, nearSeat: 0, farSeat: 1, hotseat: false, spectating: false });
    expect(s.near).toEqual(own);
    expect(s.far).toEqual({ playmat: "seat1-mat", cardBack: "seat1-back", donArt: 201 });
  });

  it("practice shows your art on both halves (#250)", () => {
    const s = sideSkins({ own, seatSkins, nearSeat: 0, farSeat: 1, hotseat: true, spectating: false });
    expect(s.far).toEqual(own);
  });

  it("each half shows its own player's DON!! art online, and yours on both halves in practice (#440)", () => {
    const online = sideSkins({ own, seatSkins, nearSeat: 0, farSeat: 1, hotseat: false, spectating: false });
    expect([online.near.donArt, online.far.donArt]).toEqual([111, 201]);
    const practice = sideSkins({ own, seatSkins, nearSeat: 0, farSeat: 1, hotseat: true, spectating: false });
    expect([practice.near.donArt, practice.far.donArt]).toEqual([111, 111]);
    const watching = sideSkins({ own, seatSkins, nearSeat: 1, farSeat: 0, hotseat: false, spectating: true });
    expect([watching.near.donArt, watching.far.donArt]).toEqual([201, 200]);
  });

  it("an opponent who shared no DON!! art shows the default, not yours (#440)", () => {
    const old = [{ playmat: null, cardBack: null }, null] as never;
    const s = sideSkins({ own, seatSkins: old, nearSeat: 1, farSeat: 0, hotseat: false, spectating: false });
    expect(s.far.donArt).toBeNull();
  });
});
