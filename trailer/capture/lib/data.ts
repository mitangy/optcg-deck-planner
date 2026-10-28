/** Decks, names and browser storage for the trailer's fictional players. */
import type { BrowserContext } from "playwright";
import type { Person } from "./fakeApi";

export type DeckList = { leaderId: string; cards: string[] };
export type SavedDeck = DeckList & { id: string; name: string; updatedAt: number; artPrefs?: Record<string, string> };

/** Expand {id: copies} into a 50-card list, and refuse to run with a short deck. */
function list(leaderId: string, counts: Record<string, number>): DeckList {
  const cards = Object.entries(counts).flatMap(([id, n]) => Array.from({ length: n }, () => id));
  if (cards.length !== 50) throw new Error(`${leaderId} deck has ${cards.length} cards`);
  return { leaderId, cards };
}

const st = (set: string, counts: [number, number][]) =>
  Object.fromEntries(counts.map(([n, c]) => [`${set}-${String(n).padStart(3, "0")}`, c]));

/*
 * Decks. TCGplayer's CDN serves a big "SAMPLE" watermark over most card images (or an "Image Coming Soon"
 * placeholder), so these lists are built only from cards whose art is clean (checked by eye, see README):
 * the original Straw Hat starter (ST01), Worst Generation (ST02) and the clean Wano / Straw Hat cards of OP01.
 */
/** Straw Hat Crew: ST01 Luffy and the crew, in red. */
export const STRAW_HATS: DeckList = list("ST01-001", {
  "ST01-002": 4, "ST01-004": 4, "ST01-006": 4, "ST01-008": 4, "ST01-009": 3, "ST01-010": 4, "ST01-011": 4,
  "ST01-012": 4, "ST01-013": 4, "OP01-009": 4, "OP01-004": 4, "OP01-013": 4, "OP01-022": 3,
});
/** Wano samurai: Kouzuki Oden (OP01), green. */
export const WANO: DeckList = list("OP01-031", {
  "OP01-032": 4, "OP01-036": 4, "OP01-037": 4, "OP01-039": 4, "ST02-003": 4, "OP01-043": 4, "OP01-045": 4,
  "OP01-046": 4, "OP01-052": 4, "OP01-053": 4, "OP01-055": 4, "ST02-004": 3, "ST02-006": 3,
});
/** Worst Generation: ST02 Eustass Kid, green. */
export const WORST_GENERATION: DeckList = list("ST02-001", {
  "ST02-002": 4, "ST02-003": 4, "ST02-004": 4, "ST02-006": 4, "ST02-009": 4, "ST02-010": 4, "ST02-011": 4,
  "ST02-012": 4, "ST02-013": 4, "ST02-014": 4, "OP01-039": 4, "OP01-053": 2, "OP01-052": 4,
});

export const MIKO: Person = { uid: 101, name: "Miko" };
export const ZORO: Person = { uid: 102, name: "Zoro_main" };
export const NAMI: Person = { uid: 103, name: "NamiNavigator" };
export const ROBIN: Person = { uid: 104, name: "RobinReads" };
export const SANJI: Person = { uid: 105, name: "Sanji_cooks" };
export const USOPP: Person = { uid: 106, name: "UsoppSniper" };
export const CHOPPER: Person = { uid: 107, name: "ChopperDoc" };

/** The decks a trailer player has saved: the first is the one the lobby shows. */
export function profileDecks(): SavedDeck[] {
  return [
    { id: "d-straw", name: "Straw Hat Crew", ...STRAW_HATS, updatedAt: 1_700_000_005 },
    { id: "d-wano", name: "Wano Samurai", ...WANO, updatedAt: 1_700_000_004 },
    { id: "d-kid", name: "Worst Generation", ...WORST_GENERATION, updatedAt: 1_700_000_003 },
  ];
}

export type Seed = {
  decks?: SavedDeck[];
  selectedDeckId?: string;
  /** Written over the settings defaults (see duel-web/src/settings.ts). */
  settings?: Record<string, unknown>;
  /** Extra localStorage entries. */
  storage?: Record<string, string>;
};

/**
 * Fill a fresh browser profile before the app loads: saved decks, the chosen deck, settings, and the
 * "already seen" flags so no first-run card sits over the lobby. Runs once per tab (sessionStorage guard).
 */
export async function seedProfile(ctx: BrowserContext, seed: Seed): Promise<void> {
  await ctx.addInitScript((s) => {
    try {
      if (sessionStorage.getItem("trailer-seeded")) return;
      sessionStorage.setItem("trailer-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(s.decks));
      localStorage.setItem("optcg.duel.selectedDeckId.v1", s.selectedDeckId);
      localStorage.setItem("optcg-duel:homeIntroDone", "1");
      localStorage.setItem("optcg.patchNotes.lastSeen.duel", "2099-12-31");
      localStorage.setItem("optcg.patchNotes.lastSeen.planner", "2099-12-31");
      if (s.settings && Object.keys(s.settings).length) localStorage.setItem("optcg-duel:settings", JSON.stringify(s.settings));
      for (const [k, v] of Object.entries(s.storage)) localStorage.setItem(k, v);
    } catch {
      /* storage blocked: the app keeps its defaults */
    }
  }, { decks: seed.decks ?? profileDecks(), selectedDeckId: seed.selectedDeckId ?? (seed.decks ?? profileDecks())[0].id, settings: seed.settings ?? {}, storage: seed.storage ?? {} });
}
