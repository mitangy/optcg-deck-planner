/** Stable negative user id for a dev identity (never collides with real, positive account ids). */
export function hashToNegativeId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 1_000_000_000;
  return -1 - n;
}
