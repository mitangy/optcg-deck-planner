import { catalogMetaFor, listCatalogMetaIds } from "./catalogMeta.js";
import type { CardDefId } from "../types.js";

export type FieldVerification = "verified" | "unverified" | "unknown";
export interface CardSourceRecord {
  cardDefId: CardDefId;
  sourceUrl: string | null;
  sourceRevision: string | null;
  fields: {
    identity: FieldVerification;
    rulesText: FieldVerification;
    stats: FieldVerification;
    counter: FieldVerification;
    traits: FieldVerification;
    errata: FieldVerification;
  };
}

const ST01_SOURCE = "https://en.onepiece-cardgame.com/cardlist/?series=569001";
const OP16_SOURCE = "https://en.onepiece-cardgame.com/cardlist/?series=569116";
const reviewed: Readonly<Record<string, { url: string; revision: string }>> = {
  "ST01-001": { url: ST01_SOURCE, revision: "reviewed-2026-09-14" },
  "ST01-004": { url: ST01_SOURCE, revision: "reviewed-2026-09-14" },
  "ST01-005": { url: ST01_SOURCE, revision: "reviewed-2026-09-14" },
  "ST01-014": { url: ST01_SOURCE, revision: "reviewed-2026-09-14" },
  "OP16-080": { url: OP16_SOURCE, revision: "reviewed-2026-09-14" },
};

export const CARD_SOURCE_RECORDS: Readonly<Record<CardDefId, CardSourceRecord>> = Object.freeze(
  Object.fromEntries(listCatalogMetaIds().map((cardDefId) => {
    const source = reviewed[cardDefId];
    const meta = catalogMetaFor(cardDefId);
    const verified = source ? "verified" as const : "unverified" as const;
    return [cardDefId, Object.freeze({
      cardDefId,
      sourceUrl: source?.url ?? null,
      sourceRevision: source?.revision ?? null,
      fields: Object.freeze({
        identity: verified,
        rulesText: verified,
        stats: verified,
        counter: source ? "verified" : meta?.counter == null ? "unknown" : "unverified",
        // Historical corrections did not establish a full trait/errata review.
        // A source URL alone must never promote unrelated fields.
        traits: "unknown",
        errata: "unknown",
      }),
    })];
  })),
);

export function cardSourceRecord(cardDefId: CardDefId): CardSourceRecord | undefined {
  return CARD_SOURCE_RECORDS[cardDefId.trim().toUpperCase()];
}
