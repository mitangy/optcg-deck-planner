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

export async function syncSettings(): Promise<void> {
  stopSettingsSync();
  const { settings } = await fetchAccountSettings();
  if (settings) applyRemoteSettings(settings);
  // First sign-in: the account starts from this browser's settings.
  else await putAccountSettings(syncedSettings(currentSettings())).catch(() => undefined);

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
}

export function stopSettingsSync(): void {
  stop?.();
  stop = null;
}
