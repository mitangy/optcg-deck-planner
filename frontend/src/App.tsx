import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  CatalogCardResult,
  CardView,
  DeckDetail,
  DeckSummary,
  money,
  needBreakdownLabel,
  OwnedCard,
  OwnedCollectionResponse,
  ShoppingItem,
  ShoppingResponse,
  User,
} from "./api";
import {
  blankMassEntryUrl,
  buildMassEntryExport,
} from "./tcgplayerMassEntry";
import {
  buildOptcgSimExport,
  downloadTextFile,
  optcgSimFilename,
} from "./optcgsimExport";
import { DUEL_URL, duelPlayUrl } from "./duelLink";
import { SiteFooter } from "@optcg/site-legal";
import { LegalPage } from "./LegalPage";
import { CardLayoutToggle, useCardLayout, type CardLayout } from "./CardLayout";
import {
  CardSearchInput,
  CollapsibleDrawer,
  CollapsibleFilters,
  COLOR_ORDER,
  compareCardOrder,
  matchesCardSearch,
  OWNED_DEFAULT_SORTS,
  OWNED_SORT_KEYS,
  OWNED_SORTS_KEY,
  SORT_LABELS,
  SortMenu,
  useCardSorts,
  usePersistedOpen,
  useShowAltArts,
  type SortKey,
} from "./cardListControls";
import { BuildTag } from "./BuildTag";
import { collectionTotals, patchOwnedCollection } from "./ownedCollection";
import { DOCK_QUERY, DeckStatsDock, useMediaQuery } from "./DeckStats";
import { deckDelta, type DeckStatsCard } from "@optcg/deck-analytics";
import { useDeckHints, useStatsAtlas } from "@optcg/deck-analytics/ui";
import { CompassIcon } from "./ThemeIcons";
import { HeadPopover, MoreIcon, ShareIcon } from "./HeadPopover";
import { ThemeToggle } from "./ThemeToggle";
import { cardImageUrl } from "./cardImage";
import { CardThumb, MobileCardMedia } from "./CardThumb";
import { CardScanner, useImageDrop } from "./CardScanner";
import ScanValidatePage from "./devtools/ScanValidatePage";
import { AltArtsRow, MarketPrice } from "./MarketPrice";
import {
  consumeLoginNext,
  GroupBuyDetailPage,
  GroupBuyJoinPage,
  GroupBuysPage,
  PublicGroupBuyPage,
  rememberLoginNext,
} from "./GroupBuys";
import {
  AuthLoadingSkeleton,
  DeckDetailSkeleton,
  DecksListSkeleton,
  GroupBuyDetailSkeleton,
  GroupBuysListSkeleton,
  InlineSkeleton,
  ShoppingListSkeleton,
} from "./Skeleton";

const SHOPPING_DECKS_KEY = "optcg_shopping_deck_ids";
/* v2: default-closed public link (resets older localStorage "open" so mobile chrome stays shorter). */
const DECK_PROGRESS_MODE_KEY = "optcg_deck_progress_mode";
const SHOPPING_SELECTED_KEY = "optcg_shopping_selected_cards";
const SHOW_SHOPPING_DONS_KEY = "optcg_show_shopping_dons";
const DECK_SEARCH_OPEN_KEY = "optcg_deck_search_open";
const DECK_DON_AVAILABLE_OPEN_KEY = "optcg_deck_don_available_open";

function isDonCardType(cardType: string | undefined | null): boolean {
  const t = (cardType || "").trim().toLowerCase();
  return t.startsWith("don") || t.includes("don!!");
}

function isDonCard(card: { card_type?: string | null; card_id?: string }): boolean {
  if (isDonCardType(card.card_type)) return true;
  return (card.card_id || "").toUpperCase().startsWith("DON-");
}

function ShareStatus({
  message,
  openUrl,
}: {
  message: string | null;
  openUrl?: string | null;
}) {
  if (!message) return null;
  return (
    <p className="share-banner" role="status">
      {message.startsWith("http") ? (
        <>
          Public link: <a href={message}>{message}</a>
        </>
      ) : (
        message
      )}
      {openUrl && !message.startsWith("http") ? (
        <>
          {" "}
          · <a href={openUrl}>Open</a>
        </>
      ) : null}
    </p>
  );
}

function ShoppingSharePanel({
  shareInfo,
  shareUrl,
  shareMsg,
  creating,
  revoking,
  onCopy,
  onCreateOrUpdate,
  onRevoke,
}: {
  shareInfo: { token: string } | null | undefined;
  shareUrl: string | null;
  shareMsg: string | null;
  creating: boolean;
  revoking: boolean;
  onCopy: () => void;
  onCreateOrUpdate: () => void;
  onRevoke: () => void;
}) {
  return (
    <HeadPopover label="Share" badge={shareInfo ? "On" : undefined} panelLabel="Public link">
      <div className="share-panel">
        <h3 className="head-popover-title">Public link</h3>
        <p className="muted share-panel-note">
          Anyone with the link can view this shopping list without signing in.
        </p>
        <div className="share-panel-actions">
          {shareInfo ? (
            <>
              <button type="button" className="btn secondary" onClick={onCopy}>
                Copy link
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={creating}
                onClick={onCreateOrUpdate}
              >
                {creating ? "Updating…" : "Update link"}
              </button>
              <button
                type="button"
                className="ghost danger"
                disabled={revoking}
                onClick={onRevoke}
              >
                Turn off
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn secondary"
              disabled={creating}
              onClick={onCreateOrUpdate}
            >
              {creating ? "Creating…" : "Create public link"}
            </button>
          )}
        </div>
        <ShareStatus message={shareMsg} openUrl={shareUrl} />
      </div>
    </HeadPopover>
  );
}

function DeckSharePanel({
  shareMsg,
  sharing,
  onShare,
}: {
  shareMsg: string | null;
  sharing: boolean;
  onShare: () => void;
}) {
  return (
    <div className="share-panel">
        <h3 className="head-popover-title">Public link</h3>
        <p className="muted share-panel-note">
          Anyone with the link can view this deck without signing in.
        </p>
        <div className="share-panel-actions">
          <button type="button" className="btn secondary" disabled={sharing} onClick={onShare}>
            {sharing ? "Sharing…" : shareMsg ? "Copy public link" : "Create public link"}
          </button>
        </div>
        <ShareStatus message={shareMsg} />
    </div>
  );
}

function DeckExportPanel({
  deck,
  exportMsg,
  onCopy,
  onDownload,
}: {
  deck: DeckDetail;
  exportMsg: string | null;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const exportable = useMemo(
    () => buildOptcgSimExport(deck.cards, { leaderCardId: deck.leader_card_id }),
    [deck],
  );
  const empty = exportable.lineCount === 0;
  const summary = empty
    ? "empty"
    : `${exportable.lineCount} line${exportable.lineCount === 1 ? "" : "s"}`;

  return (
    <div className="share-panel">
        <h3 className="head-popover-title">
          Export for OPTCGSim <span className="muted">· {summary}</span>
        </h3>
        <p className="muted share-panel-note">
          Copy or download a deck list in OPTCGSim format (
          <code>4xOP15-053</code>), then use Import from Clipboard in the simulator. DON!! cards are
          omitted.
        </p>
        <div className="share-panel-actions">
          <button type="button" className="btn secondary" disabled={empty} onClick={onCopy}>
            Copy deck list
          </button>
          <button type="button" className="btn secondary" disabled={empty} onClick={onDownload}>
            Download .txt
          </button>
        </div>
        <ShareStatus message={exportMsg} />
    </div>
  );
}

function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me });
}

function invalidateOwnedViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
  void qc.invalidateQueries({ queryKey: ["owned"] });
}

function invalidateAltWantViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
  void qc.invalidateQueries({ queryKey: ["decks"] });
  void qc.invalidateQueries({ queryKey: ["group-buy"] });
  void qc.invalidateQueries({ queryKey: ["group-buys"] });
}

function shoppingRemainingForItem(item: {
  still_need: number;
  product_id?: number | null;
  market_price: number | null;
  alt_arts?: { product_id: number; wanted?: number; market_price: number | null }[];
}): number | null {
  const still = item.still_need;
  if (still <= 0) return 0;
  let remaining = still;
  let total = 0;
  let missingPrice = false;
  for (const alt of item.alt_arts ?? []) {
    if (remaining <= 0) break;
    const want = alt.wanted ?? 0;
    const take = Math.min(Math.max(0, want), remaining);
    if (take <= 0) continue;
    if (alt.market_price == null) missingPrice = true;
    else total += take * alt.market_price;
    remaining -= take;
  }
  if (remaining > 0) {
    if (item.market_price == null) missingPrice = true;
    else total += remaining * item.market_price;
  }
  if (missingPrice) return null;
  return Math.round(total * 100) / 100;
}

function applyAltWantOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  cardId: string,
  productId: number,
  qty: number,
) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: ["shopping"] }, (old) => {
    if (!old) return old;
    let cardsStill = 0;
    let remaining = 0;
    const items = old.items.map((item) => {
      if (item.card_id.toUpperCase() !== id) {
        cardsStill += item.still_need;
        if (item.remaining_cost != null) remaining += item.remaining_cost;
        return item;
      }
      const alt_arts = (item.alt_arts ?? []).map((a) =>
        a.product_id === productId ? { ...a, wanted: qty } : a,
      );
      const patched = { ...item, alt_arts, remaining_cost: shoppingRemainingForItem({ ...item, alt_arts }) };
      cardsStill += patched.still_need;
      if (patched.remaining_cost != null) remaining += patched.remaining_cost;
      return patched;
    });
    return {
      ...old,
      items,
      cards_still_needed: cardsStill,
      remaining_market: Math.round(remaining * 100) / 100,
    };
  });
  qc.setQueriesData<DeckDetail>({ queryKey: ["deck"] }, (old) => {
    if (!old) return old;
    return {
      ...old,
      cards: old.cards.map((card) => {
        if (card.card_id.toUpperCase() !== id) return card;
        return {
          ...card,
          alt_arts: (card.alt_arts ?? []).map((a) =>
            a.product_id === productId ? { ...a, wanted: qty } : a,
          ),
        };
      }),
    };
  });
}

function patchOwnedQty(cardId: string, qty: number, need: number, market: number | null | undefined) {
  const still = Math.max(0, need - qty);
  const remaining =
    market != null && !Number.isNaN(market) ? Math.round(still * market * 100) / 100 : null;
  return { owned: qty, still_need: still, remaining_cost: remaining };
}

/** "4 go to Luffy first" when earlier leaders use some of the owned copies. */
function OwnedClaimNote({ card }: { card: CardView }) {
  const earlier = card.earlier_leaders_need ?? 0;
  const claimed = Math.min(card.owned, earlier);
  if (claimed <= 0) return null;
  const leaders = (card.earlier_leaders ?? []).join(", ") || "earlier decks";
  const left = card.owned - claimed;
  return (
    <span
      className="owned-claim-note"
      title={`Copies needed is set to Separate per leader: owned copies go to leaders in deck order. ${leaders} need ${earlier} first, leaving ${left} of your ${card.owned} for this deck.`}
    >
      {claimed} go to {leaders} first
    </span>
  );
}

function shoppingListStats(data: {
  unique_cards?: number;
  cards_still_needed?: number;
  remaining_market?: number;
  items: { still_need: number }[];
} | null | undefined) {
  const items = data?.items ?? [];
  return {
    totalUnique: data?.unique_cards ?? items.length,
    uniqueStillNeeded: items.filter((i) => i.still_need > 0).length,
    totalStillNeeded: data?.cards_still_needed ?? 0,
    remainingMarket: data?.remaining_market,
  };
}

function formatShoppingListStats(data: {
  unique_cards?: number;
  cards_still_needed?: number;
  remaining_market?: number;
  items: { still_need: number }[];
} | null | undefined) {
  const { totalUnique, uniqueStillNeeded, totalStillNeeded, remainingMarket } = shoppingListStats(data);
  // Keep to one scannable line on mobile — avoid burying the card list below chrome.
  return (
    `${uniqueStillNeeded}/${totalUnique} uniques left · ${totalStillNeeded} copies · ` +
    `${money(remainingMarket)}`
  );
}

function ShoppingStatStrip({ data }: { data: Parameters<typeof shoppingListStats>[0] }) {
  const { totalUnique, uniqueStillNeeded, totalStillNeeded, remainingMarket } = shoppingListStats(data);
  return (
    <ul className="stat-strip" aria-label="Shopping totals">
      <li>
        <span className="stat-label">Cards left</span>
        <span className="stat-value">
          {uniqueStillNeeded}
          <small> / {totalUnique}</small>
        </span>
      </li>
      <li>
        <span className="stat-label">Copies</span>
        <span className="stat-value">{totalStillNeeded}</span>
      </li>
      <li>
        <span className="stat-label">Est. cost</span>
        <span className="stat-value gold">{money(remainingMarket)}</span>
      </li>
    </ul>
  );
}

function applyOwnedOptimistic(qc: ReturnType<typeof useQueryClient>, cardId: string, qty: number) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: ["shopping"] }, (old) => {
    if (!old) return old;
    let cardsStill = 0;
    let remaining = 0;
    const items = old.items.map((item) => {
      if (item.card_id.toUpperCase() !== id) {
        cardsStill += item.still_need;
        if (item.remaining_cost != null) remaining += item.remaining_cost;
        return item;
      }
      const patched = patchOwnedQty(id, qty, item.need, item.market_price);
      cardsStill += patched.still_need;
      if (patched.remaining_cost != null) remaining += patched.remaining_cost;
      return { ...item, ...patched };
    });
    return {
      ...old,
      items,
      cards_still_needed: cardsStill,
      remaining_market: Math.round(remaining * 100) / 100,
    };
  });
  qc.setQueriesData<OwnedCollectionResponse>({ queryKey: ["owned"] }, (old) =>
    old ? patchOwnedCollection(old, id, qty) : old,
  );
  qc.setQueriesData<DeckDetail>({ queryKey: ["deck"] }, (old) => {
    if (!old) return old;
    return {
      ...old,
      cards: old.cards.map((card) => {
        if (card.card_id.toUpperCase() !== id) return card;
        // Earlier leaders take their copies first in "Separate per leader" mode.
        const available = Math.max(0, qty - (card.earlier_leaders_need ?? 0));
        return { ...card, owned: qty, still_need: Math.max(0, card.needed - available) };
      }),
    };
  });
}

