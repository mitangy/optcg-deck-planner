/** Planner ↔ FastAPI: friends, sharing, spares and trades (#703). Shapes follow the API contract exactly. */
import { request, type DeckDetail, type User } from "../api";

export type Friend = { user_id: number; username: string };
export type FriendRequest = { user_id: number; username: string };
/** GET /friends also returns duel presence and invites; the planner ignores them. */
export type FriendsState = { friends: Friend[]; incoming: FriendRequest[]; outgoing: FriendRequest[] };

export type SharingScope = "friends" | "off";
export type Sharing = {
  decks: SharingScope;
  collection: SharingScope;
  trades_open: boolean;
  show_values: boolean;
  prompted: boolean;
};
export type SharingUpdate = Partial<Omit<Sharing, "prompted">>;

export type FriendProfile = {
  user_id: number;
  username: string;
  decks_shared: boolean;
  collection_shared: boolean;
  trades_open: boolean;
  deck_count: number | null;
  unique_cards: number | null;
  total_copies: number | null;
  total_value: number | null;
  spare_cards: number | null;
};

export type FriendDeckSummary = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name: string | null;
  leader_image_url: string;
  total_cards: number;
  main_cards: number;
};

export type FriendDeckCard = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  needed: number;
  image_url: string;
  market_price: number | null;
  my_owned: number;
  my_still_need: number;
};

export type FriendDeckDetail = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name: string | null;
  leader_image_url: string;
  main_cards: number;
  cards: FriendDeckCard[];
  my_missing_copies: number;
  my_missing_cost: number | null;
};

export type FriendOwnedItem = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  owned: number;
  alts_owned: number;
  market_price: number | null;
  image_url: string;
  value: number | null;
  spare: number;
};

export type FriendCollection = {
  items: FriendOwnedItem[];
  unique_cards: number;
  total_copies: number;
  total_value: number | null;
};

export type SparePrinting = { product_id: number; label: string; image_url: string; owned: number };
export type SpareItem = {
  card_id: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number | string | null;
  image_url: string;
  market_price: number | null;
  spare: number;
  want: number;
  printings: SparePrinting[];
};
export type FriendSpares = { their_spares: SpareItem[]; you_need: SpareItem[]; they_need: SpareItem[] };
export type MySpareItem = SpareItem & { keep_qty: number };

export type TradeSide = "give" | "get";
export type TradeLineIn = { side: TradeSide; card_id: string; product_id: number | null; qty: number };
export type TradeLine = {
  side: TradeSide;
  card_id: string;
  product_id: number | null;
  qty: number;
  name: string;
  image_url: string;
  market_price: number | null;
  printing_label: string | null;
};
export type TradeStatus = "pending" | "countered" | "accepted" | "declined" | "cancelled" | "completed" | "expired";
export type Trade = {
  id: number;
  from_user_id: number;
  from_username: string;
  to_user_id: number;
  to_username: string;
  status: TradeStatus;
  message: string;
  parent_offer_id: number | null;
  /** Unix seconds. */
  created_at: number;
  responded_at: number | null;
  completed_at: number | null;
  expires_at: number;
  lines: TradeLine[];
  /** Sums of qty × market price per side, from the sender's view; null when a line has no price. */
  give_value: number | null;
  get_value: number | null;
  i_am_sender: boolean;
  my_applied: boolean;
  other_applied: boolean;
};
export type TradesOut = { incoming: Trade[]; outgoing: Trade[]; active: Trade[]; history: Trade[] };
export type TradesSummary = { incoming_pending: number; active: number };

const json = (body: unknown) => JSON.stringify(body);

export const friendsApi = {
  suggestUsername: () => request<{ username: string }>("/auth/me/username-suggestion"),
  setUsername: (username: string) => request<User>("/auth/me/username", { method: "PATCH", body: json({ username }) }),

  list: () => request<FriendsState>("/friends"),
  sendRequest: (username: string) =>
    request<{ status: "pending" | "accepted" }>("/friends/requests", { method: "POST", body: json({ username: username.trim() }) }),
  accept: (userId: number) => request<unknown>(`/friends/requests/${userId}/accept`, { method: "POST" }),
  /** Unfriend, decline or cancel a request. */
  remove: (userId: number) => request<unknown>(`/friends/${userId}`, { method: "DELETE" }),

  sharing: () => request<Sharing>("/me/sharing"),
  setSharing: (body: SharingUpdate) => request<Sharing>("/me/sharing", { method: "PUT", body: json(body) }),
  setDeckHidden: (deckId: number, hidden: boolean) =>
    request<DeckDetail>(`/decks/${deckId}`, { method: "PATCH", body: json({ hidden_from_friends: hidden }) }),

  profile: (id: number) => request<FriendProfile>(`/friends/${id}/profile`),
  decks: (id: number) => request<FriendDeckSummary[]>(`/friends/${id}/decks`),
  deck: (id: number, deckId: number) => request<FriendDeckDetail>(`/friends/${id}/decks/${deckId}`),
  copyDeck: (id: number, deckId: number) => request<DeckDetail>(`/friends/${id}/decks/${deckId}/copy`, { method: "POST" }),
  collection: (id: number) => request<FriendCollection>(`/friends/${id}/collection`),
  spares: (id: number) => request<FriendSpares>(`/friends/${id}/spares`),

  mySpares: () => request<{ items: MySpareItem[] }>("/me/spares"),
  setKeep: (cardId: string, keepQty: number) =>
    request<{ card_id: string; keep_qty: number; spare: number }>(`/me/trade-keep/${encodeURIComponent(cardId)}`, {
      method: "PUT",
      body: json({ keep_qty: keepQty }),
    }),

  trades: () => request<TradesOut>("/trades"),
  tradesSummary: () => request<TradesSummary>("/trades/summary"),
  sendTrade: (body: { to_user_id: number; message: string; lines: TradeLineIn[] }) =>
    request<Trade>("/trades", { method: "POST", body: json(body) }),
  acceptTrade: (id: number) => request<Trade>(`/trades/${id}/accept`, { method: "POST" }),
  declineTrade: (id: number) => request<Trade>(`/trades/${id}/decline`, { method: "POST" }),
  cancelTrade: (id: number) => request<Trade>(`/trades/${id}/cancel`, { method: "POST" }),
  counterTrade: (id: number, body: { message: string; lines: TradeLineIn[] }) =>
    request<Trade>(`/trades/${id}/counter`, { method: "POST", body: json(body) }),
  completeTrade: (id: number) => request<Trade>(`/trades/${id}/complete`, { method: "POST" }),
  applyTrade: (id: number) => request<Trade>(`/trades/${id}/apply`, { method: "POST" }),
  undoApplyTrade: (id: number) => request<Trade>(`/trades/${id}/apply`, { method: "DELETE" }),
};
