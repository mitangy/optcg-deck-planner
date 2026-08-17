/** Resolve an OCR read to a catalog card using progressive catalog queries.
 *
 * The scanner deliberately does not preload the catalog. A shape-repaired id is
 * enough to query for, and the query returns the names needed to cross-check
 * the read — so the common case costs a single request.
 */

import { extractCardIdTokens, repairCardId, resolveScannedCardId } from "./cardScan";
import type { ScanConfidence } from "./cardScan";

/** The subset of a catalog result this module needs. */
export type LookupCard = {
  card_id: string;
  name: string;
};

/** Injected catalog search, so resolution is testable without a network. */
export type CatalogLookup<T extends LookupCard> = (query: string) => Promise<T[]>;

export type ScanResolution<T extends LookupCard> = {
  card: T;
  confidence: ScanConfidence;
  /** The token the id was derived from. */
  source: string;
  /** Catalog queries issued, for diagnostics. */
  queries: number;
};

export type ScanResolutionFailure = {
  reason: "no-card-id" | "not-in-catalog" | "ambiguous";
  /** The repaired id we looked for, when we got that far. */
  candidate?: string;
  queries: number;
};

export type ScanOutcome<T extends LookupCard> =
  | ({ ok: true } & ScanResolution<T>)
  | ({ ok: false } & ScanResolutionFailure);

/**
 * Query widths tried in order.
 *
 * Exact resolves almost every scan. The wider forms only run when the printed
 * name disagrees with the id, which means a digit was misread. Whole-set
 * queries are split because the largest sets (123 cards) exceed the API's
 * 100-row cap and would otherwise truncate away the right answer.
 */
function widenQueries(cardId: string): string[] {
  const dash = cardId.lastIndexOf("-");
  if (dash === -1) return [cardId];
  const setCode = cardId.slice(0, dash);
  const collector = cardId.slice(dash + 1);
  return [
    cardId,
    // Same ten-block: catches a misread units digit, ~10 rows.
    `${setCode}-${collector.slice(0, 2)}`,
    // Whole set in hundreds-blocks, each safely under the row cap.
    `${setCode}-0`,
    `${setCode}-1`,
  ];
}

function toSets<T extends LookupCard>(cards: T[]) {
  const ids = new Set<string>();
  const names = new Map<string, string>();
  const byId = new Map<string, T>();
  for (const card of cards) {
    ids.add(card.card_id);
    names.set(card.card_id, card.name);
    byId.set(card.card_id, card);
  }
  return { ids, names, byId };
}

/**
 * Resolve raw OCR text to a catalog card.
 *
 * Widening stops as soon as the resolved id's printed name agrees with the
 * read, so a clean scan issues exactly one query.
 */
export async function resolveScanWithCatalog<T extends LookupCard>(
  text: string,
  lookup: CatalogLookup<T>,
): Promise<ScanOutcome<T>> {
  const tokens = extractCardIdTokens(text);
  const candidate = tokens.map(repairCardId).find((id): id is string => Boolean(id));
  if (!candidate) return { ok: false, reason: "no-card-id", queries: 0 };

  let queries = 0;
  const seen = new Map<string, T>();
  for (const query of widenQueries(candidate)) {
    const rows = await lookup(query);
    queries += 1;
    for (const row of rows) seen.set(row.card_id, row);
    const { ids, names, byId } = toSets([...seen.values()]);
    const match = resolveScannedCardId(text, ids, names);
    if (!match) continue;
    const card = byId.get(match.card_id);
    if (!card) continue;
    // Stop only when the printed name backs the id up. Repairing a token says
    // nothing about whether the result is the right card — a misread digit
    // lands on another real id just as easily — so a repaired match must clear
    // the same bar as an untouched one. Without this, "Borsalino OP16-073"
    // misread as OP16-072 returned Hannyabal, a real card, unchallenged.
    if (nameAgrees(card.name, text)) {
      return { ok: true, card, confidence: match.confidence, source: match.source, queries };
    }
  }

  // Widening exhausted — fall back to whatever the widest view supports.
  const { ids, names, byId } = toSets([...seen.values()]);
  const match = resolveScannedCardId(text, ids, names);
  const card = match ? byId.get(match.card_id) : undefined;
  if (match && card) {
    return { ok: true, card, confidence: match.confidence, source: match.source, queries };
  }
  return {
    ok: false,
    reason: seen.size ? "ambiguous" : "not-in-catalog",
    candidate,
    queries,
  };
}

function nameAgrees(name: string, text: string): boolean {
  // Reuse the same threshold the pure resolver applies.
  const tokens = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  const haystack = text.toUpperCase();
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits / tokens.length >= 0.5;
}
