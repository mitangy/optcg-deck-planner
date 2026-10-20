import type { CardDefId, CardType } from "../types.js";
import raw from "./cardData.json" with { type: "json" };

/** Printed gameplay metadata for one base card ID (alternate art shares it). */
export interface CardDataRow {
  name: string;
  type: CardType;
  colors: string[];
  /** Absent for Leaders. */
  cost?: number;
  power?: number;
  /** Absent means the card has no printed Counter. */
  counter?: number;
  life?: number;
  traits: string[];
  attributes: string[];
  /** Printed text excluding the [Trigger] clause. */
  text: string;
  /** Printed [Trigger] clause, including its tag, or "". */
  trigger: string;
  /** `bandai`: official English card list. `bundled`: legacy catalog only (unverified). `tcgplayer`: imported from TCGPlayer (tcgcsv) until Bandai publishes it (unverified). */
  source: "bandai" | "bundled" | "tcgplayer";
  sourceUrl: string;
}

export interface CardDataFile {
  candidate: string;
  generatedFrom: string;
  cards: Record<CardDefId, CardDataRow>;
}

const data = raw as unknown as CardDataFile;

/**
 * Official errata applied over the imported snapshot (the Bandai list can lag behind, and a re-import must not undo them).
 * OP06-034 Hyouzou: type {Fish-Man} became {Merfolk} on 2024-12-06 (so Ikaros Much OP06-024 cannot play it).
 */
const ERRATA: Record<CardDefId, Partial<CardDataRow>> = {
  "OP06-034": { traits: ["Merfolk"] },
};
for (const [id, patch] of Object.entries(ERRATA)) if (data.cards[id]) data.cards[id] = { ...data.cards[id]!, ...patch };

export function cardDataFor(id: CardDefId): CardDataRow | undefined {
  return data.cards[id];
}

export function listCardDataIds(): CardDefId[] {
  return Object.keys(data.cards);
}

export const CARD_DATA_CANDIDATE = data.candidate;
