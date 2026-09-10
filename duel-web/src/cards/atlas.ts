import atlasJson from "../assets/cardAtlas.json";

export type CardAltArt = {
  id: string;
  label: string;
  imageUrl: string;
};

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
  imageUrl?: string;
  effectText?: string;
  altArts?: CardAltArt[];
};

const atlas = atlasJson as Record<string, CardAtlasEntry>;

export function lookupCard(defId: string): CardAtlasEntry {
  const hit = atlas[defId];
  if (hit) return hit;
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
