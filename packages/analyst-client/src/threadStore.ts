import { GENERAL } from "./scopes";

/** The thread each scope last had open, kept per browser so the panel can show it at once after a reload. The server's list is the authority. */
export const THREADS_KEY = "optcg-logpose:threads";
/** The single thread id older versions kept. It is the general chat's hint until that scope writes its own. */
export const THREAD_KEY = "optcg-logpose:thread";
const KEEP = 40;

const asId = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function readMap(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(THREADS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = asId(v);
      if (id !== null) out[k] = id;
    }
    return out;
  } catch {
    return {};
  }
}

function legacyId(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(THREAD_KEY);
    return asId(raw ? Number(raw) : NaN);
  } catch {
    return null;
  }
}

export function readThreadHint(scope: string): number | null {
  return readMap()[scope] ?? (scope === GENERAL ? legacyId() : null);
}

export function writeThreadHint(scope: string, id: number | null): void {
  try {
    const map = readMap();
    delete map[scope];
    if (id !== null) map[scope] = id;
    // Oldest hints go first, so the map stays small.
    const entries = Object.entries(map).slice(-KEEP);
    globalThis.localStorage?.setItem(THREADS_KEY, JSON.stringify(Object.fromEntries(entries)));
    // The old single key was the general chat's: once general has its own value it must not come back.
    if (scope === GENERAL) globalThis.localStorage?.removeItem(THREAD_KEY);
  } catch {
    /* storage blocked (private mode); the thread just isn't remembered */
  }
}
