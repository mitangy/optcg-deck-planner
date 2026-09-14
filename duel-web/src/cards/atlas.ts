import atlasJson from "../assets/cardAtlas.json";
import catalogJson from "../assets/cardCatalog.json";
import { showOfficialIdentity } from "../legal";
import { tcgAltsForCard, tcgArtForCard } from "./tcgArt";

export type CardAltArt = {
  id: string;
  label: string;
  imageUrl: string;
  /** TCGPlayer product id when known (aligns with planner printings). */
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
  /** Combat attribute: Strike, Slash, Ranged, Special, Wisdom. */
  attribute?: string;
  blocker?: boolean;
  rush?: boolean;
  imageUrl?: string;
  /** TCGPlayer product id for the preferred face when known. */
  productId?: number;
  effectText?: string;
  altArts?: CardAltArt[];
  traits?: string[];
  hasTrigger?: boolean;
};

/** Curated playable prints (rules package export). */
const curated = atlasJson as Record<string, CardAtlasEntry>;

/**
 * Cosmetics catalog for every English OPTCG number we know about (TCGCSV).
 * Used for Deck Configure search / art; gameplay still auto-stubs missing defs.
 */
const catalog = catalogJson as Record<string, CardAtlasEntry>;

/** Session stubs for OPTCG ids imported beyond curated + catalog. */
const runtimeStubs = new Map<string, CardAtlasEntry>();

/** Official-style OPTCG card numbers (OP16-080, ST01-001, EB04-058, …). */
export const OPTCG_CARD_ID_RE = /^[A-Z0-9]+-\d+[A-Z]?$/;

export function isOptcgCardId(id: string): boolean {
  return OPTCG_CARD_ID_RE.test(id.trim().toUpperCase());
}

/** Local `/cards/...` mirrors are often missing in deploy; prefer CDN. */
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
      // Prefer CDN over missing local mirrors when the same alt id collides.
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
  const hit = catalog[defId];
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
            label: a.label,
            imageUrl: a.imageUrl,
          };
          if (a.productId != null) alt.productId = a.productId;
          return alt;
        })
      : undefined,
  };
}

/**
 * Resolve curated + catalog + TCG product map into a single display entry.
 * Curated wins for gameplay identity; CDN catalog / tcgProducts fill missing art.
 */
function resolveAtlasEntry(defId: string): CardAtlasEntry | undefined {
  const curatedHit = curated[defId];
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
    Object.prototype.hasOwnProperty.call(curated, defId) ||
    Object.prototype.hasOwnProperty.call(catalog, defId)
  );
}

/** Vanilla stub used when a decklist references an id outside curated + catalog. */
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
    counter: 1000,
    imageUrl,
    effectText: "—",
    altArts: altArts.length ? altArts : undefined,
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
  const hit = resolveAtlasEntry(defId);
  const base =
    hit ??
    (isOptcgCardId(defId)
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

/** All searchable ids: curated ∪ cosmetics catalog (curated wins on overlap). */
export function listAtlasIds(): string[] {
  return [...new Set([...Object.keys(curated), ...Object.keys(catalog)])].sort();
}

export function listAtlasLeaders(): string[] {
  return listAtlasIds()
    .map((id) => lookupCard(id))
    .filter((e) => e.type === "leader")
    .map((e) => e.id);
}
