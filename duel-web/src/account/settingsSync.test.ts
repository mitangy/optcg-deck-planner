import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchAccountSettings: vi.fn(),
  putAccountSettings: vi.fn(),
}));
vi.mock("../net/prefsApi", () => api);

import { currentSettings, updateSettings } from "../settings";
import { stopSettingsSync, syncSettings } from "./settingsSync";

/** An account settings load that settles when the test says so (a cold API). */
function slowLoad() {
  let resolve!: (v: { settings: Record<string, unknown> | null }) => void;
  api.fetchAccountSettings.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  return resolve;
}

describe("settings sync while the account settings load", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    api.fetchAccountSettings.mockReset();
    api.putAccountSettings.mockReset().mockResolvedValue(undefined);
    updateSettings({ endTurnConfirm: "always", turnSplash: true });
  });

  afterEach(() => {
    stopSettingsSync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps and saves a setting changed before the load finished", async () => {
    const resolve = slowLoad();
    const sync = syncSettings();
    updateSettings({ endTurnConfirm: "never" });
    resolve({ settings: { endTurnConfirm: "actions", turnSplash: false } });
    await sync;

    expect(currentSettings().endTurnConfirm).toBe("never");
    // Settings not touched here still follow the account.
    expect(currentSettings().turnSplash).toBe(false);
    expect(api.putAccountSettings).toHaveBeenCalledWith(
      expect.objectContaining({ endTurnConfirm: "never", turnSplash: false }),
    );
  });

  it("stopping during the load neither applies the account nor keeps saving", async () => {
    vi.useFakeTimers();
    const resolve = slowLoad();
    const sync = syncSettings();
    stopSettingsSync();
    resolve({ settings: { turnSplash: false } });
    await sync;

    expect(currentSettings().turnSplash).toBe(true);
    updateSettings({ endTurnConfirm: "never" });
    vi.advanceTimersByTime(5000);
    expect(api.putAccountSettings).not.toHaveBeenCalled();
  });
});
