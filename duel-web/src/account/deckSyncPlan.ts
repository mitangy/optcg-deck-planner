/**
 * What to do when this browser's saved decks meet the account's.
 * Pure so it can be unit tested; account/deckSync.ts carries it out.
 */
import type { SavedDeck } from "../decks/storage";

export type RemoteDeck = {
  id: string;
  updatedAt: number;
  deleted: boolean;
  deck?: Omit<SavedDeck, "id" | "updatedAt"> | null;
};

export type DeckSyncInput = {
  userId: number;
  /** Account that last synced this browser's cache; null = never (guest decks). */
  cacheOwner: number | null;
  local: SavedDeck[];
  /** Decks deleted here while the account could not be told (id -> delete time). */
  localDeletes: Record<string, number>;
  remote: RemoteDeck[];
};

export type DeckSyncPlan = {
  /** Account copies to write into this browser. */
  applyUpsert: SavedDeck[];
  /** Deck ids to remove from this browser. */
  applyDelete: string[];
  /** Local decks to send to the account. */
  uploadDecks: SavedDeck[];
  /** Local deletes to send to the account. */
  uploadDeletes: { id: string; at: number }[];
};

function fromRemote(r: RemoteDeck): SavedDeck | null {
  return r.deleted || !r.deck ? null : { ...r.deck, id: r.id, updatedAt: r.updatedAt };
}

export function planDeckSync(input: DeckSyncInput): DeckSyncPlan {
  const plan: DeckSyncPlan = { applyUpsert: [], applyDelete: [], uploadDecks: [], uploadDeletes: [] };
  // A cache that belonged to another account is not this player's: take the account's decks only.
  const foreign = input.cacheOwner !== null && input.cacheOwner !== input.userId;
  const local = new Map(input.local.map((d) => [d.id, d]));
  const deletes = foreign ? {} : input.localDeletes;
  const remote = new Map(input.remote.map((r) => [r.id, r]));
  const ids = new Set([...local.keys(), ...remote.keys(), ...Object.keys(deletes)]);

  for (const id of ids) {
    const l = local.get(id);
    const r = remote.get(id);
    const deletedAt = deletes[id];
    if (!r) {
      if (!l) continue;
      if (foreign) plan.applyDelete.push(id);
      else plan.uploadDecks.push(l);
    } else if (r.deleted) {
      if (!l) continue;
      if (foreign || l.updatedAt <= r.updatedAt) plan.applyDelete.push(id);
      else plan.uploadDecks.push(l);
    } else if (!l) {
      const theirs = fromRemote(r);
      if (deletedAt !== undefined && deletedAt > r.updatedAt) plan.uploadDeletes.push({ id, at: deletedAt });
      else if (theirs) plan.applyUpsert.push(theirs);
    } else if (foreign || r.updatedAt > l.updatedAt) {
      const theirs = fromRemote(r);
      if (theirs) plan.applyUpsert.push(theirs);
    } else if (l.updatedAt > r.updatedAt) {
      plan.uploadDecks.push(l);
    }
  }
  return plan;
}
