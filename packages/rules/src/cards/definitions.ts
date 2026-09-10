import type { CardDef, CardDefId } from "../types.js";

/** Bandai EN cardlist art keyed by official card number. */
function bandaiArt(id: string): string {
  return `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`;
}

/**
 * Corrected curated ST01 ids (Step 3.5 audit).
 * Only prints that map 1:1 onto engine hooks (plus ST01-001 Activate:Main).
 */
const defs: CardDef[] = [
  {
    id: "ST01-001",
    name: "Monkey.D.Luffy",
    type: "leader",
    colors: ["red"],
    cost: 0,
    power: 5000,
    life: 5,
    leaderActivateGiveRestedDon: true,
    imageUrl: bandaiArt("ST01-001"),
  },
  {
    id: "ST01-003",
    name: "Karoo",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 3000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-003"),
  },
  {
    id: "ST01-006",
    name: "TonyTony.Chopper",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 1000,
    blocker: true,
    imageUrl: bandaiArt("ST01-006"),
  },
  {
    id: "ST01-008",
    name: "Nico Robin",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 5000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-008"),
  },
  {
    id: "ST01-009",
    name: "Nefeltari Vivi",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 4000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-009"),
  },
  {
    id: "ST01-014",
    name: "Guard Point",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "counter",
    counterPowerBonus: 3000,
    imageUrl: bandaiArt("ST01-014"),
  },
];

const byId = new Map(defs.map((d) => [d.id, d]));

export const DEFAULT_LEADER_ID: CardDefId = "ST01-001";

export function getCardDef(id: CardDefId): CardDef {
  const d = byId.get(id);
  if (!d) throw new Error(`Unknown card def: ${id}`);
  return d;
}

export function listCardDefs(): CardDef[] {
  return defs.slice();
}

/** Atlas entries for clients (cosmetics + public stats). */
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
  imageUrl?: string;
};

export function buildCardAtlas(): Record<CardDefId, CardAtlasEntry> {
  const atlas: Record<CardDefId, CardAtlasEntry> = {};
  for (const d of defs) {
    atlas[d.id] = {
      id: d.id,
      name: d.name,
      type: d.type,
      colors: [...d.colors],
      cost: d.cost,
      power: d.power,
      life: d.life,
      counter: d.counter,
      blocker: d.blocker,
      imageUrl: d.imageUrl,
    };
  }
  return atlas;
}

/**
 * Build a short prototype main deck (no leader) from the curated set.
 * Respects ≤4 copies per card number.
 */
export function buildTestDeck(size = 20): CardDefId[] {
  const pool: CardDefId[] = [
    "ST01-003",
    "ST01-003",
    "ST01-003",
    "ST01-003",
    "ST01-006",
    "ST01-006",
    "ST01-006",
    "ST01-006",
    "ST01-008",
    "ST01-008",
    "ST01-008",
    "ST01-008",
    "ST01-009",
    "ST01-009",
    "ST01-009",
    "ST01-009",
    "ST01-014",
    "ST01-014",
    "ST01-014",
    "ST01-014",
  ];
  if (size > pool.length) throw new Error(`buildTestDeck max ${pool.length}`);
  return pool.slice(0, size);
}
