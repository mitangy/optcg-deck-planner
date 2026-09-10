import atlasJson from "../assets/cardAtlas.json";
import { showOfficialIdentity } from "../legal";

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

export function lookupCard(defId: string): CardAtlasEntry {
  const hit = atlas[defId];
  const base = hit ?? {
    id: defId,
    name: defId,
    type: "unknown",
    colors: [],
    cost: 0,
  };
  if (showOfficialIdentity()) return base;
  return {
    ...base,
    name: base.id,
    imageUrl: undefined,
  };
}

export function listAtlasIds(): string[] {
  return Object.keys(atlas);
}
