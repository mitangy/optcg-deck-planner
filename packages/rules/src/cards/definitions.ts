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

  // --- Constructed test-deck stubs (vanilla stats; display + legality only) ---
  {
    id: "OP17-001",
    name: "Monkey.D.Luffy (stub)",
    type: "leader",
    colors: ["red"],
    cost: 0,
    power: 5000,
    life: 5,
    imageUrl: localArt("OP17-001"),
    effectText: "—",
  },
  {
    id: "OP16-080",
    name: "Marshall.D.Teach (stub)",
    type: "leader",
    colors: ["black"],
    cost: 0,
    power: 5000,
    life: 4,
    imageUrl: localArt("OP16-080"),
    effectText: "—",
  },
  {
    id: "OP09-118",
    name: "Nami (stub)",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP09-118"),
    effectText: "—",
  },
  {
    id: "OP12-002",
    name: "Jinbe (stub)",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP12-002"),
    effectText: "—",
  },
  {
    id: "OP12-018",
    name: "Sanji (stub)",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP12-018"),
    effectText: "—",
  },
  {
    id: "OP16-021",
    name: "Zoro (stub)",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP16-021"),
    effectText: "—",
  },
  {
    id: "OP16-118",
    name: "Franky (stub)",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP16-118"),
    effectText: "—",
  },
  {
    id: "OP17-002",
    name: "Usopp (stub)",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 3000,
    counter: 1000,
    imageUrl: localArt("OP17-002"),
    effectText: "—",
  },
  {
    id: "OP17-003",
    name: "Chopper (stub)",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 3000,
    counter: 1000,
    imageUrl: localArt("OP17-003"),
    effectText: "—",
  },
  {
    id: "OP17-005",
    name: "Robin (stub)",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP17-005"),
    effectText: "—",
  },
  {
    id: "OP17-008",
    name: "Brook (stub)",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP17-008"),
    effectText: "—",
  },
  {
    id: "OP17-015",
    name: "Luffy (stub)",
    type: "character",
    colors: ["red"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP17-015"),
    effectText: "—",
  },
  {
    id: "OP17-017",
    name: "Yamato (stub)",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP17-017"),
    effectText: "—",
  },
  {
    id: "OP17-019",
    name: "Sabo (stub)",
    type: "character",
    colors: ["red"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP17-019"),
    effectText: "—",
  },
  {
    id: "ST23-001",
    name: "Bonney (stub)",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("ST23-001"),
    effectText: "—",
  },
  {
    id: "ST30-004",
    name: "Kid (stub)",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("ST30-004"),
    effectText: "—",
  },
  {
    id: "ST30-005",
    name: "Killer (stub)",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("ST30-005"),
    effectText: "—",
  },
  {
    id: "EB04-058",
    name: "Kuzan (stub)",
    type: "character",
    colors: ["black"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("EB04-058"),
    effectText: "—",
  },
  {
    id: "OP09-086",
    name: "Crocodile (stub)",
    type: "character",
    colors: ["black"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP09-086"),
    effectText: "—",
  },
  {
    id: "OP09-093",
    name: "Mihawk (stub)",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP09-093"),
    effectText: "—",
  },
  {
    id: "OP09-095",
    name: "Perona (stub)",
    type: "character",
    colors: ["black"],
    cost: 2,
    power: 3000,
    counter: 1000,
    imageUrl: localArt("OP09-095"),
    effectText: "—",
  },
  {
    id: "OP09-096",
    name: "Absalom (stub)",
    type: "character",
    colors: ["black"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP09-096"),
    effectText: "—",
  },
  {
    id: "OP09-099",
    name: "Moria (stub)",
    type: "character",
    colors: ["black"],
    cost: 8,
    power: 9000,
    counter: 1000,
    imageUrl: localArt("OP09-099"),
    effectText: "—",
  },
  {
    id: "OP12-112",
    name: "Teach (stub)",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP12-112"),
    effectText: "—",
  },
  {
    id: "OP14-108",
    name: "Shiryu (stub)",
    type: "character",
    colors: ["black"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP14-108"),
    effectText: "—",
  },
  {
    id: "OP16-104",
    name: "Doc Q (stub)",
    type: "character",
    colors: ["black"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP16-104"),
    effectText: "—",
  },
  {
    id: "OP16-106",
    name: "Van Augur (stub)",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP16-106"),
    effectText: "—",
  },
  {
    id: "OP16-108",
    name: "Lafitte (stub)",
    type: "character",
    colors: ["black"],
    cost: 3,
    power: 4000,
    counter: 1000,
    imageUrl: localArt("OP16-108"),
    effectText: "—",
  },
  {
    id: "OP16-109",
    name: "Jesus Burgess (stub)",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP16-109"),
    effectText: "—",
  },
  {
    id: "OP16-110",
    name: "Catarina Devon (stub)",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP16-110"),
    effectText: "—",
  },
  {
    id: "OP16-115",
    name: "Blackbeard (stub)",
    type: "character",
    colors: ["black"],
    cost: 10,
    power: 12000,
    counter: 1000,
    imageUrl: localArt("OP16-115"),
    effectText: "—",
  },
  {
    id: "OP16-116",
    name: "Avalo Pizarro (stub)",
    type: "character",
    colors: ["black"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP16-116"),
    effectText: "—",
  },
  {
    id: "OP16-119",
    name: "Vasco Shot (stub)",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP16-119"),
    effectText: "—",
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
