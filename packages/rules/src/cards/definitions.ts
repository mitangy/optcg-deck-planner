import type { CardDef, CardDefId, CardType } from "../types.js";
import { cardDataFor, listCardDataIds } from "./cardData.js";
import { normalizeCardId, tcgAltsForCard, tcgArtForCard } from "@optcg/card-core";
import { cardHasUnconditionalKeyword } from "./keywords.js";

const LOCAL_ALTS: Record<string, { id: string; label: string }[]> = {
  "ST01-001": [{ id: "p1", label: "Alternate Art" }],
  "ST01-006": [{ id: "p1", label: "Alternate Art" }, { id: "p2", label: "Parallel 2" }],
  "ST01-008": [{ id: "p1", label: "Alternate Art" }, { id: "p2", label: "Parallel 2" }],
  "ST01-009": [{ id: "p1", label: "Alternate Art" }, { id: "p2", label: "Parallel 2" }],
  "ST01-014": [{ id: "p1", label: "Alternate Art" }, { id: "p2", label: "Parallel 2" }],
};

function artFor(id: string): string {
  return tcgArtForCard(id) ?? `/cards/${id}.png`;
}

function altsFor(id: string): CardDef["altArts"] {
  const tcg = tcgAltsForCard(id);
  const byId = new Map<string, { id: string; label: string; imageUrl: string }>();
  for (const alt of LOCAL_ALTS[id] ?? []) byId.set(alt.id, { ...alt, imageUrl: `/cards/${id}_${alt.id}.webp` });
  for (const { id: altId, label, imageUrl } of tcg) byId.set(altId, { id: altId, label, imageUrl });
  return byId.size ? [...byId.values()] : undefined;
}

function eventTiming(text: string): CardDef["eventTiming"] {
  if (/\[Main\]/.test(text)) return "main";
  if (/\[Counter\]/.test(text)) return "counter";
  return "main";
}

function buildDef(id: CardDefId): CardDef | null {
  const row = cardDataFor(id);
  if (!row) return null;
  const def: CardDef = {
    id,
    name: row.name,
    type: row.type,
    colors: [...row.colors],
    cost: row.type === "leader" ? 0 : row.cost ?? 0,
    ...(row.power != null ? { power: row.power } : {}),
    ...(row.life != null ? { life: row.life } : {}),
    ...(row.counter != null ? { counter: row.counter } : {}),
    ...(row.type === "event" ? { eventTiming: eventTiming(row.text) } : {}),
    imageUrl: artFor(id),
    ...(row.attributes.length ? { attribute: row.attributes.join("/") } : {}),
    effectText: row.text || "—",
    ...(row.trigger ? { triggerText: row.trigger, hasTrigger: true } : {}),
    ...(row.traits.length ? { traits: [...row.traits] } : {}),
    dataSource: row.source,
  };
  const alts = altsFor(id);
  if (alts) def.altArts = alts;
  return def;
}

const byId = new Map<CardDefId, CardDef>();
for (const id of listCardDataIds()) {
  const def = buildDef(id);
  if (def) byId.set(id, def);
}

export const DEFAULT_LEADER_ID: CardDefId = "ST01-001";

export function normalizeCardDefId(id: string): CardDefId {
  return normalizeCardId(id);
}

export function hasCardDef(id: CardDefId): boolean {
  return byId.has(normalizeCardDefId(id));
}

export function isCuratedCardDef(id: CardDefId): boolean {
  return byId.get(normalizeCardDefId(id))?.dataSource === "bandai";
}

export function getDefsHealthSnapshot(): { defsCount: number; hasOP16080: boolean } {
  return { defsCount: byId.size, hasOP16080: byId.has("OP16-080") };
}

export function ensureCardDef(id: CardDefId, opts: { asLeader?: boolean } = {}): CardDef {
  const key = normalizeCardDefId(id);
  const existing = byId.get(key);
  if (existing) {
    if (opts.asLeader && existing.type !== "leader") throw new Error(`Card ${key} is typed as ${existing.type} but was used as a Leader`);
    return existing;
  }
  // Client-provided decks must not grow the process-global catalog for a server's lifetime.
  throw new Error(`Unknown card def: ${key}`);
}

export function ensureDefsForPlayers(players: ReadonlyArray<{ leaderId: CardDefId; deck: readonly CardDefId[] }>): void {
  for (const p of players) {
    const leaderId = normalizeCardDefId(p.leaderId);
    if (byId.get(leaderId)?.type !== "leader") throw new Error(`Unknown or invalid leader: ${leaderId}`);
    for (const raw of p.deck) {
      const id = normalizeCardDefId(raw);
      const def = byId.get(id);
      if (!def) throw new Error(`Unknown card def: ${id}`);
      if (def.type === "leader") throw new Error(`Leader ${id} cannot be used in the main deck`);
    }
  }
}

export function getCardDef(id: CardDefId): CardDef {
  const d = byId.get(normalizeCardDefId(id));
  if (!d) throw new Error(`Unknown card def: ${id}`);
  return d;
}

export function listCardDefs(): CardDef[] {
  return [...byId.values()];
}

export type CardAtlasEntry = {
  id: CardDefId;
  name: string;
  type: CardDef["type"];
  colors: string[];
  cost: number;
  power?: number;
  life?: number;
  counter?: number;
  blocker?: boolean;
  rush?: boolean;
  imageUrl?: string;
  effectText?: string;
  altArts?: { id: string; label: string; imageUrl: string }[];
  traits?: string[];
  hasTrigger?: boolean;
  attribute?: string;
  abilitySupport?: "none" | "keywords" | "ok" | "partial" | "unverified" | "unsupported";
  unsupportedText?: string[];
};

export function buildCardAtlas(): Record<CardDefId, CardAtlasEntry> {
  const atlas: Record<CardDefId, CardAtlasEntry> = {};
  for (const d of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (d.dataSource === "stub") continue;
    atlas[d.id] = {
      id: d.id,
      name: d.name,
      type: d.type,
      colors: [...d.colors],
      cost: d.cost,
      power: d.power,
      life: d.life,
      counter: d.counter,
      blocker: cardHasUnconditionalKeyword(d.id, "blocker") || undefined,
      rush: cardHasUnconditionalKeyword(d.id, "rush") || undefined,
      imageUrl: d.imageUrl,
      effectText: [d.effectText && d.effectText !== "—" ? d.effectText : "", d.triggerText ?? ""].filter(Boolean).join("\n\n") || "—",
      altArts: d.altArts?.map((a) => ({ ...a })),
      traits: d.traits?.length ? [...d.traits] : undefined,
      hasTrigger: d.hasTrigger ? true : undefined,
      attribute: d.attribute,
    };
  }
  return atlas;
}

export function buildTestDeck(size = 20): CardDefId[] {
  const pool: CardDefId[] = [
    "ST01-003", "ST01-003", "ST01-003", "ST01-003",
    "ST01-006", "ST01-006", "ST01-006", "ST01-006",
    "ST01-008", "ST01-008", "ST01-008", "ST01-008",
    "ST01-009", "ST01-009", "ST01-009", "ST01-009",
    "OP12-002", "OP12-002", "OP12-002", "OP12-002",
  ];
  if (size > pool.length) throw new Error(`buildTestDeck max ${pool.length}`);
  return pool.slice(0, size);
}
