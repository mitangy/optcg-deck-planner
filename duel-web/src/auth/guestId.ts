/** Stable browser guest id for duel rating continuity (localStorage). */

const KEY = "optcg.duel.guestId.v1";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateGuestId(): string {
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
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
