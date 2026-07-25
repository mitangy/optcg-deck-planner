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
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type User = { id: number; email: string; name: string };

export type DeckSummary = {
  id: number;
  name: string;
  leader_card_id: string | null;
  card_count: number;
  total_cards: number;
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
  section: "main" | "additional" | string;
  alt_arts: PrintingView[];
};

export type DeckDetail = {
  id: number;
  name: string;
  leader_card_id: string | null;
  leader_name: string | null;
  prior_decks: string[];
  cards: CardView[];
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
  used_in: string[];
  alt_arts: PrintingView[];
};

export type ShoppingResponse = {
  items: ShoppingItem[];
  cards_still_needed: number;
  remaining_market: number;
  unique_cards: number;
};

export const api = {
  apiUrl: API_URL,
  me: () => request<User | null>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
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
};

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}
