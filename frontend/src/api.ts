import { formatMoney } from "@optcg/card-core";
import { readFirstTouch } from "@optcg/ui/firstTouch";
import { API_URL, LONG_TIMEOUT_MS, request } from "./apiClient";

export type User = {
  id: number;
  email: string;
  name: string;
  sum_across_leaders?: boolean;
  username?: string | null;
  share_scans?: boolean;
};

export type ScanSampleUpload = {
  image: string;
  predicted_id: string | null;
  confidence: "sure" | "check" | "none";
  final_id: string;
  label: "confirmed" | "corrected";
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
  owned_copies?: number;
  /** Dollars left to finish the deck, the same number the deck page shows as "left". */
  remaining_cost?: number | null;
  sort_order: number;
  is_main?: boolean;
  hidden_from_friends?: boolean;
  cards?: { card_id: string; name: string; qty: number }[];
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
  wanted?: number;
  owned?: number;
  collector?: number;
};

export type CollectorLine = {
  product_id: number;
  label: string;
  image_url: string | null;
  market_price: number | null;
  want: number;
  have: number;
  still_need: number;
  remaining_cost: number | null;
};

export type AlertDirection = "below" | "above";

export type PriceAlert = {
  id: number;
  card_id: string;
  product_id: number;
  card_name: string;
  art_name: string;
  image_url: string;
  tcgplayer_url: string;
  is_alt: boolean;
  current_price: number | null;
  target_price: number;
  direction: AlertDirection;
  notify_email: boolean;
  notify_app: boolean;
  paused: boolean;
  armed: boolean;
  met_now: boolean;
  triggered_at: string | null;
  triggered_price?: number | null;
  created_at: string;
};

export type PriceAlertsResponse = { alerts: PriceAlert[]; email_enabled: boolean };

export type PriceAlertInput = {
  card_id: string;
  product_id: number;
  target_price: number;
  direction: AlertDirection;
  notify_email?: boolean;
  notify_app?: boolean;
};

export type PriceAlertPatch = Partial<
  Pick<PriceAlert, "target_price" | "direction" | "notify_email" | "notify_app" | "paused">
>;

export type AppNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  card_id: string | null;
  product_id: number | null;
  price: number | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationsResponse = { items: AppNotification[]; unread: number };

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
  alt_product_id?: number | null;
  owned?: number;
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
  alts_owned?: number;
  still_need: number;
  earlier_leaders_need?: number;
  earlier_leaders?: string[];
  market_price: number | null;
  low_price: number | null;
  image_url: string;
  tcgplayer_url: string;
  product_id?: number | null;
  section: "main" | "additional" | "don" | string;
  alt_arts: PrintingView[];
  display_art?: number | null;
  collector_want?: number;
};

export type DeckDetail = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name: string | null;
  prior_decks: string[];
  is_main?: boolean;
  cards: CardView[];
  main_cards?: number;
  don_cards?: number;
  hidden_from_friends?: boolean;
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
  alts_owned?: number;
  still_need: number;
  market_price: number | null;
  low_price: number | null;
  remaining_cost: number | null;
  image_url: string;
  tcgplayer_url: string;
  product_id?: number | null;
  used_in: string[];
  alt_arts: PrintingView[];
  display_art?: number | null;
  deck_sort_key?: string;
  primary_leader_card_id?: string | null;
  primary_leader_name?: string | null;
  leader_count?: number;
  need_by_leader?: { label: string; need: number }[];
  need_summed?: boolean;
  extra_qty?: number;
  deck_need?: number;
  collector_wants?: CollectorLine[];
  in_group_buy?: number;
  group_buys?: { group_buy_id: number; title: string; qty: number; ordered: boolean }[];
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

export type PriceHistoryResponse = {
  card_id: string;
  product_id: number;
  name: string;
  group_name: string;
  released: string | null;
  rarity?: string | null;
  current: number | null;
  points: [string, number][];
  reprints?: string[];
};

export type ShoppingResponse = {
  items: ShoppingItem[];
  cards_still_needed: number;
  remaining_market: number;
  unique_cards: number;
  collector_copies?: number;
};

