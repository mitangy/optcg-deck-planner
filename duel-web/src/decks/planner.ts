import { lookupCard } from "../cards/atlas";
import { loadCardData } from "../cards/cardData";
import { productIdFromImageUrl } from "../cards/productId";
import { apiCall, withTimeoutWording } from "../api/http";
import { resolveDeckAltId } from "./artPrefs";
import {
  applyPlannerArt,
  createDeckFromInput,
  getSavedDeck,
  listSavedDecks,
  recordPlannerArt,
  upsertPlannerDeck,
  type ImportIntoDeckResult,
  type SavedDeck,
} from "./storage";

export type PlannerCard = {
  card_id: string;
  card_type?: string;
  section?: string;
  needed: number;
  alt_arts?: { product_id: number; owned?: number | null }[];
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
  try {
    return await apiCall<T>(path, { ...init, timeoutMs }, "Planner request failed");
  } catch (e) {
    throw withTimeoutWording(e, timeoutMs);
  }
}

export function fetchPlannerDeck(id: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PlannerDeckDetail> {
  return plannerJson(`/decks/${id}`, {}, timeoutMs);
}

function isDonCard(c: PlannerCard): boolean {
  return c.section === "don" || (c.card_type ?? "").trim().toLowerCase().startsWith("don");
}

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

export function importPlannerDeckDetail(detail: PlannerDeckDetail): ImportIntoDeckResult {
  return upsertPlannerDeck({
    plannerId: detail.id,
    name: detail.name,
    text: plannerDeckToDecklist(detail),
    plannerArt: plannerDeckArt(detail),
  });
}

export async function refreshLinkedDeck(
  deck: SavedDeck,
  timeoutMs: number,
  fetchDeck: (id: number, timeoutMs: number) => Promise<PlannerDeckDetail> = fetchPlannerDeck,
): Promise<SavedDeck> {
  if (!deck.plannerDeckId) return deck;
  try {
    const detail = await fetchDeck(deck.plannerDeckId, timeoutMs);
    await loadCardData();
    return applyPlannerArt(deck.id, plannerDeckArt(detail)) ?? deck;
  } catch {
    return deck;
  }
}

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

export function setPlannerDisplayArt(
  cardId: string,
  productId: number | null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return plannerJson(
    `/owned/${encodeURIComponent(cardId)}/display`,
    {
      method: "PUT",
      body: JSON.stringify({ product_id: productId }),
    },
    timeoutMs,
  );
}

export async function pushDeckArtToPlanner(
  deckId: string,
  setArt: (cardId: string, productId: number) => Promise<unknown> = setPlannerDisplayArt,
): Promise<SavedDeck | undefined> {
  const deck = getSavedDeck(deckId);
  if (!deck?.plannerDeckId) return undefined;
  const todo = deckArtForPlanner(deck).filter((a) => deck.plannerArt?.[a.defId] !== a.altId);
  const settled = await Promise.allSettled(todo.map((a) => setArt(a.defId, a.productId)));
  const done: Record<string, string> = {};
  todo.forEach((a, i) => {
    if (settled[i].status === "fulfilled") done[a.defId] = a.altId;
  });
  return Object.keys(done).length > 0 ? recordPlannerArt(deckId, done) : undefined;
}

export async function pushLinkedDeckArt(
  setArt?: (cardId: string, productId: number) => Promise<unknown>,
): Promise<void> {
  for (const deck of listSavedDecks()) {
    if (deck.plannerDeckId) await pushDeckArtToPlanner(deck.id, setArt);
  }
}

export type PlannerDeepLink = {
  plannerId: number | null;
  list: string | null;
  name: string;
};

export function parsePlannerDeepLink(search: string, hash: string): PlannerDeepLink | null {
  const rawId = new URLSearchParams(search).get("planner");
  const plannerId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const list = h.get("list")?.trim() || null;
  if (plannerId === null && !list) return null;
  return { plannerId, list, name: h.get("name")?.trim() || "Planner deck" };
}

export async function applyPlannerDeepLink(
  link: PlannerDeepLink,
  signedIn: boolean,
  fetchDeck: (id: number) => Promise<PlannerDeckDetail> = fetchPlannerDeck,
): Promise<ImportIntoDeckResult> {
  let planErr: string | null = null;
  await loadCardData();
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
