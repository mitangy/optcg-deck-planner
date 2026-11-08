/** Starts / stops syncing settings, cosmetics and saved decks with the signed-in account. */
import { ensureAuth, getAuth, subscribeAuth } from "../auth/session";
import type { AuthUser } from "../net/api";
import { pushLinkedDeckArt } from "../decks/planner";
import { stopCosmeticsSync, syncCosmetics } from "./cosmeticsSync";
import { clearAccountDecks, flushDeckSync, stopDeckSync, syncDecks } from "./deckSync";
import { stopSettingsSync, syncSettings } from "./settingsSync";

/** The tab is brought back no more often than this to re-sync decks (planner edits show up without a reload). */
export const RESYNC_MIN_GAP_MS = 60_000;

let syncedUserId: number | null = null;
let stopReturnSync: (() => void) | null = null;

/** Deck sync, then show alt arts picked in the duel app in the planner (best effort). */
async function syncDecksAndArt(userId: number): Promise<void> {
  await syncDecks(userId);
  await pushLinkedDeckArt();
}

/**
 * Runs `run` when the tab becomes visible or the window regains focus, at most once per `minGapMs`.
 * Returns a function that stops listening.
 */
export function resyncOnReturn(
  run: () => Promise<unknown>,
  minGapMs = RESYNC_MIN_GAP_MS,
  now: () => number = Date.now,
): () => void {
  let last = now();
  let running = false;
  const onBack = () => {
    if (document.visibilityState === "hidden" || running || now() - last < minGapMs) return;
    last = now();
    running = true;
    void run()
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  };
  document.addEventListener("visibilitychange", onBack);
  window.addEventListener("focus", onBack);
  return () => {
    document.removeEventListener("visibilitychange", onBack);
    window.removeEventListener("focus", onBack);
  };
}

/** Syncs for `user` (default: whoever the auth store says is signed in); a no-op for guests or an already-synced user. */
export async function startAccountSync(user?: AuthUser | null): Promise<void> {
  const me = user === undefined ? await ensureAuth() : user;
  if (!me || me.id === syncedUserId) return;
  syncedUserId = me.id;
  stopReturnSync?.();
  stopReturnSync = resyncOnReturn(() => syncDecksAndArt(me.id));
  await Promise.all([
    syncSettings().catch(() => undefined),
    syncCosmetics().catch(() => undefined),
    syncDecksAndArt(me.id).catch(() => undefined),
  ]);
}

/**
 * Call once on app start: asks the auth store who is signed in (the one `/auth/me` request of a page load) and
 * starts syncing for that account now and for any account the store gets later (a sign-in landing).
 * Returns a function that stops watching.
 */
export function watchAccountSync(): () => void {
  const off = subscribeAuth(() => {
    const { status, user } = getAuth();
    if (status === "ready" && user) void startAccountSync(user);
  });
  void startAccountSync();
  return off;
}

/** `clearDecks` on an explicit sign-out: the account's decks leave this browser. */
export function stopAccountSync(opts: { clearDecks?: boolean } = {}): void {
  syncedUserId = null;
  stopReturnSync?.();
  stopReturnSync = null;
  stopSettingsSync();
  stopCosmeticsSync();
  if (opts.clearDecks) clearAccountDecks();
  else stopDeckSync();
}

/** Before signing out: send account edits that are still waiting to go up. */
export function flushAccountSync(): Promise<void> {
  return flushDeckSync();
}