export type OwnedCard = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  owned: number;
  alts_owned?: number;
  market_price: number | null;
  low_price: number | null;
  value: number | null;
  image_url: string;
  tcgplayer_url: string;
  product_id?: number | null;
  used_in: string[];
  buying?: number;
  alt_arts?: PrintingView[];
  display_art?: number | null;
};

export type OwnedCollectionResponse = {
  items: OwnedCard[];
  unique_cards: number;
  total_copies: number;
  total_value: number;
  unpriced_cards: number;
};

export type ShareInfo = {
  token: string;
  kind: string;
  deck_id: number | null;
  deck_ids: number[] | null;
  include_extras?: boolean;
  path: string;
};

export type PublicShoppingResponse = ShoppingResponse & {
  owner_name: string;
  kind: string;
  deck_name: string | null;
  viewer_signed_in?: boolean;
  viewer_is_owner?: boolean;
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
  include_singles?: boolean;
  include_extra_copies?: boolean;
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

export type GroupBuyArtWant = { product_id: number; user_id: number; qty: number };

export type GroupBuyMyExtra = {
  product_id: number;
  name: string;
  market_price: number | null;
  wanted: number;
  skipped: number;
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
  base_image_url?: string;
  members: GroupBuyMemberQty[];
  alt_arts: PrintingView[];
  art_wants?: GroupBuyArtWant[];
  display_art?: number | null;
  my_qty: number;
  my_suggested_qty: number;
  my_is_custom: boolean;
  my_excluded?: boolean;
  my_need?: number;
  my_used_in?: string[];
  my_deck_qty?: number;
  my_extras?: GroupBuyMyExtra[];
  /** Copies in a seller order, how many of those arrived, and how many are in no order yet (#1418). */
  in_order?: number;
  arrived?: number;
  not_ordered?: number;
  my_in_order?: number;
  my_arrived?: number;
  my_not_ordered?: number;
};

export type GroupBuyOrderStatus = "on_the_way" | "partial" | "arrived";

export type GroupBuyOrderAllocation = { user_id: number; display_name: string; qty: number; qty_arrived: number };

export type GroupBuyOrderLine = {
  id: number;
  card_id: string;
  name: string;
  product_id: number | null;
  qty_ordered: number;
  qty_arrived: number;
  qty_extra: number;
  allocations: GroupBuyOrderAllocation[];
};

export type GroupBuyOrder = {
  id: number;
  seller_name: string;
  status: GroupBuyOrderStatus | string;
  qty_ordered: number;
  qty_allocated: number;
  qty_arrived: number;
  qty_extra: number;
  arrived_at: string | null;
  created_at: string;
  version: number;
  /** Host only; blank for members. */
  order_number: string;
  tracking_url: string;
  receipt_text: string;
  lines: GroupBuyOrderLine[];
};

export type GroupBuyOrderCreate = {
  order_number?: string;
  seller_name?: string;
  tracking_url?: string;
  receipt_text?: string;
  lines?: { card_id: string; product_id?: number | null; qty: number }[];
  mark_arrived?: boolean;
};

export type GroupBuyOrderPreview = {
  lines: {
    card_id: string;
    name: string;
    product_id: number | null;
    qty: number;
    allocations: { user_id: number; display_name: string; qty: number }[];
    qty_extra: number;
  }[];
  unmatched: GroupBuyReceiptUnmatched[];
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
  orders?: GroupBuyOrder[];
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
  market_price?: number | null;
};

export type MetaDeck = {
  id: number;
  event_id: string;
  event: string;
  event_url: string;
  date: string;
  set_label?: string | null;
  players: number;
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  cards: MetaDeckCard[];
  card_count: number;
  text: string;
};

export type MetaDecksResponse = {
  leader_id: string;
  name: string;
  image_url: string;
  leader_market_price?: number | null;
  decks: MetaDeck[];
};

export type CardPagePrinting = {
  product_id: number;
  name: string;
  market_price: number | null;
  image_url: string;
  tcgplayer_url: string;
  group_name: string;
  is_special: boolean;
};

export type CardPageLeader = {
  leader_id: string;
  name: string;
  color: string;
  image_url: string;
  leader_decks: number;
  decks_with_card: number;
  rate: number;
  average_copies: number;
};

export type CardPageFinish = {
  id: number;
  event: string;
  event_url: string;
  date: string;
  players: number;
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  leader_id: string;
  leader_name: string;
  leader_image_url: string;
  copies: number;
};

export type CardPageUsage = {
  days: number;
  min_players: number;
  events: number;
  total_decks: number;
  is_leader: boolean;
  decks_with_card: number;
  rate: number;
  average_copies: number | null;
  leaders: CardPageLeader[];
  top_decks: CardPageFinish[];
  source: string;
  source_url: string;
};

export type CardPageResponse = {
  card: {
    card_id: string;
    name: string;
    rarity: string;
    color: string;
    card_type: string;
    cost: string | null;
    group_name: string;
    image_url: string;
    tcgplayer_url: string;
    market_price: number | null;
  };
  printings: CardPagePrinting[];
  usage: CardPageUsage;
};

export const api = {
  apiUrl: API_URL,
  me: () => request<User | null>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  updatePreferences: (body: { sum_across_leaders?: boolean; share_scans?: boolean }) =>
    request<User>("/preferences", { method: "PATCH", body: JSON.stringify(body) }),
  claim: (ticket: string) =>
    request<User>("/auth/claim", {
      method: "POST",
      body: JSON.stringify({ ticket, source: readFirstTouch() }),
    }),
  devLogin: () => request<User>("/auth/dev-login", { method: "POST" }),
  googleLoginUrl: () => `${API_URL}/auth/google`,
  metaLeaders: (days: number) => request<MetaLeadersResponse>(`/meta/leaders?days=${days}`),
  metaDecks: (leader: string, days: number, top: number) =>
    request<MetaDecksResponse>(
      `/meta/decks?leader=${encodeURIComponent(leader)}&days=${days}&top=${top}&limit=50`,
    ),
  cardDetail: (cardId: string, days: number) =>
    request<CardPageResponse>(`/meta/cards/${encodeURIComponent(cardId)}?days=${days}`),
  decks: () => request<DeckSummary[]>("/decks"),
  /** Same list with "share between leaders" counted the way the Shopping deck filter says (see `deck`). */
  decksForFilter: (deckIds: number[]) => {
    const params = new URLSearchParams();
    for (const d of deckIds) params.append("deck_ids", String(d));
    return request<DeckSummary[]>(`/decks?${params.toString()}`);
  },
  deck: (id: number, deckIds?: number[]) => {
    const params = new URLSearchParams();
    for (const d of deckIds ?? []) params.append("deck_ids", String(d));
    const qs = params.toString();
    return request<DeckDetail>(`/decks/${id}${qs ? `?${qs}` : ""}`);
  },
  createDeck: (name: string, decklist: string) =>
    request<DeckSummary>("/decks", {
      method: "POST",
      body: JSON.stringify({ name, decklist }),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  replaceDeckList: (id: number, decklist: string) =>
    request<DeckDetail>(`/decks/${id}/decklist`, {
      method: "PUT",
      body: JSON.stringify({ decklist }),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  deleteDeck: (id: number) =>
    request<{ ok: boolean }>(`/decks/${id}`, { method: "DELETE" }),
  renameDeck: (id: number, name: string) =>
    request<DeckDetail>(`/decks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
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
  setAltOwned: (cardId: string, productId: number, qty: number) =>
    request<{ card_id: string; product_id: number; qty: number }>(
      `/owned/${encodeURIComponent(cardId)}/printings/${productId}`,
      {
        method: "PUT",
        body: JSON.stringify({ qty }),
      },
    ),
  setCollectorWant: (cardId: string, productId: number, qty: number) =>
    request<{ card_id: string; product_id: number; qty: number }>(
      `/cards/${encodeURIComponent(cardId)}/collector/${productId}`,
      {
        method: "PUT",
        body: JSON.stringify({ qty }),
      },
    ),
  setDisplayArt: (cardId: string, productId: number | null) =>
    request<{ card_id: string; product_id: number | null }>(
      `/owned/${encodeURIComponent(cardId)}/display`,
      {
        method: "PUT",
        body: JSON.stringify({ product_id: productId }),
      },
    ),
  priceAlerts: () => request<PriceAlertsResponse>("/price-alerts"),
  savePriceAlert: (body: PriceAlertInput) =>
    request<PriceAlert>("/price-alerts", { method: "POST", body: JSON.stringify(body) }),
  patchPriceAlert: (id: number, patch: PriceAlertPatch) =>
    request<PriceAlert>(`/price-alerts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePriceAlert: (id: number) => request<void>(`/price-alerts/${id}`, { method: "DELETE" }),
  cardPrintings: (cardId: string) =>
    request<PrintingView[]>(`/catalog/cards/${encodeURIComponent(cardId)}/printings`),
  notifications: (limit = 30) => request<NotificationsResponse>(`/notifications?limit=${limit}`),
  markNotificationsRead: (ids?: number[]) =>
    request<unknown>("/notifications/read", { method: "POST", body: JSON.stringify({ ids }) }),
  searchCatalog: (opts?: {
    q?: string;
    color?: string;
    card_type?: string;
    limit?: number;
    alts?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.alts) params.set("alts", "true");
    if (opts?.color) params.set("color", opts.color);
    if (opts?.card_type) params.set("card_type", opts.card_type);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<CatalogCardResult[]>(`/catalog/cards${qs ? `?${qs}` : ""}`);
  },
  shopping: (deckIds?: number[], opts?: { extras?: boolean; collector?: boolean }) => {
    const params = new URLSearchParams();
    for (const id of deckIds ?? []) params.append("deck_ids", String(id));
    // undefined = every deck; [] = none (#1208), which a missing deck_ids can't say.
    if (deckIds && deckIds.length === 0) params.set("no_decks", "true");
    if (opts?.extras === false) params.set("extras", "false");
    if (opts?.collector === false) params.set("collector", "false");
    const qs = params.toString();
    return request<ShoppingResponse>(`/shopping${qs ? `?${qs}` : ""}`);
  },
  ownedCollection: (deckIds?: number[]) => {
    const params = new URLSearchParams();
    for (const d of deckIds ?? []) params.append("deck_ids", String(d));
    const qs = params.toString();
    return request<OwnedCollectionResponse>(`/owned${qs ? `?${qs}` : ""}`);
  },
  setShoppingExtra: (cardId: string, qty: number) =>
    request<{ card_id: string; qty: number }>(`/shopping/extras/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ qty }),
    }),
  setOwned: (cardId: string, qty: number) =>
    request<{ card_id: string; qty: number }>(`/owned/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ qty }),
    }),
  addOwned: (items: { card_id: string; add: number }[]) =>
    request<{ items: { card_id: string; owned: number }[] }>("/owned/add", {
      method: "POST",
      body: JSON.stringify({ items }),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  uploadScanSamples: (items: ScanSampleUpload[]) =>
    request<{ saved: number }>("/scan-samples", {
      method: "POST",
      body: JSON.stringify({ items }),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  myScanSamples: () => request<{ count: number }>("/scan-samples/mine"),
  deleteMyScanSamples: () => request<{ deleted: number }>("/scan-samples/mine", { method: "DELETE" }),
  recentSales: (productId: number, limit = 3) =>
    request<RecentSalesResponse>(`/catalog/sales/${productId}?limit=${limit}`),
  priceHistory: (cardId: string, productId = 0) =>
    request<PriceHistoryResponse>(`/catalog/cards/${encodeURIComponent(cardId)}/price-history?product_id=${productId}`),
  getShoppingShare: () => request<ShareInfo | null>("/share/shopping"),
  createShare: (body: {
    kind?: string;
    deck_id?: number;
    deck_ids?: number[];
    include_extras?: boolean;
  }) =>
    request<ShareInfo>("/share", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeShare: (token: string) =>
    request<{ ok: boolean }>(`/share/${encodeURIComponent(token)}`, { method: "DELETE" }),
  publicShare: (token: string) =>
    request<PublicShoppingResponse>(`/public/share/${encodeURIComponent(token)}`),
  copySharedDeck: (token: string) =>
    request<DeckDetail>(`/public/share/${encodeURIComponent(token)}/copy`, { method: "POST" }),
  groupBuys: () => request<GroupBuySummary[]>("/group-buys"),
  groupBuy: (id: number) => request<GroupBuyDetail>(`/group-buys/${id}`),
  createGroupBuy: (body: { title?: string; deck_ids?: number[] }) =>
    request<GroupBuyDetail>("/group-buys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteGroupBuy: (id: number) =>
    request<{ ok: boolean }>(`/group-buys/${id}`, { method: "DELETE" }),
  leaveGroupBuy: (id: number) =>
    request<{ ok: boolean }>(`/group-buys/${id}/leave`, { method: "POST" }),
  joinGroupBuy: (token: string) =>
    request<GroupBuyDetail>(`/group-buys/join/${encodeURIComponent(token)}`, {
      method: "POST",
    }),
  groupBuyInvitePreview: (token: string) =>
    request<GroupBuyInvitePreview>(`/public/group-buys/${encodeURIComponent(token)}`),
  publicGroupBuy: (token: string) =>
    request<GroupBuyDetail>(`/public/group-buys/${encodeURIComponent(token)}/view`),
  resetGroupBuyInvite: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/invite/reset`, { method: "POST" }),
  setGroupBuyTitle: (id: number, title: string) =>
    request<GroupBuyDetail>(`/group-buys/${id}/title`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    }),
  updateGroupBuyContribution: (
    id: number,
    body: { deck_ids: number[] | null; include_singles?: boolean; include_extra_copies?: boolean },
  ) =>
    request<GroupBuyDetail>(`/group-buys/${id}/contribution`, {
      method: "PUT",
      body: JSON.stringify(body),
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
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  applyGroupBuyReceipt: (
    id: number,
    body: { receipt_text: string; card_ids?: string[] | null; allow_partial?: boolean },
  ) =>
    request<GroupBuyDetail>(`/group-buys/${id}/receipt/apply`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  undoGroupBuyReceiptApply: (id: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/receipt/undo`, { method: "POST" }),
  addGroupBuyOrder: (id: number, body: GroupBuyOrderCreate) =>
    request<{ order_id: number; unmatched: GroupBuyReceiptUnmatched[]; detail: GroupBuyDetail }>(`/group-buys/${id}/orders`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  previewGroupBuyOrder: (id: number, text: string) =>
    request<GroupBuyOrderPreview>(`/group-buys/${id}/orders/preview`, {
      method: "POST",
      body: JSON.stringify({ receipt_text: text }),
      timeoutMs: LONG_TIMEOUT_MS,
    }),
  deleteGroupBuyOrder: (id: number, orderId: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/orders/${orderId}`, { method: "DELETE" }),
  setGroupBuyOrderArrival: (
    id: number,
    orderId: number,
    body: { expected_version: number; all?: boolean; lines?: { line_id: number; qty_arrived: number }[] },
  ) =>
    request<GroupBuyDetail>(`/group-buys/${id}/orders/${orderId}/arrival`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  undoGroupBuyOrderArrival: (id: number, orderId: number, expected_version: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/orders/${orderId}/arrival/undo`, {
      method: "POST",
      body: JSON.stringify({ expected_version }),
    }),
  closeGroupBuy: (id: number) => request<GroupBuyDetail>(`/group-buys/${id}/close`, { method: "POST" }),
  setGroupBuyQty: (id: number, cardId: string, qty: number) =>
    request<GroupBuyDetail>(`/group-buys/${id}/quantities/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: JSON.stringify({ qty }),
    }),
  setGroupBuyExtraSkip: (id: number, cardId: string, productId: number, skip: number) =>
    request<GroupBuyDetail>(
      `/group-buys/${id}/extras/${encodeURIComponent(cardId)}/${productId}`,
      { method: "PUT", body: JSON.stringify({ skip }) },
    ),
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
  return formatMoney(n);
}
