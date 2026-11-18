import { createContext, useContext, type SyntheticEvent } from "react";
import type { Seat } from "../../net/protocol";

export const DON_CARD_ART = "/cards/DON.jpg";

export function donArtUrl(productId: number | null | undefined): string {
  return typeof productId === "number" && Number.isSafeInteger(productId) && productId > 0
    ? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_400w.jpg`
    : DON_CARD_ART;
}

export { asDonArtId } from "@optcg/duel-protocol";

export const DonArtContext = createContext<(seat?: Seat) => string>(() => DON_CARD_ART);

export function useDonArt(): (seat?: Seat) => string {
  return useContext(DonArtContext);
}

export function fallbackToDefaultDon(e: SyntheticEvent<HTMLImageElement>): void {
  if (!e.currentTarget.src.endsWith(DON_CARD_ART)) e.currentTarget.src = DON_CARD_ART;
}
