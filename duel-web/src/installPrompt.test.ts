import { describe, expect, it } from "vitest";
import {
  canOfferFullscreen,
  dismissIosHint,
  shouldShowIosInstallHint,
  type InstallEnv,
} from "./installPrompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36";

function memoryStorage(seed: Record<string, string> = {}): InstallEnv["storage"] {
  const data = { ...seed };
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

function env(over: Partial<InstallEnv>): InstallEnv {
  return {
    userAgent: IPHONE_SAFARI,
    maxTouchPoints: 5,
    standaloneMedia: false,
    navigatorStandalone: false,
    fullscreenEnabled: false,
    storage: memoryStorage(),
    ...over,
  };
}

describe("shouldShowIosInstallHint", () => {
  it("shows in iPhone Safari when not installed", () => {
    expect(shouldShowIosInstallHint(env({}))).toBe(true);
  });

  it("hides once launched from the home screen (navigator.standalone)", () => {
    expect(shouldShowIosInstallHint(env({ navigatorStandalone: true }))).toBe(false);
  });

  it("hides in display-mode: standalone", () => {
    expect(shouldShowIosInstallHint(env({ standaloneMedia: true }))).toBe(false);
  });

  it("hides after the player dismissed it", () => {
    const storage = memoryStorage();
    dismissIosHint(env({ storage }));
    expect(shouldShowIosInstallHint(env({ storage }))).toBe(false);
  });

  it("still shows when storage is unavailable or throws", () => {
    const throwing: InstallEnv["storage"] = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(shouldShowIosInstallHint(env({ storage: throwing }))).toBe(true);
    expect(() => dismissIosHint(env({ storage: throwing }))).not.toThrow();
  });

  it("hides in Chrome on iOS, which cannot add to the home screen from its menu", () => {
    expect(shouldShowIosInstallHint(env({ userAgent: IPHONE_CHROME }))).toBe(false);
  });

  it("shows on iPadOS Safari that reports a desktop Mac UA", () => {
    expect(shouldShowIosInstallHint(env({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 }))).toBe(
      true,
    );
  });

  it("hides on a real Mac (no touch)", () => {
    expect(shouldShowIosInstallHint(env({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 }))).toBe(
      false,
    );
  });

  it("hides on Android Chrome", () => {
    expect(shouldShowIosInstallHint(env({ userAgent: ANDROID_CHROME }))).toBe(false);
  });
});

describe("canOfferFullscreen", () => {
  it("is offered on Android Chrome in a browser tab", () => {
    expect(canOfferFullscreen(env({ userAgent: ANDROID_CHROME, fullscreenEnabled: true }))).toBe(
      true,
    );
  });

  it("is not offered when the browser has no Fullscreen API", () => {
    expect(canOfferFullscreen(env({ userAgent: ANDROID_CHROME, fullscreenEnabled: false }))).toBe(
      false,
    );
  });

  it("is not offered once installed (already chromeless)", () => {
    expect(
      canOfferFullscreen(
        env({ userAgent: ANDROID_CHROME, fullscreenEnabled: true, standaloneMedia: true }),
      ),
    ).toBe(false);
  });

  it("is not offered on iOS even if the API reports enabled", () => {
    expect(canOfferFullscreen(env({ fullscreenEnabled: true }))).toBe(false);
    expect(
      canOfferFullscreen(env({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5, fullscreenEnabled: true })),
    ).toBe(false);
  });
});
