const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
// Local: hit uvicorn directly, on whichever host the page itself was loaded
// from — not a fixed address. A static VITE_API_URL forces every page load to
// call that one host regardless of how it was reached: opening the app via a
// LAN IP for phone testing would leave a desktop tab on localhost silently
// calling out to the LAN IP too, an unnecessary cross-address request that
// has nothing to do with how that tab was opened. Deriving it from
// window.location means localhost pairs with localhost and a LAN IP pairs
// with itself, independent of whatever else is being tested.
// Production: same-origin /api (Vercel rewrite → Render) so the session
// cookie is first-party (required on mobile Safari).
const API_URL =
  configured ||
  (import.meta.env.DEV
    ? // Guarded rather than assumed: this module is imported (transitively,
      // via other components) by tests running under Vitest's default Node
      // environment, where `window` does not exist.
      typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : "http://localhost:8000"
    : "/api");

/** Where the API lives for this page (same-origin /api in production). */
export function getApiBaseUrl(): string {
  return API_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    ...(init?.headers || {}),
  };
  if (init?.body) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body;
    } catch {
      /* ignore */
    }
    const err = new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail),
    ) as Error & { status?: number; detail?: unknown };
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type User = {
  id: number;
  email: string;
  name: string;
  /** Shopping Need sums copies across distinct leaders instead of max across decks. */
  sum_across_leaders?: boolean;
};

export type DeckSummary = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name?: string | null;
  leader_image_url?: string;
  card_count: number;
  total_cards: number;
  main_cards?: number;
  don_cards?: number;
  /** Non-DON copies covered by Owned (min(owned, needed) per card), out of main_cards. */
  owned_copies?: number;
  sort_order: number;
  /** Effective Main for this leader (explicit or earliest same-leader fallback). */
  is_main?: boolean;
};

export type PrintingView = {
  product_id: number;
  name: string;
  market_price: number | null;
  low_price: number | null;
  image_url: string;
  tcgplayer_url: string;
  group_name: string;
  is_special: boolean;
  /** Per-deck (or shopping max-across-decks) alt want for play. */
  wanted?: number;
};

export type CatalogCardResult = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  market_price: number | null;
  low_price: number | null;
  image_url: string;
  tcgplayer_url: string;
  group_name: string;
};

export type CardView = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  needed: number;
  /** Total owned, shared by every deck (what the Owned stepper edits). */
  owned: number;
  still_need: number;
  /** Separate per leader: copies leaders earlier in deck order use first (0 when shared). */
  earlier_leaders_need?: number;
  earlier_leaders?: string[];
  market_price: number | null;
  low_price: number | null;
  image_url: string;
  tcgplayer_url: string;
  product_id?: number | null;
  section: "main" | "additional" | "don" | string;
  alt_arts: PrintingView[];
};

export type DeckDetail = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name: string | null;
  /** Name of the Main deck this list is compared against (empty when this is Main). */
  prior_decks: string[];
  is_main?: boolean;
  cards: CardView[];
  main_cards?: number;
  don_cards?: number;
};

export type ShoppingItem = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  need: number;
  owned: number;
  still_need: number;
  market_price: number | null;
  low_price: number | null;
  remaining_cost: number | null;
  image_url: string;
  tcgplayer_url: string;
  product_id?: number | null;
  used_in: string[];
  alt_arts: PrintingView[];
  deck_sort_key?: string;
  primary_leader_card_id?: string | null;
  primary_leader_name?: string | null;
  leader_count?: number;
  /** Per-leader Need in deck order; only set when 2+ leaders use the card. */
  need_by_leader?: { label: string; need: number }[];
  /** True when `need` adds need_by_leader together; false when it takes the max. */
  need_summed?: boolean;
};

/** "Need 7 = Luffy 4 + Sabo 3" / "Need 4 = most of Luffy 4, Sabo 3"; "" for one leader. */
export function needBreakdownLabel(item: ShoppingItem): string {
  const parts = item.need_by_leader ?? [];
  if (parts.length < 2) return "";
  const each = parts.map((p) => `${p.label} ${p.need}`);
  return item.need_summed
    ? `Need ${item.need} = ${each.join(" + ")}`
    : `Need ${item.need} = most of ${each.join(", ")}`;
}

export type RecentSale = {
  price: number;
  shipping: number;
  condition: string;
  variant: string;
  language: string;
  quantity: number;
  order_date: string;
};

