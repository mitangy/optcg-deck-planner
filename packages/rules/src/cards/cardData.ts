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
  /** `bandai`: official English card list. `bundled`: legacy catalog only (unverified). */
  source: "bandai" | "bundled";
  sourceUrl: string;
}

export interface CardDataFile {
  candidate: string;
  generatedFrom: string;
  cards: Record<CardDefId, CardDataRow>;
}

const data = raw as unknown as CardDataFile;

export function cardDataFor(id: CardDefId): CardDataRow | undefined {
  return data.cards[id];
}

export function listCardDataIds(): CardDefId[] {
  return Object.keys(data.cards);
}

export const CARD_DATA_CANDIDATE = data.candidate;
