import type { CardDef, CardDefId } from "../types.js";

/** Bandai EN cardlist art keyed by official card number. */
function bandaiArt(id: string): string {
  return `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`;
}

/**
 * Curated real OPTCG ids for Step 3.
 * Mechanics limited to keywords the engine already supports.
 * Printed effects beyond those hooks: see README Known gaps.
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
    imageUrl: bandaiArt("ST01-001"),
  },
  {
    id: "ST01-002",
    name: "Monkey.D.Luffy",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-002"),
  },
  {
    id: "ST01-003",
    name: "Roronoa Zoro",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-003"),
  },
  {
    id: "ST01-004",
    name: "Nami",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-004"),
  },
  {
    id: "ST01-005",
    name: "Usopp",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 3000,
    counter: 1000,
    imageUrl: bandaiArt("ST01-005"),
  },
  {
    id: "ST01-006",
    name: "Sanji",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 3000,
    blocker: true,
    imageUrl: bandaiArt("ST01-006"),
  },
  {
    id: "ST01-007",
    name: "TonyTony.Chopper",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 1000,
    blocker: true,
    imageUrl: bandaiArt("ST01-007"),
  },
  {
    id: "OP01-013",
    name: "Trafalgar Law",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    triggerDraw: 1,
    imageUrl: bandaiArt("OP01-013"),
  },
  {
    id: "ST01-014",
    name: "Gum-Gum Jet Pistol",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "main",
    mainDraw: 1,
    imageUrl: bandaiArt("ST01-014"),
  },
  {
    id: "ST01-015",
    name: "Gum-Gum Balloon",
    type: "event",
    colors: ["red"],
    cost: 0,
    eventTiming: "counter",
    counterPowerBonus: 1000,
    imageUrl: bandaiArt("ST01-015"),
  },
  {
    id: "OP01-031",
    name: "Radical Beam!!",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "counter",
    counterPowerBonus: 1000,
    imageUrl: bandaiArt("OP01-031"),
  },
  {
    id: "ST01-017",
    name: "Thousand Sunny",
    type: "stage",
    colors: ["red"],
    cost: 1,
    stageLeaderPowerBonus: 1000,
    imageUrl: bandaiArt("ST01-017"),
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
    "ST01-002",
    "ST01-002",
    "ST01-002",
    "ST01-002",
    "ST01-003",
    "ST01-003",
    "ST01-003",
    "ST01-003",
    "ST01-004",
    "ST01-004",
    "ST01-005",
    "ST01-005",
    "ST01-006",
    "ST01-006",
    "ST01-007",
    "ST01-007",
    "ST01-014",
    "ST01-014",
    "ST01-015",
    "ST01-015",
    "ST01-017",
    "ST01-017",
    "OP01-013",
    "OP01-013",
  ];
  if (size > pool.length) throw new Error(`buildTestDeck max ${pool.length}`);
  return pool.slice(0, size);
}
