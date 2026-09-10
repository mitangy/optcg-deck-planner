import atlasJson from "../../assets/cardAtlas.json";

export type CardAtlasEntry = {
  id: string;
  name: string;
  type: string;
  colors: string[];
  cost: number;
  power?: number;
  life?: number;
  counter?: number;
  blocker?: boolean;
  rush?: boolean;
  imageUrl?: string;
};

const atlas = atlasJson as Record<string, CardAtlasEntry>;

/** Official Bandai art CDN — RN Image needs absolute http(s) URIs. */
const BANDAI_ART =
  "https://en.onepiece-cardgame.com/images/cardlist/card";

/**
 * Duel-web uses root-relative `/cards/...` paths served from Vite public/.
 * Mobile has no such static host, so map those to Bandai CDN (base print;
 * alt-art suffixes fall back to the same print id).
 */
export function resolveImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const m = url.match(/^\/cards\/([^/?#]+)\.(?:png|webp|jpe?g)$/i);
  if (!m) return url;
  const stem = m[1].replace(/_p\d+$/i, "");
  return `${BANDAI_ART}/${stem}.png`;
}

export function lookupCard(defId: string): CardAtlasEntry {
  const hit = atlas[defId];
  if (hit) {
    return { ...hit, imageUrl: resolveImageUrl(hit.imageUrl) };
  }
  return {
    id: defId,
    name: defId,
    type: "unknown",
    colors: [],
    cost: 0,
  };
}

export function listAtlasIds(): string[] {
  return Object.keys(atlas);
}
