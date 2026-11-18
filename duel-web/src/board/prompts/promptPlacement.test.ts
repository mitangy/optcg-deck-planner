import { describe, expect, it } from "vitest";
import { promptSide } from "./promptPlacement";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

const prompt = { width: 460, height: 218, centerX: 614, bottomTop: 480, topTop: 64 };

describe("promptSide", () => {
  it("rests at the bottom when nothing is under it (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(580, 150, 68, 95), attacker: box(400, 100, 68, 95) })).toBe("bottom");
  });

  it("moves to the top when the bottom spot would cover the card being hit (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(580, 499, 68, 95), attacker: box(405, 245, 68, 95) })).toBe("top");
  });

  it("stays at the bottom when you attack a card up in the opponent's half (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(580, 90, 68, 95), attacker: box(580, 499, 68, 95) })).toBe("bottom");
  });

  it("never lets the attacker's spot pull it onto the defender (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(580, 499, 68, 95), attacker: box(400, 80, 300, 150) })).toBe("top");
  });

  it("with the defender clear of both spots, leaves the attacker uncovered (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(250, 150, 68, 95), attacker: box(580, 499, 68, 95) })).toBe("top");
  });

  it("keeps clear of the defender's edge, not just its box (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(580, 702, 68, 95), attacker: null })).toBe("top");
  });

  it("stays at the bottom when the defender is level with it but off to the side (#278)", () => {
    expect(promptSide({ ...prompt, defender: box(250, 499, 68, 95), attacker: null })).toBe("bottom");
  });

  it("has nothing to dodge without a defender box (#278)", () => {
    expect(promptSide({ ...prompt, defender: null, attacker: box(405, 245, 68, 95) })).toBe("bottom");
  });
});
