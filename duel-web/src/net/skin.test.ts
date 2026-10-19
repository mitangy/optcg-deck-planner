import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, SKIN_MAX_CARD_BACK_CHARS, parseSkin } from "./protocol";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

function msg(skin: unknown) {
  return { protocolVersion: PROTOCOL_VERSION, seat: 1, skin };
}

describe("parseSkin", () => {
  it("keeps image data URLs and the seat they came from", () => {
    const out = parseSkin(msg({ playmat: JPEG, cardBack: null }));
    expect(out.seat).toBe(1);
    expect(out.skin).toEqual({ playmat: JPEG, cardBack: null, donArt: null });
  });

  it("drops anything that is not a small image data URL", () => {
    const out = parseSkin(
      msg({
        playmat: 'data:text/html;base64,PHNjcmlwdD4=',
        cardBack: "data:image/png;base64," + "A".repeat(SKIN_MAX_CARD_BACK_CHARS),
      }),
    );
    expect(out.skin).toEqual({ playmat: null, cardBack: null, donArt: null });
    expect(parseSkin(msg({ playmat: 'x");background:url(evil', cardBack: null })).skin.playmat).toBeNull();
  });

  it("keeps a positive 31-bit integer DON!! art id and drops strings, URLs and bad numbers (#440)", () => {
    const donArt = (v: unknown) => parseSkin(msg({ donArt: v })).skin.donArt;
    expect(donArt(512345)).toBe(512345);
    expect(donArt(2_147_483_647)).toBe(2_147_483_647);
    for (const bad of ["512345", "https://evil.example/x.jpg", -5, 0, 1.5, 2_147_483_648, NaN, {}, true]) {
      expect(donArt(bad), String(bad)).toBeNull();
    }
    // An old client sends no donArt.
    expect(parseSkin(msg({ playmat: null, cardBack: null })).skin.donArt).toBeNull();
  });
});

describe("parseSkin with account upload paths", () => {
  const PATH = "/duel/cosmetics/12/public/AbCdEf_GhIjKl-MnOp";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a received cosmetics path against the API base and keeps data URLs as they are (#389)", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/");
    const out = parseSkin(msg({ playmat: PATH, cardBack: JPEG }));
    expect(out.skin).toEqual({ playmat: `https://api.example.test${PATH}`, cardBack: JPEG, donArt: null });
  });

  it("drops a cosmetics path that is not a signed public upload path (#389)", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test");
    const out = parseSkin(
      msg({ playmat: "/duel/cosmetics/12/image", cardBack: "/duel/cosmetics/12/public/short" }),
    );
    expect(out.skin).toEqual({ playmat: null, cardBack: null, donArt: null });
  });
});
