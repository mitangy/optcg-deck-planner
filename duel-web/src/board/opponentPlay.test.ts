import { describe, expect, it } from "vitest";
import type { BattleLogEntry, LogTone } from "./battleLog";
import { latestOpponentPlay, opponentPlayCaption } from "./opponentPlay";
import { HOVER_GRACE_MS, shouldAutoPreview } from "./cardPreview";

function entry(
  id: string,
  tone: LogTone,
  ownerSeat: 0 | 1,
  defId: string,
  turn = 1,
  text = "x",
): BattleLogEntry {
  return {
    id,
    turn,
    text,
    tone,
    important: false,
    segments: [
      { kind: "text", text: "lead " },
      { kind: "card", defId, name: defId, ownerSeat },
    ],
  };
}

describe("latestOpponentPlay", () => {
  it("picks the newest opponent card entry", () => {
    const got = latestOpponentPlay(
      [entry("a", "play", 1, "OLD", 2), entry("b", "play", 1, "NEW", 3)],
      1,
    );
    expect(got).toMatchObject({ entryId: "b", defId: "NEW", turn: 3, verb: "played" });
  });

  it("skips your own plays even when they are newer", () => {
    const got = latestOpponentPlay(
      [entry("a", "play", 1, "THEIRS"), entry("b", "play", 0, "MINE")],
      1,
    );
    expect(got?.defId).toBe("THEIRS");
  });

  it("skips non-card tones such as attacks and K.O.s", () => {
    const got = latestOpponentPlay(
      [
        entry("a", "counter", 1, "COUNTERED"),
        entry("b", "attack", 1, "ATTACKER"),
        entry("c", "ko", 1, "KOD"),
      ],
      1,
    );
    expect(got).toMatchObject({ defId: "COUNTERED", verb: "countered" });
  });

  it("ignores effect lines that only bounce a card", () => {
    const got = latestOpponentPlay(
      [
        entry("a", "effect", 1, "ACTIVATED", 1, "Opponent's ACTIVATED activates its effect"),
        entry("b", "effect", 1, "BOUNCED", 1, "Opponent's BOUNCED is returned to hand"),
      ],
      1,
    );
    expect(got).toMatchObject({ defId: "ACTIVATED", verb: "activated" });
  });

  it("is null when the opponent has not used a card", () => {
    expect(latestOpponentPlay([entry("a", "play", 0, "MINE")], 1)).toBeNull();
  });
});

describe("opponentPlayCaption", () => {
  it("names the verb and turn", () => {
    expect(opponentPlayCaption({ verb: "played", turn: 5 })).toBe("Opponent played · Turn 5");
  });
});

describe("shouldAutoPreview", () => {
  it("waits out a recent hover but not an old one", () => {
    expect(shouldAutoPreview(10_000, 10_000 - HOVER_GRACE_MS + 1)).toBe(false);
    expect(shouldAutoPreview(10_000, 10_000 - HOVER_GRACE_MS)).toBe(true);
    expect(shouldAutoPreview(10_000, -Infinity)).toBe(true);
  });
});
