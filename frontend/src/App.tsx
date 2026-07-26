import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  api,
  CardView,
  DeckDetail,
  money,
  PrintingView,
  ShoppingItem,
  ShoppingResponse,
  User,
} from "./api";
import {
  blankMassEntryUrl,
  buildMassEntryExport,
} from "./tcgplayerMassEntry";
import {
  consumeLoginNext,
  GroupBuyDetailPage,
  GroupBuyJoinPage,
  GroupBuysPage,
  rememberLoginNext,
} from "./GroupBuys";

const SHOPPING_DECKS_KEY = "optcg_shopping_deck_ids";
const SHOW_ALT_ARTS_KEY = "optcg_show_alt_arts";
const CARD_SORTS_KEY = "optcg_card_sorts";
const FILTERS_OPEN_KEY = "optcg_filters_open";
const SHARE_OPEN_KEY = "optcg_share_open";
const DECK_PROGRESS_MODE_KEY = "optcg_deck_progress_mode";
const SHOPPING_SELECTED_KEY = "optcg_shopping_selected_cards";
const CARD_LAYOUT_KEY = "optcg_card_layout";

type CardLayout = "list" | "grid";

const COLOR_ORDER = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
const SET_PREFIX_ORDER = ["OP", "ST", "EB", "PRB", "P"];

type SortKey = "still_need" | "color" | "set" | "deck" | "price";

const ALL_SORT_KEYS: SortKey[] = ["deck", "still_need", "price", "color", "set"];
const DEFAULT_SORTS: SortKey[] = ["color", "set"];
const SORT_LABELS: Record<SortKey, string> = {
  deck: "Deck",
  still_need: "Still need",
  price: "Price",
  color: "Color",
  set: "Set",
};

type SortableCard = {
  card_id: string;
  color: string;
  still_need: number;
  deck_sort_key?: string;
  market_price?: number | null;
};