function Shell({ user, children }: { user: User; children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/login");
    },
  });
  const shortName = (user.name || user.email).split("@")[0];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <img
                className="brand-logo"
                src="/optcg-logo.png"
                alt="ONE PIECE CARD GAME"
                width={562}
                height={145}
              />
              <span>Planner</span>
            </Link>
          </div>
          <nav aria-label="Primary">
            <NavLink to="/" end>
              Shopping
            </NavLink>
            <NavLink to="/decks">Decks</NavLink>
            <NavLink to="/collection">Collection</NavLink>
            <NavLink to="/group-buys">Group buys</NavLink>
            <NavLink to="/import">Import</NavLink>
          </nav>
          <div className="user">
            <BuildTag />
            <a className="duel-nav-link" href={DUEL_URL} target="_blank" rel="noopener">
              Play Duel
            </a>
            <ThemeToggle />
            <span className="user-name" title={user.email}>
              {shortName}
            </span>
            <button type="button" className="ghost" onClick={() => logout.mutate()}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}

function LoginPage() {
  const { data: user, isLoading, refetch } = useMe();
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next) rememberLoginNext(next);
  }, []);

  useEffect(() => {
    // Prefer fragment (not sent to servers/Referer); fall back to ?ticket= for
    // older redirects still in flight during deploy.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const ticket = hashParams.get("ticket") || queryParams.get("ticket");
    if (!ticket) return;
    let cancelled = false;
    setClaiming(true);
    // Strip ticket from the address bar before the claim request.
    queryParams.delete("ticket");
    const q = queryParams.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    api
      .claim(ticket)
      .then(async () => {
        if (cancelled) return;
        const next = consumeLoginNext() || "/";
        window.history.replaceState({}, "", next);
        await refetch();
        navigate(next, { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        window.history.replaceState({}, "", "/login");
      })
      .finally(() => {
        if (!cancelled) setClaiming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, refetch]);

  if (!isLoading && user) {
    const next = consumeLoginNext() || "/";
    return <Navigate to={next} replace />;
  }
  if (claiming) return <AuthLoadingSkeleton label="Signing you in…" />;

  async function devLogin() {
    try {
      setErr(null);
      await api.devLogin();
      await refetch();
      const next = consumeLoginNext() || "/";
      navigate(next, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <img
          className="login-logo"
          src="/optcg-logo.png"
          alt="ONE PIECE CARD GAME"
          width={562}
          height={145}
        />
        <h1>OPTCG Tracker</h1>
        <p className="lede">
          Chart your decks, track what you own, and see what’s left to buy at market price.
        </p>
        <a className="btn primary" href={api.googleLoginUrl()}>
          Sign in with Google
        </a>
        {import.meta.env.DEV && (
          <button type="button" className="btn secondary" onClick={devLogin}>
            Dev login (local)
          </button>
        )}
        {err && <p className="error">{err}</p>}
        {import.meta.env.DEV && <p className="hint">API: {api.apiUrl}</p>}
        <BuildTag className="build-tag-login" />
      </div>
    </div>
  );
}

function OwnedInput({
  cardId,
  value,
  onSaved,
}: {
  cardId: string;
  value: number;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const serverValueRef = useRef(value);
  const pendingRef = useRef<number | null>(null);
  const draftNum = Number(draft);
  const displayQty = Number.isFinite(draftNum) ? Math.max(0, Math.floor(draftNum)) : 0;

  const mutation = useMutation({
    mutationFn: (n: number) => api.setOwned(cardId, n),
    onSuccess: (res) => {
      setErr(null);
      serverValueRef.current = res.qty;
      if (pendingRef.current === res.qty) pendingRef.current = null;
      applyOwnedOptimistic(qc, cardId, res.qty);
      if (!focused) setDraft(String(res.qty));
      onSaved();
    },
    onError: (e: Error) => {
      setErr(e.message);
      pendingRef.current = null;
      applyOwnedOptimistic(qc, cardId, serverValueRef.current);
      if (!focused) setDraft(String(serverValueRef.current));
    },
  });

  useEffect(() => {
    serverValueRef.current = value;
    // Don't clobber an in-progress edit or an optimistic value waiting on the server.
    if (focused || pendingRef.current !== null) return;
    setDraft(String(value));
  }, [value, cardId, focused]);

  function commit(next: number) {
    const n = Math.max(0, Math.floor(next));
    setDraft(String(n));
    if (n === serverValueRef.current && pendingRef.current === null) return;
    pendingRef.current = n;
    applyOwnedOptimistic(qc, cardId, n);
    mutation.mutate(n);
  }

  function parseDraft(): number | null {
    const trimmed = draft.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }

  return (
    <span className="owned-wrap">
      <button
        type="button"
        className="owned-btn"
        aria-label="Decrease owned"
        disabled={mutation.isPending || displayQty <= 0}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => commit(displayQty - 1)}
      >
        −
      </button>
      <input
        className="owned"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        title={err ?? undefined}
        disabled={mutation.isPending && !focused}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" || /^\d+$/.test(raw)) setDraft(raw);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseDraft();
          if (n == null) {
            setDraft(String(serverValueRef.current));
            return;
          }
          commit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(String(serverValueRef.current));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="owned-btn"
        aria-label="Increase owned"
        disabled={mutation.isPending}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => commit(displayQty + 1)}
      >
        +
      </button>
      {err && <span className="owned-err">!</span>}
    </span>
  );
}

/** Matches the shopping mobile breakpoint in styles.css (`max-width: 800px`). */
function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 800px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

function stopCardSelectBubble(e: { stopPropagation(): void }) {
  e.stopPropagation();
}

function loadShoppingDeckFilter(allIds: number[]): number[] | null {
  try {
    const raw = localStorage.getItem(SHOPPING_DECKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set(allIds);
    const filtered = parsed.filter((id) => allowed.has(id));
    return filtered.length ? filtered : null;
  } catch {
    return null;
  }
}

function loadSelectedCardIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOPPING_SELECTED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function loadShowShoppingDons(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_SHOPPING_DONS_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function ShoppingItemsView({
  items,
  layout,
  isNarrow,
  selectedCardIds,
  onToggleCard,
  allVisibleSelected,
  onToggleSelectVisible,
  showAltArts,
  altRow,
  usedInLabel,
  onOwnedSaved,
}: {
  items: ShoppingItem[];
  layout: CardLayout;
  isNarrow: boolean;
  selectedCardIds: Set<string>;
  onToggleCard: (cardId: string) => void;
  allVisibleSelected: boolean;
  onToggleSelectVisible: () => void;
  showAltArts: boolean;
  altRow: (item: ShoppingItem) => ReactNode;
  usedInLabel: (item: ShoppingItem) => string;
  onOwnedSaved: () => void;
}) {
  if (items.length === 0) return null;

  if (layout === "grid") {
    return (
      <div className="card-grid">
        {items.map((item: ShoppingItem) => {
          const checked = selectedCardIds.has(item.card_id);
          const tapToSelect = isNarrow;
          return (
            <article
              key={item.card_id}
              className={`grid-card-wrap${checked ? " selected-row" : ""}${tapToSelect ? " selectable" : ""}`}
              onClick={tapToSelect ? () => onToggleCard(item.card_id) : undefined}
              onKeyDown={
                tapToSelect
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleCard(item.card_id);
                      }
                    }
                  : undefined
              }
              role={tapToSelect ? "button" : undefined}
              tabIndex={tapToSelect ? 0 : undefined}
              aria-pressed={tapToSelect ? checked : undefined}
            >
              {!tapToSelect && (
                <label className="grid-card-select" onClick={stopCardSelectBubble}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCard(item.card_id)}
                    aria-label={`Select ${item.card_id}`}
                  />
                </label>
              )}
              <div className={`grid-card ${item.still_need > 0 ? "need" : "done"}`}>
                <div className="grid-card-media" onClick={stopCardSelectBubble}>
                  <CardThumb src={item.image_url || undefined} alt={item.name} />
                </div>
                <div className="grid-card-body">
                  <div className="card-id">{item.card_id}</div>
                  <div className="grid-card-name">{item.name}</div>
                  <div className="grid-card-meta muted">
                    {item.still_need}/{item.need} still needed
                    {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                  </div>
                  <div className="grid-card-price" onClick={stopCardSelectBubble}>
                    <MarketPrice price={item.market_price} productId={item.product_id} />
                  </div>
                  <div className="grid-card-owned" onClick={stopCardSelectBubble}>
                    <span>Owned</span>
                    <OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
                  </div>
                  {item.tcgplayer_url && (
                    <a
                      href={item.tcgplayer_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={stopCardSelectBubble}
                    >
                      TCGPlayer
                    </a>
                  )}
                  {showAltArts && (item.alt_arts?.length ?? 0) > 0 && (
                    <div className="grid-card-alts" onClick={stopCardSelectBubble}>
                      {altRow(item)}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table shopping-table">
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectVisible}
                  aria-label={allVisibleSelected ? "Deselect visible cards" : "Select visible cards"}
                />
              </th>
              <th>Card</th>
              <th>Owned</th>
              <th>Still needed</th>
              <th>Market</th>
              <th>Remaining</th>
              <th>Cost</th>
              {showAltArts && <th>Alt arts</th>}
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: ShoppingItem) => {
              const checked = selectedCardIds.has(item.card_id);
              return (
                <tr
                  key={item.card_id}
                  className={`${item.still_need > 0 ? "need" : "done"}${checked ? " selected-row" : ""}`}
                >
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCard(item.card_id)}
                      aria-label={`Select ${item.card_id}`}
                    />
                  </td>
                  <td className="card-cell">
                    <div className="card-cell-inner">
                      <CardThumb src={item.image_url || undefined} alt={item.name} />
                      <div>
                        <div className="card-id">{item.card_id}</div>
                        <div>{item.name}</div>
                        {item.tcgplayer_url && (
                          <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                            TCGPlayer
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
                  </td>
                  <td>
                    {item.still_need}/{item.need}
                  </td>
                  <td>
                    <MarketPrice price={item.market_price} productId={item.product_id} />
                  </td>
                  <td>{money(item.remaining_cost)}</td>
                  <td>{item.cost ?? "—"}</td>
                  {showAltArts && <td onClick={stopCardSelectBubble}>{altRow(item)}</td>}
                  <td className="used-in">{usedInLabel(item)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {items.map((item: ShoppingItem) => {
          const checked = selectedCardIds.has(item.card_id);
          return (
            <article
              key={item.card_id}
              className={`mobile-card selectable ${item.still_need > 0 ? "need" : "done"}${checked ? " selected-row" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={checked}
              aria-label={`${checked ? "Deselect" : "Select"} ${item.card_id}`}
              onClick={() => onToggleCard(item.card_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleCard(item.card_id);
                }
              }}
            >
              <div className="mobile-card-top">
                <div onClick={stopCardSelectBubble} onKeyDown={stopCardSelectBubble}>
                  <MobileCardMedia
                    src={item.image_url || undefined}
                    alt={item.name}
                    cost={item.cost}
                    rarity={item.rarity}
                  />
                </div>
                <div className="mobile-card-info">
                  <div className="card-id">{item.card_id}</div>
                  <div className="mobile-card-name">{item.name}</div>
                  <div className="mobile-card-meta">
                    {[item.color, `${item.still_need}/${item.need} still needed`]
                      .filter(Boolean)
                      .join(" · ")}
                    {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                  </div>
                  <div
                    className="mobile-card-price-row"
                    onClick={stopCardSelectBubble}
                    onKeyDown={stopCardSelectBubble}
                  >
                    <div className="mobile-card-price-main">
                      <span className="muted">Market</span>
                      <MarketPrice price={item.market_price} productId={item.product_id} />
                      {item.tcgplayer_url ? (
                        <a
                          href={item.tcgplayer_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={stopCardSelectBubble}
                        >
                          TCGPlayer
                        </a>
                      ) : null}
                    </div>
                    <div className="mobile-card-owned">
                      <span>Owned</span>
                      <OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
                    </div>
                  </div>
                </div>
              </div>
              {showAltArts && (item.alt_arts?.length ?? 0) > 0 && (
                <div
                  className="mobile-card-alts"
                  onClick={stopCardSelectBubble}
                  onKeyDown={stopCardSelectBubble}
                >
                  {altRow(item)}
                </div>
              )}
              {item.used_in.length > 0 && (
                <p className="used-in mobile-used-in">{usedInLabel(item)}</p>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function ShoppingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNarrow = useNarrowLayout();
  const decksQ = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const allDeckIds = useMemo(() => (decksQ.data ?? []).map((d) => d.id), [decksQ.data]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[] | null>(null);
  const [filterReady, setFilterReady] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => loadSelectedCardIds());
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!decksQ.data) return;
    const ids = decksQ.data.map((d) => d.id);
    const saved = loadShoppingDeckFilter(ids);
    setSelectedDeckIds(saved ?? ids);
    setFilterReady(true);
  }, [decksQ.data]);

  useEffect(() => {
    if (!filterReady || selectedDeckIds === null) return;
    localStorage.setItem(SHOPPING_DECKS_KEY, JSON.stringify(selectedDeckIds));
  }, [selectedDeckIds, filterReady]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOPPING_SELECTED_KEY, JSON.stringify([...selectedCardIds]));
    } catch {
      /* ignore */
    }
  }, [selectedCardIds]);

  const activeDeckIds = selectedDeckIds ?? allDeckIds;
  const shoppingKey = useMemo(
    () => [...activeDeckIds].sort((a, b) => a - b),
    [activeDeckIds],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["shopping", shoppingKey],
    queryFn: () => api.shopping(shoppingKey.length ? shoppingKey : undefined),
    enabled: filterReady && allDeckIds.length > 0,
  });
  const shareQ = useQuery({
    queryKey: ["share", "shopping"],
    queryFn: api.getShoppingShare,
    enabled: filterReady && allDeckIds.length > 0,
  });
  const meQ = useMe();
  const sumAcrossLeaders = Boolean(meQ.data?.sum_across_leaders);
  const setSumAcrossLeaders = useMutation({
    mutationFn: (value: boolean) => api.updatePreferences({ sum_across_leaders: value }),
    onMutate: (value) => {
      const prev = qc.getQueryData<User | null>(["me"]);
      qc.setQueryData<User | null>(["me"], (old) =>
        old ? { ...old, sum_across_leaders: value } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["me"], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      invalidateAltWantViews(qc);
    },
  });
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [showDons, setShowDons] = useState(loadShowShoppingDons);
  const shoppingUnavailableSorts = useMemo(() => ["user"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, shoppingUnavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [droppedImage, setDroppedImage] = useState<Blob | null>(null);
  const [pageDragging, setPageDragging] = useState(false);
  // Dropping a card image anywhere on this page opens the scanner, so the
  // dialog does not have to be open first for drag-and-drop to work.
  useImageDrop({
    enabled: !scanOpen,
    onImage: (blob) => {
      setDroppedImage(blob);
      setScanOpen(true);
    },
    onDragStateChange: setPageDragging,
  });
  const [altWantBusyKey, setAltWantBusyKey] = useState<string | null>(null);
  const [altWantErr, setAltWantErr] = useState<string | null>(null);
  const sortingByDeck = effectiveSorts.includes("deck");

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_SHOPPING_DONS_KEY, showDons ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showDons]);

  const changeShoppingAltWant = async (cardId: string, productId: number, qty: number) => {
    setAltWantErr(null);
    setAltWantBusyKey(`${cardId}:${productId}`);
    applyAltWantOptimistic(qc, cardId, productId, qty);
    try {
      const res = await api.setCardPrinting(
        cardId,
        productId,
        qty,
        activeDeckIds.length ? activeDeckIds : undefined,
      );
      applyAltWantOptimistic(qc, cardId, productId, res.qty);
      invalidateAltWantViews(qc);
    } catch (e) {
      setAltWantErr((e as Error).message);
      invalidateAltWantViews(qc);
    } finally {
      setAltWantBusyKey(null);
    }
  };

  const shoppingAltRow = (item: ShoppingItem) => (
    <AltArtsRow
      alts={item.alt_arts ?? []}
      cardNeeded={item.need}
      editable
      onWantChange={(productId, qty) => void changeShoppingAltWant(item.card_id, productId, qty)}
      busyProductId={
        altWantBusyKey?.startsWith(`${item.card_id}:`)
          ? Number(altWantBusyKey.slice(item.card_id.length + 1))
          : null
      }
    />
  );

  const filteredItems = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter((i) => i.still_need > 0);
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    list = [...list].sort((a, b) => compareCardOrder(a, b, effectiveSorts));
    return list;
  }, [data, onlyNeed, effectiveSorts, search]);

  const mainItems = useMemo(() => filteredItems.filter((i) => !isDonCard(i)), [filteredItems]);
  const donItems = useMemo(() => filteredItems.filter((i) => isDonCard(i)), [filteredItems]);
  const hasDonsInData = useMemo(() => (data?.items ?? []).some(isDonCard), [data]);
  const items = useMemo(
    () => (showDons ? [...mainItems, ...donItems] : mainItems),
    [mainItems, donItems, showDons],
  );

  const selectedItems = useMemo(() => {
    const byId = new Map((data?.items ?? []).map((i) => [i.card_id, i]));
    const list: ShoppingItem[] = [];
    for (const id of selectedCardIds) {
      const item = byId.get(id);
      if (item) list.push(item);
    }
    return list;
  }, [data, selectedCardIds]);

  const selectedTotals = useMemo(() => {
    let copies = 0;
    let total = 0;
    let priced = 0;
    let count = 0;
    for (const item of selectedItems) {
      count += 1;
      copies += item.still_need;
      if (item.remaining_cost != null) {
        total += item.remaining_cost;
        priced += 1;
      }
    }
    return { count, copies, total: Math.round(total * 100) / 100, priced };
  }, [selectedItems]);

  const massEntry = useMemo(() => buildMassEntryExport(selectedItems), [selectedItems]);

  async function copyMassEntryList(): Promise<boolean> {
    if (!massEntry.pasteText) {
      setExportMsg("Nothing to export — selected cards need copies.");
      return false;
    }
    try {
      await navigator.clipboard.writeText(massEntry.pasteText);
      return true;
    } catch {
      setExportMsg(massEntry.pasteText);
      return false;
    }
  }

  async function onCopyMassEntry() {
    const ok = await copyMassEntryList();
    if (!ok) return;
    const missing =
      massEntry.missingProductId > 0
        ? ` · ${massEntry.missingProductId} without product id (name fallback)`
        : "";
    setExportMsg(
      `Copied ${massEntry.includedCount} card${massEntry.includedCount === 1 ? "" : "s"} (${massEntry.copyCount} copies) for TCGPlayer Mass Entry${missing}`,
    );
  }

  async function onOpenMassEntry() {
    if (!massEntry.pasteText) {
      setExportMsg("Nothing to export — selected cards need copies.");
      return;
    }
    const copied = await copyMassEntryList();
    if (massEntry.url) {
      window.open(massEntry.url, "_blank", "noopener,noreferrer");
      setExportMsg(
        copied
          ? "Opened TCGPlayer Mass Entry (list copied as backup). Paste only if the form is empty, then Add to Cart → Optimize Cart."
          : "Opened TCGPlayer Mass Entry. Paste the list below if the cart is empty.",
      );
      return;
    }
    window.open(blankMassEntryUrl(), "_blank", "noopener,noreferrer");
    if (massEntry.withProductId === 0) {
      setExportMsg(
        copied
          ? "List copied. Paste into Mass Entry (One Piece Card Game). No product ids on these cards."
          : "Open Mass Entry, select One Piece Card Game, and paste the list below.",
      );
      return;
    }
    setExportMsg(
      copied
        ? "List too long for a direct link — copied. Paste into Mass Entry, then Add to Cart → Optimize Cart."
        : "List too long for a direct link. Paste the list below into Mass Entry.",
    );
  }

  const buyInPerson = useMutation({
    mutationFn: async (targets: { cardId: string; prevOwned: number; nextOwned: number; copies: number }[]) => {
      if (!targets.length) {
        throw new Error("Nothing to mark — selected cards already have enough owned.");
      }
      for (const t of targets) {
        applyOwnedOptimistic(qc, t.cardId, t.nextOwned);
      }
      const results = await Promise.allSettled(
        targets.map((t) => api.setOwned(t.cardId, t.nextOwned)),
      );
      const failed: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          failed.push(targets[i].cardId);
          applyOwnedOptimistic(qc, targets[i].cardId, targets[i].prevOwned);
        }
      });
      const copies = targets
        .filter((_, i) => results[i].status === "fulfilled")
        .reduce((sum, t) => sum + t.copies, 0);
      const ok = targets.length - failed.length;
      return { ok, failed, copies };
    },
    onSuccess: ({ ok, failed, copies }) => {
      void qc.invalidateQueries({ queryKey: ["shopping"] });
      if (failed.length) {
        setExportMsg(
          `Marked ${ok} card${ok === 1 ? "" : "s"} bought in person (${copies} copies). Failed: ${failed.join(", ")}`,
        );
        return;
      }
      setSelectedCardIds(new Set());
      setExportMsg(
        `Marked ${ok} card${ok === 1 ? "" : "s"} bought in person (${copies} copies added to Owned).`,
      );
    },
    onError: (e: Error) => setExportMsg(e.message),
  });

  function onBuyInPerson() {
    const targets = selectedItems
      .filter((item) => item.still_need > 0)
      .map((item) => ({
        cardId: item.card_id,
        prevOwned: item.owned,
        nextOwned: item.owned + item.still_need,
        copies: item.still_need,
      }));
    buyInPerson.mutate(targets);
  }

  const allVisibleSelected =
    items.length > 0 && items.every((i) => selectedCardIds.has(i.card_id));

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (onlyNeed) parts.push("Still need");
    if (showDons) parts.push("DON!!");
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (showAltArts) parts.push("Alt arts");
    if (layout === "grid") parts.push("Grid");
    if (sumAcrossLeaders) parts.push("Separate per leader");
    if (allDeckIds.length > 0 && activeDeckIds.length < allDeckIds.length) {
      parts.push(`${activeDeckIds.length}/${allDeckIds.length} decks`);
    }
    return parts.join(" · ");
  }, [
    onlyNeed,
    showDons,
    effectiveSorts,
    showAltArts,
    layout,
    sumAcrossLeaders,
    activeDeckIds.length,
    allDeckIds.length,
  ]);

  const createShare = useMutation({
    mutationFn: () =>
      api.createShare({
        kind: "shopping",
        deck_ids: activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds,
      }),
    onSuccess: async (info) => {
      await qc.invalidateQueries({ queryKey: ["share", "shopping"] });
      const url = `${window.location.origin}${info.path}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Public link copied");
      } catch {
        setShareMsg(url);
      }
    },
    onError: (e: Error) => setShareMsg(e.message),
  });

  const revokeShare = useMutation({
    mutationFn: (token: string) => api.revokeShare(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["share", "shopping"] });
      setShareMsg("Public link turned off");
    },
    onError: (e: Error) => setShareMsg(e.message),
  });

  const startGroupBuy = useMutation({
    mutationFn: () =>
      api.createGroupBuy({
        title: "Group buy",
        deck_ids: activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds,
      }),
    onSuccess: async (detail) => {
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      navigate(`/group-buys/${detail.id}`);
    },
    onError: (e: Error) => setExportMsg(e.message),
  });

  function usedInLabel(item: ShoppingItem): string {
    const decks = item.used_in.join(", ");
    const breakdown = needBreakdownLabel(item);
    if ((item.leader_count ?? 1) > 1) {
      const primary = item.primary_leader_name || item.primary_leader_card_id || "earliest deck";
      // The breakdown already says the card is shared; the sort note only
      // matters when grouping by deck.
      if (!breakdown) return `${decks} · shared (sorted under ${primary})`;
      return sortingByDeck ? `${decks} · ${breakdown} · sorted under ${primary}` : `${decks} · ${breakdown}`;
    }
    if (breakdown) return `${decks} · ${breakdown}`;
    if (sortingByDeck && item.primary_leader_name) {
      return `${decks} · ${item.primary_leader_name}`;
    }
    return decks;
  }

  function toggleDeck(id: number) {
    setSelectedDeckIds((prev) => {
      const current = prev ?? allDeckIds;
      if (current.includes(id)) {
        const next = current.filter((x) => x !== id);
        return next.length ? next : current;
      }
      return [...current, id];
    });
  }

  function selectAllDecks() {
    setSelectedDeckIds(allDeckIds);
  }

  function toggleCard(cardId: string) {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function toggleSelectVisible() {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const item of items) next.delete(item.card_id);
      } else {
        for (const item of items) next.add(item.card_id);
      }
      return next;
    });
  }

  if (decksQ.isLoading || (allDeckIds.length > 0 && !filterReady)) {
    return <ShoppingListSkeleton />;
  }
  if (decksQ.error) return <p className="error">{(decksQ.error as Error).message}</p>;
  if (allDeckIds.length === 0) {
    return (
      <section>
        <h1>Master Shopping</h1>
        <p className="muted">
          No decks yet. <Link to="/import">Import a deck</Link> to build your shopping list.
        </p>
        {/* Price lookup works without any decks — useful before you own a list. */}
        <p className="muted">
          Or{" "}
          <button type="button" className="ghost linkish" onClick={() => setScanOpen(true)}>
            scan a card
          </button>{" "}
          to check its market price.
        </p>
        {scanOpen && (
          <CardScanner
            items={[]}
            initialImage={droppedImage}
            onClose={() => {
              setScanOpen(false);
              setDroppedImage(null);
            }}
          />
        )}
      </section>
    );
  }
  if (isLoading) return <ShoppingListSkeleton />;
  if (error) return <p className="error">{(error as Error).message}</p>;

  const shareInfo = shareQ.data;
  const shareUrl = shareInfo ? `${window.location.origin}${shareInfo.path}` : null;

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">Across your decks</p>
          <h1>Master Shopping</h1>
          <ShoppingStatStrip data={data} />
        </div>
        <div className="page-head-actions">
          <ShoppingSharePanel
            shareInfo={shareInfo}
            shareUrl={shareUrl}
            shareMsg={shareMsg}
            creating={createShare.isPending}
            revoking={revokeShare.isPending}
            onCopy={async () => {
              if (!shareUrl) return;
              try {
                await navigator.clipboard.writeText(shareUrl);
                setShareMsg("Public link copied");
              } catch {
                setShareMsg(shareUrl);
              }
            }}
            onCreateOrUpdate={() => createShare.mutate()}
            onRevoke={() => {
              if (shareInfo) revokeShare.mutate(shareInfo.token);
            }}
          />
          <button
            type="button"
            className="btn secondary"
            disabled={startGroupBuy.isPending}
            onClick={() => startGroupBuy.mutate()}
          >
            {startGroupBuy.isPending ? "Starting…" : "Start group buy"}
          </button>
        </div>
      </div>

      {selectedTotals.count > 0 && (
        <div className="buy-bar">
          <div className="buy-bar-summary">
            <div>
              <strong>
                {selectedTotals.count} card{selectedTotals.count === 1 ? "" : "s"} selected
              </strong>
              <span className="muted">
                {" "}
                · {selectedTotals.copies} still needed · {money(selectedTotals.total)}
                {selectedTotals.priced < selectedTotals.count ? " (priced cards only)" : ""}
              </span>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSelectedCardIds(new Set());
                setExportMsg(null);
              }}
            >
              Clear
            </button>
          </div>
          <div className="buy-bar-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={massEntry.includedCount === 0 || buyInPerson.isPending}
              onClick={() => void onCopyMassEntry()}
            >
              Copy for TCGPlayer
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={massEntry.includedCount === 0 || buyInPerson.isPending}
              onClick={() => void onOpenMassEntry()}
            >
              Open Mass Entry
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={massEntry.includedCount === 0 || buyInPerson.isPending}
              onClick={onBuyInPerson}
            >
              {buyInPerson.isPending ? "Updating…" : "Buying in person"}
            </button>
          </div>
          {exportMsg ? (
            <p className="buy-bar-msg" role="status">
              {exportMsg}
            </p>
          ) : null}
        </div>
      )}
      {selectedTotals.count === 0 && exportMsg ? (
        <p className="buy-bar-msg buy-bar-msg-solo" role="status">
          {exportMsg}
        </p>
      ) : null}
      {altWantErr && <p className="error">{altWantErr}</p>}

      <div className="list-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <button type="button" className="ghost scan-open" onClick={() => setScanOpen(true)}>
            Scan
          </button>
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={filterSummary}>
          <div className="filters">
            <label>
              <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
              Still need only
            </label>
            <label>
              <input type="checkbox" checked={showDons} onChange={(e) => setShowDons(e.target.checked)} />
              Show DON!!
            </label>
            <SortMenu
              sorts={sorts}
              onChange={setSorts}
              onlyNeed={onlyNeed}
              unavailableKeys={shoppingUnavailableSorts}
            />
            <label>
              <input
                type="checkbox"
                checked={showAltArts}
                onChange={(e) => setShowAltArts(e.target.checked)}
              />
              Show alt arts
            </label>
          </div>
          <div className="deck-filter need-mode">
            <div className="deck-filter-head">
              <span id="need-mode-label">Copies needed</span>
            </div>
            <div className="layout-toggle" role="radiogroup" aria-labelledby="need-mode-label">
              {(
                [
                  [false, "Share between leaders"],
                  [true, "Separate per leader"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={sumAcrossLeaders === value}
                  className={sumAcrossLeaders === value ? "active" : ""}
                  disabled={!meQ.data || setSumAcrossLeaders.isPending}
                  onClick={() => {
                    if (sumAcrossLeaders !== value) setSumAcrossLeaders.mutate(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="need-mode-note muted">
              {sumAcrossLeaders
                ? "Each leader gets its own copies: 4 in a Luffy deck + 3 in a Sabo deck = 7 to buy. Owned copies fill leaders in deck order."
                : "One set of copies is moved between decks: 4 in a Luffy deck and 3 in a Sabo deck = 4 to buy."}{" "}
              Decks with the same leader always share. Also used for deck pages, your public link and group buys.
            </p>
          </div>
          {sortingByDeck && (
            <p className="sort-deck-note muted">
              Deck sort groups cards by leader (deck list order). Cards used by multiple leaders stay under
              their earliest deck&apos;s leader.
            </p>
          )}
          <div className="deck-filter">
            <div className="deck-filter-head">
              <span>Include decks</span>
              <button type="button" className="ghost" onClick={selectAllDecks}>
                Select all
              </button>
            </div>
            <div className="deck-filter-list">
              {(decksQ.data ?? []).map((d) => (
                <label key={d.id} className="deck-chip">
                  <input
                    type="checkbox"
                    checked={activeDeckIds.includes(d.id)}
                    onChange={() => toggleDeck(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
        </CollapsibleFilters>
      </div>

      {search.trim() && (
        <p className="search-result-note muted">
          Showing {items.length} match{items.length === 1 ? "" : "es"} for “{search.trim()}”
        </p>
      )}

      <ShoppingItemsView
        items={mainItems}
        layout={layout}
        isNarrow={isNarrow}
        selectedCardIds={selectedCardIds}
        onToggleCard={toggleCard}
        allVisibleSelected={allVisibleSelected}
        onToggleSelectVisible={toggleSelectVisible}
        showAltArts={showAltArts}
        altRow={shoppingAltRow}
        usedInLabel={usedInLabel}
        onOwnedSaved={() => invalidateOwnedViews(qc)}
      />

      {showDons && hasDonsInData && (
        <div className="shopping-don-section">
          <h2 className="don-heading">
            DON!!{donItems.length ? ` · ${donItems.length}` : ""}
          </h2>
          {donItems.length === 0 ? (
            <p className="muted">No DON!! cards match the current filters.</p>
          ) : (
            <ShoppingItemsView
              items={donItems}
              layout={layout}
              isNarrow={isNarrow}
              selectedCardIds={selectedCardIds}
              onToggleCard={toggleCard}
              allVisibleSelected={allVisibleSelected}
              onToggleSelectVisible={toggleSelectVisible}
              showAltArts={showAltArts}
              altRow={shoppingAltRow}
              usedInLabel={usedInLabel}
              onOwnedSaved={() => invalidateOwnedViews(qc)}
            />
          )}
        </div>
      )}
      {/* Confirms the page is receiving the drag, so a failure is legible as
          "not accepted" rather than "nothing happened". */}
      {pageDragging && !scanOpen && (
        <div className="page-drop-hint" role="status">
          Drop the card image to scan it
        </div>
      )}
      {scanOpen && (
        <CardScanner
          items={data?.items ?? []}
          initialImage={droppedImage}
          onClose={() => {
            setScanOpen(false);
            setDroppedImage(null);
          }}
        />
      )}
    </section>
  );
}

const COLLECTION_SHOW_DONS_KEY = "optcg_collection_show_dons";
const COLLECTION_SPARES_KEY = "optcg_collection_spares_only";
const COLLECTION_COLORS_KEY = "optcg_collection_colors";

function loadCollectionColors(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLECTION_COLORS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((c): c is string => COLOR_ORDER.includes(c as string)) : [];
  } catch {
    return [];
  }
}

function cardHasColor(card: { color: string }, colors: string[]): boolean {
  const parts = card.color.split(/[/,&]+/).map((p) => p.trim().toLowerCase());
  return colors.some((c) => parts.includes(c.toLowerCase()));
}

function CollectionStatStrip({ data }: { data: OwnedCollectionResponse | undefined }) {
  return (
    <ul className="stat-strip" aria-label="Collection totals">
      <li>
        <span className="stat-label">Cards</span>
        <span className="stat-value">{data?.unique_cards ?? 0}</span>
      </li>
      <li>
        <span className="stat-label">Copies</span>
        <span className="stat-value">{data?.total_copies ?? 0}</span>
      </li>
      <li>
        <span className="stat-label">Est. value</span>
        <span className="stat-value gold">
          {money(data?.total_value ?? 0)}
          {data?.unpriced_cards ? <small> + {data.unpriced_cards} unpriced</small> : null}
        </span>
      </li>
    </ul>
  );
}

function CollectionItemsView({
  items,
  layout,
  onOwnedSaved,
}: {
  items: OwnedCard[];
  layout: CardLayout;
  onOwnedSaved: () => void;
}) {
  if (items.length === 0) return null;
  const usedIn = (item: OwnedCard) => (item.used_in.length ? item.used_in.join(", ") : "Not in a deck");

  if (layout === "grid") {
    return (
      <div className="card-grid">
        {items.map((item) => (
          <article key={item.card_id} className="grid-card-wrap collection-grid-wrap" data-card-id={item.card_id}>
            <div className="grid-card collection-grid-card">
              <div className="grid-card-media">
                <CardThumb src={item.image_url || undefined} alt={item.name} />
              </div>
              <div className="grid-card-body">
                <div className="card-id">{item.card_id}</div>
                <div className="grid-card-name">{item.name}</div>
                <div className="grid-card-meta muted">
                  Value <strong className="collection-value">{money(item.value)}</strong>
                </div>
                <div className="grid-card-price">
                  <MarketPrice price={item.market_price} productId={item.product_id} />
                </div>
                <div className="grid-card-owned">
                  <span>Owned</span>
                  <OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
                </div>
                {item.tcgplayer_url && (
                  <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                    TCGPlayer
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table collection-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Owned</th>
              <th>Market</th>
              <th>Value</th>
              <th>Cost</th>
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.card_id} data-card-id={item.card_id}>
                <td className="card-cell">
                  <div className="card-cell-inner">
                    <CardThumb src={item.image_url || undefined} alt={item.name} />
                    <div>
                      <div className="card-id">{item.card_id}</div>
                      <div>{item.name}</div>
                      {item.tcgplayer_url && (
                        <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
                </td>
                <td>
                  <MarketPrice price={item.market_price} productId={item.product_id} />
                </td>
                <td className="collection-value">{money(item.value)}</td>
                <td>{item.cost ?? "—"}</td>
                <td className={`used-in${item.used_in.length ? "" : " muted"}`}>{usedIn(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {items.map((item) => (
          <article key={item.card_id} className="mobile-card" data-card-id={item.card_id}>
            <div className="mobile-card-top">
              <MobileCardMedia
                src={item.image_url || undefined}
                alt={item.name}
                cost={item.cost}
                rarity={item.rarity}
              />
              <div className="mobile-card-info">
                <div className="card-id">{item.card_id}</div>
                <div className="mobile-card-name">{item.name}</div>
                <div className="mobile-card-meta">
                  {[item.color, `Value ${money(item.value)}`].filter(Boolean).join(" · ")}
                </div>
                <div className="mobile-card-price-row">
                  <div className="mobile-card-price-main">
                    <span className="muted">Market</span>
                    <MarketPrice price={item.market_price} productId={item.product_id} />
                    {item.tcgplayer_url ? (
                      <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                        TCGPlayer
                      </a>
                    ) : null}
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    <OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
                  </div>
                </div>
              </div>
            </div>
            <p className={`used-in mobile-used-in${item.used_in.length ? "" : " muted"}`}>{usedIn(item)}</p>
          </article>
        ))}
      </div>
    </>
  );
}

const COLLECTION_ADD_OPEN_KEY = "optcg_collection_add_open";

/** "Add" for a card you don't own yet, the Owned stepper once you do. Same footprint either way. */
function CollectionOwnedControl({
  cardId,
  owned,
  onSaved,
}: {
  cardId: string;
  owned: number;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => api.setOwned(cardId, 1),
    // Refetch so the new card joins the list with its catalog details and price.
    onSuccess: () => invalidateOwnedViews(qc),
  });
  return (
    <span className="collection-owned-control">
      {owned > 0 ? (
        <OwnedInput cardId={cardId} value={owned} onSaved={onSaved} />
      ) : (
        <button
          type="button"
          className="btn secondary"
          disabled={add.isPending}
          aria-label={`Add ${cardId} to collection`}
          title={add.error ? (add.error as Error).message : undefined}
          onClick={() => add.mutate()}
        >
          {add.isError ? "Retry" : "Add"}
        </button>
      )}
    </span>
  );
}

function CollectionAddPanel({
  ownedById,
  defaultOpen,
  onScan,
  onOwnedSaved,
}: {
  ownedById: Map<string, number>;
  defaultOpen: boolean;
  onScan: () => void;
  onOwnedSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [color, setColor] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const searchEnabled = Boolean(debouncedQ || color);
  const searchQ = useQuery({
    queryKey: ["catalog-search", debouncedQ, color, ""],
    queryFn: () => api.searchCatalog({ q: debouncedQ || undefined, color: color || undefined, limit: 40 }),
    enabled: searchEnabled,
  });

  return (
    <div className="deck-editor collection-add">
      <CollapsibleDrawer
        label="Add cards"
        summary="Search the catalog or scan a card"
        storageKey={COLLECTION_ADD_OPEN_KEY}
        defaultOpen={defaultOpen}
      >
        <div className="deck-editor-filters">
          <CardSearchInput value={query} onChange={setQuery} />
          <div className="deck-editor-filter-row">
            <label className="deck-editor-select">
              <span className="sr-only">Color</span>
              <select value={color} onChange={(e) => setColor(e.target.value)} aria-label="Filter catalog by color">
                <option value="">All colors</option>
                {COLOR_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="ghost scan-open" onClick={onScan}>
              Scan
            </button>
          </div>
        </div>

        {!searchEnabled && <p className="muted deck-editor-status">Search the catalog by name or ID to add cards</p>}
        {searchEnabled && searchQ.isLoading && <InlineSkeleton lines={3} label="Searching catalog…" />}
        {searchEnabled && searchQ.error && (
          <p className="error deck-editor-status">{(searchQ.error as Error).message}</p>
        )}
        {searchEnabled && searchQ.data && searchQ.data.length === 0 && (
          <p className="muted deck-editor-status">No catalog matches</p>
        )}
        {searchQ.data && searchQ.data.length > 0 && (
          <ul className="deck-editor-results">
            {searchQ.data.map((card) => (
              <li key={card.card_id} className="deck-editor-result" data-catalog-id={card.card_id}>
                <div className="deck-editor-result-main">
                  <CardThumb src={card.image_url || undefined} alt={card.name} />
                  <div>
                    <div className="card-id">{card.card_id}</div>
                    <div>{card.name}</div>
                    <div className="muted">
                      {[card.color, card.card_type, money(card.market_price)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="deck-editor-result-actions">
                  <CollectionOwnedControl
                    cardId={card.card_id}
                    owned={ownedById.get(card.card_id) ?? 0}
                    onSaved={onOwnedSaved}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleDrawer>
    </div>
  );
}

function CollectionPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["owned"], queryFn: api.ownedCollection });
  const noUnavailableSorts = useMemo(() => [] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(false, noUnavailableSorts, {
    storageKey: OWNED_SORTS_KEY,
    keys: OWNED_SORT_KEYS,
    defaults: OWNED_DEFAULT_SORTS,
  });
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [showDons, setShowDons] = usePersistedOpen(COLLECTION_SHOW_DONS_KEY, true);
  const [sparesOnly, setSparesOnly] = usePersistedOpen(COLLECTION_SPARES_KEY, false);
  const [colors, setColors] = useState<string[]>(loadCollectionColors);
  const [scanOpen, setScanOpen] = useState(false);
  const [droppedImage, setDroppedImage] = useState<Blob | null>(null);
  const [pageDragging, setPageDragging] = useState(false);
  // Same as Shopping: drop a card image anywhere on the page to scan it.
  useImageDrop({
    enabled: !scanOpen,
    onImage: (blob) => {
      setDroppedImage(blob);
      setScanOpen(true);
    },
    onDragStateChange: setPageDragging,
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLECTION_COLORS_KEY, JSON.stringify(colors));
    } catch {
      /* ignore */
    }
  }, [colors]);

  const allItems = data?.items ?? [];
  const ownedById = useMemo(() => new Map(allItems.map((i) => [i.card_id, i.owned])), [allItems]);
  const items = useMemo(() => {
    let list = allItems;
    if (!showDons) list = list.filter((i) => !isDonCard(i));
    if (sparesOnly) list = list.filter((i) => i.used_in.length === 0);
    if (colors.length) list = list.filter((i) => cardHasColor(i, colors));
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    return [...list].sort((a, b) => compareCardOrder(a, b, effectiveSorts));
  }, [allItems, showDons, sparesOnly, colors, search, effectiveSorts]);

  const shown = useMemo(() => collectionTotals(items.filter((i) => i.owned > 0)), [items]);
  const narrowed = items.length !== allItems.length;

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (colors.length) parts.push(colors.join("/"));
    if (sparesOnly) parts.push("Not in a deck");
    if (!showDons) parts.push("No DON!!");
    if (layout === "grid") parts.push("Grid");
    return parts.join(" · ");
  }, [effectiveSorts, colors, sparesOnly, showDons, layout]);
  const activeFilters = colors.length + (sparesOnly ? 1 : 0) + (showDons ? 0 : 1);

  function toggleColor(color: string) {
    setColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  }

  // Shopping and deck pages refetch; this page keeps its optimistic copy so a
  // card stepped down to 0 stays put instead of vanishing under the pointer.
  const onOwnedSaved = () => {
    void qc.invalidateQueries({ queryKey: ["shopping"] });
    void qc.invalidateQueries({ queryKey: ["deck"] });
  };

  if (isLoading) return <ShoppingListSkeleton label="Loading your collection…" />;
  if (error) return <p className="error">{(error as Error).message}</p>;

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">Cards you own</p>
          <h1>Collection</h1>
          <CollectionStatStrip data={data} />
        </div>
      </div>

      <CollectionAddPanel
        ownedById={ownedById}
        defaultOpen={allItems.length === 0}
        onScan={() => setScanOpen(true)}
        onOwnedSaved={onOwnedSaved}
      />

      {allItems.length === 0 ? (
        <p className="muted">
          No owned cards yet. Add some above, or set Owned on the <Link to="/">shopping list</Link> or a{" "}
          <Link to="/decks">deck</Link>. Owned is shared, so every deck counts these copies.
        </p>
      ) : (
        <>
          <div className="list-toolbar">
            <div className="list-toolbar-row">
              <CardSearchInput value={search} onChange={setSearch} />
              <CardLayoutToggle layout={layout} onChange={setLayout} />
            </div>
            <CollapsibleFilters summary={filterSummary} badge={activeFilters} badgeLabel="filters on">
              <div className="filters">
                <SortMenu sorts={sorts} onChange={setSorts} onlyNeed={false} keys={OWNED_SORT_KEYS} />
                <label>
                  <input
                    type="checkbox"
                    checked={sparesOnly}
                    onChange={(e) => setSparesOnly(e.target.checked)}
                  />
                  Not in a deck
                </label>
                <label>
                  <input type="checkbox" checked={showDons} onChange={(e) => setShowDons(e.target.checked)} />
                  Show DON!!
                </label>
              </div>
              <div className="deck-filter">
                <div className="deck-filter-head">
                  <span>Colors</span>
                  {colors.length > 0 && (
                    <button type="button" className="ghost" onClick={() => setColors([])}>
                      Any color
                    </button>
                  )}
                </div>
                <div className="deck-filter-list">
                  {COLOR_ORDER.map((color) => (
                    <label key={color} className="deck-chip">
                      <input
                        type="checkbox"
                        checked={colors.includes(color)}
                        onChange={() => toggleColor(color)}
                      />
                      {color}
                    </label>
                  ))}
                </div>
              </div>
              <p className="need-mode-note muted">
                Value is owned copies × the standard printing&apos;s TCGPlayer market price.
              </p>
            </CollapsibleFilters>
          </div>

          {narrowed && (
            <p className="search-result-note muted" role="status">
              Showing {shown.cards} of {allItems.length} cards · {shown.copies}{" "}
              {shown.copies === 1 ? "copy" : "copies"} ·{" "}
              {money(shown.value)}
            </p>
          )}
          {items.length === 0 ? (
            <p className="muted">No owned cards match the current search and filters.</p>
          ) : (
            <CollectionItemsView items={items} layout={layout} onOwnedSaved={onOwnedSaved} />
          )}
        </>
      )}
      {pageDragging && !scanOpen && (
        <div className="page-drop-hint" role="status">
          Drop the card image to scan it
        </div>
      )}
      {scanOpen && (
        <CardScanner
          items={[]}
          showNeed={false}
          initialImage={droppedImage}
          renderHitAction={(card) => (
            <div className="scan-hit-owned">
              <span className="muted">In collection</span>
              <CollectionOwnedControl
                cardId={card.card_id}
                owned={ownedById.get(card.card_id) ?? 0}
                onSaved={onOwnedSaved}
              />
            </div>
          )}
          onClose={() => {
            setScanOpen(false);
            setDroppedImage(null);
          }}
        />
      )}
    </section>
  );
}

type DeckLeaderGroup = {
  key: string;
  leaderCardId: string | null;
  leaderName: string | null;
  leaderImageUrl: string;
  decks: DeckSummary[];
};

function groupDecksByLeader(
  decks: DeckSummary[],
  artFallback: Map<string, { name: string; image_url: string }>,
): DeckLeaderGroup[] {
  const groups: DeckLeaderGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const deck of decks) {
    const key = deck.leader_card_id || "__none__";
    let idx = indexByKey.get(key);
    if (idx == null) {
      const fallback = deck.leader_card_id ? artFallback.get(deck.leader_card_id) : undefined;
      idx = groups.length;
      indexByKey.set(key, idx);
      groups.push({
        key,
        leaderCardId: deck.leader_card_id,
        leaderName: deck.leader_name || fallback?.name || null,
        leaderImageUrl: deck.leader_image_url || fallback?.image_url || "",
        decks: [],
      });
    }
    groups[idx].decks.push(deck);
  }
  for (const group of groups) {
    group.decks.sort((a, b) => {
      if (Boolean(a.is_main) !== Boolean(b.is_main)) return a.is_main ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    });
  }
  return groups;
}

/** Compact owned-copies bar for a deck tile; hidden when the API omits the count. */
function DeckOwnedMeter({ owned, total }: { owned: number | undefined; total: number }) {
  if (owned == null || total <= 0) return null;
  const pct = Math.min(100, Math.round((owned / total) * 100));
  const complete = owned >= total;
  return (
    <div className={`deck-owned-meter${complete ? " complete" : ""}`}>
      <div className="deck-owned-meter-text">
        <span>
          <strong>{owned}</strong> / {total} owned
        </span>
        <span>{complete ? "Complete" : `${total - owned} to go`}</span>
      </div>
      <div
        className="deck-progress-bar"
        role="progressbar"
        aria-label="Copies owned"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={owned}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DecksPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const needsLeaderArtFallback = useMemo(
    () => (data ?? []).some((d) => Boolean(d.leader_card_id) && !d.leader_image_url),
    [data],
  );
  // Prod API may lag behind the SPA (Render deploy). Fall back to shopping catalog art.
  const leaderArtQ = useQuery({
    queryKey: ["shopping", "leader-art-fallback"],
    queryFn: () => api.shopping(),
    enabled: needsLeaderArtFallback,
    staleTime: 60_000,
  });
  const leaderArtById = useMemo(() => {
    const map = new Map<string, { name: string; image_url: string }>();
    for (const item of leaderArtQ.data?.items ?? []) {
      if (!item.image_url && !item.name) continue;
      map.set(item.card_id, { name: item.name, image_url: item.image_url });
    }
    return map;
  }, [leaderArtQ.data]);
  const leaderGroups = useMemo(
    () => groupDecksByLeader(data ?? [], leaderArtById),
    [data, leaderArtById],
  );
  const del = useMutation({
    mutationFn: api.deleteDeck,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["decks"] });
      invalidateOwnedViews(qc);
    },
  });
  const setMain = useMutation({
    mutationFn: api.setDeckAsMain,
    onSuccess: (detail) => {
      void qc.invalidateQueries({ queryKey: ["decks"] });
      qc.setQueryData(["deck", detail.id], detail);
      // Other same-leader decks change which cards are Additional.
      void qc.invalidateQueries({ queryKey: ["deck"] });
    },
  });

  if (isLoading) return <DecksListSkeleton />;
  if (error) return <p className="error">{(error as Error).message}</p>;

  return (
    <section>
      <div className="page-head">
        <h1>Decks</h1>
        <Link className="btn primary" to="/import">
          Import deck
        </Link>
      </div>
      {setMain.isError && (
        <p className="error">{(setMain.error as Error).message}</p>
      )}
      {del.isError && <p className="error">{(del.error as Error).message}</p>}
      {leaderGroups.length === 0 && (
        <div className="empty-state">
          <CompassIcon />
          <h2>No decks aboard yet</h2>
          <p>Import an OPTCGSim deck code and its cards join your Master Shopping list.</p>
          <Link className="btn primary" to="/import">
            Import your first deck
          </Link>
        </div>
      )}
      <div className="deck-leader-groups">
        {leaderGroups.map((group) => {
          const heading = group.leaderCardId
            ? `${group.leaderName || "Leader"} · ${group.leaderCardId}`
            : "No leader detected";
          return (
            <section key={group.key} className="deck-leader-group">
              <header className="deck-leader-group-head">
                {group.leaderCardId ? (
                  group.leaderImageUrl ? (
                    <img
                      src={cardImageUrl(group.leaderImageUrl, "thumb") || group.leaderImageUrl}
                      alt=""
                      className="deck-leader-group-thumb"
                      loading="lazy"
                    />
                  ) : (
                    <div className="thumb placeholder deck-leader-group-thumb" aria-hidden>
                      <span className="deck-card-leader-fallback">{group.leaderCardId}</span>
                    </div>
                  )
                ) : null}
                <div className="deck-leader-group-title">
                  <h2>{heading}</h2>
                  <p className="muted">
                    {group.decks.length} deck{group.decks.length === 1 ? "" : "s"}
                    {group.decks.some((d) => d.is_main) ? " · Main listed first" : ""}
                  </p>
                </div>
              </header>
              <div className="deck-grid">
                {group.decks.map((d) => {
                  const fallback = d.leader_card_id
                    ? leaderArtById.get(d.leader_card_id)
                    : undefined;
                  const leaderImage = d.leader_image_url || fallback?.image_url || "";
                  const leaderName = d.leader_name || fallback?.name || null;
                  const isMain = Boolean(d.is_main);
                  return (
                    <article
                      key={d.id}
                      className={`deck-card${isMain ? " is-main" : ""}`}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate(`/decks/${d.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/decks/${d.id}`);
                        }
                      }}
                    >
                      <div className="deck-card-main">
                        {leaderImage || d.leader_card_id ? (
                          <div className="deck-card-leader-art">
                            {leaderImage ? (
                              <img
                                src={cardImageUrl(leaderImage, "thumb") || leaderImage}
                                alt={leaderName || d.leader_card_id || "Leader"}
                                className="deck-card-leader-thumb"
                                loading="lazy"
                              />
                            ) : (
                              <div
                                className="thumb placeholder deck-card-leader-thumb"
                                aria-label={d.leader_card_id || "Leader"}
                              >
                                <span className="deck-card-leader-fallback">
                                  {d.leader_card_id || "?"}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : null}
                        <div className="deck-card-body">
                          <div className="deck-card-title-row">
                            <h2>{d.name}</h2>
                            {isMain && <span className="deck-main-badge">Main deck</span>}
                          </div>
                          <p className="muted">
                            {d.main_cards ?? d.total_cards}/{51} main
                            {(d.don_cards ?? 0) > 0 ? ` · ${d.don_cards}/10 DON!!` : ""}
                            {` · ${d.card_count} unique`}
                          </p>
                          <DeckOwnedMeter owned={d.owned_copies} total={d.main_cards ?? d.total_cards} />
                        </div>
                      </div>
                      <div className="row-actions">
                        {d.leader_card_id && !isMain && (
                          <button
                            type="button"
                            className="ghost"
                            disabled={setMain.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMain.mutate(d.id);
                            }}
                          >
                            Set as Main
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/decks/${d.id}?edit=1`);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          disabled={del.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Delete “${d.name}”? This can’t be undone.`)) return;
                            del.mutate(d.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function filterCards(
  cards: CardView[],
  onlyNeed: boolean,
  sorts: SortKey[],
  search = "",
): CardView[] {
  let list = cards;
  if (onlyNeed) list = list.filter((c) => c.still_need > 0);
  if (search.trim()) list = list.filter((c) => matchesCardSearch(c, search));
  return [...list].sort((a, b) => compareCardOrder(a, b, sorts));
}

type DeckProgressMode = "copies" | "uniques";

function summarizeDeckProgress(cards: CardView[]) {
  const uniqueTotal = cards.length;
  const uniqueComplete = cards.filter((c) => c.still_need === 0).length;
  const uniqueStill = uniqueTotal - uniqueComplete;
  const copiesNeeded = cards.reduce((sum, c) => sum + c.needed, 0);
  const copiesStill = cards.reduce((sum, c) => sum + c.still_need, 0);
  const copiesOwned = copiesNeeded - copiesStill;
  const remainingMarket = cards.reduce((sum, c) => {
    if (c.still_need <= 0 || c.market_price == null) return sum;
    return sum + c.still_need * c.market_price;
  }, 0);
  return {
    uniqueTotal,
    uniqueComplete,
    uniqueStill,
    copiesNeeded,
    copiesStill,
    copiesOwned,
    remainingMarket,
  };
}

function useDeckProgressMode() {
  const [mode, setMode] = useState<DeckProgressMode>(() => {
    try {
      return localStorage.getItem(DECK_PROGRESS_MODE_KEY) === "uniques" ? "uniques" : "copies";
    } catch {
      return "copies";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DECK_PROGRESS_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  return [mode, setMode] as const;
}

function DeckProgressSummary({ cards }: { cards: CardView[] }) {
  const [mode, setMode] = useDeckProgressMode();
  const stats = useMemo(() => summarizeDeckProgress(cards), [cards]);
  const owned = mode === "copies" ? stats.copiesOwned : stats.uniqueComplete;
  const total = mode === "copies" ? stats.copiesNeeded : stats.uniqueTotal;
  const still = mode === "copies" ? stats.copiesStill : stats.uniqueStill;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 100;
  const meta =
    stats.copiesStill > 0
      ? mode === "uniques"
        ? `${stats.copiesStill} copies left · ${money(stats.remainingMarket)} left`
        : `${money(stats.remainingMarket)} left`
      : "Deck complete";

  return (
    <div className="deck-progress">
      <div className="deck-progress-head">
        <div className="deck-progress-toggle" role="group" aria-label="Progress count mode">
          <button
            type="button"
            className={mode === "copies" ? "active" : ""}
            aria-pressed={mode === "copies"}
            onClick={() => setMode("copies")}
          >
            Copies
          </button>
          <button
            type="button"
            className={mode === "uniques" ? "active" : ""}
            aria-pressed={mode === "uniques"}
            onClick={() => setMode("uniques")}
          >
            Uniques
          </button>
        </div>
        <p className="deck-progress-text">
          <span className="deck-progress-line">
            <strong>
              {owned}/{total}
            </strong>{" "}
            {mode === "copies" ? "copies owned" : "uniques complete"} · <strong>{still}</strong> still needed
          </span>
          <span className="deck-progress-line deck-progress-meta">{meta}</span>
        </p>
      </div>
      <div
        className="deck-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% of deck ${mode === "copies" ? "copies" : "uniques"} owned`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardTable({
  cards,
  onOwnedSaved,
  showAltArts,
  layout = "list",
  editing = false,
  onNeededChange,
  neededBusyId = null,
  onAltWantChange,
  altWantBusyKey = null,
}: {
  cards: CardView[];
  onOwnedSaved: () => void;
  showAltArts: boolean;
  layout?: CardLayout;
  editing?: boolean;
  onNeededChange?: (cardId: string, needed: number) => void;
  neededBusyId?: string | null;
  onAltWantChange?: (cardId: string, productId: number, qty: number) => void;
  /** `${cardId}:${productId}` while a printing want save is in flight. */
  altWantBusyKey?: string | null;
}) {
  const altRow = (c: CardView) => (
    <AltArtsRow
      alts={c.alt_arts ?? []}
      cardNeeded={c.needed}
      editable={Boolean(onAltWantChange)}
      onWantChange={
        onAltWantChange
          ? (productId, qty) => onAltWantChange(c.card_id, productId, qty)
          : undefined
      }
      busyProductId={
        altWantBusyKey?.startsWith(`${c.card_id}:`)
          ? Number(altWantBusyKey.slice(c.card_id.length + 1))
          : null
      }
    />
  );
  if (layout === "grid") {
    return (
      <div className="card-grid">
        {cards.map((c) => (
          <article
            key={`${c.section}-${c.card_id}`}
            data-card-id={c.card_id}
            className={`grid-card ${c.still_need > 0 ? "need" : "done"}`}
          >
            <div className="grid-card-media">
              <CardThumb src={c.image_url || undefined} alt={c.name} />
            </div>
            <div className="grid-card-body">
              <div className="card-id">{c.card_id}</div>
              <div className="grid-card-name">{c.name}</div>
              <div className="grid-card-meta muted">
                {[`${c.still_need}/${c.needed} still needed`, c.card_type || ""].filter(Boolean).join(" · ")}
              </div>
              <div className="grid-card-price">
                <MarketPrice price={c.market_price} productId={c.product_id} />
              </div>
              {editing && onNeededChange ? (
                <div className="grid-card-owned">
                  <span>In deck</span>
                  <NeededStepper
                    cardId={c.card_id}
                    value={c.needed}
                    busy={neededBusyId === c.card_id}
                    onChange={onNeededChange}
                  />
                </div>
              ) : null}
              <div className="grid-card-owned">
                <span>Owned</span>
                <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
              </div>
              <OwnedClaimNote card={c} />
              {c.tcgplayer_url && (
                <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                  TCGPlayer
                </a>
              )}
              {showAltArts && (c.alt_arts?.length ?? 0) > 0 && (
                <div className="grid-card-alts">{altRow(c)}</div>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Owned</th>
              <th>Still needed</th>
              <th>Market</th>
              <th>Type</th>
              <th>Cost</th>
              {showAltArts && <th>Alt arts</th>}
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={`${c.section}-${c.card_id}`} data-card-id={c.card_id} className={c.still_need > 0 ? "need" : "done"}>
                <td className="card-cell">
                  <div className="card-cell-inner">
                    <CardThumb src={c.image_url || undefined} alt={c.name} />
                    <div>
                      <div className="card-id">{c.card_id}</div>
                      <div>{c.name}</div>
                      {c.tcgplayer_url && (
                        <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
                  <OwnedClaimNote card={c} />
                </td>
                <td className="need-cell">
                  {editing && onNeededChange ? (
                    <>{c.still_need}/{" "}
                      <NeededStepper
                        cardId={c.card_id}
                        value={c.needed}
                        busy={neededBusyId === c.card_id}
                        onChange={onNeededChange}
                      />
                    </>
                  ) : (
                    `${c.still_need}/${c.needed}`
                  )}
                </td>
                <td>
                  <MarketPrice price={c.market_price} productId={c.product_id} />
                </td>
                <td>{c.card_type || "—"}</td>
                <td>{c.cost ?? "—"}</td>
                {showAltArts && <td>{altRow(c)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {cards.map((c) => (
          <article
            key={`${c.section}-${c.card_id}`}
            data-card-id={c.card_id}
            className={`mobile-card ${c.still_need > 0 ? "need" : "done"}`}
          >
            <div className="mobile-card-top">
              <MobileCardMedia
                src={c.image_url || undefined}
                alt={c.name}
                cost={c.cost}
                rarity={c.rarity}
              />
              <div className="mobile-card-info">
                <div className="card-id">{c.card_id}</div>
                <div className="mobile-card-name">{c.name}</div>
                <div className="mobile-card-meta">
                  {[c.color, `${c.still_need}/${c.needed} still needed`, c.card_type || ""]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="mobile-card-price-row">
                  <div className="mobile-card-price-main">
                    <span className="muted">Market</span>
                    <MarketPrice price={c.market_price} productId={c.product_id} />
                    {c.tcgplayer_url ? (
                      <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                        TCGPlayer
                      </a>
                    ) : null}
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
                  </div>
                </div>
                <OwnedClaimNote card={c} />
              </div>
            </div>
            {editing && onNeededChange ? (
              <div className="mobile-card-owned mobile-card-owned-block">
                <span>In deck</span>
                <NeededStepper
                  cardId={c.card_id}
                  value={c.needed}
                  busy={neededBusyId === c.card_id}
                  onChange={onNeededChange}
                />
              </div>
            ) : null}
            {showAltArts && (c.alt_arts?.length ?? 0) > 0 && (
              <div className="mobile-card-alts">{altRow(c)}</div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function NeededStepper({
  cardId,
  value,
  busy,
  onChange,
}: {
  cardId: string;
  value: number;
  busy?: boolean;
  onChange: (cardId: string, needed: number) => void;
}) {
  return (
    <span className="owned-wrap">
      <button
        type="button"
        className="owned-btn"
        aria-label={`Decrease ${cardId} in deck`}
        disabled={busy || value <= 0}
        onClick={() => onChange(cardId, Math.max(0, value - 1))}
      >
        −
      </button>
      <span className="deck-editor-qty" aria-label={`${cardId} copies in deck`}>
        {value}
      </span>
      <button
        type="button"
        className="owned-btn"
        aria-label={`Increase ${cardId} in deck`}
        disabled={busy}
        onClick={() => onChange(cardId, value + 1)}
      >
        +
      </button>
    </span>
  );
}

const MAIN_DECK_LIMIT = 51;
const DON_DECK_LIMIT = 10;
const CATALOG_TYPE_FILTERS = ["", "Leader", "Character", "Event", "Stage", "DON!!"] as const;

/** Past-50 decks are allowed; the hints tray flags them as a soft warning instead of a confirm. */
async function setDeckCardNeeded(
  deckId: number,
  cardId: string,
  needed: number,
): Promise<DeckDetail | null> {
  return api.upsertDeckCard(deckId, cardId, needed, true);
}

/** Main-deck rows (leader included, DON!! excluded) in the shape the stats and hints code reads. */
function toStatsCards(cards: DeckDetail["cards"]): DeckStatsCard[] {
  return cards
    .filter((c) => c.section !== "don" && !isDonCardType(c.card_type))
    .map((c) => ({ id: c.card_id, copies: c.needed }));
}

const DELTA_MS = 4500;

function DeckEditorPanel({
  deckId,
  deck,
  onUpdated,
  onChanged,
}: {
  deckId: number;
  deck: DeckDetail;
  onUpdated: (detail: DeckDetail) => void;
  /** Fired after a save that leaves the card in the deck, so the list can point at its row. */
  onChanged?: (cardId: string) => void;
}) {
  const atlas = useStatsAtlas().data;
  const [delta, setDelta] = useState<{ text: string; key: number } | null>(null);
  const deltaKey = useRef(0);
  useEffect(() => {
    if (!delta) return;
    const t = window.setTimeout(() => setDelta(null), DELTA_MS);
    return () => window.clearTimeout(t);
  }, [delta]);

  /** Say what an add/remove moved. Purely informational: never blocks or confirms anything. */
  function flashDelta(cardId: string, after: DeckDetail) {
    if (!atlas) return;
    const text = deckDelta(toStatsCards(deck.cards), toStatsCards(after.cards), cardId, atlas, after.leader_card_id);
    if (text) setDelta({ text, key: ++deltaKey.current });
  }

  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [color, setColor] = useState("");
  const [cardType, setCardType] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const searchEnabled = Boolean(debouncedQ || color || cardType);
  const searchQ = useQuery({
    queryKey: ["catalog-search", debouncedQ, color, cardType],
    queryFn: () =>
      api.searchCatalog({
        q: debouncedQ || undefined,
        color: color || undefined,
        card_type: cardType || undefined,
        limit: 40,
      }),
    enabled: searchEnabled,
  });

  const neededById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of deck.cards) map.set(c.card_id, c.needed);
    return map;
  }, [deck.cards]);

  const mainCount = deck.main_cards ?? deck.cards
    .filter((c) => c.section !== "don" && !isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);
  const donCount = deck.don_cards ?? deck.cards
    .filter((c) => c.section === "don" || isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);

  async function addCopies(card: CatalogCardResult, add: number) {
    setErr(null);
    setPendingId(card.card_id);
    try {
      const current = neededById.get(card.card_id) ?? 0;
      const next = current + add;
      if (isDonCardType(card.card_type)) {
        const projectedDon = donCount - current + next;
        if (projectedDon > DON_DECK_LIMIT) {
          setErr(`DON!! deck is limited to ${DON_DECK_LIMIT} cards.`);
          return;
        }
      }
      const detail = await setDeckCardNeeded(deckId, card.card_id, next);
      if (detail) {
        onUpdated(detail);
        flashDelta(card.card_id, detail);
        onChanged?.(card.card_id);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  async function setNeeded(cardId: string, needed: number) {
    setErr(null);
    setPendingId(cardId);
    try {
      const detail = await setDeckCardNeeded(deckId, cardId, Math.max(0, needed));
      if (detail) {
        onUpdated(detail);
        flashDelta(cardId, detail);
        if (needed > 0) onChanged?.(cardId);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  const searchSummary = [
    `Main ${mainCount}/${MAIN_DECK_LIMIT}`,
    `DON!! ${donCount}/${DON_DECK_LIMIT}`,
    searchEnabled && searchQ.data ? `${searchQ.data.length} results` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="deck-editor">
      <div className="dh-delta-slot" role="status" aria-live="polite">
        {delta ? (
          <span key={delta.key} className="dh-delta">
            {delta.text}
          </span>
        ) : null}
      </div>
      <CollapsibleDrawer
        label="Add cards"
        summary={searchSummary}
        storageKey={DECK_SEARCH_OPEN_KEY}
        defaultOpen
      >
        <div className="deck-editor-filters">
          <CardSearchInput value={query} onChange={setQuery} />
          <div className="deck-editor-filter-row">
            <label className="deck-editor-select">
              <span className="sr-only">Color</span>
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Filter by color"
              >
                <option value="">All colors</option>
                {COLOR_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="deck-editor-select">
              <span className="sr-only">Card type</span>
              <select
                value={cardType}
                onChange={(e) => setCardType(e.target.value)}
                aria-label="Filter by card type"
              >
                {CATALOG_TYPE_FILTERS.map((t) => (
                  <option key={t || "all"} value={t}>
                    {t ? t : "All types"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {err && <p className="error deck-editor-status">{err}</p>}

        {!searchEnabled && (
          <p className="muted deck-editor-status">Search name, ID, color, or type</p>
        )}
        {searchEnabled && searchQ.isLoading && (
          <InlineSkeleton lines={3} label="Searching catalog…" />
        )}
        {searchEnabled && searchQ.error && (
          <p className="error deck-editor-status">{(searchQ.error as Error).message}</p>
        )}
        {searchEnabled && searchQ.data && searchQ.data.length === 0 && (
          <p className="muted deck-editor-status">No catalog matches</p>
        )}

        {searchQ.data && searchQ.data.length > 0 && (
          <ul className="deck-editor-results">
            {searchQ.data.map((card) => {
              const inDeck = neededById.get(card.card_id) ?? 0;
              const busy = pendingId === card.card_id;
              return (
                <li key={card.card_id} className="deck-editor-result">
                  <div className="deck-editor-result-main">
                    <CardThumb src={card.image_url || undefined} alt={card.name} />
                    <div>
                      <div className="card-id">{card.card_id}</div>
                      <div>{card.name}</div>
                      <div className="muted">
                        {[card.color, card.card_type, card.rarity].filter(Boolean).join(" · ") || "—"}
                        {inDeck > 0 ? ` · In deck ×${inDeck}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="deck-editor-result-actions">
                    {inDeck > 0 && (
                      <>
                        <button
                          type="button"
                          className="owned-btn"
                          aria-label={`Decrease ${card.card_id}`}
                          disabled={busy}
                          onClick={() => void setNeeded(card.card_id, inDeck - 1)}
                        >
                          −
                        </button>
                        <span className="deck-editor-qty">{inDeck}</span>
                        <button
                          type="button"
                          className="owned-btn"
                          aria-label={`Increase ${card.card_id}`}
                          disabled={busy}
                          onClick={() => void addCopies(card, 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          disabled={busy}
                          onClick={() => void setNeeded(card.card_id, 0)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {inDeck === 0 && (
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => void addCopies(card, 1)}
                      >
                        Add
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleDrawer>
    </div>
  );
}

function AvailableDonSection({
  deckId,
  deck,
  onUpdated,
}: {
  deckId: number;
  deck: DeckDetail;
  onUpdated: (detail: DeckDetail) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const donQ = useQuery({
    queryKey: ["catalog-don"],
    queryFn: () => api.searchCatalog({ card_type: "DON", limit: 100 }),
    staleTime: 60_000,
  });

  const neededById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of deck.cards) map.set(c.card_id, c.needed);
    return map;
  }, [deck.cards]);

  const donCount = deck.don_cards ?? deck.cards
    .filter((c) => c.section === "don" || isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);

  async function addOne(card: CatalogCardResult) {
    setErr(null);
    const current = neededById.get(card.card_id) ?? 0;
    if (donCount >= DON_DECK_LIMIT) {
      setErr(`DON!! deck is limited to ${DON_DECK_LIMIT} cards.`);
      return;
    }
    setPendingId(card.card_id);
    try {
      const detail = await setDeckCardNeeded(deckId, card.card_id, current + 1);
      if (detail) onUpdated(detail);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  const resultCount = donQ.data?.length ?? 0;
  const summary = [
    `${donCount}/${DON_DECK_LIMIT} in deck`,
    resultCount > 0 ? `${resultCount} available` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="don-available">
      <CollapsibleDrawer
        label="Available DON!! cards"
        summary={summary}
        storageKey={DECK_DON_AVAILABLE_OPEN_KEY}
        defaultOpen={false}
      >
        {err && <p className="error deck-editor-status">{err}</p>}
        {donQ.isLoading && <InlineSkeleton lines={3} label="Loading DON!! cards…" />}
        {donQ.error && <p className="error deck-editor-status">{(donQ.error as Error).message}</p>}
        {donQ.data && donQ.data.length === 0 && (
          <p className="muted deck-editor-status">No DON!! cards in the catalog yet.</p>
        )}
        {donQ.data && donQ.data.length > 0 && (
          <ul className="deck-editor-results don-available-list">
            {donQ.data.map((card) => {
              const inDeck = neededById.get(card.card_id) ?? 0;
              const busy = pendingId === card.card_id;
              const atCap = donCount >= DON_DECK_LIMIT && inDeck === 0;
              return (
                <li key={card.card_id} className="deck-editor-result">
                  <div className="deck-editor-result-main">
                    <CardThumb src={card.image_url || undefined} alt={card.name} />
                    <div>
                      <div className="card-id">{card.card_id}</div>
                      <div>{card.name}</div>
                      <div className="muted">
                        {[card.group_name, money(card.market_price)].filter(Boolean).join(" · ")}
                        {inDeck > 0 ? ` · In deck ×${inDeck}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="deck-editor-result-actions">
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy || atCap}
                      onClick={() => void addOne(card)}
                    >
                      {inDeck > 0 ? "Add another" : "Add"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleDrawer>
    </div>
  );
}

/** Error state for a page-level fetch: message plus a Retry that keeps its size while refetching. */
function LoadErrorBlock({ title, message, retrying, onRetry }: { title: string; message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <div className="load-error-text">
        <strong>{title}</strong>
        <p className="muted">{message}</p>
      </div>
      <button type="button" className="btn secondary load-error-retry" disabled={retrying} aria-busy={retrying} onClick={onRetry}>
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function DeckDetailPage() {
  const { id } = useParams();
  const deckId = Number(id);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["deck", deckId],
    queryFn: () => api.deck(deckId),
    enabled: Number.isFinite(deckId),
  });
  // A failed deck query with no data goes back to "pending" while Retry refetches; remember the
  // error so the block stays on screen (Retry disabled) instead of flashing the skeleton.
  const lastError = useRef<Error | null>(null);
  if (error) lastError.current = error as Error;
  else if (data) lastError.current = null;
  const [onlyNeed, setOnlyNeed] = useState(true);
  const deckUnavailableSorts = useMemo(() => ["deck", "user"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, deckUnavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  // Wide enough for the dock column: the editor takes that column (sticky) while editing, stats move to the pill.
  const sideEdit = useMediaQuery(DOCK_QUERY) && editing;
  const [rowFlash, setRowFlash] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!rowFlash) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-card-id]")).find(
      (e) => e.dataset.cardId === rowFlash.id && e.offsetParent !== null,
    );
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (sideEdit && (r.top < 0 || r.bottom > window.innerHeight)) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }
    el.classList.remove("row-flash");
    void el.offsetWidth;
    el.classList.add("row-flash");
    const t = window.setTimeout(() => el.classList.remove("row-flash"), 1400);
    return () => window.clearTimeout(t);
  }, [rowFlash, sideEdit]);
  const [neededBusyId, setNeededBusyId] = useState<string | null>(null);
  const [neededErr, setNeededErr] = useState<string | null>(null);
  const [altWantBusyKey, setAltWantBusyKey] = useState<string | null>(null);
  const [altWantErr, setAltWantErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const shareDeck = useMutation({
    mutationFn: () => api.createShare({ kind: "deck", deck_id: deckId }),
    onSuccess: async (info) => {
      const url = `${window.location.origin}${info.path}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Public link copied");
      } catch {
        setShareMsg(url);
      }
    },
    onError: (e: Error) => setShareMsg(e.message),
  });

  const optcgSimExport = useMemo(() => {
    if (!data) return null;
    return buildOptcgSimExport(data.cards, { leaderCardId: data.leader_card_id });
  }, [data]);

  const copyOptcgSimList = async () => {
    if (!optcgSimExport || !optcgSimExport.pasteText) {
      setExportMsg("Nothing to export — add main-deck cards first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(optcgSimExport.pasteText);
      setExportMsg(
        `Copied ${optcgSimExport.lineCount} line${optcgSimExport.lineCount === 1 ? "" : "s"} for OPTCGSim`,
      );
    } catch {
      setExportMsg("Could not copy — try Download .txt instead.");
    }
  };

  const downloadOptcgSimList = () => {
    if (!data || !optcgSimExport || !optcgSimExport.pasteText) {
      setExportMsg("Nothing to export — add main-deck cards first.");
      return;
    }
    downloadTextFile(optcgSimExport.pasteText, optcgSimFilename(data.name));
    setExportMsg(
      `Downloaded ${optcgSimExport.lineCount} line${optcgSimExport.lineCount === 1 ? "" : "s"} for OPTCGSim`,
    );
  };

  const applyDeckUpdate = (detail: DeckDetail) => {
    qc.setQueryData(["deck", deckId], detail);
    invalidateAltWantViews(qc);
  };

  const changeNeeded = async (cardId: string, needed: number) => {
    setNeededErr(null);
    setNeededBusyId(cardId);
    try {
      const detail = await setDeckCardNeeded(deckId, cardId, needed);
      if (detail) applyDeckUpdate(detail);
    } catch (e) {
      setNeededErr((e as Error).message);
    } finally {
      setNeededBusyId(null);
    }
  };

  const changeAltWant = async (cardId: string, productId: number, qty: number) => {
    setAltWantErr(null);
    setAltWantBusyKey(`${cardId}:${productId}`);
    applyAltWantOptimistic(qc, cardId, productId, qty);
    try {
      const detail = await api.setDeckCardPrinting(deckId, cardId, productId, qty);
      applyDeckUpdate(detail);
    } catch (e) {
      setAltWantErr((e as Error).message);
      invalidateAltWantViews(qc);
    } finally {
      setAltWantBusyKey(null);
    }
  };

  const resetOwned = useMutation({
    mutationFn: () => api.resetDeckOwned(deckId),
    onSuccess: (res) => {
      applyDeckUpdate(res.deck);
      invalidateOwnedViews(qc);
      setResetMsg(
        res.reset_count === 0
          ? "Owned counts were already 0 for this deck"
          : `Reset owned on ${res.reset_count} card${res.reset_count === 1 ? "" : "s"}`,
      );
    },
    onError: (e: Error) => setResetMsg(e.message),
  });

  const setMain = useMutation({
    mutationFn: () => api.setDeckAsMain(deckId),
    onSuccess: (detail) => {
      applyDeckUpdate(detail);
      void qc.invalidateQueries({ queryKey: ["decks"] });
      void qc.invalidateQueries({ queryKey: ["deck"] });
    },
  });

  const main = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section !== "additional" && c.section !== "don"),
      onlyNeed,
      effectiveSorts,
      search,
    );
  }, [data, onlyNeed, effectiveSorts, search]);

  const additional = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section === "additional"),
      onlyNeed,
      effectiveSorts,
      search,
    );
  }, [data, onlyNeed, effectiveSorts, search]);

  const donCards = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section === "don" || isDonCardType(c.card_type)),
      onlyNeed,
      effectiveSorts,
      search,
    );
  }, [data, onlyNeed, effectiveSorts, search]);

  const hasDonInDeck = useMemo(() => {
    if (!data) return false;
    return data.cards.some((c) => c.section === "don" || isDonCardType(c.card_type));
  }, [data]);

  const progressCards = useMemo(() => {
    if (!data) return [];
    return data.cards.filter((c) => c.section !== "don" && !isDonCardType(c.card_type));
  }, [data]);
  const statsCards = useMemo(
    () => progressCards.map((c) => ({ id: c.card_id, copies: c.needed })),
    [progressCards],
  );
  // While editing the 50-card count stays quiet; once the user is done (or just viewing) it is checked.
  const hints = useDeckHints(deckId, statsCards, data?.leader_card_id ?? null, !editing);
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (onlyNeed) parts.push("Still need");
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (showAltArts) parts.push("Alt arts");
    if (layout === "grid") parts.push("Grid");
    return parts.join(" · ");
  }, [onlyNeed, effectiveSorts, showAltArts, layout]);
  const filterCount = (onlyNeed ? 1 : 0) + (effectiveSorts.length ? 1 : 0) + (showAltArts ? 1 : 0);

  if (!data && lastError.current) {
    return <LoadErrorBlock title="Couldn't load this deck" message={lastError.current.message} retrying={isFetching} onRetry={() => void refetch()} />;
  }
  if (isLoading) return <DeckDetailSkeleton />;
  if (!data) return null;

  const duelUrl = duelPlayUrl(data);
  const refresh = () => invalidateOwnedViews(qc);
  const flashRow = (id: string) => setRowFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  const visibleCount = main.length + additional.length + donCards.length;
  const mainCount = data.main_cards ?? progressCards.reduce((s, c) => s + c.needed, 0);
  const donCount = data.don_cards ?? data.cards
    .filter((c) => c.section === "don" || isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);
  const leaderArt = data.leader_card_id
    ? data.cards.find((c) => c.card_id === data.leader_card_id)?.image_url
    : undefined;

  return (
    <div className={`deck-layout${sideEdit ? " deck-layout-editing" : ""}`}>
    <section className="deck-main">
      <div className="page-head">
        <div className="deck-detail-head">
          {leaderArt && (
            <img
              className="deck-detail-leader"
              src={cardImageUrl(leaderArt, "thumb") || leaderArt}
              alt={data.leader_name || data.leader_card_id || "Leader"}
            />
          )}
          <div className="deck-detail-head-text">
          <p className="eyebrow">
            <Link to="/decks">← Decks</Link>
          </p>
          <div className="deck-detail-title-row">
            <h1>{data.name}</h1>
            {data.is_main && <span className="deck-main-badge">Main deck</span>}
            <span className="muted deck-size-inline">
              Main {mainCount}/{MAIN_DECK_LIMIT} · DON!! {donCount}/{DON_DECK_LIMIT}
            </span>
          </div>
          <p className="muted">
            {data.leader_card_id
              ? `Leader ${data.leader_card_id}${data.leader_name ? ` · ${data.leader_name}` : ""}`
              : "No leader detected"}
            {data.prior_decks.length > 0
              ? ` · Compared to Main: ${data.prior_decks.join(", ")}`
              : data.is_main && data.leader_card_id
                ? " · Main deck for this leader"
                : ""}
          </p>
          <p className="muted deck-size-meta deck-size-below">
            Main {mainCount}/{MAIN_DECK_LIMIT} · DON!! {donCount}/{DON_DECK_LIMIT}
          </p>
          </div>
        </div>
        <div className="page-head-actions deck-head-actions">
          <button
            type="button"
            className={`deck-edit-toggle ${editing ? "btn secondary" : "btn primary"}`}
            aria-pressed={editing}
            onClick={() => {
              setEditing((v) => {
                const next = !v;
                if (!next && searchParams.get("edit") === "1") {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete("edit");
                  setSearchParams(nextParams, { replace: true });
                }
                return next;
              });
            }}
          >
            {editing ? (
              <>
                Done<span className="done-editing-extra"> editing</span>
              </>
            ) : (
              "Edit deck"
            )}
          </button>
          {duelUrl ? (
            <a className="btn secondary duel-play-btn" href={duelUrl} target="_blank" rel="noopener">
              Play in Duel
            </a>
          ) : (
            <span className="btn secondary duel-play-btn" aria-disabled="true" title="Needs a leader and cards">
              Play in Duel
            </span>
          )}
          <HeadPopover
            label="Share"
            icon={<ShareIcon />}
            className="btn quiet"
            panelLabel="Share and export"
            width={360}
          >
            <div className="head-popover-sections">
              <DeckSharePanel
                shareMsg={shareMsg}
                sharing={shareDeck.isPending}
                onShare={() => shareDeck.mutate()}
              />
              <DeckExportPanel
                deck={data}
                exportMsg={exportMsg}
                onCopy={() => void copyOptcgSimList()}
                onDownload={downloadOptcgSimList}
              />
            </div>
          </HeadPopover>
          <HeadPopover
            label="More"
            icon={<MoreIcon />}
            className="btn quiet"
            panelLabel="More deck actions"
            width={260}
          >
            {(close) => (
              <div className="head-popover-menu" role="menu">
                {data.leader_card_id && !data.is_main && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={setMain.isPending}
                    onClick={() => {
                      setMain.mutate();
                      close();
                    }}
                  >
                    {setMain.isPending ? "Setting…" : "Set as Main deck"}
                    <span className="muted">Other decks for this leader compare against it</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  disabled={resetOwned.isPending || data.cards.length === 0}
                  onClick={() => {
                    close();
                    const ok = window.confirm(
                      "Reset owned counts to 0 for every card in this deck?\n\n" +
                        "Owned is shared across decks — those cards will also show as unowned in Shopping and other decks, and leave your Collection.",
                    );
                    if (!ok) return;
                    setResetMsg(null);
                    resetOwned.mutate();
                  }}
                >
                  {resetOwned.isPending ? "Resetting…" : "Reset owned counts"}
                  <span className="muted">Sets every card in this deck to 0 owned (also removes them from Collection)</span>
                </button>
              </div>
            )}
          </HeadPopover>
        </div>
      </div>

      {setMain.isError && (
        <p className="error">{(setMain.error as Error).message}</p>
      )}

      {resetMsg && (
        <p className="share-banner" role="status">
          {resetMsg}
        </p>
      )}

      {editing && !sideEdit && (
        <DeckEditorPanel deckId={deckId} deck={data} onUpdated={applyDeckUpdate} onChanged={flashRow} />
      )}

      <DeckProgressSummary cards={progressCards} />

      <div className="list-toolbar deck-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={filterSummary} badge={filterCount} badgeLabel="active filters">
          <div className="filters">
            <label>
              <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
              Still need only
            </label>
            <SortMenu
              sorts={sorts}
              onChange={setSorts}
              onlyNeed={onlyNeed}
              unavailableKeys={deckUnavailableSorts}
            />
            <label>
              <input
                type="checkbox"
                checked={showAltArts}
                onChange={(e) => setShowAltArts(e.target.checked)}
              />
              Show alt arts
            </label>
          </div>
        </CollapsibleFilters>
      </div>

      {search.trim() && (
        <p className="search-result-note muted">
          Showing {visibleCount} match{visibleCount === 1 ? "" : "es"} for “{search.trim()}”
        </p>
      )}

      {neededErr && <p className="error">{neededErr}</p>}
      {altWantErr && <p className="error">{altWantErr}</p>}

      {data.prior_decks.length > 0 && (
        <p className="banner">
          Cards also in the Main deck ({data.prior_decks.join(", ")}) are listed first. Cards that
          differ appear under Additional Cards.
        </p>
      )}
      <h2>Deck list</h2>
      <CardTable
        cards={main}
        onOwnedSaved={refresh}
        showAltArts={showAltArts}
        layout={layout}
        editing={editing}
        onNeededChange={(cardId, needed) => void changeNeeded(cardId, needed)}
        neededBusyId={neededBusyId}
        onAltWantChange={(cardId, productId, qty) => void changeAltWant(cardId, productId, qty)}
        altWantBusyKey={altWantBusyKey}
      />
      {additional.length > 0 && (
        <>
          <h2 className="additional-heading">
            Additional Cards — not in {data.prior_decks.join(", ")}
          </h2>
          <CardTable
            cards={additional}
            onOwnedSaved={refresh}
            showAltArts={showAltArts}
            layout={layout}
            editing={editing}
            onNeededChange={(cardId, needed) => void changeNeeded(cardId, needed)}
            neededBusyId={neededBusyId}
            onAltWantChange={(cardId, productId, qty) => void changeAltWant(cardId, productId, qty)}
            altWantBusyKey={altWantBusyKey}
          />
        </>
      )}

      <AvailableDonSection deckId={deckId} deck={data} onUpdated={applyDeckUpdate} />

      <h2 className="don-heading">
        DON!! deck · {donCount}/{DON_DECK_LIMIT}
      </h2>
      {donCards.length === 0 ? (
        <p className="muted">
          {hasDonInDeck
            ? "No DON!! cards match the current filters."
            : "No DON!! cards in this deck yet. Add some from the list above."}
        </p>
      ) : (
        <CardTable
          cards={donCards}
          onOwnedSaved={refresh}
          showAltArts={showAltArts}
          layout={layout}
          editing={editing}
          onNeededChange={(cardId, needed) => void changeNeeded(cardId, needed)}
          neededBusyId={neededBusyId}
          onAltWantChange={(cardId, productId, qty) => void changeAltWant(cardId, productId, qty)}
          altWantBusyKey={altWantBusyKey}
        />
      )}
    </section>
    {sideEdit && (
      <aside className="deck-editor-side" aria-label="Add cards">
        <DeckEditorPanel deckId={deckId} deck={data} onUpdated={applyDeckUpdate} onChanged={flashRow} />
      </aside>
    )}
    <DeckStatsDock cards={statsCards} leaderId={data.leader_card_id ?? null} hints={hints} compact={sideEdit} />
    </div>
  );
}

function ImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [decklist, setDecklist] = useState("");
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createDeck(name.trim(), decklist),
    onSuccess: async (deck) => {
      await qc.invalidateQueries({ queryKey: ["decks"] });
      await qc.invalidateQueries({ queryKey: ["shopping"] });
      // New imports are auto-added to open group-buy contributions.
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      await qc.invalidateQueries({ queryKey: ["group-buy"] });
      navigate(`/decks/${deck.id}`);
    },
    onError: (e: Error) => setErr(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!decklist.trim()) {
      setErr("Paste a deck code or upload a file first.");
      return;
    }
    create.mutate();
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (!name) setName(file.name.replace(/\.(txt|deck)$/i, ""));
    file.text().then((text) => {
      setDecklist(text);
      setMode("paste");
    });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setErr("Clipboard is empty.");
        return;
      }
      setDecklist(text.trim());
      setErr(null);
      setMode("paste");
    } catch {
      setErr("Could not read clipboard — paste into the box with Ctrl+V.");
    }
  }

  return (
    <section>
      <h1>Import deck</h1>
      <p className="muted">
        Paste an OPTCGSim deck code from your clipboard, or upload a <code>.txt</code> /{" "}
        <code>.deck</code> file.
      </p>
      <form className="import-form" onSubmit={onSubmit}>
        <label>
          Deck name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="import-modes" role="tablist" aria-label="Import method">
          <button
            type="button"
            className={mode === "paste" ? "mode active" : "mode"}
            onClick={() => setMode("paste")}
          >
            Paste deck code
          </button>
          <button
            type="button"
            className={mode === "file" ? "mode active" : "mode"}
            onClick={() => setMode("file")}
          >
            Upload file
          </button>
        </div>

        {mode === "paste" ? (
          <div className="paste-block">
            <div className="paste-actions">
              <button type="button" className="btn secondary" onClick={pasteFromClipboard}>
                Paste from clipboard
              </button>
            </div>
            <label>
              Deck code
              <textarea
                value={decklist}
                onChange={(e) => setDecklist(e.target.value)}
                rows={16}
                placeholder={"1xOP15-002\n4xOP15-053\n4xOP15-052\n…"}
                required
              />
            </label>
            <p className="hint">
              Same format as OPTCGSim “Copy Deck List to Clipboard” — one card per line like{" "}
              <code>4xOP15-053</code>.
            </p>
          </div>
        ) : (
          <label>
            Decklist file (.txt / .deck)
            <input
              type="file"
              accept=".txt,.deck,text/plain"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {decklist && (
              <p className="hint">
                Loaded {decklist.split("\n").filter((l) => l.trim()).length} lines — switch to
                “Paste deck code” to review before creating.
              </p>
            )}
          </label>
        )}

        {err && <p className="error">{err}</p>}
        <button className="btn primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Create deck"}
        </button>
      </form>
    </section>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <AuthLoadingSkeleton label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell user={user}>{children}</Shell>;
}

function PublicSharePage() {
  const { token = "" } = useParams();
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useCardLayout();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => api.publicShare(token),
    enabled: Boolean(token),
  });

  const shareStatsCards = useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => !isDonCardType(i.card_type))
        .map((i) => ({ id: i.card_id, copies: i.need })),
    [data],
  );

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter((i) => i.still_need > 0);
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    list = [...list].sort((a, b) => compareCardOrder(a, b, ["color", "set"]));
    return list;
  }, [data, onlyNeed, search]);

  return (
    <div className="app public-app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/login">
              <img
                className="brand-logo"
                src="/optcg-logo.png"
                alt="ONE PIECE CARD GAME"
                width={562}
                height={145}
              />
              <span>Planner</span>
            </Link>
          </div>
          <div className="user">
            <BuildTag />
            <a className="duel-nav-link" href={DUEL_URL} target="_blank" rel="noopener">
              Play Duel
            </a>
            <ThemeToggle />
            <Link className="btn secondary" to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main className="app-main">
        {isLoading && <ShoppingListSkeleton />}
        {error && <p className="error">{(error as Error).message}</p>}
        {data && (
          <div className={data.kind === "deck" ? "deck-layout" : undefined}>
          <section className="deck-main">
            <div className="page-head">
              <div>
                <p className="eyebrow">Public {data.kind === "deck" ? "deck" : "shopping"} list</p>
                <h1>{data.deck_name || `${data.owner_name}'s list`}</h1>
                <p className="muted">
                  Shared by {data.owner_name} · {formatShoppingListStats(data)}
                </p>
              </div>
            </div>

            <div className="list-toolbar">
              <div className="list-toolbar-row">
                <CardSearchInput value={search} onChange={setSearch} />
                <CardLayoutToggle layout={layout} onChange={setLayout} />
              </div>
              <div className="filters">
                <label>
                  <input
                    type="checkbox"
                    checked={onlyNeed}
                    onChange={(e) => setOnlyNeed(e.target.checked)}
                  />
                  Still need only
                </label>
              </div>
            </div>

            {layout === "grid" ? (
              <div className="card-grid">
                {items.map((item) => (
                  <article
                    key={item.card_id}
                    className={`grid-card ${item.still_need > 0 ? "need" : "done"}`}
                  >
                    <div className="grid-card-media">
                      <CardThumb src={item.image_url || undefined} alt={item.name} />
                    </div>
                    <div className="grid-card-body">
                      <div className="card-id">{item.card_id}</div>
                      <div className="grid-card-name">{item.name}</div>
                      <div className="grid-card-meta muted">
                        Owned {item.owned} · {item.still_need}/{item.need} still needed
                        {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                      </div>
                      <div className="grid-card-price">
                        <MarketPrice price={item.market_price} productId={item.product_id} />
                      </div>
                      {item.tcgplayer_url && (
                        <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <>
                <div className="table-wrap desktop-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Card</th>
                        <th>Owned</th>
                        <th>Still needed</th>
                        <th>Market</th>
                        <th>Remaining</th>
                        <th>Used in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.card_id} className={item.still_need > 0 ? "need" : "done"}>
                          <td className="card-cell">
                            <div className="card-cell-inner">
                              <CardThumb src={item.image_url || undefined} alt={item.name} />
                              <div>
                                <div className="card-id">{item.card_id}</div>
                                <div>{item.name}</div>
                                {item.tcgplayer_url && (
                                  <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                                    TCGPlayer
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>{item.owned}</td>
                          <td>{item.still_need}/{item.need}</td>
                          <td>
                            <MarketPrice price={item.market_price} productId={item.product_id} />
                          </td>
                          <td>{money(item.remaining_cost)}</td>
                          <td className="used-in">
                            {[item.used_in.join(", "), needBreakdownLabel(item)].filter(Boolean).join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-card-list">
                  {items.map((item) => (
                    <article
                      key={item.card_id}
                      className={`mobile-card ${item.still_need > 0 ? "need" : "done"}`}
                    >
                      <div className="mobile-card-top">
                        <MobileCardMedia
                          src={item.image_url || undefined}
                          alt={item.name}
                          cost={item.cost}
                          rarity={item.rarity}
                        />
                        <div className="mobile-card-info">
                          <div className="card-id">{item.card_id}</div>
                          <div className="mobile-card-name">{item.name}</div>
                          <div className="mobile-card-meta">
                            {[`Owned ${item.owned}`, `${item.still_need}/${item.need} still needed`]
                              .filter(Boolean)
                              .join(" · ")}
                            {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                          </div>
                          <div className="mobile-card-price-row">
                            <div className="mobile-card-price-main">
                              <span className="muted">Market</span>
                              <MarketPrice price={item.market_price} productId={item.product_id} />
                              {item.tcgplayer_url ? (
                                <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                                  TCGPlayer
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      {item.used_in.length > 0 && (
                        <p className="used-in mobile-used-in">
                          {[item.used_in.join(", "), needBreakdownLabel(item)].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
          {data.kind === "deck" && (
            <DeckStatsDock cards={shareStatsCards} leaderId={data.items[0]?.primary_leader_card_id ?? null} />
          )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:token" element={<PublicSharePage />} />
        <Route path="/group-buy/join/:token" element={<GroupBuyJoinPage />} />
        <Route path="/group-buy/view/:token" element={<PublicGroupBuyPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/cookies" element={<LegalPage kind="cookies" />} />
        {import.meta.env.DEV && <Route path="/dev/scan-validate" element={<ScanValidatePage />} />}
        <Route
          path="/"
          element={
            <RequireAuth>
              <ShoppingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/decks"
          element={
            <RequireAuth>
              <DecksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/decks/:id"
          element={
            <RequireAuth>
              <DeckDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/collection"
          element={
            <RequireAuth>
              <CollectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/group-buys"
          element={
            <RequireAuth>
              <GroupBuysPage />
            </RequireAuth>
          }
        />
        <Route
          path="/group-buys/:id"
          element={
            <RequireAuth>
              <GroupBuyDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/import"
          element={
            <RequireAuth>
              <ImportPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter Link={Link} />
    </>
  );
}
