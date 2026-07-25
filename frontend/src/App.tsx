import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, CardView, money, ShoppingItem, User } from "./api";

function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me });
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
          <span>{user.name || user.email}</span>
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

  if (!isLoading && user) return <Navigate to="/" replace />;

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
          Track decks, shared collection counts, and market prices with friends.
        </p>
        <a className="btn primary" href={api.googleLoginUrl()}>
          Sign in with Google
        </a>
        <button type="button" className="btn secondary" onClick={devLogin}>
          Dev login (local)
        </button>
        {err && <p className="error">{err}</p>}
        <p className="hint">API: {api.apiUrl}</p>
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
  const [qty, setQty] = useState(String(value));
  const mutation = useMutation({
    mutationFn: (n: number) => api.setOwned(cardId, n),
    onSuccess: onSaved,
  });

  return (
    <input
      className="owned"
      type="number"
      min={0}
      value={qty}
      onChange={(e) => setQty(e.target.value)}
      onBlur={() => {
        const n = Math.max(0, Number(qty) || 0);
        setQty(String(n));
        if (n !== value) mutation.mutate(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function ShoppingPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["shopping"],
    queryFn: api.shopping,
  });
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [sortStillNeed, setSortStillNeed] = useState(true);

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter((i) => i.still_need > 0);
    if (sortStillNeed) {
      list = [...list].sort((a, b) => b.still_need - a.still_need || a.card_id.localeCompare(b.card_id));
    }
    return list;
  }, [data, onlyNeed, sortStillNeed]);

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
            Sort by still need
          </label>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Card</th>
              <th>Cost</th>
              <th>Owned</th>
              <th>Need</th>
              <th>Still</th>
              <th>Market</th>
              <th>Remaining</th>
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: ShoppingItem) => (
              <tr key={item.card_id} className={item.still_need > 0 ? "need" : "done"}>
                <td>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="thumb" loading="lazy" />
                  ) : (
                    <div className="thumb placeholder" />
                  )}
                </td>
                <td>
                  <div className="card-id">{item.card_id}</div>
                  <div>{item.name}</div>
                  {item.tcgplayer_url && (
                    <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                      TCGPlayer
                    </a>
                  )}
                </td>
                <td>{item.cost ?? "—"}</td>
                <td>
                  <OwnedInput
                    cardId={item.card_id}
                    value={item.owned}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["shopping"] });
                      qc.invalidateQueries({ queryKey: ["decks"] });
                    }}
                  />
                </td>
                <td>{item.need}</td>
                <td>{item.still_need}</td>
                <td>{money(item.market_price)}</td>
                <td>{money(item.remaining_cost)}</td>
                <td className="used-in">{item.used_in.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DecksPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const del = useMutation({
    mutationFn: api.deleteDeck,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decks"] }),
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

function CardTable({
  cards,
  onOwnedSaved,
}: {
  cards: CardView[];
  onOwnedSaved: () => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Card</th>
            <th>Type</th>
            <th>Cost</th>
            <th>Needed</th>
            <th>Owned</th>
            <th>Still</th>
            <th>Market</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={`${c.section}-${c.card_id}`} className={c.still_need > 0 ? "need" : "done"}>
              <td>
                {c.image_url ? (
                  <img src={c.image_url} alt="" className="thumb" loading="lazy" />
                ) : (
                  <div className="thumb placeholder" />
                )}
              </td>
              <td>
                <div className="card-id">{c.card_id}</div>
                <div>{c.name}</div>
                {c.tcgplayer_url && (
                  <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                    TCGPlayer
                  </a>
                )}
              </td>
              <td>{c.card_type || "—"}</td>
              <td>{c.cost ?? "—"}</td>
              <td>{c.needed}</td>
              <td>
                <OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
              </td>
              <td>{c.still_need}</td>
              <td>{money(c.market_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

  if (isLoading) return <p className="muted">Loading deck…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;
  if (!data) return null;

  const main = data.cards.filter((c) => c.section !== "additional");
  const additional = data.cards.filter((c) => c.section === "additional");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["deck", deckId] });
    qc.invalidateQueries({ queryKey: ["shopping"] });
  };

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
      {data.prior_decks.length > 0 && (
        <p className="banner">
          Cards already in earlier same-leader decks are listed first. New pieces are under
          Additional Cards.
        </p>
      )}
      <h2>Deck list</h2>
      <CardTable cards={main} onOwnedSaved={refresh} />
      {additional.length > 0 && (
        <>
          <h2 className="additional-heading">
            Additional Cards — not in {data.prior_decks.join(", ")}
          </h2>
          <CardTable cards={additional} onOwnedSaved={refresh} />
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
    create.mutate();
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (!name) setName(file.name.replace(/\.(txt|deck)$/i, ""));
    file.text().then(setDecklist);
  }

  return (
    <section>
      <h1>Import deck</h1>
      <form className="import-form" onSubmit={onSubmit}>
        <label>
          Deck name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Decklist file
          <input
            type="file"
            accept=".txt,.deck,text/plain"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Or paste list
          <textarea
            value={decklist}
            onChange={(e) => setDecklist(e.target.value)}
            rows={16}
            placeholder={"4xOP15-053\n1xOP09-118"}
            required
          />
        </label>
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