export type RecentSalesResponse = {
  product_id: number;
  sales: RecentSale[];
};

export type ShoppingResponse = {
  items: ShoppingItem[];
  cards_still_needed: number;
  remaining_market: number;
  unique_cards: number;
};

export type OwnedCard = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  owned: number;
  market_price: number | null;
  low_price: number | null;
  /** owned × market_price of the standard printing; null when unpriced. */
  value: number | null;
  image_url: string;
  tcgplayer_url: string;
  product_id?: number | null;
  used_in: string[];
};

export type OwnedCollectionResponse = {
  items: OwnedCard[];
  unique_cards: number;
  total_copies: number;
  total_value: number;
  /** Owned cards with no market price (not in total_value). */
  unpriced_cards: number;
};

export type ShareInfo = {
  token: string;
  kind: string;
  deck_id: number | null;
  deck_ids: number[] | null;
  path: string;
};

export type PublicShoppingResponse = ShoppingResponse & {
  owner_name: string;
  kind: string;
  deck_name: string | null;
};

export type GroupBuyMemberQty = {
  user_id: number;
  display_name: string;
  qty: number;
  suggested_qty?: number;
  is_custom?: boolean;
};

export type GroupBuyMember = {
  user_id: number;
  display_name: string;
  role: string;
  deck_ids: number[] | null;
  /** Member's Copies needed mode; null/absent once quantities are frozen. */
  sum_across_leaders?: boolean | null;
  cards_still_needed: number;
  remaining_market: number;
  card_cost?: number;
  shipping_share?: number;
  tax_share?: number;
  total_owed?: number;
};

export type GroupBuyOrderUpdate = {
  external_order_id?: string | null;
  order_notes?: string | null;
  shipping_cost?: number | null;
  shipping_split?: "equal" | "by_cost" | "by_copies" | null;
  tax_cost?: number | null;
};

export type GroupBuyLine = {
  card_id: string;
  name: string;
  color?: string;
  rarity?: string;
  card_type?: string;
  cost?: string | null;
  total_qty: number;
  market_price: number | null;
  remaining_cost: number | null;
  product_id?: number | null;
  preferred_product_id?: number | null;
  preferred_market_price?: number | null;
  tcgplayer_url: string;
  image_url: string;
  members: GroupBuyMemberQty[];
  alt_arts: PrintingView[];
  my_qty: number;
  my_suggested_qty: number;
  my_is_custom: boolean;
  my_excluded?: boolean;
  /** Viewer's play Need for this card — caps alt want steppers. */
  my_need?: number;
};

export type GroupBuySummary = {
  id: number;
  title: string;
  status: string;
  invite_token: string;
  invite_path: string;
  host_user_id: number;
  host_name: string;
  member_count: number;
  is_host: boolean;
  is_public?: boolean;
  public_path?: string | null;
  unique_cards: number;
  cards_still_needed: number;
  remaining_market: number;
  created_at: string;
};

export type GroupBuyDetail = GroupBuySummary & {
  members: GroupBuyMember[];
  lines: GroupBuyLine[];
  locked_at: string | null;
  ordered_at: string | null;
  external_order_id: string;
  order_notes: string;
  shipping_cost: number;
  shipping_split: "equal" | "by_cost" | "by_copies" | string;
  tax_cost: number;
  cards_subtotal: number;
  grand_total: number;
  receipt_text?: string;
  has_receipt?: boolean;
  can_undo_purchase?: boolean;
  read_only?: boolean;
};

export type GroupBuyInvitePreview = {
  title: string;
  host_name: string;
  member_count: number;
  status: string;
  invite_token: string;
  is_public?: boolean;
  public_path?: string | null;
};

export type GroupBuyExport = {
  paste_text: string;
  url: string | null;
  included_count: number;
  copy_count: number;
  with_product_id: number;
  missing_product_id: number;
  status: string;
};

export type GroupBuyReceiptLine = {
  card_id: string;
  name: string;
  group_name: string;
  needed_qty: number;
  receipt_qty: number;
  status: "exact" | "surplus" | "short" | "extra" | "missing" | string;
  confidence: string;
  product_id: number | null;
  staged_qty: number;
  descriptions: string[];
};

export type GroupBuyReceiptUnmatched = {
  qty: number;
  description: string;
  set_name: string;
  card_name: string;
};

