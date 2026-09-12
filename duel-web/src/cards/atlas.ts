import atlasJson from "../assets/cardAtlas.json";
import { showOfficialIdentity } from "../legal";
import { tcgArtForCard } from "./tcgArt";

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
  /** Combat attribute: Strike, Slash, Ranged, Special, Wisdom. */
  attribute?: string;
  blocker?: boolean;
  rush?: boolean;
  imageUrl?: string;
  effectText?: string;
  altArts?: CardAltArt[];
};

const atlas = atlasJson as Record<string, CardAtlasEntry>;

/** Session stubs for OPTCG ids imported beyond the curated atlas. */
const runtimeStubs = new Map<string, CardAtlasEntry>();

/** Official-style OPTCG card numbers (OP16-080, ST01-001, EB04-058, …). */
export const OPTCG_CARD_ID_RE = /^[A-Z0-9]+-\d+[A-Z]?$/;

export function isOptcgCardId(id: string): boolean {
  return OPTCG_CARD_ID_RE.test(id.trim().toUpperCase());
}

export function hasAtlasEntry(defId: string): boolean {
  return Object.prototype.hasOwnProperty.call(atlas, defId);
}

/** Vanilla stub used when a decklist references an id outside the curated atlas. */
export function stubAtlasEntry(
  defId: string,
  type: "leader" | "character" = "character",
): CardAtlasEntry {
  const id = defId.trim().toUpperCase();
  // Prefer TCGPlayer CDN when mapped; else local /cards/ mirror.
  const imageUrl = tcgArtForCard(id) ?? `/cards/${id}.png`;
  if (type === "leader") {
    return {
      id,
      name: `${id} (stub)`,
      type: "leader",
      colors: [],
      cost: 0,
      power: 5000,
      life: 5,
      imageUrl,
      effectText: "—",
    };
  }
  return {
    id,
    name: `${id} (stub)`,
    type: "character",
    colors: [],
    cost: 2,
    power: 3000,
    counter: 1000,
    imageUrl,
    effectText: "—",
  };
}

/** Remember a stub so later `lookupCard` calls keep leader vs character typing. */
export function registerAtlasStub(
  defId: string,
  type: "leader" | "character" = "character",
): CardAtlasEntry {
  const entry = stubAtlasEntry(defId, type);
  runtimeStubs.set(entry.id, entry);
  return entry;
}

export function lookupCard(defId: string): CardAtlasEntry {
  const hit = atlas[defId] ?? runtimeStubs.get(defId);
  const base =
    hit ??
    (isOptcgCardId(defId) ? stubAtlasEntry(defId, "character") : {
      id: defId,
      name: defId,
      type: "unknown",
      colors: [],
      cost: 0,
    });
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

export function listAtlasLeaders(): string[] {
  return Object.values(atlas)
    .filter((e) => e.type === "leader")
    .map((e) => e.id);
}