function colorSortKey(color: string): string {
  const parts = color
    .split(/[\/,&]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "zzz";
  return parts
    .map((p) => {
      const idx = COLOR_ORDER.findIndex((c) => c.toLowerCase() === p.toLowerCase());
      return idx >= 0 ? String(idx).padStart(2, "0") : `9${p.toLowerCase()}`;
    })
    .join("/");
}

function setSortKey(cardId: string): string {
  const id = cardId.toUpperCase();
  const dash = id.indexOf("-");
  const setCode = dash >= 0 ? id.slice(0, dash) : id;
  const m = setCode.match(/^([A-Z]+?)(\d*)$/);
  const prefix = m?.[1] ?? setCode;
  const num = m?.[2] ? Number(m[2]) : 0;
  const prefixIdx = SET_PREFIX_ORDER.indexOf(prefix);
  const prefixRank = prefixIdx >= 0 ? String(prefixIdx).padStart(2, "0") : `9${prefix}`;
  return `${prefixRank}-${String(num).padStart(4, "0")}-${setCode}`;
}

function compareBySortKey(a: SortableCard, b: SortableCard, key: SortKey): number {
  if (key === "still_need") return b.still_need - a.still_need;
  if (key === "color") return colorSortKey(a.color).localeCompare(colorSortKey(b.color));
  if (key === "deck") {
    return (a.deck_sort_key || "zzzz").localeCompare(b.deck_sort_key || "zzzz");
  }
  if (key === "price") {
    const ap = a.market_price;
    const bp = b.market_price;
    if (ap == null && bp == null) return 0;
    if (ap == null) return 1;
    if (bp == null) return -1;
    return bp - ap;
  }
  return setSortKey(a.card_id).localeCompare(setSortKey(b.card_id));
}

function compareCardOrder(a: SortableCard, b: SortableCard, sorts: SortKey[]): number {
  for (const key of sorts) {
    const cmp = compareBySortKey(a, b, key);
    if (cmp !== 0) return cmp;
  }
  return a.card_id.localeCompare(b.card_id);
}

function loadCardSorts(): SortKey[] {
  try {
    const raw = localStorage.getItem(CARD_SORTS_KEY);
    if (!raw) return DEFAULT_SORTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SORTS;
    const valid = parsed.filter((k): k is SortKey => ALL_SORT_KEYS.includes(k as SortKey));
    return valid.length ? valid : DEFAULT_SORTS;
  } catch {
    return DEFAULT_SORTS;
  }
}

function useCardSorts(onlyNeed: boolean, unavailableKeys: SortKey[] = []) {
  const [sorts, setSorts] = useState<SortKey[]>(() => loadCardSorts());

  useEffect(() => {
    if (!onlyNeed) return;
    setSorts((prev) => (prev.includes("still_need") ? prev.filter((k) => k !== "still_need") : prev));
  }, [onlyNeed]);

  useEffect(() => {
    try {
      localStorage.setItem(CARD_SORTS_KEY, JSON.stringify(sorts));
    } catch {
      /* ignore */
    }
  }, [sorts]);

  const effectiveSorts = useMemo(
    () =>
      sorts.filter((k) => {
        if (k === "still_need" && onlyNeed) return false;
        if (unavailableKeys.includes(k)) return false;
        return true;
      }),
    [onlyNeed, sorts, unavailableKeys],
  );

  return { sorts, setSorts, effectiveSorts };
}

function SortMenu({
  sorts,
  onChange,
  onlyNeed,
  unavailableKeys = [],
}: {
  sorts: SortKey[];
  onChange: (next: SortKey[]) => void;
  onlyNeed: boolean;
  unavailableKeys?: SortKey[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menuKeys = useMemo(() => {
    const inactive = ALL_SORT_KEYS.filter((k) => !sorts.includes(k));
    return [...sorts, ...inactive];
  }, [sorts]);

  const summary =
    sorts.filter((k) => !unavailableKeys.includes(k) && !(k === "still_need" && onlyNeed)).length === 0
      ? "Card ID"
      : sorts
          .filter((k) => !unavailableKeys.includes(k) && !(k === "still_need" && onlyNeed))
          .map((k) => SORT_LABELS[k])
          .join(" › ");

  function keyDisabled(key: SortKey): string | null {
    if (key === "still_need" && onlyNeed) return "Off while Still need only";
    if (unavailableKeys.includes(key)) {
      if (key === "deck") return "Shopping list only";
      return "Unavailable here";
    }
    return null;
  }

  function toggleKey(key: SortKey) {
    if (keyDisabled(key)) return;
    if (sorts.includes(key)) {
      onChange(sorts.filter((k) => k !== key));
      return;
    }
    onChange([...sorts, key]);
  }

  function moveKey(key: SortKey, dir: -1 | 1) {
    const idx = sorts.indexOf(key);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= sorts.length) return;
    const copy = [...sorts];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        className="sort-menu-btn"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Sort: {summary}
      </button>
      {open && (
        <div className="sort-menu-panel" role="menu">
          <p className="sort-menu-hint">
            Top option sorts first. Price is highest market price first. Deck groups by leader
            (earliest deck first); cards used by multiple leaders stay under their earliest leader.
          </p>
          <ul className="sort-menu-list">
            {menuKeys.map((key) => {
              const active = sorts.includes(key);
              const disabledReason = keyDisabled(key);
              const disabled = Boolean(disabledReason);
              const activeIdx = sorts.indexOf(key);
              return (
                <li key={key} className={`sort-menu-item${disabled ? " disabled" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={active && !disabled}
                      disabled={disabled}
                      onChange={() => toggleKey(key)}
                    />
                    <span>{SORT_LABELS[key]}</span>
                  </label>
                  {disabledReason && <span className="sort-menu-note">{disabledReason}</span>}
                  {active && !disabled && (
                    <span className="sort-menu-move">
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Move ${SORT_LABELS[key]} up`}
                        disabled={activeIdx <= 0}
                        onClick={() => moveKey(key, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Move ${SORT_LABELS[key]} down`}
                        disabled={activeIdx >= sorts.length - 1}
                        onClick={() => moveKey(key, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function matchesCardSearch(
  card: {
    card_id: string;
    name: string;
    color?: string;
    card_type?: string;
    rarity?: string;
    used_in?: string[];
    primary_leader_name?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    card.card_id,
    card.name,
    card.color,
    card.card_type,
    card.rarity,
    card.primary_leader_name,
    ...(card.used_in ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

function usePersistedOpen(storageKey: string | undefined, defaultOpen: boolean) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return defaultOpen;
      return raw === "1";
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);
  return [open, setOpen] as const;
}

function useFiltersOpen() {
  return usePersistedOpen(FILTERS_OPEN_KEY, false);
}

function CardSearchInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const id = useId();
  return (
    <div className="card-search">
      <label className="sr-only" htmlFor={id}>
        Search cards
      </label>
      <input
        id={id}
        type="search"
        className="card-search-input"
        placeholder="Search name, ID, color…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          className="ghost card-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function CollapsibleDrawer({
  label,
  summary,
  storageKey,
  defaultOpen = false,
  children,
}: {
  label: string;
  summary?: string;
  storageKey?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);
  const panelId = useId();

  return (
    <div className={`filter-drawer${open ? " open" : ""}`}>
      <button
        type="button"
        className="filter-drawer-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="filter-drawer-label">
          {label}
          {summary ? <span className="filter-drawer-summary"> · {summary}</span> : null}
        </span>
        <span className="filter-drawer-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="filter-drawer-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleFilters({
  summary,
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <CollapsibleDrawer label="Filters" summary={summary} storageKey={FILTERS_OPEN_KEY}>
      {children}
    </CollapsibleDrawer>
  );
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
  const summary = shareInfo ? "On" : "Off";
  return (
    <CollapsibleDrawer label="Public link" summary={summary} storageKey={SHARE_OPEN_KEY}>
      <div className="share-panel">
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
    </CollapsibleDrawer>
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
    <CollapsibleDrawer label="Public link" summary={shareMsg ? "Ready" : undefined} storageKey={SHARE_OPEN_KEY}>
      <div className="share-panel">
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
    </CollapsibleDrawer>
  );
}

function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me });
}

function invalidateOwnedViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
}

function patchOwnedQty(cardId: string, qty: number, need: number, market: number | null | undefined) {
  const still = Math.max(0, need - qty);
  const remaining =
    market != null && !Number.isNaN(market) ? Math.round(still * market * 100) / 100 : null;
  return { owned: qty, still_need: still, remaining_cost: remaining };
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
  qc.setQueriesData<DeckDetail>({ queryKey: ["deck"] }, (old) => {
    if (!old) return old;
    return {
      ...old,
      cards: old.cards.map((card) => {
        if (card.card_id.toUpperCase() !== id) return card;
        const patched = patchOwnedQty(id, qty, card.needed, card.market_price);
        return { ...card, owned: patched.owned, still_need: patched.still_need };
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
              <span>OPTCG Tracker</span>
            </Link>
          </div>
          <nav>
            <Link to="/">Shopping</Link>
            <Link to="/decks">Decks</Link>
            <Link to="/group-buys">Group buys</Link>
            <Link to="/import">Import</Link>
          </nav>
          <div className="user">
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
  if (claiming) return <p className="muted center">Signing you in…</p>;

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
          Track decks, Owned counts across your lists, and market prices.
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
      </div>
    </div>
  );
}

function CardThumb({ src, alt = "" }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) return <div className="thumb placeholder" />;

  return (
    <>
      <button type="button" className="thumb-btn" onClick={() => setOpen(true)} title="Expand card">
        <img src={src} alt={alt} className="thumb" loading="lazy" />
      </button>
      {open && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded card art"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="lightbox-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}

function MobileCardMedia({
  src,
  alt,
  cost,
  rarity,
}: {
  src?: string;
  alt: string;
  cost: number | string | null;
  rarity?: string;
}) {
  return (
    <div className="mobile-card-media">
      <CardThumb src={src} alt={alt} />
      <div className="mobile-card-media-meta">
        <span className="mobile-card-cost">Cost {cost ?? "—"}</span>
        {rarity ? <span className="mobile-card-rarity">{rarity}</span> : null}
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

function useShowAltArts() {
  const [showAltArts, setShowAltArts] = useState(() => {
    try {
      return localStorage.getItem(SHOW_ALT_ARTS_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SHOW_ALT_ARTS_KEY, showAltArts ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showAltArts]);
  return [showAltArts, setShowAltArts] as const;
}

function formatSaleDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useCardLayout() {
  const [layout, setLayout] = useState<CardLayout>(() => {
    try {
      return localStorage.getItem(CARD_LAYOUT_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CARD_LAYOUT_KEY, layout);
    } catch {
      /* ignore */
    }
  }, [layout]);
  return [layout, setLayout] as const;
}

function CardLayoutToggle({
  layout,
  onChange,
}: {
  layout: CardLayout;
  onChange: (next: CardLayout) => void;
}) {
  return (
    <div className="layout-toggle" role="group" aria-label="Card layout">
      <button
        type="button"
        className={layout === "list" ? "active" : ""}
        aria-pressed={layout === "list"}
        onClick={() => onChange("list")}
      >
        List
      </button>
      <button
        type="button"
        className={layout === "grid" ? "active" : ""}
        aria-pressed={layout === "grid"}
        onClick={() => onChange("grid")}
      >
        Grid
      </button>
    </div>
  );
}

function MarketPrice({
  price,
  productId,
}: {
  price: number | null | undefined;
  productId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const canExpand = productId != null && productId > 0;
  const salesQ = useQuery({
    queryKey: ["recent-sales", productId],
    queryFn: () => api.recentSales(productId!),
    enabled: open && canExpand,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = 224;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPanelPos({ top: rect.bottom + 6, left });
    }
    place();
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (price == null || Number.isNaN(price)) {
    return <span className="muted">—</span>;
  }

  if (!canExpand) {
    return <span>{money(price)}</span>;
  }

  return (
    <div ref={rootRef} className={`market-price${open ? " open" : ""}`}>
      <button
        ref={btnRef}
        type="button"
        className="market-price-btn"
        aria-expanded={open}
        title="Show last 3 sold prices"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{money(price)}</span>
        <span className="market-price-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && panelPos && (
        <div
          className="market-sales"
          role="region"
          aria-label="Last 3 sold prices"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <div className="market-sales-head">Last 3 sold</div>
          {salesQ.isLoading && <p className="muted market-sales-status">Loading…</p>}
          {salesQ.error && (
            <p className="error market-sales-status">{(salesQ.error as Error).message}</p>
          )}
          {salesQ.data && salesQ.data.sales.length === 0 && (
            <p className="muted market-sales-status">No recent sales</p>
          )}
          {salesQ.data && salesQ.data.sales.length > 0 && (
            <ul className="market-sales-list">
              {salesQ.data.sales.map((sale, idx) => (
                <li key={`${sale.order_date}-${sale.price}-${idx}`}>
                  <span className="market-sale-price">{money(sale.price)}</span>
                  <span className="market-sale-meta">
                    {[sale.condition, sale.variant, formatSaleDate(sale.order_date)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AltArtsRow({ alts }: { alts: PrintingView[] }) {
  if (!alts.length) return <span className="muted">—</span>;
  return (
    <div className="alt-arts">
      {alts.map((alt) => (
        <div key={alt.product_id} className="alt-art">
          <CardThumb src={alt.image_url || undefined} alt={alt.name} />
          <div className="alt-meta">
            <MarketPrice price={alt.market_price} productId={alt.product_id} />
            {alt.tcgplayer_url ? (
              <a href={alt.tcgplayer_url} target="_blank" rel="noreferrer" title={alt.name}>
                Alt
              </a>
            ) : (
              <span className="muted" title={alt.name}>
                Alt
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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

function ShoppingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const [onlyNeed, setOnlyNeed] = useState(true);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const sortingByDeck = effectiveSorts.includes("deck");

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter((i) => i.still_need > 0);
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    list = [...list].sort((a, b) => compareCardOrder(a, b, effectiveSorts));
    return list;
  }, [data, onlyNeed, effectiveSorts, search]);

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
          ? "Opened TCGPlayer Mass Entry (list also copied). Use Add to Cart → Optimize Cart."
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
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (showAltArts) parts.push("Alt arts");
    if (layout === "grid") parts.push("Grid");
    if (allDeckIds.length > 0 && activeDeckIds.length < allDeckIds.length) {
      parts.push(`${activeDeckIds.length}/${allDeckIds.length} decks`);
    }
    return parts.join(" · ");
  }, [onlyNeed, effectiveSorts, showAltArts, layout, activeDeckIds.length, allDeckIds.length]);

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
    if ((item.leader_count ?? 1) > 1) {
      const primary = item.primary_leader_name || item.primary_leader_card_id || "earliest deck";
      return `${decks} · shared (sorted under ${primary})`;
    }
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
    return <p className="muted">Loading shopping list…</p>;
  }
  if (decksQ.error) return <p className="error">{(decksQ.error as Error).message}</p>;
  if (allDeckIds.length === 0) {
    return (
      <section>
        <h1>Master Shopping</h1>
        <p className="muted">
          No decks yet. <Link to="/import">Import a deck</Link> to build your shopping list.
        </p>
      </section>
    );
  }
  if (isLoading) return <p className="muted">Loading shopping list…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;

  const shareInfo = shareQ.data;
  const shareUrl = shareInfo ? `${window.location.origin}${shareInfo.path}` : null;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Master Shopping</h1>
          <p className="muted">
            {data?.unique_cards ?? 0} unique cards · {data?.cards_still_needed ?? 0} still needed ·{" "}
            {money(data?.remaining_market)}
          </p>
        </div>
        <div className="page-head-actions">
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

      <div className="list-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={filterSummary}>
          <div className="filters">
            <label>
              <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
              Still need only
            </label>
            <SortMenu sorts={sorts} onChange={setSorts} onlyNeed={onlyNeed} />
            <label>
              <input
                type="checkbox"
                checked={showAltArts}
                onChange={(e) => setShowAltArts(e.target.checked)}
              />
              Show alt arts
            </label>
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

      {layout === "grid" ? (
        <div className="card-grid">
          {items.map((item: ShoppingItem) => {
            const checked = selectedCardIds.has(item.card_id);
            return (
              <article
                key={item.card_id}
                className={`grid-card ${item.still_need > 0 ? "need" : "done"}${checked ? " selected-row" : ""}`}
              >
                <div className="grid-card-media">
                  <label className="grid-card-select">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCard(item.card_id)}
                      aria-label={`Select ${item.card_id}`}
                    />
                  </label>
                  <CardThumb src={item.image_url || undefined} alt={item.name} />
                </div>
                <div className="grid-card-body">
                  <div className="card-id">{item.card_id}</div>
                  <div className="grid-card-name">{item.name}</div>
                  <div className="grid-card-meta muted">
                    Still {item.still_need} · Need {item.need}
                    {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                  </div>
                  <div className="grid-card-price">
                    <MarketPrice price={item.market_price} productId={item.product_id} />
                  </div>
                  <div className="grid-card-owned">
                    <span>Owned</span>
                    <OwnedInput
                      cardId={item.card_id}
                      value={item.owned}
                      onSaved={() => invalidateOwnedViews(qc)}
                    />
                  </div>
                  {item.tcgplayer_url && (
                    <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                      TCGPlayer
                    </a>
                  )}
                  {showAltArts && (item.alt_arts?.length ?? 0) > 0 && (
                    <div className="grid-card-alts">
                      <AltArtsRow alts={item.alt_arts ?? []} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <>
          <div className="table-wrap desktop-table">
            <table className="data-table shopping-table">
              <thead>
                <tr>
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectVisible}
                      aria-label={allVisibleSelected ? "Deselect visible cards" : "Select visible cards"}
                      disabled={items.length === 0}
                    />
                  </th>
                  <th>Card</th>
                  <th>Owned</th>
                  <th>Still</th>
                  <th>Need</th>
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
                          onChange={() => toggleCard(item.card_id)}
                          aria-label={`Select ${item.card_id}`}
                        />
                      </td>
                      <td className="card-cell">
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
                      </td>
                      <td>
                        <OwnedInput
                          cardId={item.card_id}
                          value={item.owned}
                          onSaved={() => invalidateOwnedViews(qc)}
                        />
                      </td>
                      <td>{item.still_need}</td>
                      <td>{item.need}</td>
                      <td>
                        <MarketPrice price={item.market_price} productId={item.product_id} />
                      </td>
                      <td>{money(item.remaining_cost)}</td>
                      <td>{item.cost ?? "—"}</td>
                      {showAltArts && (
                        <td>
                          <AltArtsRow alts={item.alt_arts ?? []} />
                        </td>
                      )}
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
                  className={`mobile-card ${item.still_need > 0 ? "need" : "done"}${checked ? " selected-row" : ""}`}
                >
                  <div className="mobile-card-top">
                    <label className="mobile-select">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCard(item.card_id)}
                        aria-label={`Select ${item.card_id}`}
                      />
                    </label>
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
                        {[item.color, `Still ${item.still_need}`, `Need ${item.need}`]
                          .filter(Boolean)
                          .join(" · ")}
                        {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                      </div>
                      <div className="mobile-card-price-row">
                        <span className="muted">Market</span>
                        <MarketPrice price={item.market_price} productId={item.product_id} />
                      </div>
                      {item.tcgplayer_url && (
                        <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    <OwnedInput
                      cardId={item.card_id}
                      value={item.owned}
                      onSaved={() => invalidateOwnedViews(qc)}
                    />
                  </div>
                  {showAltArts && (item.alt_arts?.length ?? 0) > 0 && (
                    <div className="mobile-card-alts">
                      <AltArtsRow alts={item.alt_arts ?? []} />
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
      )}
    </section>
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
  const del = useMutation({
    mutationFn: api.deleteDeck,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["decks"] });
      invalidateOwnedViews(qc);
    },
  });

  if (isLoading) return <p className="muted">Loading decks…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;

  return (
    <section>
      <div className="page-head">
        <h1>Decks</h1>
        <Link className="btn primary" to="/import">
          Import deck
        </Link>
      </div>
      <div className="deck-grid">
        {(data ?? []).map((d) => {
          const fallback = d.leader_card_id ? leaderArtById.get(d.leader_card_id) : undefined;
          const leaderImage = d.leader_image_url || fallback?.image_url || "";
          const leaderName = d.leader_name || fallback?.name || null;
          return (
            <article
              key={d.id}
              className="deck-card"
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
                        src={leaderImage}
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
                  <h2>{d.name}</h2>
                  <p className="deck-card-leader">
                    {d.leader_card_id
                      ? `${leaderName || "Leader"} · ${d.leader_card_id}`
                      : "No leader detected"}
                  </p>
                  <p className="muted">
                    {d.card_count} unique · {d.total_cards} cards
                  </p>
                </div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost danger"
                  onClick={(e) => {
                    e.stopPropagation();
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
            {mode === "copies" ? "copies owned" : "uniques complete"} · <strong>{still}</strong> still
            needed
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
}: {
  cards: CardView[];
  onOwnedSaved: () => void;
  showAltArts: boolean;
  layout?: CardLayout;
}) {
  if (layout === "grid") {
    return (
      <div className="card-grid">
        {cards.map((c) => (
          <article
            key={`${c.section}-${c.card_id}`}
            className={`grid-card ${c.still_need > 0 ? "need" : "done"}`}
          >
            <div className="grid-card-media">
              <CardThumb src={c.image_url || undefined} alt={c.name} />
            </div>
            <div className="grid-card-body">
              <div className="card-id">{c.card_id}</div>
              <div className="grid-card-name">{c.name}</div>
              <div className="grid-card-meta muted">
                {[`Still ${c.still_need}`, `Need ${c.needed}`, c.card_type || ""].filter(Boolean).join(" · ")}
              </div>
              <div className="grid-card-price">
                <MarketPrice price={c.market_price} productId={c.product_id} />
              </div>
              <div className="grid-card-owned">
                <span>Owned</span>
                <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
              </div>
              {c.tcgplayer_url && (
                <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                  TCGPlayer
                </a>
              )}
              {showAltArts && (c.alt_arts?.length ?? 0) > 0 && (
                <div className="grid-card-alts">
                  <AltArtsRow alts={c.alt_arts ?? []} />
                </div>
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
              <th>Still</th>
              <th>Needed</th>
              <th>Market</th>
              <th>Type</th>
              <th>Cost</th>
              {showAltArts && <th>Alt arts</th>}
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={`${c.section}-${c.card_id}`} className={c.still_need > 0 ? "need" : "done"}>
                <td className="card-cell">
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
                </td>
                <td>
                  <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
                </td>
                <td>{c.still_need}</td>
                <td>{c.needed}</td>
                <td>
                  <MarketPrice price={c.market_price} productId={c.product_id} />
                </td>
                <td>{c.card_type || "—"}</td>
                <td>{c.cost ?? "—"}</td>
                {showAltArts && (
                  <td>
                    <AltArtsRow alts={c.alt_arts ?? []} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {cards.map((c) => (
          <article
            key={`${c.section}-${c.card_id}`}
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
                  {[c.color, `Still ${c.still_need}`, `Need ${c.needed}`, c.card_type || ""]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="mobile-card-price-row">
                  <span className="muted">Market</span>
                  <MarketPrice price={c.market_price} productId={c.product_id} />
                </div>
                {c.tcgplayer_url && (
                  <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                    TCGPlayer
                  </a>
                )}
              </div>
            </div>
            <div className="mobile-card-owned">
              <span>Owned</span>
              <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
            </div>
            {showAltArts && (c.alt_arts?.length ?? 0) > 0 && (
              <div className="mobile-card-alts">
                <AltArtsRow alts={c.alt_arts ?? []} />
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function DeckDetailPage() {
  const { id } = useParams();
  const deckId = Number(id);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["deck", deckId],
    queryFn: () => api.deck(deckId),
    enabled: Number.isFinite(deckId),
  });
  const [onlyNeed, setOnlyNeed] = useState(true);
  const deckUnavailableSorts = useMemo(() => ["deck"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, deckUnavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
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

  const main = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section !== "additional"),
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

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (onlyNeed) parts.push("Still need");
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (showAltArts) parts.push("Alt arts");
    if (layout === "grid") parts.push("Grid");
    return parts.join(" · ");
  }, [onlyNeed, effectiveSorts, showAltArts, layout]);

  if (isLoading) return <p className="muted">Loading deck…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;
  if (!data) return null;

  const refresh = () => invalidateOwnedViews(qc);
  const visibleCount = main.length + additional.length;

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/decks">Decks</Link>
          </p>
          <h1>{data.name}</h1>
          <p className="muted">
            {data.leader_card_id
              ? `Leader ${data.leader_card_id}${data.leader_name ? ` · ${data.leader_name}` : ""}`
              : "No leader detected"}
            {data.prior_decks.length > 0
              ? ` · Same leader as ${data.prior_decks.join(", ")}`
              : ""}
          </p>
        </div>
      </div>

      <DeckSharePanel
        shareMsg={shareMsg}
        sharing={shareDeck.isPending}
        onShare={() => shareDeck.mutate()}
      />

      <DeckProgressSummary cards={data.cards} />

      <div className="list-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={filterSummary}>
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

      {data.prior_decks.length > 0 && (
        <p className="banner">
          Cards already in earlier same-leader decks are listed first. New pieces are under
          Additional Cards.
        </p>
      )}
      <h2>Deck list</h2>
      <CardTable cards={main} onOwnedSaved={refresh} showAltArts={showAltArts} layout={layout} />
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
          />
        </>
      )}
    </section>
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
  if (isLoading) return <p className="muted center">Loading…</p>;
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
              <span>OPTCG Tracker</span>
            </Link>
          </div>
          <div className="user">
            <Link className="btn secondary" to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main className="app-main">
        {isLoading && <p className="muted">Loading shared list…</p>}
        {error && <p className="error">{(error as Error).message}</p>}
        {data && (
          <section>
            <div className="page-head">
              <div>
                <p className="eyebrow">Public {data.kind === "deck" ? "deck" : "shopping"} list</p>
                <h1>{data.deck_name || `${data.owner_name}'s list`}</h1>
                <p className="muted">
                  Shared by {data.owner_name} · {data.unique_cards} unique cards ·{" "}
                  {data.cards_still_needed} still needed · {money(data.remaining_market)}
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
                        Owned {item.owned} · Still {item.still_need} · Need {item.need}
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
                        <th>Still</th>
                        <th>Need</th>
                        <th>Market</th>
                        <th>Remaining</th>
                        <th>Used in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.card_id} className={item.still_need > 0 ? "need" : "done"}>
                          <td className="card-cell">
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
                          </td>
                          <td>{item.owned}</td>
                          <td>{item.still_need}</td>
                          <td>{item.need}</td>
                          <td>
                            <MarketPrice price={item.market_price} productId={item.product_id} />
                          </td>
                          <td>{money(item.remaining_cost)}</td>
                          <td className="used-in">{item.used_in.join(", ")}</td>
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
                            {[`Owned ${item.owned}`, `Still ${item.still_need}`, `Need ${item.need}`]
                              .filter(Boolean)
                              .join(" · ")}
                            {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                          </div>
                          <div className="mobile-card-price-row">
                            <span className="muted">Market</span>
                            <MarketPrice price={item.market_price} productId={item.product_id} />
                          </div>
                          {item.tcgplayer_url && (
                            <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                              TCGPlayer
                            </a>
                          )}
                        </div>
                      </div>
                      {item.used_in.length > 0 && (
                        <p className="used-in mobile-used-in">{item.used_in.join(", ")}</p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:token" element={<PublicSharePage />} />
      <Route path="/group-buy/join/:token" element={<GroupBuyJoinPage />} />
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
  );
}
