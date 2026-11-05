import { describe, expect, it, vi } from "vitest";
import { ReplayLoadError } from "./replayApi";
import { loadWhileSaving } from "./replayRetry";

const inProgress = () => new ReplayLoadError("in-progress", "still being played");

describe("loadWhileSaving", () => {
  it("retries an in-progress replay on the schedule until it loads (#965)", async () => {
    const load = vi.fn().mockRejectedValueOnce(inProgress()).mockRejectedValueOnce(inProgress()).mockResolvedValue("replay");
    const waits: number[] = [];
    const onWait = vi.fn();
    const out = await loadWhileSaving(load, { delaysS: [2, 4, 8], wait: async (ms) => void waits.push(ms), onWait });
    expect(out).toBe("replay");
    expect(waits).toEqual([2000, 4000]);
    expect(onWait).toHaveBeenCalledTimes(2);
  });

  it("gives up with the in-progress error after the last delay (#965)", async () => {
    const load = vi.fn().mockRejectedValue(inProgress());
    await expect(loadWhileSaving(load, { delaysS: [1, 2], wait: async () => undefined })).rejects.toMatchObject({ reason: "in-progress" });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not retry any other failure (#965)", async () => {
    const load = vi.fn().mockRejectedValue(new ReplayLoadError("not-found", "gone"));
    await expect(loadWhileSaving(load, { delaysS: [1, 2], wait: async () => undefined })).rejects.toMatchObject({ reason: "not-found" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("stops waiting once the page has gone away (#965)", async () => {
    const load = vi.fn().mockRejectedValue(inProgress());
    await expect(loadWhileSaving(load, { delaysS: [1, 2], wait: async () => undefined, cancelled: () => true })).rejects.toMatchObject({ reason: "in-progress" });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
