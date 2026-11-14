import { lookupCard, maxCopiesFor } from "../cards/atlas";
import { cardImageUrl, previewArtPath, type CardImageSize } from "@optcg/ui/cardArt";
import {
  getSeatArtPref,
  isSeatArtPrefsLive,
  type Seat,
} from "./seatArtPrefs";
import { getArtPrefs, getSelectedDeck, setDeckArtPref, type SavedDeck } from "./storage";

/**
 * Stored in a deck's artPrefs to pin standard art over a global alt pick.
 * It never matches a real alt id, so image lookup falls back to the base art.
 */
export const STANDARD_ART_ID = "standard";

/**
 * Stored in a deck's artPrefs for an any-number card (#1292): every copy shows a different art, cycling
 * through the standard art then the alternates by the copy's rank (`artCopy`). Like STANDARD_ART_ID it never
 * matches a real alt id, and the planner ignores it.
 */
export const EACH_ART_ID = "each";

export type ResolveCardImageOpts = {
  /**
   * Explicit deck for artPrefs (configure page).
   * Ignored when `ownerSeat` is set and that seat is live.
   */
  deck?: SavedDeck | null;
  /** Prefer this seat's live cosmetics map for cards owned by that seat. */
  ownerSeat?: Seat;
  size?: CardImageSize;
  /** Which copy of an any-number card this is (from the engine view); picks the art when the pref is "each". */
  artCopy?: number;
};

function isSavedDeck(v: unknown): v is SavedDeck {
  return (
    !!v &&
    typeof v === "object" &&
    "leaderId" in v &&
    "cards" in v &&
    typeof (v as SavedDeck).leaderId === "string" &&
    Array.isArray((v as SavedDeck).cards)
  );
}

function resolveAltId(
  defId: string,
  opts?: { deck?: SavedDeck | null; ownerSeat?: Seat },
): string | undefined {
  const ownerSeat = opts?.ownerSeat;
  if (ownerSeat === 0 || ownerSeat === 1) {
    const fromSeat = getSeatArtPref(ownerSeat, defId);
    if (fromSeat !== undefined) return fromSeat;
    if (!isSeatArtPrefsLive(ownerSeat)) {
      const deck = opts?.deck === undefined ? getSelectedDeck() : opts.deck;
      return deck?.artPrefs?.[defId] ?? getArtPrefs()[defId];
    }
    return undefined;
  }
  const deck = opts?.deck === undefined ? getSelectedDeck() : opts.deck;
  return deck?.artPrefs?.[defId] ?? getArtPrefs()[defId];
}

/** True for a card a deck may hold any number of that also has an alternate art to spread copies over (#1292). */
export function canUseEachArt(defId: string): boolean {
  return maxCopiesFor(defId) === Infinity && (lookupCard(defId).altArts?.length ?? 0) > 0;
}

/** `[standard, ...alternates][artCopy % count]`: 8 copies over 3 arts show 3 / 3 / 2, standard art first. */
function artUrlForCopy(defId: string, artCopy: number): string | undefined {
  const entry = lookupCard(defId);
  const urls = [entry.imageUrl ?? previewArtPath(defId) ?? undefined, ...(entry.altArts ?? []).map((a) => a.imageUrl)];
  return urls[artCopy % urls.length] || urls[0];
}

function rawCardImageUrl(
  defId: string,
  opts?: { deck?: SavedDeck | null; ownerSeat?: Seat; artCopy?: number },
): string | undefined {
  const entry = lookupCard(defId);
  const altId = resolveAltId(defId, opts);
  if (altId === EACH_ART_ID && typeof opts?.artCopy === "number" && entry.altArts?.length) {
    return artUrlForCopy(defId, opts.artCopy);
  }
  if (altId && entry.altArts?.length) {
    const hit = entry.altArts.find((a) => a.id === altId);
    if (hit?.imageUrl) return hit.imageUrl;
  }
  return entry.imageUrl ?? previewArtPath(defId) ?? undefined;
}

/**
 * Resolve display art for a card (seat / deck prefs + CDN size rewrite).
 *
 * Call shapes:
 * - `resolveCardImageUrl(id)` / `resolveCardImageUrl(id, "thumb"|"large")`
 * - `resolveCardImageUrl(id, savedDeck)`
 * - `resolveCardImageUrl(id, { deck?, ownerSeat?, size? })`
 */
export function resolveCardImageUrl(
  defId: string,
  opts?: ResolveCardImageOpts | CardImageSize | SavedDeck | null,
): string | undefined {
  let deck: SavedDeck | null | undefined = undefined;
  let ownerSeat: Seat | undefined;
  let artCopy: number | undefined;
  let size: CardImageSize = "thumb";

  if (opts === null) {
    deck = null;
  } else if (opts === "thumb" || opts === "large") {
    size = opts;
  } else if (isSavedDeck(opts)) {
    deck = opts;
  } else if (opts && typeof opts === "object") {
    if ("deck" in opts) deck = opts.deck;
    if (opts.ownerSeat === 0 || opts.ownerSeat === 1) ownerSeat = opts.ownerSeat;
    if (opts.size) size = opts.size;
    if (typeof opts.artCopy === "number") artCopy = opts.artCopy;
  }

  const raw = rawCardImageUrl(defId, { deck, ownerSeat, artCopy });
  if (!raw) return undefined;
  return cardImageUrl(raw, size) || raw;
}

/**
 * The alt id a deck actually shows for a card (deck pref, else the global pref,
 * the same order the image uses). "" means standard art.
 */
export function resolveDeckAltId(defId: string, deck: SavedDeck): string {
  const id = deck.artPrefs?.[defId] ?? getArtPrefs()[defId];
  if (!id || id === STANDARD_ART_ID) return "";
  return lookupCard(defId).altArts?.some((a) => a.id === id) ? id : "";
}

/**
 * What the deck's art picker shows for a card: "" (standard), an alt id, or EACH_ART_ID (#1292).
 * "each" only counts for a card that can use it, so a stale pref falls back to standard.
 */
export function resolveDeckArtChoice(defId: string, deck: SavedDeck): string {
  const id = (deck.artPrefs ?? {})[defId] ?? getArtPrefs()[defId];
  if (id === EACH_ART_ID) return canUseEachArt(defId) ? EACH_ART_ID : "";
  return resolveDeckAltId(defId, deck);
}

/**
 * Save a deck's art choice. Standard (null / "") is stored as STANDARD_ART_ID
 * when a global alt pref exists, so the global pick cannot show through.
 */
export function setDeckArtChoice(
  deckId: string,
  defId: string,
  altId: string | null,
): SavedDeck | undefined {
  if (!altId && getArtPrefs()[defId]) {
    return setDeckArtPref(deckId, defId, STANDARD_ART_ID);
  }
  return setDeckArtPref(deckId, defId, altId || null);
}
