/**
 * Resolves a FAQ reference (card id plus the hash of the question) against the live official rows, the way
 * the model sees them through card_rulings: same order, same source ids. Nothing here holds Bandai text.
 */
import { shortHash } from "../src/sources";

export type Row = { question: string; answer: string };
export type Polarity = "yes" | "no" | "other";
export type Resolved = { source: string; polarity: Polarity };

/** The official answer's first word: "Yes..." or "No...", anything else (including "Not if...") is other. */
export function polarity(answer: string): Polarity {
  const m = /^(Yes|No)\b/.exec(answer.trim());
  return m ? (m[1] === "Yes" ? "yes" : "no") : "other";
}

function pick(rows: readonly Row[], qh: string): { index: number } | "stale" | "ambiguous" {
  const hits = rows.map((r, i) => ({ r, i })).filter(({ r }) => shortHash(r.question) === qh);
  if (!hits.length) return "stale";
  if (hits.length > 1) return "ambiguous";
  return { index: hits[0]!.i };
}

/** A card's ruling by question hash; its source is `ruling:<card>#<n>`, n counting from 1 as card_rulings shows them. */
export function resolveCardRuling(rulings: readonly Row[], card: string, qh: string): Resolved | "stale" | "ambiguous" {
  const found = pick(rulings, qh);
  if (typeof found === "string") return found;
  return { source: `ruling:${card}#${found.index + 1}`, polarity: polarity(rulings[found.index]!.answer) };
}

/** A general rules Q&A by question hash; its source is `ruling:general#<hash>`. */
export function resolveGeneral(general: readonly Row[], qh: string): Resolved | "stale" | "ambiguous" {
  const found = pick(general, qh);
  if (typeof found === "string") return found;
  return { source: `ruling:general#${qh}`, polarity: polarity(general[found.index]!.answer) };
}

/** The kth (1-based) erratum of a card, as `ruling:<card>#e<k>`, with its date. */
export function resolveErrata(errata: readonly { date: string | null }[], card: string, k: number): { source: string; date: string } | "stale" {
  const e = errata[k - 1];
  return e?.date ? { source: `ruling:${card}#e${k}`, date: e.date } : "stale";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Ways an answer may write a date such as "December 8, 2023" (ISO, month day year, day month year, short month). */
export function dateForms(date: string): string[] {
  const t = Date.parse(`${date} UTC`);
  if (Number.isNaN(t)) return [date];
  const d = new Date(t);
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
  const month = MONTHS[m]!;
  return [
    date,
    `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${month} ${day}, ${y}`,
    `${month} ${day} ${y}`,
    `${day} ${month} ${y}`,
    `${month.slice(0, 3)} ${day}, ${y}`,
  ];
}
