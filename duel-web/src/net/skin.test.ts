import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, SKIN_MAX_CARD_BACK_CHARS, parseSkin } from "./protocol";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

function msg(skin: unknown) {
  return { protocolVersion: PROTOCOL_VERSION, seat: 1, skin };
}

describe("parseSkin", () => {
  it("keeps image data URLs and the seat they came from", () => {
    const out = parseSkin(msg({ playmat: JPEG, cardBack: null }));
    expect(out.seat).toBe(1);
    expect(out.skin).toEqual({ playmat: JPEG, cardBack: null });
  });

  it("drops anything that is not a small image data URL", () => {
    const out = parseSkin(
      msg({
        playmat: 'data:text/html;base64,PHNjcmlwdD4=',
        cardBack: "data:image/png;base64," + "A".repeat(SKIN_MAX_CARD_BACK_CHARS),
      }),
    );
    expect(out.skin).toEqual({ playmat: null, cardBack: null });
    expect(parseSkin(msg({ playmat: 'x");background:url(evil', cardBack: null })).skin.playmat).toBeNull();
  });
});
