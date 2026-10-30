import { presence, type Takedown } from "./presence.js";

/**
 * Images a moderator took down (#810). The API repeats every takedown from the last 15
 * minutes in each presence answer; we remember the cosmetic ids for a day so a skin that
 * is sent later (a seat that joins or re-sends its skin) is blanked too.
 */
export const TAKEDOWN_MEMORY_MS = 24 * 60 * 60 * 1000;

const known = new Map<number, number>();

export function recordTakedowns(list: readonly Takedown[], now = Date.now()): void {
  for (const [id, at] of known) if (now - at > TAKEDOWN_MEMORY_MS) known.delete(id);
  for (const t of list) if (!known.has(t.cosmetic_id)) known.set(t.cosmetic_id, now);
}

export function isTakenDown(cosmeticId: number, now = Date.now()): boolean {
  const at = known.get(cosmeticId);
  return at !== undefined && now - at <= TAKEDOWN_MEMORY_MS;
}

/** The cosmetic id inside a signed link ("/duel/cosmetics/{id}/public/{sig}"), else null. */
export function cosmeticIdOfLink(value: string | null): number | null {
  const m = value ? /^\/duel\/cosmetics\/(\d{1,12})\/public\//.exec(value) : null;
  return m ? Number(m[1]) : null;
}

/** True for a skin value that must not be shown: a link to this cosmetic, or any inline image. */
export function skinMatchesTakedown(value: string | null, cosmeticId: number): boolean {
  if (!value) return false;
  if (value.startsWith("data:")) return true;
  return cosmeticIdOfLink(value) === cosmeticId;
}

/** Test hook. */
export function resetTakedowns(): void {
  known.clear();
}

presence.onTakedowns((list) => recordTakedowns(list));
