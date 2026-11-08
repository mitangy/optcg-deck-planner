/** Card-number helpers shared by every app and package. No dependencies (rules cannot import `ui`, and duel-web's main bundle cannot import rules). */

/** Cards in a legal main deck (the Leader and DON!! are separate). Python mirror: `backend/app/planner/deck_link.py` `COMPLETE_MAIN`. */
export const MAIN_DECK_SIZE = 50;

/** A whole printed card number such as `OP01-001`, `ST01-014` or `P-001` (after `normalizeCardId`). */
export const CARD_ID_RE = /^[A-Z0-9]+-\d+[A-Z]?$/;

/** Art-variant suffix of a printing id: `_P1` (parallel) or `_R1` (reprint). */
const ART_SUFFIX_RE = /_(?:P\d+|R\d+)$/;

/** Base card number of any printing id: trimmed, upper case, without a `_P1` / `_R1` art suffix. */
export function normalizeCardId(id: string): string {
  return id.trim().toUpperCase().replace(ART_SUFFIX_RE, "");
}

/** True for a well-formed card number (case and surrounding spaces are ignored). */
export function isCardId(id: string): boolean {
  return CARD_ID_RE.test(id.trim().toUpperCase());
}
