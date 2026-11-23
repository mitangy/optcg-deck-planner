import { lookupCard } from "../cards/atlas";
import { cardImageUrl, previewArtPath, type CardImageSize } from "@optcg/ui/cardArt";

/**
 * Image for a profile picture: the chosen alt art, or the base art when `artId`
 * is empty or no longer an alt of the card. Unlike resolveCardImageUrl it never
 * reads deck or global in-game art prefs, so changing deck art leaves the avatar alone.
 */
export function profileArtUrl(cardId: string, artId: string, size: CardImageSize = "thumb"): string | undefined {
  const entry = lookupCard(cardId);
  const alt = artId ? entry.altArts?.find((a) => a.id === artId) : undefined;
  const raw = alt?.imageUrl || entry.imageUrl || previewArtPath(cardId) || undefined;
  if (!raw) return undefined;
  return cardImageUrl(raw, size) || raw;
}
