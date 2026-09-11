import { lookupCard } from "../cards/atlas";
import { cardImageUrl, type CardImageSize } from "../cards/cardImage";
import {
  getSeatArtPref,
  isSeatArtPrefsLive,
  type Seat,
} from "./seatArtPrefs";
import { getArtPrefs, getSelectedDeck, type SavedDeck } from "./storage";

export type ResolveCardImageOpts = {
  /**
   * Explicit deck for artPrefs (configure page).
   * Ignored when `ownerSeat` is set and that seat is live.
   */
  deck?: SavedDeck | null;
  /** Prefer this seat's live cosmetics map for cards owned by that seat. */
  ownerSeat?: Seat;
  size?: CardImageSize;
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

function rawCardImageUrl(
  defId: string,
  opts?: { deck?: SavedDeck | null; ownerSeat?: Seat },
): string | undefined {
  const entry = lookupCard(defId);
  const altId = resolveAltId(defId, opts);
  if (altId && entry.altArts?.length) {
    const hit = entry.altArts.find((a) => a.id === altId);
    if (hit?.imageUrl) return hit.imageUrl;
  }
  return entry.imageUrl;
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
  }

  const raw = rawCardImageUrl(defId, { deck, ownerSeat });
  if (!raw) return undefined;
  return cardImageUrl(raw, size) || raw;
}
