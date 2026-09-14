import type { CardDefId, CardType } from "../types.js";
import raw from "./catalogMeta.json" with { type: "json" };

function normalize(id: string): CardDefId {
  return id.trim().toUpperCase();
}

export type CatalogMetaRow = {
  cost: number;
  type: string;
  name: string;
  colors?: string[];
  power?: number;
  counter?: number;
  life?: number;
  blocker?: boolean;
  rush?: boolean;
  eventTiming?: "main" | "counter";
  /** Printed ability text from cosmetics catalog (display / stubs only). */
  effectText?: string;
};

const catalog = raw as Record<string, CatalogMetaRow>;

export function catalogMetaFor(id: CardDefId): CatalogMetaRow | undefined {
  return catalog[normalize(id)];
}

export function catalogTypeFor(id: CardDefId): CardType {
  const t = catalogMetaFor(id)?.type;
  if (t === "leader" || t === "event" || t === "stage") return t;
  return "character";
}
