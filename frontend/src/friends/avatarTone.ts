/** Number of avatar colour tones defined in friends.css (`.friend-avatar[data-tone]`). */
export const AVATAR_TONES = 8;

/** A stable tone index (0..AVATAR_TONES-1) for a username, so one friend keeps one colour. */
export function avatarTone(username: string): number {
  let h = 0;
  for (const ch of username) h = (Math.imul(h, 31) + ch.codePointAt(0)!) >>> 0;
  return h % AVATAR_TONES;
}
