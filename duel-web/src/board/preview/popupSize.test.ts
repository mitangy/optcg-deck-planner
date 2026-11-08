import { describe, expect, it } from "vitest";
import { applyPopupSize, clampPopupSize, stepPopupSize } from "./popupSize";

describe("pop-up size (#555)", () => {
  it("steps by 10 and stops at 70 and 160 (#555)", () => {
    expect(stepPopupSize(100, 1)).toBe(110);
    expect(stepPopupSize(100, -1)).toBe(90);
    expect(stepPopupSize(160, 1)).toBe(160);
    expect(stepPopupSize(70, -1)).toBe(70);
  });

  it("a saved size out of range, off a step or unreadable is pulled back (#555)", () => {
    expect(clampPopupSize(500)).toBe(160);
    expect(clampPopupSize(10)).toBe(70);
    expect(clampPopupSize(134)).toBe(130);
    expect(clampPopupSize("big")).toBe(100);
    expect(clampPopupSize(NaN)).toBe(100);
  });
});

describe("pop-up size on the page root (#555)", () => {
  const root = () => {
    const vars = new Map<string, string>();
    return { vars, style: { setProperty: (k: string, v: string) => void vars.set(k, v), removeProperty: (k: string) => void vars.delete(k) } };
  };
  it("sets --popup-scale as a multiplier and clears it at 100% (#555)", () => {
    const r = root();
    applyPopupSize(160, r);
    expect(r.vars.get("--popup-scale")).toBe("1.6");
    applyPopupSize(100, r);
    expect(r.vars.has("--popup-scale")).toBe(false);
    applyPopupSize(70, r);
    expect(r.vars.get("--popup-scale")).toBe("0.7");
  });

  it("the card pop-up size writes its own --preview-popup-scale and leaves --popup-scale alone (#572)", () => {
    const r = root();
    applyPopupSize(130, r);
    applyPopupSize(160, r, "previewPopupSize");
    expect(r.vars.get("--preview-popup-scale")).toBe("1.6");
    expect(r.vars.get("--popup-scale")).toBe("1.3");
    applyPopupSize(100, r, "previewPopupSize");
    expect(r.vars.has("--preview-popup-scale")).toBe(false);
    expect(r.vars.get("--popup-scale")).toBe("1.3");
  });
});
