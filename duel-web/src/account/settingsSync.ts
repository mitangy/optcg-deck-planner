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
  const unsubscribe = onLocalSettingsChange((s) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void putAccountSettings(syncedSettings(s)).catch(() => undefined);
    }, PUSH_DELAY_MS);
  });
  stop = () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
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
