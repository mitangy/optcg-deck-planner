/** Deck planner ↔ duel decks: API helpers, list mapping, and linked local copies. */
import { lookupCard } from "../cards/atlas";
import { productIdFromImageUrl } from "../cards/productId";
import { getApiBaseUrl } from "../config";
import { ApiError, fetchWithTimeout } from "../net/api";
import { resolveDeckAltId } from "./artPrefs";
import {
  createDeckFromInput,
  saveDeck,
  upsertPlannerDeck,
  type ImportIntoDeckResult,
  type SavedDeck,
} from "./storage";

export type PlannerDeckSummary = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name?: string | null;
  leader_image_url?: string;
  card_count: number;
  main_cards?: number;
};

export type PlannerCard = {
  card_id: string;
  card_type?: string;
  section?: string;
  needed: number;
  /** Printings the planner lists for this card; `owned` picks the shown art when none is chosen. */
  alt_arts?: { product_id: number; owned?: number | null }[];
  /** Planner art choice: null/absent = automatic, 0 = base art, else a product id. */
  display_art?: number | null;
};

export type PlannerDeckDetail = {
  id: number;
  name: string;
  leader_card_id: string | null;
  cards: PlannerCard[];
};

const DEFAULT_TIMEOUT_MS = 15000;

async function plannerJson<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const res = await fetchWithTimeout(
    `${getApiBaseUrl()}${path}`,
    { ...init, credentials: "include" },
    timeoutMs,
  );
  if (!res.ok) {
    let detail = `Planner request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export function listPlannerDecks(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PlannerDeckSummary[]> {
  return plannerJson("/decks", {}, timeoutMs);
}

export function fetchPlannerDeck(id: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PlannerDeckDetail> {
  return plannerJson(`/decks/${id}`, {}, timeoutMs);
}

export function createPlannerDeck(
  name: string,
  decklist: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PlannerDeckSummary> {
  return plannerJson(
    "/decks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, decklist }),
    },
    timeoutMs,
  );
}

/** DON!! rows are a separate deck in the planner; duel has no use for them. */
function isDonCard(c: PlannerCard): boolean {
  return c.section === "don" || (c.card_type ?? "").trim().toLowerCase().startsWith("don");
}

/**
 * Planner deck → decklist text for `validateImportedList`. The leader comes from
 * `leader_card_id` exactly once (the planner also lists it among `cards`); DON!! is dropped.
 */
export function plannerDeckToDecklist(deck: PlannerDeckDetail): string {
  const leaderId = deck.leader_card_id?.trim().toUpperCase() || null;
  const counts = new Map<string, number>();
  for (const c of deck.cards) {
    const id = c.card_id.trim().toUpperCase();
    if (c.needed <= 0 || isDonCard(c) || id === leaderId) continue;
    counts.set(id, (counts.get(id) ?? 0) + c.needed);
  }
  const lines = leaderId ? [`1x${leaderId}`] : [];
  for (const [id, n] of counts) lines.push(`${n}x${id}`);
  return lines.join("\n");
}

/** Local deck → planner decklist text (1x leader + Nx per main-deck card). */
export function savedDeckToPlannerList(deck: Pick<SavedDeck, "leaderId" | "cards">): string {
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [`1x${deck.leaderId}`, ...[...counts].map(([id, n]) => `${n}x${id}`)].join("\n");
}

/**
 * Product id of the art the planner shows for a card (0 = base). Same rule as `featuredAlt` in the
 * planner's `altArt.ts`: base when chosen, the chosen alt when listed, else the most-owned alt.
 */
export function plannerShownProductId(card: PlannerCard): number {
  const chosen = card.display_art;
  if (chosen === 0) return 0;
  const alts = card.alt_arts ?? [];
  if (chosen != null && chosen > 0 && alts.some((a) => a.product_id === chosen)) return chosen;
  let best: { product_id: number; owned?: number | null } | null = null;
  for (const alt of alts) {
    const n = alt.owned ?? 0;
    if (n > 0 && (best === null || n > (best.owned ?? 0))) best = alt;
  }
  return best?.product_id ?? 0;
}

/** Duel alt art ids (`p1`, …) for the alt arts the planner shows; cards on base art or without a matching alt are left out (#1003). */
export function plannerDeckArt(deck: PlannerDeckDetail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of deck.cards) {
    const defId = c.card_id.trim().toUpperCase();
    if (c.needed <= 0 || isDonCard(c) || out[defId]) continue;
    const shown = plannerShownProductId(c);
    if (!shown) continue;
    const alt = lookupCard(defId)?.altArts?.find(
      (a) => (a.productId ?? productIdFromImageUrl(a.imageUrl)) === shown,
    );
    if (alt) out[defId] = alt.id;
  }
  return out;
}

/** Validate a fetched planner deck and upsert its linked local copy. */
export function importPlannerDeckDetail(detail: PlannerDeckDetail): ImportIntoDeckResult {
  return upsertPlannerDeck({
    plannerId: detail.id,
    name: detail.name,
    text: plannerDeckToDecklist(detail),
    plannerArt: plannerDeckArt(detail),
  });
}

/** Pull a planner deck fresh and upsert the linked copy. Throws on network/API failure. */
export async function pullPlannerDeck(id: number): Promise<ImportIntoDeckResult> {
  return importPlannerDeckDetail(await fetchPlannerDeck(id));
}

/** Planner decks that have no linked local copy yet; a copied deck lives under "Your decks". */
export function plannerDecksNotLocal(
  planner: PlannerDeckSummary[],
  local: Pick<SavedDeck, "plannerDeckId">[],
): PlannerDeckSummary[] {
  const linked = new Set(local.map((d) => d.plannerDeckId));
  return planner.filter((d) => !linked.has(d.id));
}

export type PlannerBulkImport = { imported: SavedDeck[]; errors: string[] };

/**
 * Pull several planner decks at once. One deck failing (network, or invalid for
 * duel) never stops the others; each failure is reported with the deck's name.
 */
export async function importPlannerDecks(
  decks: Pick<PlannerDeckSummary, "id" | "name">[],
  fetchDeck: (id: number) => Promise<PlannerDeckDetail> = fetchPlannerDeck,
): Promise<PlannerBulkImport> {
  const settled = await Promise.allSettled(decks.map((d) => fetchDeck(d.id)));
  const out: PlannerBulkImport = { imported: [], errors: [] };
  settled.forEach((s, i) => {
    const name = decks[i].name;
    if (s.status === "rejected") {
      out.errors.push(`${name}: ${s.reason instanceof Error ? s.reason.message : "could not load"}`);
      return;
    }
    const result = importPlannerDeckDetail(s.value);
    if (result.ok) out.imported.push(result.deck);
    else out.errors.push(`${name}: ${result.errors.join(" · ") || "invalid deck"}`);
  });
  return out;
}

/** Whether a bulk import brought in this planner deck (a swiped row stays gone only then). */
export function plannerDeckImported(imported: readonly Pick<SavedDeck, "plannerDeckId">[], plannerId: number): boolean {
  return imported.some((d) => d.plannerDeckId === plannerId);
}

/**
 * Best-effort refresh before a match: any failure (offline, timeout, invalid
 * planner list) keeps the local copy as-is.
 */
export async function refreshLinkedDeck(
  deck: SavedDeck,
  timeoutMs: number,
  fetchDeck: (id: number, timeoutMs: number) => Promise<PlannerDeckDetail> = fetchPlannerDeck,
): Promise<SavedDeck> {
  if (!deck.plannerDeckId) return deck;
  // Edits saved in the deck editor win over the planner's version (#481).
  if (deck.editedLocally) return deck;
  try {
    const result = importPlannerDeckDetail(await fetchDeck(deck.plannerDeckId, timeoutMs));
    return result.ok ? result.deck : deck;
  } catch {
    return deck;
  }
}

/** Alt arts a deck shows (leader + main deck) that the planner can display: one entry per card with a product id (#1017). */
export function deckArtForPlanner(
  deck: Pick<SavedDeck, "leaderId" | "cards" | "artPrefs">,
): { defId: string; productId: number; altId: string }[] {
  const out: { defId: string; productId: number; altId: string }[] = [];
  for (const defId of new Set([deck.leaderId, ...deck.cards])) {
    const altId = resolveDeckAltId(defId, deck as SavedDeck);
    if (!altId) continue;
    const alt = lookupCard(defId)?.altArts?.find((a) => a.id === altId);
    const productId = alt && (alt.productId ?? productIdFromImageUrl(alt.imageUrl));
    if (productId) out.push({ defId, productId, altId });
  }
  return out;
}

/** Choose the art the planner shows for a card (`PUT /owned/{id}/display`). Global per card in the planner. */
export function setPlannerDisplayArt(
  cardId: string,
  productId: number | null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return plannerJson(
    `/owned/${encodeURIComponent(cardId)}/display`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    },
    timeoutMs,
  );
}

export type SaveToPlannerResult = {
  deck: SavedDeck;
  planner: PlannerDeckSummary;
  artsSet: number;
  artsFailed: number;
};

/**
 * Push a local deck to the planner, set the planner's shown art for the deck's alt-art cards, and
 * keep a linked local copy (with its art prefs). One art failing never fails the save (#1017).
 */
export async function saveDeckToPlanner(
  deck: SavedDeck,
  deps: {
    create?: (name: string, decklist: string) => Promise<PlannerDeckSummary>;
    setArt?: (cardId: string, productId: number) => Promise<unknown>;
  } = {},
): Promise<SaveToPlannerResult> {
  const create = deps.create ?? createPlannerDeck;
  const setArt = deps.setArt ?? setPlannerDisplayArt;
  const created = await create(deck.name, savedDeckToPlannerList(deck));
  const arts = deckArtForPlanner(deck);
  const settled = await Promise.allSettled(arts.map((a) => setArt(a.defId, a.productId)));
  const plannerArt: Record<string, string> = {};
  arts.forEach((a, i) => {
    if (settled[i].status === "fulfilled") plannerArt[a.defId] = a.altId;
  });
  const saved = saveDeck({
    id: deck.id,
    name: deck.name,
    leaderId: deck.leaderId,
    cards: deck.cards,
    artPrefs: deck.artPrefs ?? {},
    plannerArt,
    plannerDeckId: created.id,
    editedLocally: false,
  });
  const artsSet = Object.keys(plannerArt).length;
  return { deck: saved, planner: created, artsSet, artsFailed: arts.length - artsSet };
}

export type PlannerDeepLink = {
  plannerId: number | null;
  list: string | null;
  name: string;
};

/** `/decks?planner=<id>` with optional `#list=…&name=…` fallback. Null when neither is present. */
export function parsePlannerDeepLink(search: string, hash: string): PlannerDeepLink | null {
  const rawId = new URLSearchParams(search).get("planner");
  const plannerId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const list = h.get("list")?.trim() || null;
  if (plannerId === null && !list) return null;
  return { plannerId, list, name: h.get("name")?.trim() || "Planner deck" };
}

/**
 * Resolve a deep link to a local deck: the planner deck when signed in and the
 * fetch works, otherwise the `list` fallback. Never imports an invalid deck.
 */
export async function applyPlannerDeepLink(
  link: PlannerDeepLink,
  signedIn: boolean,
  fetchDeck: (id: number) => Promise<PlannerDeckDetail> = fetchPlannerDeck,
): Promise<ImportIntoDeckResult> {
  let planErr: string | null = null;
  if (signedIn && link.plannerId !== null) {
    try {
      return importPlannerDeckDetail(await fetchDeck(link.plannerId));
    } catch (e) {
      planErr = e instanceof Error ? e.message : "Could not load the planner deck";
    }
  }
  if (link.list) return createDeckFromInput(link.name, link.list);
  return {
    ok: false,
    errors: [planErr ?? "Sign in to open this planner deck."],
    warnings: [],
  };
}
