// Where to send someone after they sign in. Kept out of GroupBuys.tsx so the shell and the public pages can use it without pulling the whole group-buy chunk into the entry bundle.
const NEXT_KEY = "optcg_login_next";

/** Same-origin relative paths only — reject protocol-relative //evil.example. */
export function isSafeLoginNext(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("://")) return false;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

export function rememberLoginNext(path: string) {
  if (!isSafeLoginNext(path)) return;
  try {
    sessionStorage.setItem(NEXT_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeLoginNext(): string | null {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    if (next) sessionStorage.removeItem(NEXT_KEY);
    return next && isSafeLoginNext(next) ? next : null;
  } catch {
    return null;
  }
}
