/** Deck planner ↔ duel decks: API helpers, list mapping, and linked local copies. */
import { getApiBaseUrl } from "../config";
import { ApiError, fetchWithTimeout } from "../net/api";
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

/** Validate a fetched planner deck and upsert its linked local copy. */
export function importPlannerDeckDetail(detail: PlannerDeckDetail): ImportIntoDeckResult {
  return upsertPlannerDeck({
    plannerId: detail.id,
    name: detail.name,
    text: plannerDeckToDecklist(detail),
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

/** Push a local deck to the planner and remember the returned id on the local copy. */
export async function saveDeckToPlanner(deck: SavedDeck): Promise<SavedDeck> {
  const created = await createPlannerDeck(deck.name, savedDeckToPlannerList(deck));
  return saveDeck({
    id: deck.id,
    name: deck.name,
    leaderId: deck.leaderId,
    cards: deck.cards,
    plannerDeckId: created.id,
  });
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
