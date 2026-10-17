/** Saved duel decks kept in the signed-in player's account; localStorage stays as the cache. */
import {
  applyRemoteDecks,
  clearLocalDecks,
  ensureDefaultDeck,
  getSavedDeck,
  listSavedDecks,
  onLocalDecksChange,
  type LocalDeckChange,
  type SavedDeck,
} from "../decks/storage";
import {
  deleteAccountDeck,
  fetchAccountDecks,
  putAccountDeck,
  putAccountDecks,
  type AccountDeck,
  type AccountDeckBody,
} from "../net/prefsApi";
import { planDeckSync } from "./deckSyncPlan";

const OWNER_KEY = "optcg.duel.savedDecks.owner.v1";
const PENDING_KEY = "optcg.duel.savedDecks.pending.v1";
const PUSH_DELAY_MS = 600;
const BULK_CHUNK = 50;

/** Deck id -> 0 (saved here, not yet sent) or the time it was deleted here and not yet sent. */
type Pending = Record<string, number>;

let stop: (() => void) | null = null;
/** Bumped by every start / stop: a load that settles under an older value was cancelled. */
let syncGen = 0;

export function getDeckCacheOwner(): number | null {
  try {
    const n = Number(localStorage.getItem(OWNER_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function setDeckCacheOwner(id: number) {
  try {
    localStorage.setItem(OWNER_KEY, String(id));
  } catch {
    /* storage unavailable */
  }
}

function readPending(): Pending {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Pending) : {};
  } catch {
    return {};
  }
}

function writePending(p: Pending) {
  try {
    if (Object.keys(p).length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

function markPending(id: string, value: number) {
  writePending({ ...readPending(), [id]: value });
}

function clearPending(id: string, value: number) {
  const p = readPending();
  if (p[id] !== value) return;
  delete p[id];
  writePending(p);
}

function toBody(d: SavedDeck): AccountDeckBody {
  const body: AccountDeckBody = { name: d.name, leaderId: d.leaderId, cards: d.cards };
  if (d.artPrefs) body.artPrefs = d.artPrefs;
  if (d.plannerDeckId !== undefined) body.plannerDeckId = d.plannerDeckId;
  if (d.editedLocally !== undefined) body.editedLocally = d.editedLocally;
  return body;
}

function fromAccount(r: AccountDeck): SavedDeck | null {
  if (r.deleted || !r.deck) return null;
  const { artPrefs, plannerDeckId, editedLocally, ...rest } = r.deck;
  return {
    ...rest,
    id: r.id,
    updatedAt: r.updatedAt,
    ...(artPrefs ? { artPrefs } : {}),
    ...(plannerDeckId != null ? { plannerDeckId } : {}),
    ...(editedLocally != null ? { editedLocally } : {}),
  };
}

/** The account holds a newer copy than the one just sent: take it. */
function adoptIfNewer(sent: number, theirs: AccountDeck, localTime: number | undefined) {
  if (theirs.updatedAt <= sent) return;
  if (localTime !== undefined && localTime > theirs.updatedAt) return;
  const deck = fromAccount(theirs);
  if (deck) applyRemoteDecks({ upsert: [deck], remove: [] });
  else applyRemoteDecks({ upsert: [], remove: [theirs.id] });
}

async function pushOne(id: string): Promise<void> {
  const value = readPending()[id];
  if (value === undefined) return;
  if (value > 0) {
    const res = await deleteAccountDeck(id, value);
    clearPending(id, value);
    // Edited elsewhere after this delete: the deck lives on.
    if (!res.deleted && !getSavedDeck(id)) adoptIfNewer(value, res, undefined);
    return;
  }
  const deck = getSavedDeck(id);
  if (!deck) return clearPending(id, 0);
  const res = await putAccountDeck(id, toBody(deck), deck.updatedAt);
  if (getSavedDeck(id)?.updatedAt === deck.updatedAt) {
    clearPending(id, 0);
    adoptIfNewer(deck.updatedAt, res, getSavedDeck(id)?.updatedAt);
  }
}

export async function syncDecks(userId: number): Promise<void> {
  stopDeckSync();
  const gen = syncGen;
  let loaded = false;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const schedule = (id: string) => {
    const old = timers.get(id);
    if (old) clearTimeout(old);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void pushOne(id).catch(() => undefined);
      }, PUSH_DELAY_MS),
    );
  };
  // Edits made while the account list loads are only remembered; they go up after the merge.
  const unsubscribe = onLocalDecksChange((c: LocalDeckChange) => {
    if (c.kind === "upsert") markPending(c.deck.id, 0);
    else markPending(c.id, c.at);
    if (loaded) schedule(c.kind === "upsert" ? c.deck.id : c.id);
  });
  stop = () => {
    unsubscribe();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };

  const { decks } = await fetchAccountDecks();
  if (gen !== syncGen) return;

  const pending = readPending();
  const localDeletes = Object.fromEntries(Object.entries(pending).filter(([, v]) => v > 0));
  const plan = planDeckSync({
    userId,
    cacheOwner: getDeckCacheOwner(),
    local: listSavedDecks(),
    localDeletes,
    remote: decks,
  });
  applyRemoteDecks({ upsert: plan.applyUpsert, remove: plan.applyDelete });
  setDeckCacheOwner(userId);
  loaded = true;

  // Dropped decks that were waiting to go up belonged to someone else; forget them.
  for (const id of plan.applyDelete) clearPending(id, 0);
  for (const d of plan.applyUpsert) clearPending(d.id, 0);
  for (const id of Object.keys(localDeletes)) {
    if (!plan.uploadDeletes.some((u) => u.id === id)) clearPending(id, localDeletes[id]);
  }

  for (let i = 0; i < plan.uploadDecks.length; i += BULK_CHUNK) {
    const chunk = plan.uploadDecks.slice(i, i + BULK_CHUNK);
    for (const d of chunk) markPending(d.id, 0);
    try {
      const res = await putAccountDecks(
        chunk.map((d) => ({ id: d.id, deck: toBody(d), updatedAt: d.updatedAt })),
      );
      if (gen !== syncGen) return;
      for (const d of chunk) {
        if (getSavedDeck(d.id)?.updatedAt === d.updatedAt) clearPending(d.id, 0);
      }
      for (const r of res.decks) adoptIfNewer(chunk.find((d) => d.id === r.id)?.updatedAt ?? 0, r, getSavedDeck(r.id)?.updatedAt);
    } catch {
      /* stays pending; the next start sends it again */
    }
  }
  for (const u of plan.uploadDeletes) {
    markPending(u.id, u.at);
    schedule(u.id);
  }
  // Anything still pending (an earlier failed push) goes up now that the account is reachable.
  for (const id of Object.keys(readPending())) {
    if (!timers.has(id)) schedule(id);
  }
}

export function stopDeckSync(): void {
  syncGen++;
  stop?.();
  stop = null;
}

/** Sign-out: the decks in this browser belonged to the account, so remove them and give guests the starters. */
export function clearAccountDecks(): void {
  stopDeckSync();
  try {
    localStorage.removeItem(OWNER_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
  clearLocalDecks();
  try {
    ensureDefaultDeck();
  } catch {
    /* starters are re-seeded on the next page that needs them */
  }
}
