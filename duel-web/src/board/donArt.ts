import { createContext, useContext, type SyntheticEvent } from "react";
import type { Seat } from "../net/protocol";

/** Bundled DON!! card face for cost area + DON deck pile (private prototype). */
export const DON_CARD_ART = "/cards/DON.jpg";

/** Same TCGPlayer CDN the card art uses; `productId` comes from the DON!! catalog (#440). */
export function donArtUrl(productId: number | null | undefined): string {
  return typeof productId === "number" && Number.isSafeInteger(productId) && productId > 0
    ? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_400w.jpg`
    : DON_CARD_ART;
}

/** A TCGPlayer productId (positive 31-bit integer), or null for anything else; never a string or URL. */
export function asDonArtId(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 && raw <= 2_147_483_647
    ? raw
    : null;
}

/** DON!! face for a seat's side of the board; no seat means your own (#440). */
export const DonArtContext = createContext<(seat?: Seat) => string>(() => DON_CARD_ART);

export function useDonArt(): (seat?: Seat) => string {
  return useContext(DonArtContext);
}

/** `<img onError>`: a chosen DON!! face that fails to load falls back to the bundled one. */
export function fallbackToDefaultDon(e: SyntheticEvent<HTMLImageElement>): void {
  if (!e.currentTarget.src.endsWith(DON_CARD_ART)) e.currentTarget.src = DON_CARD_ART;
}
