import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, CardView, money, PrintingView, ShoppingItem, User } from "./api";

const SHOPPING_DECKS_KEY = "optcg_shopping_deck_ids";
const SHOW_ALT_ARTS_KEY = "optcg_show_alt_arts";

const COLOR_ORDER = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
const SET_PREFIX_ORDER = ["OP", "ST", "EB", "PRB", "P"];

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

function compareCardOrder(
  a: { card_id: string; color: string; still_need: number },
  b: { card_id: string; color: string; still_need: number },
  sortStillNeed: boolean,
): number {
  if (sortStillNeed) {
    const byNeed = b.still_need - a.still_need;
    if (byNeed !== 0) return byNeed;
  }
  return (
    colorSortKey(a.color).localeCompare(colorSortKey(b.color)) ||
    setSortKey(a.card_id).localeCompare(setSortKey(b.card_id)) ||
    a.card_id.localeCompare(b.card_id)
  );
}

function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me });
}

function invalidateOwnedViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
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
        <div className="brand">
          <Link to="/">OPTCG Tracker</Link>
        </div>
        <nav>
          <Link to="/">Shopping</Link>
          <Link to="/decks">Decks</Link>
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
      </header>
      <main>{children}</main>
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
    const ticket = params.get("ticket");
    if (!ticket) return;
    let cancelled = false;
    setClaiming(true);
    api
      .claim(ticket)
      .then(async () => {
        if (cancelled) return;
        window.history.replaceState({}, "", "/");
        await refetch();
        navigate("/", { replace: true });
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

  if (!isLoading && user) return <Navigate to="/" replace />;
  if (claiming) return <p className="muted center">Signing you in…</p>;

  async function devLogin() {
    try {
      setErr(null);
      await api.devLogin();
      await refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <p className="eyebrow">One Piece TCG</p>
        <h1>Deck Tracker</h1>
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

function OwnedInput({
  cardId,
  value,
  onSaved,
}: {
  cardId: string;
  value: number;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (n: number) => api.setOwned(cardId, n),
    onSuccess: () => {
      setErr(null);
      onSaved();
    },
    onError: (e: Error) => {
      setErr(e.message);
      setQty(value);
    },
  });

  useEffect(() => {
    setQty(value);
  }, [value, cardId]);

  function commit(next: number) {
    const n = Math.max(0, next);
    setQty(n);
    if (n !== value) mutation.mutate(n);
  }

  return (
    <span className="owned-wrap">
      <button
        type="button"
        className="owned-btn"
        aria-label="Decrease owned"
        disabled={mutation.isPending || qty <= 0}
        onClick={() => commit(qty - 1)}
      >
        −
      </button>
      <input
        className="owned"
        type="number"
        inputMode="numeric"
        min={0}
        value={qty}
        title={err ?? undefined}
        onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
        onBlur={() => commit(qty)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className="owned-btn"
        aria-label="Increase owned"
        disabled={mutation.isPending}
        onClick={() => commit(qty + 1)}
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

function AltArtsRow({ alts }: { alts: PrintingView[] }) {
  if (!alts.length) return <span className="muted">—</span>;
  return (
    <div className="alt-arts">
      {alts.map((alt) => (
        <div key={alt.product_id} className="alt-art">
          <CardThumb src={alt.image_url || undefined} alt={alt.name} />
          <div className="alt-meta">
            <div className="alt-price">{money(alt.market_price)}</div>
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

function ShoppingPage() {
  const qc = useQueryClient();
  const decksQ = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const allDeckIds = useMemo(() => (decksQ.data ?? []).map((d) => d.id), [decksQ.data]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[] | null>(null);
  const [filterReady, setFilterReady] = useState(false);

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
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [sortStillNeed, setSortStillNeed] = useState(true);
  const [showAltArts, setShowAltArts] = useShowAltArts();

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter((i) => i.still_need > 0);
    list = [...list].sort((a, b) => compareCardOrder(a, b, sortStillNeed));
    return list;
  }, [data, onlyNeed, sortStillNeed]);

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
        <div className="filters">
          <label>
            <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
            Still need only
          </label>
          <label>
            <input
              type="checkbox"
              checked={sortStillNeed}
              onChange={(e) => setSortStillNeed(e.target.checked)}
            />
            Sort by still need, then color & set
          </label>
          <label>
            <input
              type="checkbox"
              checked={showAltArts}
              onChange={(e) => setShowAltArts(e.target.checked)}
            />
            Show alt arts
          </label>
        </div>
      </div>

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
              <th>Cost</th>
              {showAltArts && <th>Alt arts</th>}
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: ShoppingItem) => (
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
                <td>
                  <OwnedInput
                    cardId={item.card_id}
                    value={item.owned}
                    onSaved={() => invalidateOwnedViews(qc)}
                  />
                </td>
                <td>{item.still_need}</td>
                <td>{item.need}</td>
                <td>{money(item.market_price)}</td>
                <td>{money(item.remaining_cost)}</td>
                <td>{item.cost ?? "—"}</td>
                {showAltArts && (
                  <td>
                    <AltArtsRow alts={item.alt_arts ?? []} />
                  </td>
                )}
                <td className="used-in">{item.used_in.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {items.map((item: ShoppingItem) => (
          <article key={item.card_id} className={`mobile-card ${item.still_need > 0 ? "need" : "done"}`}>
            <div className="mobile-card-top">
              <CardThumb src={item.image_url || undefined} alt={item.name} />
              <div className="mobile-card-info">
                <div className="card-id">{item.card_id}</div>
                <div className="mobile-card-name">{item.name}</div>
                <div className="mobile-card-meta">
                  {[item.color, `Still ${item.still_need}`, `Need ${item.need}`, money(item.market_price)]
                    .filter(Boolean)
                    .join(" · ")}
                  {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
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
              <p className="used-in mobile-used-in">{item.used_in.join(", ")}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DecksPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["decks"], queryFn: api.decks });
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
        {(data ?? []).map((d) => (
          <article key={d.id} className="deck-card">
            <h2>
              <Link to={`/decks/${d.id}`}>{d.name}</Link>
            </h2>
            <p className="muted">
              {d.card_count} unique · {d.total_cards} cards
              {d.leader_card_id ? ` · Leader ${d.leader_card_id}` : ""}
            </p>
            <div className="row-actions">
              <Link to={`/decks/${d.id}`}>Open</Link>
              <button type="button" className="ghost danger" onClick={() => del.mutate(d.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function filterCards(cards: CardView[], onlyNeed: boolean, sortStillNeed: boolean): CardView[] {
  let list = cards;
  if (onlyNeed) list = list.filter((c) => c.still_need > 0);
  return [...list].sort((a, b) => compareCardOrder(a, b, sortStillNeed));
}

function CardTable({
  cards,
  onOwnedSaved,
  showAltArts,
}: {
  cards: CardView[];
  onOwnedSaved: () => void;
  showAltArts: boolean;
}) {
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
                <td>{money(c.market_price)}</td>
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
              <CardThumb src={c.image_url || undefined} alt={c.name} />
              <div className="mobile-card-info">
                <div className="card-id">{c.card_id}</div>
                <div className="mobile-card-name">{c.name}</div>
                <div className="mobile-card-meta">
                  {[c.color, `Still ${c.still_need}`, `Need ${c.needed}`, money(c.market_price), c.card_type || ""]
                    .filter(Boolean)
                    .join(" · ")}
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
  const [sortStillNeed, setSortStillNeed] = useState(true);
  const [showAltArts, setShowAltArts] = useShowAltArts();

  const main = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section !== "additional"),
      onlyNeed,
      sortStillNeed,
    );
  }, [data, onlyNeed, sortStillNeed]);

  const additional = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section === "additional"),
      onlyNeed,
      sortStillNeed,
    );
  }, [data, onlyNeed, sortStillNeed]);

  if (isLoading) return <p className="muted">Loading deck…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;
  if (!data) return null;

  const refresh = () => invalidateOwnedViews(qc);

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
        <div className="filters">
          <label>
            <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
            Still need only
          </label>
          <label>
            <input
              type="checkbox"
              checked={sortStillNeed}
              onChange={(e) => setSortStillNeed(e.target.checked)}
            />
            Sort by still need, then color & set
          </label>
          <label>
            <input
              type="checkbox"
              checked={showAltArts}
              onChange={(e) => setShowAltArts(e.target.checked)}
            />
            Show alt arts
          </label>
        </div>
      </div>
      {data.prior_decks.length > 0 && (
        <p className="banner">
          Cards already in earlier same-leader decks are listed first. New pieces are under
          Additional Cards.
        </p>
      )}
      <h2>Deck list</h2>
      <CardTable cards={main} onOwnedSaved={refresh} showAltArts={showAltArts} />
      {additional.length > 0 && (
        <>
          <h2 className="additional-heading">
            Additional Cards — not in {data.prior_decks.join(", ")}
          </h2>
          <CardTable cards={additional} onOwnedSaved={refresh} showAltArts={showAltArts} />
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
