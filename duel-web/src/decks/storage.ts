import { expandDecklist, isCardId, parseDecklist, type ParsedDeckLine } from "@optcg/card-core";
import {
  listAtlasIds,
  lookupCard,
  maxCopiesFor,
  registerAtlasStub,
} from "../cards/atlas";
import { readStored, removeStored, writeStored } from "@optcg/ui/storage";
import { BOT_META_DECK_LIST } from "@optcg/rules/botMetaDeckList";
import { cardDataReady } from "../cards/cardData";
import { MAX_DECK_NAME_LENGTH } from "./editDeck";

const STORAGE_KEY = "optcg.duel.savedDecks.v1";
const SELECTED_KEY = "optcg.duel.selectedDeckId.v1";
const ART_PREFS_KEY = "optcg.duel.artPrefs.v1";

export type SavedDeck = {
  id: string;
  name: string;
  leaderId: string;
  cards: string[];
  artPrefs?: Record<string, string>;
  plannerArt?: Record<string, string>;
  plannerDeckId?: number;
  editedLocally?: boolean;
  /** Marks a deliberate copy so account sync never merges it into an identical deck (#1400). */
  noMerge?: boolean;
  updatedAt: number;
};

export type LocalDeckChange =
  | { kind: "upsert"; deck: SavedDeck }
  | { kind: "delete"; id: string; at: number };

export const SAVED_DECKS_CHANGED_EVENT = "optcg:saved-decks-changed";

const changeListeners = new Set<(change: LocalDeckChange) => void>();

export function onLocalDecksChange(cb: (change: LocalDeckChange) => void): () => void {
  changeListeners.add(cb);
  return () => void changeListeners.delete(cb);
}

function emit(change: LocalDeckChange) {
  for (const cb of [...changeListeners]) cb(change);
}

function announceChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SAVED_DECKS_CHANGED_EVENT));
}

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
  // Without the card data every id would read as unknown and come back as a vanilla stub: fail loudly instead.
  if (!cardDataReady()) throw new Error("Card data is not loaded yet");
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
      if (!isCardId(line.cardId)) {
        errors.push(`${line.cardId} is not a valid OPTCG card id`);
        continue;
      }
      warnings.push(
        `${line.cardId} is not curated yet — will play as a vanilla stub`,
      );
      if (line.count > 4) {
        errors.push(`${line.cardId} has ${line.count} copies (max 4)`);
      }
      if (line.count === 1) unknownSingletons.push(line.cardId);
      else {
        registerAtlasStub(line.cardId, "character");
        main.push(line);
      }
      continue;
    }

    if (line.count > maxCopiesFor(line.cardId)) {
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
  if (leaders.length === 1) errors.push(...leaderDeckRuleErrors(leaders[0], cards));

  return {
    ok: errors.length === 0 && leaders.length === 1,
    errors,
    warnings,
    leaderId: leaders[0] ?? null,
    cards,
    lines,
  };
}

export function leaderDeckRuleErrors(leaderId: string, cards: readonly string[]): string[] {
  const leader = lookupCard(leaderId);
  const errors: string[] = [];
  for (const rule of leader.deckRules ?? []) {
    const [kind, arg = ""] = rule.split(":");
    const offending = [...new Set(cards)].filter((id) => {
      const card = lookupCard(id);
      if (kind === "max_cost") return card.cost > Number(arg);
      if (kind === "no_events_cost_ge") return card.type === "event" && card.cost >= Number(arg);
      if (kind === "only_trait") return !(card.traits ?? []).includes(arg);
      return false;
    }).sort();
    if (!offending.length) continue;
    const list = offending.join(", ");
    if (kind === "max_cost") errors.push(`${leader.name} cannot include cards with a cost of ${Number(arg) + 1} or more: ${list}`);
    if (kind === "no_events_cost_ge") errors.push(`${leader.name} cannot include Events with a cost of ${arg} or more: ${list}`);
    if (kind === "only_trait") errors.push(`${leader.name} can only include {${arg}} type cards: ${list}`);
  }
  return errors;
}

