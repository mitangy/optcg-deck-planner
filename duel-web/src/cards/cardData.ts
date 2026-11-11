import { createStore } from "../lib/createStore";

/**
 * The two card JSON files (about 3 MB raw) live in their own chunk, `cardDataSource.ts`, and arrive through
 * `loadCardData()` instead of riding in the entry chunk (B-02). `lookupCard` stays synchronous: until the data
 * is in, the store is empty, so every page that shows card names or art waits for `loadCardData()` (the lazy
 * routes in lazyRoutes.ts, `CardDataGate`) or for `useCardDataReady()` (the lobby, which paints first).
 */
export type CardData = {
  /** Curated playable prints (rules package export). */
  curated: Record<string, unknown>;
  /** Cosmetics catalog for every English OPTCG number (TCGCSV). */
  catalog: Record<string, unknown>;
};

const EMPTY: CardData = { curated: {}, catalog: {} };

let data: CardData = EMPTY;
const readyStore = createStore(false);

export function getCardData(): CardData {
  return data;
}

export function cardDataReady(): boolean {
  return readyStore.get();
}

/** Installs the card data and wakes every component waiting on `useCardDataReady`. */
export function setCardData(next: CardData): void {
  data = next;
  readyStore.set(true);
}

/**
 * One load per session: concurrent and later callers share the first promise. A failed load (offline) clears
 * it so the next caller retries instead of caching the failure.
 */
export function createCardDataLoader(importer: () => Promise<CardData>, apply: (d: CardData) => void = setCardData): () => Promise<void> {
  let pending: Promise<void> | null = null;
  return () => {
    pending ??= importer()
      .then(apply)
      .catch((err) => {
        pending = null;
        throw err;
      });
    return pending;
  };
}

export const loadCardData = createCardDataLoader(() => import("./cardDataSource").then((m) => m.cardData));

/** True once the card data is installed. Starts the load itself, so a page that only reads this still gets its data. */
export function useCardDataReady(): boolean {
  const isReady = readyStore.use();
  if (!isReady) void loadCardData().catch(() => undefined);
  return isReady;
}
