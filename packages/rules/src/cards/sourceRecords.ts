import { CARD_DATA_CANDIDATE, cardDataFor, listCardDataIds } from "./cardData.js";
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

/**
 * Provenance per card. Official-list rows are verified against the captured
 * Bandai snapshot (`CARD_DATA_CANDIDATE`); errata are not tracked there.
 */
export const CARD_SOURCE_RECORDS: Readonly<Record<CardDefId, CardSourceRecord>> = Object.freeze(
  Object.fromEntries(listCardDataIds().map((cardDefId) => {
    const row = cardDataFor(cardDefId)!;
    const official = row.source === "bandai";
    const v: FieldVerification = official ? "verified" : "unverified";
    return [cardDefId, Object.freeze({
      cardDefId,
      sourceUrl: row.sourceUrl || null,
      sourceRevision: official ? CARD_DATA_CANDIDATE : null,
      fields: Object.freeze({ identity: v, rulesText: v, stats: v, counter: v, traits: official ? "verified" : "unknown", errata: "unknown" }),
    })];
  })),
);

export function cardSourceRecord(cardDefId: CardDefId): CardSourceRecord | undefined {
  return CARD_SOURCE_RECORDS[cardDefId.trim().toUpperCase()];
}
