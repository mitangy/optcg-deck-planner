import {
  isOptcgCardId,
  listAtlasIds,
  lookupCard,
  registerAtlasStub,
} from "../cards/atlas";
import { expandDecklist, parseDecklist, type ParsedDeckLine } from "./parseDecklist";

const STORAGE_KEY = "optcg.duel.savedDecks.v1";
const SELECTED_KEY = "optcg.duel.selectedDeckId.v1";
const ART_PREFS_KEY = "optcg.duel.artPrefs.v1";

export type SavedDeck = {
  id: string;
  name: string;
  leaderId: string;
  /** Main deck card ids (no leader), length typically 20 for the prototype pool. */
  cards: string[];
  /** Preferred alt art id per card def (`p1`, `p2`, …). */
  artPrefs?: Record<string, string>;
  updatedAt: number;
};

export type DeckValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  leaderId: string | null;
  cards: string[];
  lines: ParsedDeckLine[];
};

function knownIds(): Set<string> {
  return new Set(listAtlasIds());
}

export function validateImportedList(text: string): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let lines: ParsedDeckLine[] = [];
  try {
    lines = parseDecklist(text);
  } catch (e) {
    return {
      ok: false,
      errors: [e instanceof Error ? e.message : "Parse failed"],
      warnings,
      leaderId: null,
      cards: [],
      lines: [],
    };
  }

  const known = knownIds();
  const leaders: string[] = [];
  const main: ParsedDeckLine[] = [];
  const unknownSingletons: string[] = [];

  for (const line of lines) {
    if (!known.has(line.cardId)) {
      if (!isOptcgCardId(line.cardId)) {
        errors.push(`${line.cardId} is not a valid OPTCG card id`);
        continue;
      }
      warnings.push(
        `${line.cardId} is not curated yet — will play as a vanilla stub`,
      );
      if (line.count > 4) {
        errors.push(`${line.cardId} has ${line.count} copies (max 4)`);
      }
      // Defer type: curated leaders win; otherwise a single 1x unknown may be the leader.
      if (line.count === 1) unknownSingletons.push(line.cardId);
      else {
        registerAtlasStub(line.cardId, "character");
        main.push(line);
      }
      continue;
    }

    if (line.count > 4) {
      errors.push(`${line.cardId} has ${line.count} copies (max 4)`);
    }
    const entry = lookupCard(line.cardId);
    if (entry.type === "leader") {
      if (line.count !== 1) errors.push(`Leader ${line.cardId} must appear exactly once`);
      leaders.push(line.cardId);
    } else {
      main.push(line);
    }
  }

  if (leaders.length === 0 && unknownSingletons.length === 1) {
    // e.g. `1xOP16-080` before the atlas caught up — treat as leader stub.
    leaders.push(unknownSingletons[0]);
    registerAtlasStub(unknownSingletons[0], "leader");
    warnings.push(
      `${unknownSingletons[0]} treated as Leader stub (not in curated atlas)`,
    );
  } else if (leaders.length === 0 && unknownSingletons.length > 1) {
    errors.push(
      `Multiple possible leaders among uncurated 1x cards: ${unknownSingletons.join(", ")}. Include a curated Leader or only one 1x line.`,
    );
  } else {
    // Curated leader present — remaining unknown singletons are main-deck stubs.
    for (const id of unknownSingletons) {
      if (!leaders.includes(id)) {
        registerAtlasStub(id, "character");
        main.push({ cardId: id, count: 1 });
      }
    }
  }

  if (leaders.length === 0) errors.push("Decklist must include a Leader (e.g. 1xST01-001)");
  if (leaders.length > 1) errors.push(`Multiple leaders: ${leaders.join(", ")}`);

  const cards = expandDecklist(main);
  if (cards.length < 10) {
    warnings.push(`Main deck has ${cards.length} cards (prototype allows short decks; constructed is 50).`);
  }
  if (cards.length > 50) errors.push(`Main deck has ${cards.length} cards (max 50)`);

  return {
    ok: errors.length === 0 && leaders.length === 1,
    errors,
    warnings,
    leaderId: leaders[0] ?? null,
    cards,
    lines,
  };
}

