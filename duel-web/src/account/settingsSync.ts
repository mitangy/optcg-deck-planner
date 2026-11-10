/** Duel settings saved to a signed-in player's account (device-only fields stay local). */
import {
  applyRemoteSettings,
  currentSettings,
  onLocalSettingsChange,
  syncedSettings,
} from "../settings";
import { fetchAccountSettings, putAccountSettings } from "../net/prefsApi";

const PUSH_DELAY_MS = 600;

let stop: (() => void) | null = null;
/** Bumped by every start / stop: a load that settles under an older value was cancelled. */
let syncGen = 0;

export async function syncSettings(): Promise<void> {
  stopSettingsSync();
  const gen = syncGen;
  // The load can take a while (cold API): remember where it started so edits
  // made meanwhile win over the account's copy instead of being overwritten.
  const before = syncedSettings(currentSettings());
  const { settings } = await fetchAccountSettings();
  if (gen !== syncGen) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ReturnType<typeof syncedSettings> | null = null;
  const unsubscribe = onLocalSettingsChange((s) => {
    if (timer) clearTimeout(timer);
    pending = syncedSettings(s);
    timer = setTimeout(() => {
      timer = null;
      const body = pending;
      pending = null;
      if (body) void putAccountSettings(body).catch(() => undefined);
    }, PUSH_DELAY_MS);
  });
  // A tab closed or hidden inside the debounce window would lose its last edit (and the account's older copy
  // would then overwrite it on the next load): push it now, with a request that outlives the page.
  const flush = () => {
    if (!timer || !pending) return;
    clearTimeout(timer);
    timer = null;
    const body = pending;
    pending = null;
    void putAccountSettings(body, { keepalive: true }).catch(() => undefined);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  stop = () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", flush);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };

  const local = syncedSettings(currentSettings());
  const edited = Object.fromEntries(Object.entries(local).filter(([k, v]) => before[k] !== v));
  if (settings) {
    applyRemoteSettings({ ...settings, ...edited });
    if (Object.keys(edited).length > 0) {
      await putAccountSettings(syncedSettings(currentSettings())).catch(() => undefined);
    }
  }
  // First sign-in: the account starts from this browser's settings.
  else await putAccountSettings(local).catch(() => undefined);
}

export function stopSettingsSync(): void {
  syncGen++;
  stop?.();
  stop = null;
}
