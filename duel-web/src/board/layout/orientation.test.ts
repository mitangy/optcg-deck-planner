import { describe, expect, it } from "vitest";
import { lockNoteVisible, orientationLockTarget, shouldShowRotateHint } from "./orientation";

describe("orientationLockTarget", () => {
  it("locks nothing when following the phone", () => {
    expect(orientationLockTarget("auto", true)).toBeNull();
  });

  it("asks for the chosen orientation when the browser can lock", () => {
    expect(orientationLockTarget("portrait", true)).toBe("portrait");
    expect(orientationLockTarget("landscape", true)).toBe("landscape");
  });

  it("locks nothing when the browser cannot", () => {
    expect(orientationLockTarget("landscape", false)).toBeNull();
  });
});

describe("shouldShowRotateHint", () => {
  const base = {
    portrait: true,
    phone: true,
    setting: "auto" as const,
    seen: false,
    hotseat: false,
  };

  it("shows once to a portrait phone player who has not seen it", () => {
    expect(shouldShowRotateHint(base)).toBe(true);
  });

  it("stays away once seen", () => {
    expect(shouldShowRotateHint({ ...base, seen: true })).toBe(false);
  });

  it("stays away when portrait was chosen on purpose", () => {
    expect(shouldShowRotateHint({ ...base, setting: "portrait" })).toBe(false);
  });

  it("still shows when landscape is chosen but the phone is upright", () => {
    expect(shouldShowRotateHint({ ...base, setting: "landscape" })).toBe(true);
  });

  it("stays away in hotseat", () => {
    expect(shouldShowRotateHint({ ...base, hotseat: true })).toBe(false);
  });

  it("stays away when already in landscape or not on a phone", () => {
    expect(shouldShowRotateHint({ ...base, portrait: false })).toBe(false);
    expect(shouldShowRotateHint({ ...base, phone: false })).toBe(false);
  });
});

describe("lockNoteVisible", () => {
  it("is quiet while following the phone, even if a lock failed earlier", () => {
    expect(lockNoteVisible("auto", false, true)).toBe(false);
  });

  it("appears when a lock was picked and the browser has no lock API", () => {
    expect(lockNoteVisible("portrait", false, false)).toBe(true);
  });

  it("appears when a lock was picked and the browser refused it", () => {
    expect(lockNoteVisible("landscape", true, true)).toBe(true);
  });

  it("is quiet when the lock worked", () => {
    expect(lockNoteVisible("landscape", true, false)).toBe(false);
  });
});
