import { listAtlasIds, lookupCard } from "../cards/atlas";
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
  for (const line of lines) {
    if (!known.has(line.cardId)) {
      errors.push(`${line.cardId} is not in the duel card pool yet`);
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
  artPrefs?: Record<string, string>;
}): SavedDeck {
  const decks = readAll();
  const id = input.id ?? crypto.randomUUID();
  const next: SavedDeck = {
    id,
    name: input.name.trim() || "Untitled deck",
    leaderId: input.leaderId,
    cards: [...input.cards],
    artPrefs: input.artPrefs ? { ...input.artPrefs } : undefined,
    updatedAt: Date.now(),
  };
  const idx = decks.findIndex((d) => d.id === id);
  if (idx >= 0) decks[idx] = next;
  else decks.push(next);
  writeAll(decks);
  return next;
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
