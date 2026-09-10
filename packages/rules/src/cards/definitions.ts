import type { CardDef, CardDefId } from "../types.js";

/** Bandai EN cardlist art keyed by official card number. */
function bandaiArt(id: string): string {
  return `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`;
}

/** Local duel-web mirror (+ Limitless-sourced parallels under /cards). */
function localArt(id: string): string {
  return `/cards/${id}.png`;
}

function localAlt(id: string, parallel: string): string {
  return `/cards/${id}_${parallel}.webp`;
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
    imageUrl: localArt("ST01-001"),
    effectText:
      "[Activate: Main] [Once Per Turn] You may rest this Leader: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
    altArts: [
      { id: "p1", label: "Alternate Art", imageUrl: localAlt("ST01-001", "p1") },
    ],
  },
  {
    id: "ST01-003",
    name: "Karoo",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 3000,
    counter: 1000,
    imageUrl: localArt("ST01-003"),
    effectText: "—",
  },
  {
    id: "ST01-006",
    name: "TonyTony.Chopper",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 1000,
    blocker: true,
    imageUrl: localArt("ST01-006"),
    effectText:
      "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
    altArts: [
      { id: "p1", label: "Alternate Art", imageUrl: localAlt("ST01-006", "p1") },
      { id: "p2", label: "Parallel 2", imageUrl: localAlt("ST01-006", "p2") },
    ],
  },
  {
    id: "ST01-008",
    name: "Nico Robin",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("ST01-008"),
    effectText: "—",
    altArts: [
      { id: "p1", label: "Alternate Art", imageUrl: localAlt("ST01-008", "p1") },
      { id: "p2", label: "Parallel 2", imageUrl: localAlt("ST01-008", "p2") },
    ],
  },
  {
    id: "ST01-009",
    name: "Nefeltari Vivi",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("ST01-009"),
    effectText: "—",
    altArts: [
      { id: "p1", label: "Alternate Art", imageUrl: localAlt("ST01-009", "p1") },
      { id: "p2", label: "Parallel 2", imageUrl: localAlt("ST01-009", "p2") },
    ],
  },
  {
    id: "ST01-014",
    name: "Guard Point",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "counter",
    counterPowerBonus: 3000,
    imageUrl: localArt("ST01-014"),
    effectText:
      "[Counter] Your Leader or 1 of your Characters gains +3000 power during this battle.",
    altArts: [
      { id: "p1", label: "Alternate Art", imageUrl: localAlt("ST01-014", "p1") },
      { id: "p2", label: "Parallel 2", imageUrl: localAlt("ST01-014", "p2") },
    ],
  },
];

// Keep Bandai CDN as a documented fallback for tooling that prefers remote art.
void bandaiArt;

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
  effectText?: string;
  altArts?: { id: string; label: string; imageUrl: string }[];
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
      effectText: d.effectText,
      altArts: d.altArts?.map((a) => ({ ...a })),
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
