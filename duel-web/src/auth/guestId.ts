/** Stable browser guest id for duel rating continuity (localStorage). */

const KEY = "optcg.duel.guestId.v1";

/**
 * Fixed guest id for automated browsers (Playwright, Puppeteer: `navigator.webdriver`), so tests
 * reuse one prod account instead of creating a new one per run (#447).
 */
export const AUTOMATION_GUEST_ID = "automation-test-guest";

function isAutomatedBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateGuestId(): string {
  if (isAutomatedBrowser()) return AUTOMATION_GUEST_ID;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
    const next = randomId();
    localStorage.setItem(KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

export function peekGuestId(): string | null {
  if (isAutomatedBrowser()) return AUTOMATION_GUEST_ID;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
