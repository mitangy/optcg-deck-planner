/**
 * Every React Query key in the planner. A key is `[domain, ...parts]`; `.all()` is the bare-domain prefix that
 * invalidations and optimistic `setQueriesData` use to reach every specific key under it. A hand-typed literal
 * that misspells a domain silently stops matching, so keys are built here and nowhere else.
 */
export const qk = {
  /** The session (User or null). Read it through `useMe`, which also writes the signed-in hint (#914). */
  me: () => ["me"] as const,

  decks: () => ["decks"] as const,
  deck: {
    all: () => ["deck"] as const,
    /** Prefix for one deck's detail under any Include-decks filter. */
    byId: (deckId: number) => ["deck", deckId] as const,
    /** `savedDeckIds` is the viewer's saved Include-decks filter; undefined (all decks) keeps the plain key. */
    detail: (deckId: number, savedDeckIds?: number[]) =>
      savedDeckIds ? (["deck", deckId, savedDeckIds] as const) : (["deck", deckId] as const),
  },

  shopping: {
    all: () => ["shopping"] as const,
    /** The last slot is the Extra copies checkbox (#1184); optimistic Extra copy edits skip lists fetched with it off. */
    list: (deckIds: number[], includeExtras: boolean, showCollector = true) =>
      ["shopping", deckIds, includeExtras, showCollector] as const,
    /** Every card on the list, for the lightbox. */
    full: (deckIds?: number[]) => (deckIds ? (["shopping", "all", deckIds] as const) : (["shopping", "all"] as const)),
    leaderArtFallback: () => ["shopping", "leader-art-fallback"] as const,
  },

  owned: {
    all: () => ["owned"] as const,
    collection: (savedDeckIds?: number[]) => (savedDeckIds ? (["owned", savedDeckIds] as const) : (["owned"] as const)),
  },

  groupBuys: () => ["group-buys"] as const,
  groupBuy: {
    all: () => ["group-buy"] as const,
    detail: (groupId: number) => ["group-buy", groupId] as const,
    invite: (token: string) => ["group-buy-invite", token] as const,
    publicView: (token: string) => ["public-group-buy", token] as const,
  },

  share: {
    shopping: () => ["share", "shopping"] as const,
    /** Owned counts on a shared deck come from whoever views it, so the viewer is part of the key. */
    public: (token: string, viewerId: number | null) => ["public-share", token, viewerId] as const,
  },

  scanSamples: {
    all: () => ["scan-samples"] as const,
    mine: () => ["scan-samples", "mine"] as const,
  },

  priceAlerts: () => ["price-alerts"] as const,
  notifications: () => ["notifications"] as const,
  cardPrintings: (cardId: string) => ["card-printings", cardId] as const,
  recentSales: (productId: number) => ["recent-sales", productId] as const,
  priceHistory: (cardId: string, productId: number) => ["price-history", cardId, productId] as const,

  catalogSearch: {
    all: () => ["catalog-search"] as const,
    query: (q: string, color: string, cardType: string, showAltArts: boolean) =>
      ["catalog-search", q, color, cardType, showAltArts] as const,
  },
  catalogDon: (q: string) => ["catalog-don", q] as const,

  meta: {
    leaders: (days: number) => ["meta", "leaders", days] as const,
    decks: (leaderId: string, days: number, top: number) => ["meta", "decks", leaderId, days, top] as const,
    card: (cardId: string, days: number) => ["meta", "card", cardId, days] as const,
  },

  sharing: () => ["sharing"] as const,
  usernameSuggestion: () => ["username-suggestion"] as const,
  friends: () => ["friends"] as const,
  friend: {
    all: () => ["friend"] as const,
    profile: (friendId: number | undefined) => ["friend", friendId, "profile"] as const,
    decks: (friendId: number) => ["friend", friendId, "decks"] as const,
    deck: (friendId: number | undefined, deckId: number) => ["friend", friendId, "deck", deckId] as const,
    collection: (friendId: number) => ["friend", friendId, "collection"] as const,
    /** Prefix for the spares under any Include-decks filter. */
    sparesAll: (friendId: number) => ["friend", friendId, "spares"] as const,
    spares: (friendId: number, deckIds?: number[]) =>
      deckIds ? (["friend", friendId, "spares", deckIds] as const) : (["friend", friendId, "spares"] as const),
  },
  trades: () => ["trades"] as const,
  tradesSummary: () => ["trades-summary"] as const,
  mySpares: () => ["my-spares"] as const,
};
