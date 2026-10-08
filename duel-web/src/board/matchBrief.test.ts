import { describe, expect, it } from "vitest";
import { briefFoldsAway, briefSeenKey, briefShown, briefStart } from "./matchBrief";

const ticket = { ticket: "mb1.x.y", leaderId: "OP01-001", opponentId: "ST01-001", deck: ["OP01-016"] };
const good = { ranked: false as boolean | null | undefined, role: "player" as const, brief: ticket as unknown, logPoseEnabled: true as boolean | null, setting: true };

describe("matchup brief on the board", () => {
  it("the brief is offered only to players of unranked games with Log Pose and the setting on (#401)", () => {
    expect(briefShown(good)).toBe(true);
    const refused: [string, Parameters<typeof briefShown>[0]][] = [
      ["ranked", { ...good, ranked: true }],
      ["an older server that never says", { ...good, ranked: undefined }],
      ["not told yet", { ...good, ranked: null }],
      ["a spectator", { ...good, role: "spectator" }],
      ["no ticket", { ...good, brief: null }],
      ["Log Pose off", { ...good, logPoseEnabled: false }],
      ["Log Pose not known yet", { ...good, logPoseEnabled: null }],
      ["setting off", { ...good, setting: false }],
    ];
    for (const [why, input] of refused) expect(briefShown(input), why).toBe(false);
  });

  it("writes a brief by itself only with Write briefs automatically on (#401)", () => {
    expect(briefStart({ cached: false, auto: false, requested: false })).toBe("offer");
    expect(briefStart({ cached: false, auto: true, requested: false })).toBe("generate");
    expect(briefStart({ cached: false, auto: false, requested: true })).toBe("generate");
    // A saved brief just shows, whatever the setting.
    expect(briefStart({ cached: true, auto: true, requested: false })).toBe("show");
    expect(briefStart({ cached: true, auto: false, requested: false })).toBe("show");
  });

  it("the panel folds away when the first turn starts, only if it opened by itself and was left alone (#401, #423)", () => {
    const fresh = { auto: true, touched: false };
    // During the mulligan (or before the phase is known) it stays up.
    expect(briefFoldsAway(fresh, "mulligan")).toBe(false);
    expect(briefFoldsAway(fresh, undefined)).toBe(false);
    // The first turn folds it away.
    expect(briefFoldsAway(fresh, "refresh")).toBe(true);
    expect(briefFoldsAway(fresh, "main")).toBe(true);
    // One the player opened, or started using, stays.
    expect(briefFoldsAway({ auto: false, touched: false }, "main")).toBe(false);
    expect(briefFoldsAway({ auto: true, touched: true }, "main")).toBe(false);
  });

  it("remembers a room's brief by room id so a reload or rematch doesn't open it again (#401)", () => {
    expect(briefSeenKey("room-1")).not.toBe(briefSeenKey("room-2"));
    expect(briefSeenKey("room-1")).toContain("room-1");
  });
});