function readAll(): SavedDeck[] {
  try {
    const raw = readStored(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDeck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(decks: SavedDeck[]): boolean {
  return writeStored(STORAGE_KEY, JSON.stringify(decks));
}

export function listSavedDecks(): SavedDeck[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSavedDeck(id: string): SavedDeck | undefined {
  return readAll().find((d) => d.id === id);
}

export function saveDeck(input: SaveDeckInput): SavedDeck {
  return saveDeckResult(input).deck;
}

type SaveDeckInput = {
  id?: string;
  name: string;
  leaderId: string;
  cards: string[];
  artPrefs?: Record<string, string>;
  plannerArt?: Record<string, string>;
  plannerDeckId?: number;
  editedLocally?: boolean;
  noMerge?: boolean;
};

/**
 * Same as `saveDeck`, but also reports whether the browser kept the write. A full quota or disabled storage
 * leaves `persisted` false: the deck is still returned and announced (account sync can carry it) but a reload
 * would lose it, so a caller can tell the player.
 */
export function saveDeckResult(input: SaveDeckInput): { deck: SavedDeck; persisted: boolean } {
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
  const plannerSrc = input.plannerArt ?? existing?.plannerArt;
  const plannerArt = plannerSrc && Object.keys(plannerSrc).length > 0 ? { ...plannerSrc } : undefined;
  const next: SavedDeck = {
    id,
    name: input.name.trim() || "Untitled deck",
    leaderId: input.leaderId,
    cards: [...input.cards],
    artPrefs,
    plannerArt,
    plannerDeckId: input.plannerDeckId ?? existing?.plannerDeckId,
    editedLocally: input.editedLocally ?? existing?.editedLocally,
    noMerge: input.noMerge ?? existing?.noMerge,
    updatedAt: Date.now(),
  };
  const idx = decks.findIndex((d) => d.id === id);
  if (idx >= 0) decks[idx] = next;
  else decks.push(next);
  const persisted = writeAll(decks);
  emit({ kind: "upsert", deck: next });
  return { deck: next, persisted };
}

const COPY_SUFFIX = " (copy)";

/**
 * Saves a copy named "<name> (copy)" with the same Leader, cards and art picks. The copy is a fresh local deck:
 * it never carries the planner link or the edited-locally flag, so it cannot overwrite or be synced as the original.
 */
export function duplicateDeck(id: string): SavedDeck | undefined {
  const deck = getSavedDeck(id);
  if (!deck) return undefined;
  return saveDeck({
    noMerge: true,
    name: `${deck.name.slice(0, MAX_DECK_NAME_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
    leaderId: deck.leaderId,
    cards: deck.cards,
    artPrefs: deck.artPrefs,
  });
}

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
  const decks = readAll();
  writeAll(decks.filter((d) => d.id !== id));
  if (getSelectedDeckId() === id) setSelectedDeckId(null);
  if (decks.some((d) => d.id === id)) emit({ kind: "delete", id, at: Date.now() });
}

export function applyRemoteDecks(change: { upsert: SavedDeck[]; remove: string[] }) {
  if (change.upsert.length === 0 && change.remove.length === 0) return;
  const gone = new Set(change.remove);
  const incoming = new Map(change.upsert.map((d) => [d.id, d]));
  const next = readAll()
    .filter((d) => !gone.has(d.id))
    .map((d) => incoming.get(d.id) ?? d);
  const have = new Set(next.map((d) => d.id));
  for (const d of change.upsert) if (!have.has(d.id)) next.push(d);
  writeAll(next);
  const selected = getSelectedDeckId();
  if (selected && gone.has(selected) && !incoming.has(selected)) setSelectedDeckId(null);
  announceChanged();
}

export function clearLocalDecks() {
  removeStored(STORAGE_KEY);
  setSelectedDeckId(null);
  announceChanged();
}

export const BLANK_DECK_LEADER_ID = "ST01-001";

export type ImportIntoDeckResult =
  | { ok: true; deck: SavedDeck; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export function createBlankDeck(name: string): SavedDeck {
  return saveDeck({
    name: name.trim() || "Untitled deck",
    leaderId: BLANK_DECK_LEADER_ID,
    cards: [],
  });
}

export function importIntoSavedDeck(deckId: string, text: string): ImportIntoDeckResult {
  const v = validateImportedList(text);
  if (!v.ok || !v.leaderId) {
    return { ok: false, errors: v.errors, warnings: v.warnings };
  }
  const existing = getSavedDeck(deckId);
  if (!existing) {
    return { ok: false, errors: ["Deck not found"], warnings: [] };
  }
  const inDeckIds = new Set([v.leaderId, ...v.cards]);
  const artPrefs = existing.artPrefs
    ? Object.fromEntries(
        Object.entries(existing.artPrefs).filter(([defId]) => inDeckIds.has(defId)),
      )
    : undefined;
  const deck = saveDeck({
    id: deckId,
    name: existing.name,
    leaderId: v.leaderId,
    cards: v.cards,
    artPrefs: artPrefs && Object.keys(artPrefs).length > 0 ? artPrefs : undefined,
  });
  return { ok: true, deck, warnings: v.warnings };
}

export function createDeckFromInput(name: string, text: string): ImportIntoDeckResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, deck: createBlankDeck(name), warnings: [] };
  }
  const v = validateImportedList(trimmed);
  if (!v.ok || !v.leaderId) {
    return { ok: false, errors: v.errors, warnings: v.warnings };
  }
  const deck = saveDeck({
    name: name.trim() || `Imported ${v.leaderId}`,
    leaderId: v.leaderId,
    cards: v.cards,
  });
  return { ok: true, deck, warnings: v.warnings };
}

export function plannerLocalId(plannerId: number): string {
  return `planner-${plannerId}`;
}

function followPlannerArt(
  existing: SavedDeck | undefined,
  inDeckIds: ReadonlySet<string>,
  incoming: Record<string, string>,
): { artPrefs: Record<string, string>; plannerArt: Record<string, string> } {
  const previous = existing?.plannerArt ?? {};
  const current = existing?.artPrefs ?? {};
  const artPrefs: Record<string, string> = {};
  for (const defId of inDeckIds) {
    const alt = current[defId] === previous[defId] ? incoming[defId] : current[defId];
    if (alt) artPrefs[defId] = alt;
  }
  const plannerArt = Object.fromEntries(Object.entries(incoming).filter(([defId]) => inDeckIds.has(defId)));
  return { artPrefs, plannerArt };
}

export function applyPlannerArt(deckId: string, incoming: Record<string, string>): SavedDeck | undefined {
  const deck = getSavedDeck(deckId);
  if (!deck) return undefined;
  const next = followPlannerArt(deck, new Set([deck.leaderId, ...deck.cards]), incoming);
  const same = (a: Record<string, string> | undefined, b: Record<string, string>) => {
    const x = a ?? {};
    return Object.keys(x).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => x[k] === v);
  };
  if (same(deck.artPrefs, next.artPrefs) && same(deck.plannerArt, next.plannerArt)) return deck;
  return saveDeck({ id: deck.id, name: deck.name, leaderId: deck.leaderId, cards: deck.cards, ...next });
}

export function recordPlannerArt(deckId: string, sent: Record<string, string>): SavedDeck | undefined {
  const deck = getSavedDeck(deckId);
  if (!deck) return undefined;
  return saveDeck({
    id: deck.id,
    name: deck.name,
    leaderId: deck.leaderId,
    cards: deck.cards,
    plannerArt: { ...deck.plannerArt, ...sent },
  });
}

export function upsertPlannerDeck(input: {
  plannerId: number;
  name: string;
  text: string;
  plannerArt?: Record<string, string>;
}): ImportIntoDeckResult {
  const v = validateImportedList(input.text);
  if (!v.ok || !v.leaderId) {
    return { ok: false, errors: v.errors, warnings: v.warnings };
  }
  const existing = readAll().find((d) => d.plannerDeckId === input.plannerId);
  const id = existing?.id ?? plannerLocalId(input.plannerId);
  const inDeckIds = new Set([v.leaderId, ...v.cards]);
  const { artPrefs: kept, plannerArt } = followPlannerArt(existing, inDeckIds, input.plannerArt ?? {});
  const deck = saveDeck({
    id,
    name: input.name,
    leaderId: v.leaderId,
    cards: v.cards,
    artPrefs: kept,
    plannerArt,
    plannerDeckId: input.plannerId,
  });
  return { ok: true, deck, warnings: v.warnings };
}

export function getSelectedDeckId(): string | null {
  return readStored(SELECTED_KEY);
}

export function setSelectedDeckId(id: string | null) {
  if (!id) removeStored(SELECTED_KEY);
  else writeStored(SELECTED_KEY, id);
}

export function getSelectedDeck(): SavedDeck | null {
  const id = getSelectedDeckId();
  if (!id) return null;
  return getSavedDeck(id) ?? null;
}

export function getArtPrefs(): Record<string, string> {
  try {
    const raw = readStored(ART_PREFS_KEY);
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
  writeStored(ART_PREFS_KEY, JSON.stringify(prefs));
}

export function ensureDefaultDeck(): SavedDeck {
  const kept = listSavedDecks().filter((d) => d.id !== "default-st01");
  if (kept.length !== listSavedDecks().length) {
    writeAll(kept);
    emit({ kind: "delete", id: "default-st01", at: Date.now() });
    if (getSelectedDeckId() === "default-st01") setSelectedDeckId(null);
  }
  const tests = ensureTestDecks();
  const all = listSavedDecks();
  const preferred =
    all.find((d) => d.id === getSelectedDeckId()) ?? tests[0] ?? all[0];
  if (!preferred) throw new Error("No decks available");
  if (!getSelectedDeckId()) setSelectedDeckId(preferred.id);
  return preferred;
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

export function seedDeckName(current: string, legacy: string, next: string): string {
  return current === legacy ? next : current;
}

function ensureSeedDeck(id: string, name: string, list: string, legacyName: string): SavedDeck {
  const all = readAll();
  const existing = all.find((d) => d.id === id);
  if (existing) {
    const renamed = seedDeckName(existing.name, legacyName, name);
    if (renamed === existing.name) return existing;
    existing.name = renamed;
    writeAll(all);
    emit({ kind: "upsert", deck: existing });
    return existing;
  }
  const v = validateImportedList(list);
  if (!v.ok || !v.leaderId) {
    throw new Error(`Seed deck ${id} invalid: ${v.errors.join("; ")}`);
  }
  const seed: SavedDeck = { id, name, leaderId: v.leaderId, cards: v.cards, updatedAt: 0 };
  writeAll([...all, seed]);
  emit({ kind: "upsert", deck: seed });
  return seed;
}

/** The clean-art starter new guests land on: the OP13-001 Luffy entry of the bot meta decks (#1391). */
function luffyStarterList(): string {
  const meta = BOT_META_DECK_LIST.find((d) => d.leaderId === "OP13-001");
  if (!meta) throw new Error("Seed deck starter-op13-luffy: OP13-001 missing from BOT_META_DECK_LIST");
  const counts = new Map<string, number>([[meta.leaderId, 1]]);
  for (const id of meta.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${n}x${id}`).join("\n");
}

export function ensureTestDecks(): SavedDeck[] {
  const luffy = ensureSeedDeck("starter-op13-luffy", "Starter: OP13 Luffy", luffyStarterList(), "Starter: OP13 Luffy");
  const a = ensureSeedDeck("test-op17-red", "Starter: OP17 Red", TEST_OP17_LIST, "Test OP17 red");
  const b = ensureSeedDeck(
    "test-op16-black",
    "Starter: OP16 Teach",
    TEST_OP16_LIST,
    "Test OP16 Teach (black/yellow)",
  );
  return [luffy, a, b];
}
