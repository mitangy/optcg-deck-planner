const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
// Local: hit uvicorn directly. Production: same-origin /api (Vercel rewrite → Render)
// so the session cookie is first-party (required on mobile Safari).
const API_URL = configured || (import.meta.env.DEV ? "http://localhost:8000" : "/api");

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

export type User = { id: number; email: string; name: string };

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
  sort_order: number;
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
  owned: number;
  still_need: number;
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
  prior_decks: string[];
  cards: CardView[];
  main_cards?: number;
  don_cards?: number;
};

export type DeckOversizeDetail = {
  code: "deck_oversize";
  message: string;
  current: number;
  projected: number;
  limit: number;
};

export function isDeckOversizeError(
  err: unknown,
): err is Error & { status: number; detail: DeckOversizeDetail } {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { status?: number; detail?: unknown };
  if (e.status !== 409) return false;
  const d = e.detail;
  return (
    typeof d === "object" &&
    d !== null &&
    (d as DeckOversizeDetail).code === "deck_oversize"
  );
}

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
};

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
  cards_still_needed: number;
  remaining_market: number;
  card_cost?: number;
  shipping_share?: number;
  total_owed?: number;
};

export type GroupBuyOrderUpdate = {
  external_order_id?: string | null;
  order_notes?: string | null;
  shipping_cost?: number | null;
  shipping_split?: "equal" | "by_cost" | "by_copies" | null;
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
  tcgplayer_url: string;
  image_url: string;
  members: GroupBuyMemberQty[];
  alt_arts: PrintingView[];
  my_qty: number;
  my_suggested_qty: number;
  my_is_custom: boolean;
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
  cards_subtotal: number;
  grand_total: number;
};

export type GroupBuyInvitePreview = {
  title: string;
  host_name: string;
  member_count: number;
  status: string;
  invite_token: string;
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

export const api = {
  apiUrl: API_URL,
  me: () => request<User | null>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  claim: (ticket: string) =>
    request<User>("/auth/claim", { method: "POST", body: JSON.stringify({ ticket }) }),
  devLogin: () => request<User>("/auth/dev-login", { method: "POST" }),
  googleLoginUrl: () => `${API_URL}/auth/google`,
  decks: () => request<DeckSummary[]>("/decks"),
  deck: (id: number) => request<DeckDetail>(`/decks/${id}`),
  createDeck: (name: string, decklist: string) =>
    request<DeckSummary>("/decks", {
      method: "POST",
      body: JSON.stringify({ name, decklist }),
    }),
  deleteDeck: (id: number) =>
    request<{ ok: boolean }>(`/decks/${id}`, { method: "DELETE" }),
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
