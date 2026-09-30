import { useSyncExternalStore } from "react";
import type { ScreenOrientationPref } from "../settings";

/** The lock to ask the browser for, or null (follow the phone / nothing to lock with). */
export function orientationLockTarget(
  setting: ScreenOrientationPref,
  canLock: boolean,
): "portrait" | "landscape" | null {
  if (!canLock || setting === "auto") return null;
  return setting;
}

/**
 * The "rotate for bigger cards" toast: once per browser, on a phone held in
 * portrait, unless the player chose portrait on purpose or shares one device
 * between two seats (hotseat).
 */
export function shouldShowRotateHint(o: {
  portrait: boolean;
  phone: boolean;
  setting: ScreenOrientationPref;
  seen: boolean;
  hotseat: boolean;
}): boolean {
  return o.portrait && o.phone && o.setting !== "portrait" && !o.seen && !o.hotseat;
}

/** The settings note: only when a lock was picked and it cannot be had. */
export function lockNoteVisible(
  setting: ScreenOrientationPref,
  apiAvailable: boolean,
  attemptFailed: boolean,
): boolean {
  return setting !== "auto" && (!apiAvailable || attemptFailed);
}

type LockableOrientation = ScreenOrientation & {
  lock?: (o: "portrait" | "landscape") => Promise<void>;
};

function lockable(): LockableOrientation | null {
  if (typeof screen === "undefined") return null;
  const o = screen.orientation as LockableOrientation | undefined;
  return o && typeof o.lock === "function" ? o : null;
}

/** Whether this browser has the lock API at all (iPhone Safari does not). */
export function lockApiAvailable(): boolean {
  return lockable() != null;
}

let lockFailed = false;
const listeners = new Set<() => void>();

function setLockFailed(v: boolean) {
  if (lockFailed === v) return;
  lockFailed = v;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Free the orientation (leaving the match, or back to "follow my phone"). */
export function releaseOrientationLock(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Nothing was locked.
  }
}

/**
 * Apply the setting: lock when it names an orientation and the browser will
 * (Android Chrome, in full screen or installed), unlock on "auto". A refused
 * lock is remembered so the settings note can say so.
 */
export async function syncOrientationLock(setting: ScreenOrientationPref): Promise<void> {
  const target = orientationLockTarget(setting, lockApiAvailable());
  if (!target) {
    if (setting === "auto") releaseOrientationLock();
    setLockFailed(false);
    return;
  }
  try {
    await lockable()!.lock!(target);
    setLockFailed(false);
  } catch {
    setLockFailed(true);
  }
}

/** True when the settings should tell the player the lock is unavailable. */
export function useLockNote(setting: ScreenOrientationPref): boolean {
  const failed = useSyncExternalStore(
    subscribe,
    () => lockFailed,
    () => false,
  );
  return lockNoteVisible(setting, lockApiAvailable(), failed);
}

const SEEN_KEY = "optcg-duel:rotate-hint-seen";

export function rotateHintSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRotateHintSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: the hint may show again next visit.
  }
}
