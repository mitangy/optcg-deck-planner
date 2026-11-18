import { timingSafeEqual } from "node:crypto";

export function keyMatches(given: string | undefined, expected: string): boolean {
  if (!expected) return true;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
