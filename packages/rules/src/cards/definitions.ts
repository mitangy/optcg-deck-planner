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
    id: "ST01-005",
    name: "Usopp",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 2000,
    counter: 2000,
    imageUrl: localArt("ST01-005"),
    effectText: "—",
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

  // --- Constructed test-deck stubs (printed identity + vanilla play; hooks TBD) ---
  {
    id: "OP17-001",
    name: "Edward.Newgate",
    type: "leader",
    colors: ["red"],
    cost: 0,
    power: 5000,
    life: 5,
    imageUrl: localArt("OP17-001"),
    effectText: "[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: Up to 1 of your Leader or Characters gains +4000 power during this battle.",
  },
  {
    id: "OP16-080",
    name: "Marshall.D.Teach",
    type: "leader",
    colors: ["black", "yellow"],
    cost: 0,
    power: 5000,
    life: 4,
    imageUrl: localArt("OP16-080"),
    effectText: "[Opponent's Turn] All of your Characters gain +1 cost.\n\n[On your Opponent's Attack] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Change the target of that attack to this Leader or to one of your {Blackbeard Pirates} type Character cards.",
  },
  {
    id: "OP09-118",
    name: "Gol.D.Roger",
    type: "character",
    colors: ["red"],
    cost: 10,
    power: 13000,
    imageUrl: localArt("OP09-118"),
    effectText: "[Rush] (This card can attack on the turn in which it is played.)\n\nWhen your opponent activates [Blocker], if either you or your opponent has 0 Life cards, you win the game.",
  },
  {
    id: "OP12-002",
    name: "Edward.Newgate",
    type: "character",
    colors: ["red"],
    cost: 5,
    power: 6000,
    counter: 2000,
    imageUrl: localArt("OP12-002"),
    effectText: "—",
  },
  {
    id: "OP12-018",
    name: "Color of the Supreme King Haki",
    type: "event",
    colors: ["red"],
    cost: 0,
    eventTiming: "counter",
    imageUrl: localArt("OP12-018"),
    effectText: "[Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle. Then, you may rest 1 of your DON!! cards. If you do, give your opponent's Leader and all of their Characters 1000 power during this turn.",
  },
  {
    id: "OP16-021",
    name: "Moby Dick",
    type: "stage",
    colors: ["red"],
    cost: 1,
    imageUrl: localArt("OP16-021"),
    effectText: "[On Play] If your Leader has the {Whitebeard Pirates} type, look at 3 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order.\n\n\n[Activate:Main] You may trash this Stage: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
  },
  {
    id: "OP16-118",
    name: "Portgas.D.Ace",
    type: "character",
    colors: ["red"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP16-118"),
    effectText: "The counter of all of your Character cards with 8000 power in your hand becomes +2000.\n\n[On Play]/[On K.O.] Look at 5 cards from the top of your deck; reveal up to 1 [Monkey.D.Luffy] or up to 1 card with a type including \"Whitebeard Pirates\" and add it to your hand. Then, place the rest a the bottom of your deck in any order.",
  },
  {
    id: "OP17-002",
    name: "Atmos",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 6000,
    imageUrl: localArt("OP17-002"),
    effectText: "[Opponent's Turn] This Character gains +3000 power.",
  },
  {
    id: "OP17-003",
    name: "Izo",
    type: "character",
    colors: ["red"],
    cost: 4,
    power: 6000,
    imageUrl: localArt("OP17-003"),
    effectText: "[Rush: Character]\n\n[On Play] If your Leader is [Edward.Newgate] or has the {Land of Wano} type, give up to 1 of your opponent's rested Characters -6000 power during this turn.",
  },
  {
    id: "OP17-005",
    name: "Edward.Newgate",
    type: "character",
    colors: ["red"],
    cost: 10,
    power: 12000,
    imageUrl: localArt("OP17-005"),
    effectText: "If your opponent has a Character with 10000 power or more, give this card in your hand -4 cost.\n\n[On Play] Your monocolored Leader's base power becomes 8000 until the end of your opponent's next End Phase.",
  },
  {
    id: "OP17-008",
    name: "Jozu",
    type: "character",
    colors: ["red"],
    cost: 6,
    power: 8000,
    imageUrl: localArt("OP17-008"),
    effectText: "[On Play] Your [Edward.Newgate] Leader's base power becomes 8000 until the end of your opponent's next End Phase.",
  },
  {
    id: "OP17-015",
    name: "Marco",
    type: "character",
    colors: ["red"],
    cost: 5,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP17-015"),
    effectText: "If one of your Characters would be removed from the field by your opponent's effect, you may K.O. this Character instead.\n\n[On K.O.] You may trash 1 card with a type including \"Whitebeard Pirates\" from your hand: Play this Character card from your trash.",
  },
  {
    id: "OP17-017",
    name: "Ga Ha Ha Ha!!",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "counter",
    imageUrl: localArt("OP17-017"),
    effectText: "[Counter] Up to 1 of your Leader with a type including \"Whitebeard Pirates\" or up to 1 of your Characters with a type including \"Whitebeard Pirates\" gains +2000 power during this battle. Then, give up to 1 of your opponent's Leader or Characters 2000 power during this turn.",
  },
  {
    id: "OP17-019",
    name: "I Don't Have Time to Chat with Snot-Nosed Brats",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "main",
    imageUrl: localArt("OP17-019"),
    effectText: "[Main] Look at 5 cards from the top of your deck; reveal up to 1 card with a type including \"Whitebeard Pirates\" and add it to your hand. Then, place the rest at the bottom of your deck in any order.\n\n\n[Trigger] Your Leader gains +1000 power during this turn.",
  },
  {
    id: "ST23-001",
    name: "Uta",
    type: "character",
    colors: ["red"],
    cost: 6,
    power: 4000,
    counter: 2000,
    blocker: true,
    imageUrl: localArt("ST23-001"),
    effectText: "If you have a Character with 10000 power or more, give this card in your hand −4 cost.\n[Blocker]",
  },
  {
    id: "ST30-004",
    name: "Emporio.Ivankov",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    imageUrl: localArt("ST30-004"),
    effectText: "[On Play] You may reveal 2 Character cards with 6000 power from your hand: Draw 3 cards and trash 2 cards from your hand.",
  },
  {
    id: "ST30-005",
    name: "Jozu",
    type: "character",
    colors: ["red"],
    cost: 5,
    power: 6000,
    counter: 2000,
    imageUrl: localArt("ST30-005"),
    effectText: "—",
  },
  {
    id: "EB04-058",
    name: "Borsalino",
    type: "character",
    colors: ["yellow"],
    cost: 5,
    power: 6000,
    counter: 1000,
    blocker: true,
    imageUrl: localArt("EB04-058"),
    effectText: "[Blocker]\n[On Play] If you have 2 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards.",
  },
  {
    id: "OP09-086",
    name: "Jesus Burgess",
    type: "character",
    colors: ["black"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP09-086"),
    effectText: "This Character cannot be K.O.'d by your opponent's effects.\n\nIf your Leader has the \"Blackbeard Pirates\" type, this Character gains +1000 power for every 4 cards in your trash.",
  },
  {
    id: "OP09-093",
    name: "Marshall.D.Teach",
    type: "character",
    colors: ["black"],
    cost: 10,
    power: 12000,
    imageUrl: localArt("OP09-093"),
    effectText: "[Blocker]\n\n[Activate: Main] [Once Per Turn] If your Leader has the \"Blackbeard Pirates\" type and this Character was played on this turn, negate the effect of up to 1 of your opponent's Leader during this turn. Then, negate the effect of up to 1 of your opponent's Characters and that Character cannot attack until the end of your opponent's next turn.",
  },
  {
    id: "OP09-095",
    name: "Laffitte",
    type: "character",
    colors: ["black"],
    cost: 1,
    power: 1000,
    counter: 1000,
    imageUrl: localArt("OP09-095"),
    effectText: "[Activate: Main] You may rest 1 of your DON!! cards and this Character: Look at 5 cards from the top of your deck; reveal up to 1 \"Blackbeard Pirates\" type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  },
  {
    id: "OP09-096",
    name: "My Era...Begins!!",
    type: "event",
    colors: ["black"],
    cost: 1,
    eventTiming: "main",
    imageUrl: localArt("OP09-096"),
    effectText: "[Main] Look at 3 cards from the top of your deck; reveal up to 1 \"Blackbeard Pirates\" type card other than [My Era...Begins!!] and add it to your hand. Then, trash the rest.\n\n[Trigger] Activate this card's [Main] effect.",
  },
  {
    id: "OP09-099",
    name: "Fullalead",
    type: "stage",
    colors: ["black"],
    cost: 1,
    imageUrl: localArt("OP09-099"),
    effectText: "[Activate: Main] You may trash 1 card from your hand and rest this Stage: Look at 3 cards from the top of your deck; reveal up to 1 \"Blackbeard Pirates\" type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  },
  {
    id: "OP12-112",
    name: "Baby 5",
    type: "character",
    colors: ["yellow"],
    cost: 4,
    power: 5000,
    counter: 2000,
    imageUrl: localArt("OP12-112"),
    effectText: "[Trigger] If your Leader is multicolored, draw 2 cards.",
  },
  {
    id: "OP14-108",
    name: "Silvers Rayleigh",
    type: "character",
    colors: ["yellow"],
    cost: 6,
    power: 6000,
    counter: 1000,
    imageUrl: localArt("OP14-108"),
    effectText: "[On Play] If your Leader is multicolored and your opponent has 3 or less Life cards, K.O. up to 1 of your opponent's Characters with 7000 base power or less.\n\n[Trigger] Activate this card's [On Play] effect.",
  },
  {
    id: "OP16-104",
    name: "Catarina Devon",
    type: "character",
    colors: ["yellow"],
    cost: 4,
    power: 3000,
    counter: 2000,
    imageUrl: localArt("OP16-104"),
    effectText: "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.\n\n[Trigger] Draw 1 card and play up to 1 {Blackbeard Pirates} type Character with a cost of 1 from your trash.",
  },
  {
    id: "OP16-106",
    name: "Sanjuan.Wolf",
    type: "character",
    colors: ["yellow"],
    cost: 4,
    power: 5000,
    counter: 1000,
    imageUrl: localArt("OP16-106"),
    effectText: "[On K.O.] If your Leader has the {Blackbeard Pirates} type, draw 1 card, then up to 1 of your Leader or Character cards' base power becomes 7000 during this turn.\n\n[Trigger] Activate this card's [On K.O.] effect.",
  },
  {
    id: "OP16-108",
    name: "Shiryu",
    type: "character",
    colors: ["yellow"],
    cost: 6,
    power: 8000,
    imageUrl: localArt("OP16-108"),
    effectText: "[On Play] You may trash 1 card from your hand: Add up to 1 {Blackbeard Pirates} type card with a cost of 6 or less from your trash to the top of your Life cards face-up.\n\n[Trigger] Draw 2 cards.",
  },
  {
    id: "OP16-109",
    name: "Doc Q",
    type: "character",
    colors: ["yellow"],
    cost: 1,
    power: 0,
    counter: 2000,
    imageUrl: localArt("OP16-109"),
    effectText: "[On K.O.] If your Leader has the {Blackbeard Pirates} type, draw 1 card and K.O. up to 2 of your opponent's Characters with a cost of 1 or less.\n\n[Trigger] Activate this card's [On K.O.] effect.",
  },
  {
    id: "OP16-110",
    name: "Vasco Shot",
    type: "character",
    colors: ["yellow"],
    cost: 1,
    power: 2000,
    counter: 1000,
    imageUrl: localArt("OP16-110"),
    effectText: "[On K.O.] Draw 1 card and rest up to 1 of your opponent's Characters with a cost of 6 or less.\n\n[Trigger] Activate this card's [On K.O.] effect.",
  },
  {
    id: "OP16-115",
    name: "Black Vortex",
    type: "event",
    colors: ["yellow"],
    cost: 1,
    eventTiming: "main",
    imageUrl: localArt("OP16-115"),
    effectText: "[Main] If your Leader has the {Blackbeard Pirates} type, add up to 1 card with a [Trigger] other than [Black Vortex] from your trash to your hand.\n\n[Trigger] Negate the effect of up to 1 of your opponent's Leader or Character cards during this turn.",
  },
  {
    id: "OP16-116",
    name: "Zehahahahaha!",
    type: "event",
    colors: ["yellow"],
    cost: 8,
    eventTiming: "main",
    imageUrl: localArt("OP16-116"),
    effectText: "[Main] If you have 10 DON!! cards on your field, play up to 1 [Marshall.D.Teach] from your hand. Then, add up to 1 card from the top of your opponent's Life cards to the owner's hand.\n\n[Trigger] Draw 2 cards and trash 1 card from your hand.",
  },
  {
    id: "OP16-119",
    name: "Marshall.D.Teach",
    type: "character",
    colors: ["yellow"],
    cost: 8,
    power: 10000,
    imageUrl: localArt("OP16-119"),
    effectText: "[On Play] Look at 3 cards from the top of your deck; add up to 1 card to the top of your Life cards. Then, place the rest at the bottom of your deck in any order.\n\n[Trigger] Negate the effect of up to 1 of your opponent's Characters during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
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

export const DEFAULT_LEADER_ID: CardDefId = "ST01-001";

/** Normalize OPTCG-style ids (trim + uppercase). */
export function normalizeCardDefId(id: string): CardDefId {
  return id.trim().toUpperCase();
}

export function hasCardDef(id: CardDefId): boolean {
  return byId.has(normalizeCardDefId(id));
}

/** Ops snapshot for game-server `/health` (no secrets). */
export function getDefsHealthSnapshot(): {
  defsCount: number;
  hasOP16080: boolean;
} {
  return {
    defsCount: byId.size,
    hasOP16080: byId.has("OP16-080"),
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
}

export function getCardDef(id: CardDefId): CardDef {
  const d = byId.get(normalizeCardDefId(id));
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
    // 1 copy of the demo On-Play-draw character so pending-choice prompts are
    // reachable in default hotseat/quick-match games without deck editing.
    "ST01-005",
    "ST01-014",
    "ST01-014",
  ];
  if (size > pool.length) throw new Error(`buildTestDeck max ${pool.length}`);
  return pool.slice(0, size);
}
