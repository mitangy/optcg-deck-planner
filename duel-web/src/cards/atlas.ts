import { getCardData } from "./cardData";
import { isCardId, tcgAltsForCard, tcgArtForCard } from "@optcg/card-core";
import { showOfficialIdentity } from "../legal";

export type CardAltArt = {
  id: string;
  label: string;
  imageUrl: string;
  productId?: number;
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
  attribute?: string;
  blocker?: boolean;
  rush?: boolean;
  imageUrl?: string;
  productId?: number;
  effectText?: string;
  altArts?: CardAltArt[];
  traits?: string[];
  hasTrigger?: boolean;
  abilitySupport?: "none" | "keywords" | "ok" | "partial" | "unverified" | "unsupported";
  deckRules?: string[];
};

/**
 * Raw cosmetics JSON omits empty arrays/nulls (e.g. no `colors`), so it is not
 * a full CardAtlasEntry until `fromCatalog` normalizes defaults.
 */
type CosmeticsCatalogRow = Omit<Partial<CardAtlasEntry>, "altArts" | "abilitySupport"> & {
  id?: string;
  altArts?: Array<Partial<CardAltArt> & Pick<CardAltArt, "id" | "imageUrl">>;
  abilitySupport?: CardAtlasEntry["abilitySupport"];
};

const curatedRows = () => getCardData().curated as Record<string, CardAtlasEntry>;

const catalogRows = () => getCardData().catalog as Record<string, CosmeticsCatalogRow>;

const runtimeStubs = new Map<string, CardAtlasEntry>();

function isLocalCardsUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith("/cards/") || url.startsWith("cards/"));
}

function mergeAltArts(
  ...lists: (CardAltArt[] | undefined)[]
): CardAltArt[] | undefined {
  const byId = new Map<string, CardAltArt>();
  for (const list of lists) {
    if (!list?.length) continue;
    for (const alt of list) {
      if (!alt?.id || !alt.imageUrl) continue;
      const prev = byId.get(alt.id);
      if (prev && isLocalCardsUrl(alt.imageUrl) && !isLocalCardsUrl(prev.imageUrl)) {
        continue;
      }
      const next: CardAltArt = {
        id: alt.id,
        label: alt.label,
        imageUrl: alt.imageUrl,
      };
      const productId = alt.productId ?? prev?.productId;
      if (productId != null) next.productId = productId;
      byId.set(alt.id, next);
    }
  }
  if (byId.size === 0) return undefined;
  return [...byId.values()];
}

function fromCatalog(defId: string): CardAtlasEntry | undefined {
  const hit = catalogRows()[defId];
  if (!hit) return undefined;
  return {
    id: hit.id ?? defId,
    name: hit.name ?? defId,
    type: hit.type ?? "character",
    colors: hit.colors ?? [],
    cost: hit.cost ?? 0,
    power: hit.power,
    life: hit.life,
    counter: hit.counter,
    attribute: hit.attribute,
    blocker: hit.blocker,
    rush: hit.rush,
    imageUrl: hit.imageUrl,
    productId: hit.productId,
    effectText: hit.effectText,
    altArts: hit.altArts?.length
      ? hit.altArts.map((a) => {
          const alt: CardAltArt = {
            id: a.id,
            label: a.label ?? a.id,
            imageUrl: a.imageUrl,
          };
          if (a.productId != null) alt.productId = a.productId;
          return alt;
        })
      : undefined,
    abilitySupport: hit.abilitySupport ?? "unverified",
  };
}

function resolveAtlasEntry(defId: string): CardAtlasEntry | undefined {
  const curatedHit = curatedRows()[defId];
  const catalogHit = fromCatalog(defId);
  const stubHit = runtimeStubs.get(defId);
  const base = curatedHit ?? catalogHit ?? stubHit;
  if (!base) return undefined;

  const catalogUrl = catalogHit?.imageUrl;
  const tcgUrl = tcgArtForCard(defId);
  let imageUrl = base.imageUrl;
  if (isLocalCardsUrl(imageUrl)) {
    if (catalogUrl && !isLocalCardsUrl(catalogUrl)) imageUrl = catalogUrl;
    else if (tcgUrl) imageUrl = tcgUrl;
  } else if (!imageUrl) {
    imageUrl = (catalogUrl && !isLocalCardsUrl(catalogUrl) ? catalogUrl : undefined) ?? tcgUrl;
  }

  const altArts = mergeAltArts(
    base.altArts,
    catalogHit?.altArts,
    tcgAltsForCard(defId),
  );

  return {
    ...base,
    imageUrl,
    productId: base.productId ?? catalogHit?.productId,
    altArts,
  };
}

export function hasAtlasEntry(defId: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(curatedRows(), defId) ||
    Object.prototype.hasOwnProperty.call(catalogRows(), defId)
  );
}

export function stubAtlasEntry(
  defId: string,
  type: "leader" | "character" = "character",
): CardAtlasEntry {
  const id = defId.trim().toUpperCase();
  const imageUrl = tcgArtForCard(id) ?? `/cards/${id}.png`;
  const altArts = tcgAltsForCard(id);
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
      abilitySupport: "unverified",
      altArts: altArts.length ? altArts : undefined,
    };
  }
  return {
    id,
    name: `${id} (stub)`,
    type: "character",
    colors: [],
    cost: 2,
    power: 3000,
    imageUrl,
    effectText: "—",
    abilitySupport: "unverified",
    altArts: altArts.length ? altArts : undefined,
  };
}

export function registerAtlasStub(
  defId: string,
  type: "leader" | "character" = "character",
): CardAtlasEntry {
  const entry = stubAtlasEntry(defId, type);
  runtimeStubs.set(entry.id, entry);
  return entry;
}

export const MAX_COPIES_PER_CARD = 4;

export function maxCopiesFor(defId: string): number {
  return lookupCard(defId).deckRules?.includes("any_number") ? Infinity : MAX_COPIES_PER_CARD;
}

export function lookupCard(defId: string): CardAtlasEntry {
  const hit = resolveAtlasEntry(defId);
  const base =
    hit ??
    (isCardId(defId)
      ? stubAtlasEntry(defId, "character")
      : {
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
  return [...new Set([...Object.keys(curatedRows()), ...Object.keys(catalogRows())])].sort();
}

export function listAtlasLeaders(): string[] {
  return listAtlasIds()
    .map((id) => lookupCard(id))
    .filter((e) => e.type === "leader")
    .map((e) => e.id);
}
