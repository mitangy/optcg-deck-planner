/**
 * Client-side mirror of the backend username format rules (backend/app/usernames.py).
 * Only format/length are checked here for instant feedback; the API is
 * authoritative for reserved words, profanity, and uniqueness (422 / 409).
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
// A dot is allowed between characters ("Miko.T"), not leading, trailing, or doubled.
const USERNAME_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.-]+$/;

/** Returns a user-facing problem, or null when the format looks valid. */
export function usernameFormatError(raw: string): string | null {
  const v = raw.trim();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_RE.test(v)) {
    return "Use only letters, numbers, underscores, hyphens, and dots (not at the ends or doubled).";
  }
  return null;
}

/** Signed-in accounts without a username must pick one before playing. */
export function needsUsername(user: { username?: string | null } | null | undefined): boolean {
  return Boolean(user) && !user!.username;
}