function readAll(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDeck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(decks: SavedDeck[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

export function listSavedDecks(): SavedDeck[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSavedDeck(id: string): SavedDeck | undefined {
  return readAll().find((d) => d.id === id);
}

export function saveDeck(input: {
  id?: string;
  name: string;
  leaderId: string;
  cards: string[];
  /** Omit to keep existing prefs; pass `{}` / object to replace. */
  artPrefs?: Record<string, string>;
}): SavedDeck {
  const decks = readAll();
  const id = input.id ?? crypto.randomUUID();
  const existing = decks.find((d) => d.id === id);
  let artPrefs: Record<string, string> | undefined;
  if (input.artPrefs !== undefined) {
    artPrefs =
      Object.keys(input.artPrefs).length > 0 ? { ...input.artPrefs } : undefined;
  } else if (existing?.artPrefs && Object.keys(existing.artPrefs).length > 0) {
    artPrefs = { ...existing.artPrefs };
  }
  const next: SavedDeck = {
    id,
    name: input.name.trim() || "Untitled deck",
    leaderId: input.leaderId,
    cards: [...input.cards],
    artPrefs,
    updatedAt: Date.now(),
  };
  const idx = decks.findIndex((d) => d.id === id);
  if (idx >= 0) decks[idx] = next;
  else decks.push(next);
  writeAll(decks);
  return next;
}

/** Persist preferred alt art for one card on a saved deck (`null` = standard). */
export function setDeckArtPref(
  deckId: string,
  defId: string,
  altId: string | null,
): SavedDeck | undefined {
  const deck = getSavedDeck(deckId);
  if (!deck) return undefined;
  const artPrefs = { ...(deck.artPrefs ?? {}) };
  if (!altId) delete artPrefs[defId];
  else artPrefs[defId] = altId;
  return saveDeck({
    id: deck.id,
    name: deck.name,
    leaderId: deck.leaderId,
    cards: deck.cards,
    artPrefs,
  });
}

export function deleteDeck(id: string) {
  writeAll(readAll().filter((d) => d.id !== id));
  if (getSelectedDeckId() === id) setSelectedDeckId(null);
}

export function getSelectedDeckId(): string | null {
  return localStorage.getItem(SELECTED_KEY);
}

export function setSelectedDeckId(id: string | null) {
  if (!id) localStorage.removeItem(SELECTED_KEY);
  else localStorage.setItem(SELECTED_KEY, id);
}

export function getSelectedDeck(): SavedDeck | null {
  const id = getSelectedDeckId();
  if (!id) return null;
  return getSavedDeck(id) ?? null;
}

/** Global art prefs (cardId → alt id). Merged with per-deck prefs at resolve time. */
export function getArtPrefs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ART_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function setArtPref(cardId: string, altId: string | null) {
  const prefs = getArtPrefs();
  if (!altId) delete prefs[cardId];
  else prefs[cardId] = altId;
  localStorage.setItem(ART_PREFS_KEY, JSON.stringify(prefs));
}

/** Default ST01 test deck seeded into storage once. */
export function ensureDefaultDeck(): SavedDeck {
  const existing = listSavedDecks();
  const found = existing.find((d) => d.id === "default-st01");
  if (found) return found;
  const cards = [
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
  return saveDeck({
    id: "default-st01",
    name: "ST01 Straw Hat (test)",
    leaderId: "ST01-001",
    cards,
  });
}

export function deckToWire(deck: SavedDeck): { leaderId: string; deck: string[] } {
  return { leaderId: deck.leaderId, deck: [...deck.cards] };
}

const TEST_OP17_LIST = `1xOP17-001
2xOP09-118
4xOP12-002
2xOP12-018
4xOP16-021
4xOP16-118
4xOP17-002
4xOP17-003
4xOP17-005
4xOP17-008
2xOP17-015
4xOP17-017
4xOP17-019
2xST23-001
4xST30-004
2xST30-005`;

const TEST_OP16_LIST = `1xOP16-080
4xEB04-058
3xOP09-086
4xOP09-093
2xOP09-095
2xOP09-096
4xOP09-099
4xOP12-112
2xOP14-108
4xOP16-104
2xOP16-106
4xOP16-108
4xOP16-109
4xOP16-110
1xOP16-115
2xOP16-116
4xOP16-119`;

function upsertSeedDeck(id: string, name: string, list: string): SavedDeck {
  const v = validateImportedList(list);
  if (!v.ok || !v.leaderId) {
    throw new Error(`Seed deck ${id} invalid: ${v.errors.join("; ")}`);
  }
  return saveDeck({
    id,
    name,
    leaderId: v.leaderId,
    cards: v.cards,
  });
}

/** Seed the two constructed test decks (idempotent upsert). */
export function ensureTestDecks(): SavedDeck[] {
  const a = upsertSeedDeck("test-op17-red", "Test OP17 red", TEST_OP17_LIST);
  const b = upsertSeedDeck(
    "test-op16-black",
    "Test OP16 Teach (black/yellow)",
    TEST_OP16_LIST,
  );
  return [a, b];
}
