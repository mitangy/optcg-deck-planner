/** Mirror of the backend username format rules (duel-web/src/auth/username.ts); the API stays authoritative for reserved words and uniqueness. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[A-Za-z0-9_-]+$/;

/** A user-facing problem, or null when the format looks valid. */
export function usernameFormatError(raw: string): string | null {
  const v = raw.trim();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(v)) return "Use only letters, numbers, underscores, and hyphens.";
  return null;
}
