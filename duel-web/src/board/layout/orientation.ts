import { createStore } from "../../lib/createStore";
import type { ScreenOrientationPref } from "../../settings";
import { readStored, writeStored } from "@optcg/ui/storage";

export function orientationLockTarget(
  setting: ScreenOrientationPref,
  canLock: boolean,
): "portrait" | "landscape" | null {
  if (!canLock || setting === "auto") return null;
  return setting;
}

export function shouldShowRotateHint(o: {
  portrait: boolean;
  phone: boolean;
  setting: ScreenOrientationPref;
  seen: boolean;
  hotseat: boolean;
}): boolean {
  return o.portrait && o.phone && o.setting !== "portrait" && !o.seen && !o.hotseat;
}

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

// iPhone Safari lacks the lock API.
export function lockApiAvailable(): boolean {
  return lockable() != null;
}

const lockFailed = createStore(false);

function setLockFailed(v: boolean) {
  lockFailed.set(v);
}

export function releaseOrientationLock(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Nothing was locked.
  }
}

// A refused lock is remembered so the settings note can say so.
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

export function useLockNote(setting: ScreenOrientationPref): boolean {
  const failed = lockFailed.use();
  return lockNoteVisible(setting, lockApiAvailable(), failed);
}

const SEEN_KEY = "optcg-duel:rotate-hint-seen";

export function rotateHintSeen(): boolean {
  return readStored(SEEN_KEY) === "1";
}

export function markRotateHintSeen(): void {
  writeStored(SEEN_KEY, "1");
}
