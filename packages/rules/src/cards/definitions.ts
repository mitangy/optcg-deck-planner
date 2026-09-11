import fs from "node:fs";
import type { CardDef, CardDefId } from "../types.js";
import { tcgAltsForCard, tcgArtForCard } from "./tcgArt.js";

/** Bandai EN cardlist art keyed by official card number (often CORP-blocked in browsers). */
function bandaiArt(id: string): string {
  return `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`;
}

/**
 * Prefer TCGPlayer CDN (same as the deck planner catalog). Fall back to a local
 * `/cards/` mirror when no product id is mapped yet.
 */
function localArt(id: string): string {
  return tcgArtForCard(id) ?? `/cards/${id}.png`;
}

function localAlt(id: string, parallel: string): string {
  const fromTcg = tcgAltsForCard(id).find((a) => a.id === parallel);
  if (fromTcg) return fromTcg.imageUrl;
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
    id: "ST01-004",
    name: "Sanji",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 4000,
    counter: 1000,
    rush: true,
    imageUrl: localArt("ST01-004"),
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

// Prefer TCGPlayer CDN alt prints when mapped; keep any curated local parallels.
for (const d of defs) {
  const fromTcg = tcgAltsForCard(d.id);
  if (!fromTcg.length) continue;
  const byAltId = new Map((d.altArts ?? []).map((a) => [a.id, a]));
  for (const a of fromTcg) {
    byAltId.set(a.id, { id: a.id, label: a.label, imageUrl: a.imageUrl });
  }
  d.altArts = [...byAltId.values()];
}

// Keep Bandai CDN as a documented fallback for tooling that prefers remote art.
void bandaiArt;

const byId = new Map(defs.map((d) => [d.id, d]));

/** Runtime identity for detecting duplicate module instances (debug). */
const DEFS_MODULE_ID = `defs_${Math.random().toString(36).slice(2, 9)}`;

// #region agent log
function agentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
): void {
  const payload = {
    hypothesisId,
    location,
    message,
    data: { moduleId: DEFS_MODULE_ID, defsCount: byId.size, ...data },
    timestamp: Date.now(),
  };
  try {
    fs.appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify(payload)}\n`,
    );
  } catch {
    /* ignore missing path */
  }
  console.warn(`[agent-debug] ${JSON.stringify(payload)}`);
}
agentLog("A", "definitions.ts:init", "defs module loaded", {
  hasOP16080: byId.has("OP16-080"),
  hasEnsure: true,
});
// #endregion

export const DEFAULT_LEADER_ID: CardDefId = "ST01-001";

/** Normalize OPTCG-style ids (trim + uppercase). */
export function normalizeCardDefId(id: string): CardDefId {
  return id.trim().toUpperCase();
}

export function hasCardDef(id: CardDefId): boolean {
  return byId.has(normalizeCardDefId(id));
}

/** Debug/ops snapshot — used by game-server /health (safe, no secrets). */
export function getDefsDebugSnapshot(): {
  moduleId: string;
  defsCount: number;
  hasOP16080: boolean;
  hasEnsureDefsForPlayers: boolean;
} {
  return {
    moduleId: DEFS_MODULE_ID,
    defsCount: byId.size,
    hasOP16080: byId.has("OP16-080"),
    hasEnsureDefsForPlayers: true,
  };
}

/**
 * Register a vanilla stub when a deck references an id outside the curated set.
 * Leaders need `asLeader: true` (life/power defaults); everything else is a
 * generic Character so matches can still start for constructed lists.
 */
export function ensureCardDef(
  id: CardDefId,
  opts: { asLeader?: boolean } = {},
): CardDef {
  const key = normalizeCardDefId(id);
  const existing = byId.get(key);
  if (existing) {
    if (opts.asLeader && existing.type !== "leader") {
      throw new Error(
        `Card ${key} is typed as ${existing.type} but was used as a Leader`,
      );
    }
    return existing;
  }

  const stub: CardDef = opts.asLeader
    ? {
        id: key,
        name: `${key} (stub)`,
        type: "leader",
        colors: ["red"],
        cost: 0,
        power: 5000,
        life: 5,
        imageUrl: localArt(key),
        effectText: "—",
      }
    : {
        id: key,
        name: `${key} (stub)`,
        type: "character",
        colors: ["red"],
        cost: 2,
        power: 3000,
        counter: 1000,
        imageUrl: localArt(key),
        effectText: "—",
      };

  defs.push(stub);
  byId.set(key, stub);
  return stub;
}

/** Ensure every leader + main-deck id has a CardDef (curated or auto-stub). */
export function ensureDefsForPlayers(
  players: ReadonlyArray<{ leaderId: CardDefId; deck: readonly CardDefId[] }>,
): void {
  // #region agent log
  agentLog("B", "definitions.ts:ensureDefsForPlayers", "ensureDefs entry", {
    leaders: players.map((p) => p.leaderId),
    deckLens: players.map((p) => p.deck.length),
    hasOP16080Before: byId.has("OP16-080"),
  });
  // #endregion
  const missing: string[] = [];
  for (const p of players) {
    const leaderId = normalizeCardDefId(p.leaderId);
    if (!hasCardDef(leaderId)) missing.push(leaderId);
    ensureCardDef(leaderId, { asLeader: true });
    for (const raw of p.deck) {
      const id = normalizeCardDefId(raw);
      if (!hasCardDef(id)) missing.push(id);
      ensureCardDef(id);
    }
  }
  if (missing.length) {
    // Dedupe for logs/tests; createMatch still proceeds with stubs.
    const uniq = [...new Set(missing)];
    console.warn(
      `[optcg/rules] Auto-stubbed ${uniq.length} missing card def(s): ${uniq.join(", ")}`,
    );
  }
  // #region agent log
  agentLog("B", "definitions.ts:ensureDefsForPlayers", "ensureDefs exit", {
    missingCount: missing.length,
    hasOP16080After: byId.has("OP16-080"),
  });
  // #endregion
}

export function getCardDef(id: CardDefId): CardDef {
  const key = normalizeCardDefId(id);
  const d = byId.get(key);
  if (!d) {
    // #region agent log
    agentLog("A", "definitions.ts:getCardDef", "Unknown card def throw", {
      rawId: id,
      key,
      hasKey: byId.has(key),
      hasOP16080: byId.has("OP16-080"),
    });
    // #endregion
    throw new Error(`Unknown card def: ${id}`);
  }
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
  rush?: boolean;
  imageUrl?: string;
  effectText?: string;
  altArts?: { id: string; label: string; imageUrl: string }[];
};

export function buildCardAtlas(): Record<CardDefId, CardAtlasEntry> {
  const atlas: Record<CardDefId, CardAtlasEntry> = {};
  for (const d of defs) {
    const authoredAlts = d.altArts?.map((a) => ({ ...a }));
    const tcgAlts = tcgAltsForCard(d.id);
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
      rush: d.rush,
      imageUrl: d.imageUrl,
      effectText: d.effectText,
      // Prefer authored alt list (e.g. local ST01 parallels); else TCGCSV alts.
      altArts: authoredAlts?.length ? authoredAlts : tcgAlts.length ? tcgAlts : undefined,
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
    "ST01-004",
    "ST01-004",
    "ST01-004",
    "ST01-004",
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
    "ST01-014",
    "ST01-014",
  ];
  if (size > pool.length) throw new Error(`buildTestDeck max ${pool.length}`);
  return pool.slice(0, size);
}