export type GroupBuyReceiptMatchReport = {
  lines: GroupBuyReceiptLine[];
  unmatched: GroupBuyReceiptUnmatched[];
  summary: Record<string, number>;
  can_apply_full: boolean;
  can_apply_partial: boolean;
};

export type MetaLeader = {
  leader_id: string;
  name: string;
  color: string;
  image_url: string;
  decks: number;
  share: number;
  top8: number;
  wins: number;
  losses: number;
  ties: number;
  win_rate: number | null;
};

export type MetaLeadersResponse = {
  days: number;
  min_players: number;
  events: number;
  total_decks: number;
  source: string;
  source_url: string;
  leaders: MetaLeader[];
};

export type MetaDeckCard = {
  card_id: string;
  count: number;
  name: string;
  cost: string;
  card_type: string;
  image_url: string;
};

export type MetaDeck = {
  id: number;
  event_id: string;
  event: string;
  event_url: string;
  /** YYYY-MM-DD */
  date: string;
  set_label?: string | null;
  players: number;
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  cards: MetaDeckCard[];
  card_count: number;
  /** OPTCGSim paste format, accepted as-is by POST /decks. */
  text: string;
};

export type MetaDecksResponse = {
  leader_id: string;
  name: string;
  image_url: string;
  decks: MetaDeck[];
};

