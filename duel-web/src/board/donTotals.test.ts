import { describe, expect, it } from "vitest";
import { attachedDonTotal, donTotal } from "./donTotals";

describe("DON!! total", () => {
  it("counts DON!! attached to the Leader and Characters in the DON!! total (#345)", () => {
    const side = {
      leader: { attachedDonCount: 1 },
      characters: [{ attachedDonCount: 1 }, {}],
      stage: null,
    };
    expect(attachedDonTotal(side)).toBe(2);
    expect(donTotal(8, side)).toBe(10);
  });

  it("is just the cost area when nothing is attached (#345)", () => {
    expect(donTotal(10, { leader: {}, characters: [{}] })).toBe(10);
  });
});
