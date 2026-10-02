import { timingSafeEqual } from "node:crypto";

/**
 * The connector URL carries a secret path segment so only people given the URL can use it.
 * With no key configured (local dev), every request is allowed.
 */
export function keyMatches(given: string | undefined, expected: string): boolean {
  if (!expected) return true;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