export const api = {
  apiUrl: API_URL,
  me: () => request<User | null>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  updatePreferences: (body: { sum_across_leaders?: boolean }) =>
    request<User>("/preferences", { method: "PATCH", body: JSON.stringify(body) }),
  claim: (ticket: string) =>
    request<User>("/auth/claim", { method: "POST", body: JSON.stringify({ ticket }) }),
  devLogin: () => request<User>("/auth/dev-login", { method: "POST" }),
  googleLoginUrl: () => `${API_URL}/auth/google`,
  metaLeaders: (days: number) => request<MetaLeadersResponse>(`/meta/leaders?days=${days}`),
  metaDecks: (leader: string, days: number, top: number) =>
    request<MetaDecksResponse>(
      `/meta/decks?leader=${encodeURIComponent(leader)}&days=${days}&top=${top}&limit=50`,
    ),
  decks: () => request<DeckSummary[]>("/decks"),
  deck: (id: number) => request<DeckDetail>(`/decks/${id}`),
  createDeck: (name: string, decklist: string) =>
    request<DeckSummary>("/decks", {
      method: "POST",
      body: JSON.stringify({ name, decklist }),
    }),
  deleteDeck: (id: number) =>
    request<{ ok: boolean }>(`/decks/${id}`, { method: "DELETE" }),
  setDeckAsMain: (id: number) =>
    request<DeckDetail>(`/decks/${id}/set-main`, { method: "POST" }),
  resetDeckOwned: (id: number) =>
    request<{ deck_id: number; reset_count: number; deck: DeckDetail }>(
      `/decks/${id}/reset-owned`,
      { method: "POST" },
    ),
  upsertDeckCard: (
    deckId: number,
    cardId: string,
    needed: number,
    confirmOversize = false,
  ) =>
    request<DeckDetail>(`/decks/${deckId}/cards/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ needed, confirm_oversize: confirmOversize }),
    }),
  removeDeckCard: (deckId: number, cardId: string) =>
    request<DeckDetail>(`/decks/${deckId}/cards/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
    }),
  setDeckCardPrinting: (deckId: number, cardId: string, productId: number, qty: number) =>
    request<DeckDetail>(
      `/decks/${deckId}/cards/${encodeURIComponent(cardId)}/printings/${productId}`,
      {
        method: "PUT",
        body: JSON.stringify({ qty }),
      },
    ),
  setCardPrinting: (cardId: string, productId: number, qty: number, deckIds?: number[]) =>
    request<{ card_id: string; product_id: number; qty: number; decks_updated: number }>(
      `/cards/${encodeURIComponent(cardId)}/printings/${productId}`,
      {
        method: "PUT",
        body: JSON.stringify({ qty, deck_ids: deckIds }),
      },
    ),
  searchCatalog: (opts?: {
    q?: string;
    color?: string;
    card_type?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.color) params.set("color", opts.color);
    if (opts?.card_type) params.set("card_type", opts.card_type);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<CatalogCardResult[]>(`/catalog/cards${qs ? `?${qs}` : ""}`);
  },
  shopping: (deckIds?: number[]) => {
    const params = new URLSearchParams();
    for (const id of deckIds ?? []) params.append("deck_ids", String(id));
    const qs = params.toString();
    return request<ShoppingResponse>(`/shopping${qs ? `?${qs}` : ""}`);
  },
  ownedCollection: () => request<OwnedCollectionResponse>("/owned"),
  setOwned: (cardId: string, qty: number) =>
    request<{ card_id: string; qty: number }>(`/owned/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ qty }),
    }),
  recentSales: (productId: number, limit = 3) =>
    request<RecentSalesResponse>(`/catalog/sales/${productId}?limit=${limit}`),
  getShoppingShare: () => request<ShareInfo | null>("/share/shopping"),
  createShare: (body: { kind?: string; deck_id?: number; deck_ids?: number[] }) =>
    request<ShareInfo>("/share", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeShare: (token: string) =>
    request<{ ok: boolean }>(`/share/${encodeURIComponent(token)}`, { method: "DELETE" }),
  publicShare: (token: string) =>
    request<PublicShoppingResponse>(`/public/share/${encodeURIComponent(token)}`),
  groupBuys: () => request<GroupBuySummary[]>("/group-buys"),
  groupBuy: (id: number) => request<GroupBuyDetail>(`/group-buys/${id}`),
  createGroupBuy: (body: { title?: string; deck_ids?: number[] }) =>
    request<GroupBuyDetail>("/group-buys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteGroupBuy: (id: number) =>
    request<{ ok: boolean }>(`/group-buys/${id}`, { method: "DELETE" }),
  joinGroupBuy: (token: string) =>
    request<GroupBuyDetail>(`/group-buys/join/${encodeURIComponent(token)}`, {
      method: "POST",
    }),
  groupBuyInvitePreview: (token: string) =>
    request<GroupBuyInvitePreview>(`/public/group-buys/${encodeURIComponent(token)}`),
  publicGroupBuy: (token: string) =>
    request<GroupBuyDetail>(`/public/group-buys/${encodeURIComponent(token)}/view`),
  setGroupBuyPublic: (id: number, is_public: boolean) =>
    request<GroupBuyDetail>(`/group-buys/${id}/public`, {
      method: "PUT",
      body: JSON.stringify({ is_public }),
    }),
  updateGroupBuyContribution: (id: number, deck_ids: number[] | null | undefined) =>
    request<GroupBuyDetail>(`/group-buys/${id}/contribution`, {
      method: "PUT",
      body: JSON.stringify({ deck_ids: deck_ids ?? null }),
    }),
  lockGroupBuy: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/lock`, { method: "POST" }),
  unlockGroupBuy: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/unlock`, { method: "POST" }),
  markGroupBuyOrdered: (id: number, body?: GroupBuyOrderUpdate) =>
    request<GroupBuyDetail>(`/group-buys/${id}/order`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  updateGroupBuyOrder: (id: number, body: GroupBuyOrderUpdate) =>
    request<GroupBuyDetail>(`/group-buys/${id}/order`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  completeGroupBuy: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/complete`, { method: "POST" }),
  matchGroupBuyReceipt: (id: number, receipt_text: string) =>
    request<GroupBuyReceiptMatchReport>(`/group-buys/${id}/receipt/match`, {
      method: "POST",
      body: JSON.stringify({ receipt_text }),
    }),
  applyGroupBuyReceipt: (
    id: number,
    body: { receipt_text: string; card_ids?: string[] | null; allow_partial?: boolean },
  ) =>
    request<GroupBuyDetail>(`/group-buys/${id}/receipt/apply`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  undoGroupBuyReceiptApply: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/receipt/undo`, { method: "POST" }),
  setGroupBuyLineProduct: (id: number, cardId: string, product_id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/lines/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ product_id }),
    }),
  setGroupBuyQty: (id: number, cardId: string, qty: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/quantities/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ qty }),
    }),
  clearGroupBuyQty: (id: number, cardId: string) =>
    request<GroupBuyDetail>(`/group-buys/${id}/quantities/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
    }),
  syncGroupBuyQuantities: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/quantities/sync`, { method: "POST" }),
  exportGroupBuyTcgplayer: (id: number) =>
    request<GroupBuyExport>(`/group-buys/${id}/export/tcgplayer`),
};

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}
