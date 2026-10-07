import { describe, expect, it } from "vitest";
import { logPoseChrome } from "./chrome";

describe("Log Pose chrome", () => {
  it("a provider without a launcher hides the compass but still opens the panel (#401)", () => {
    const base = { enabled: true, hidden: false, open: false };
    expect(logPoseChrome({ ...base, launcher: true })).toEqual({ compass: true, panel: false });
    expect(logPoseChrome({ ...base, launcher: false })).toEqual({ compass: false, panel: false });
    expect(logPoseChrome({ ...base, launcher: false, open: true })).toEqual({ compass: false, panel: true });
    expect(logPoseChrome({ ...base, launcher: true, open: true })).toEqual({ compass: false, panel: true });
  });

  it("shows nothing while hidden or until chat is known to be on (#401)", () => {
    for (const enabled of [false, null]) {
      expect(logPoseChrome({ enabled, hidden: false, launcher: true, open: true })).toEqual({ compass: false, panel: false });
    }
    expect(logPoseChrome({ enabled: true, hidden: true, launcher: true, open: true })).toEqual({ compass: false, panel: false });
  });

  it("a player who can only ask for access still gets the compass and panel, but not while hidden (#393, #401)", () => {
    const base = { enabled: false, hidden: false, launcher: true, requestable: true };
    expect(logPoseChrome({ ...base, open: false })).toEqual({ compass: true, panel: false });
    expect(logPoseChrome({ ...base, open: true })).toEqual({ compass: false, panel: true });
    expect(logPoseChrome({ ...base, open: true, hidden: true })).toEqual({ compass: false, panel: false });
  });
});
