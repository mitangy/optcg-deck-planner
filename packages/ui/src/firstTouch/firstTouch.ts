/**
 * First-touch traffic source (#905): where a visitor came from before they signed up.
 * The planner and duel-web call `captureFirstTouch()` at startup and send `readFirstTouch()`
 * with POST /auth/claim; the server keeps it only for brand-new accounts.
 */

export const FIRST_TOUCH_KEY = "optcg.firstTouch";
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type FirstTouch = {
  /** Referring hostname without a leading "www.". */
  ref?: string;
  /** Landing path (no query string). */
  land?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** When it was captured (ms since epoch). */
  at: number;
};

/** Our own sites, the API, and Google's OAuth bounce: a visit from these is not a new source. */
const OWN_HOSTS = ["optcgduel.app", "optcg-deck-planner.app", "onrender.com", "accounts.google.com"];

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isOwnHost(host: string): boolean {
  return OWN_HOSTS.some((own) => host === own || host.endsWith(`.${own}`));
}

function externalReferrerHost(referrer: string, currentHost: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const here = currentHost.toLowerCase().replace(/^www\./, "");
  if (!host || host === here || isOwnHost(host)) return null;
  return host;
}

/** The stored first touch, or null when there is none or it has expired. */
export function readFirstTouch(storage?: StorageLike, now: number = Date.now()): FirstTouch | null {
  try {
    // Resolve the global inside the try: a browser that blocks site data throws on `localStorage` itself (#907).
    const raw = (storage ?? localStorage).getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as FirstTouch | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number") return null;
    if (now - v.at >= FIRST_TOUCH_TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * Remember an external referrer or utm tags the first time they show up. First touch wins for
 * 30 days; a direct visit stores nothing (direct is the absence of a value).
 */
export function captureFirstTouch(
  location?: Pick<Location, "hostname" | "pathname" | "search">,
  referrerOverride?: string,
  storageOverride?: StorageLike,
  now: number = Date.now(),
): void {
  try {
    // Globals are resolved inside the try: blocked site data makes `localStorage` throw (#907).
    const loc = location ?? window.location;
    const referrer = referrerOverride ?? document.referrer;
    const storage = storageOverride ?? localStorage;
    const ref = externalReferrerHost(referrer, loc.hostname);
    const params = new URLSearchParams(loc.search);
    const touch: FirstTouch = { at: now };
    if (ref) touch.ref = ref;
    touch.land = loc.pathname.slice(0, 100);
    let hasUtm = false;
    for (const key of UTM_KEYS) {
      const value = params.get(key)?.trim();
      if (value) {
        touch[key] = value.slice(0, 60);
        hasUtm = true;
      }
    }
    if (!ref && !hasUtm) return;
    if (readFirstTouch(storage, now)) return;
    storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  } catch {
    // Storage can be blocked (private window); tracking is best effort.
  }
}
