/** Starts / stops syncing settings and cosmetics with the signed-in account. */
import { fetchAuthMe, type AuthUser } from "../net/api";
import { stopCosmeticsSync, syncCosmetics } from "./cosmeticsSync";
import { stopSettingsSync, syncSettings } from "./settingsSync";

let syncedUserId: number | null = null;

/** Call on app start and after sign-in; a no-op for guests or an already-synced user. */
export async function startAccountSync(user?: AuthUser | null): Promise<void> {
  const me = user === undefined ? await fetchAuthMe().catch(() => null) : user;
  if (!me || me.id === syncedUserId) return;
  syncedUserId = me.id;
  await Promise.all([
    syncSettings().catch(() => undefined),
    syncCosmetics().catch(() => undefined),
  ]);
}

export function stopAccountSync(): void {
  syncedUserId = null;
  stopSettingsSync();
  stopCosmeticsSync();
}
