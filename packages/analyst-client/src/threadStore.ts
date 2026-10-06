/** The open chat's thread id, kept per browser so the panel can show it again after a reload. */
export const THREAD_KEY = "optcg-logpose:thread";

export function readThreadId(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(THREAD_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeThreadId(id: number | null): void {
  try {
    if (id == null) globalThis.localStorage?.removeItem(THREAD_KEY);
    else globalThis.localStorage?.setItem(THREAD_KEY, String(id));
  } catch {
    /* storage blocked (private mode); the thread just isn't remembered */
  }
}
