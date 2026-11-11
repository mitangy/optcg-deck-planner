import { describe, expect, it } from "vitest";
import { clampPhoneWidth, nudgePhoneWidth, parsePhoneSizes, serializePhoneSizes } from "./phoneSizes";

describe("phone column sizes", () => {
  it("clamps a dragged width to the minimum and to the smaller of the px and window-share maximum (#1246)", () => {
    expect(clampPhoneWidth("rail", 50, 812)).toBe(140);
    expect(clampPhoneWidth("rail", 900, 700)).toBe(315); // 45vw < 360
    expect(clampPhoneWidth("rail", 900, 1000)).toBe(360); // 360 < 450
    expect(clampPhoneWidth("overlay", 900, 1000)).toBe(560);
    expect(clampPhoneWidth("overlay", 100, 812)).toBe(220);
    expect(clampPhoneWidth("overlay", 900, 600)).toBe(450);
  });

  it("nudges by a step and stops at the ends (#1246)", () => {
    expect(nudgePhoneWidth("rail", 200, true, 812)).toBe(216);
    expect(nudgePhoneWidth("rail", 200, false, 812)).toBe(184);
    expect(nudgePhoneWidth("rail", 140, false, 812)).toBe(140);
  });

  it("round-trips both widths and drops junk or out-of-range values (#1246)", () => {
    expect(serializePhoneSizes(parsePhoneSizes("R=220;O=320"))).toBe("R=220;O=320");
    expect(parsePhoneSizes("R=100;O=900;X=3;junk")).toEqual({});
    expect(parsePhoneSizes("O=300")).toEqual({ overlay: 300 });
    expect(serializePhoneSizes({})).toBe("");
  });
});
