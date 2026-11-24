import { Select } from "@optcg/ui/popups";
import { useMemo, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type MetaDeck, type MetaLeader, type User } from "../api";
import { CardArtImg, CardThumb } from "../ui/CardThumb";
import { CardSearchInput, COLOR_ORDER } from "../ui/cardListControls";
import { ColorFilterChips } from "../ui/CollectionToolbar";
import { rememberLoginNext } from "../auth/loginNext";
import { Skeleton } from "../ui/Skeleton";
import {
  createMetaDeck,
  distinctiveCards,
  fewDecksNote,
  filterSortLeaders,
  formatDeckRow,
  formatPercent,
  groupCardsByCost,
  META_DAY_OPTIONS,
  META_DEFAULT_DAYS,
  META_DEFAULT_SORT,
  META_SORT_LABELS,
  META_SORTS,
  hasFewDecks,
  leaderSubtitle,
  parseMetaSort,
  type MetaSort,
} from "./meta";
import { qk } from "../cache/queryKeys";
import { cardBackState } from "../cards/cardBack";
import { listCost, listCostText } from "./listCost";
import { totalOwnedCopies } from "../pages/shopping/shoppingExtras";
import { copyText } from "@optcg/ui/clipboard";

const FALLBACK_SOURCE_URL = "https://play.limitlesstcg.com/tournaments/completed?game=OP";
const META_STALE_MS = 5 * 60_000;

function parseDays(raw: string | null): number {
  const n = Number(raw);
  return (META_DAY_OPTIONS as readonly number[]).includes(n) ? n : META_DEFAULT_DAYS;
}

function parseColors(raw: string | null): string[] {
  const wanted = (raw ?? "").toLowerCase().split(",");
  return COLOR_ORDER.filter((c) => wanted.includes(c.toLowerCase()));
}

/** The 4px stripe down a leader card's left edge: its colour, or a top/bottom split for two colours. */
function leaderStripe(color: string): string {
  const names = color
    .split(/[;/,&]+/)
    .map((c) => c.trim().toLowerCase())
    .filter((c) => COLOR_ORDER.some((o) => o.toLowerCase() === c));
  const vars = names.slice(0, 2).map((c) => `var(--card-${c})`);
  if (vars.length === 0) return "var(--line-strong)";
  if (vars.length === 1) return vars[0];
  return `linear-gradient(to bottom, ${vars[0]} 50%, ${vars[1]} 50%)`;
}

function ShareBar({ share, max }: { share: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (share / max) * 100)) : 0;
  return (
    <div className="meta-share-bar" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg className="meta-ext-icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M8 4.5H4.5v11h11V12M11.5 4.5h4v4M15.5 4.5 9 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" data-icon={done ? "check" : "copy"}>
      {done ? (
        <path d="m4.5 10.5 3.6 3.6 7.4-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <rect x="7" y="7" width="9" height="9" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function LeaderArt({ src, cardId, name }: { src?: string; cardId?: string; name: string }) {
  return (
    <CardArtImg
      className="meta-leader-art"
      src={src}
      cardId={cardId}
      alt=""
      loading="lazy"
      decoding="async"
      width={72}
      height={100}
      title={name}
      fallback={<div className="meta-leader-art placeholder" />}
    />
  );
}

function MetaSkeleton() {
  return (
    <section className="skeleton-screen" aria-busy="true" aria-live="polite" aria-label="Loading meta">
      <span className="visually-hidden">Loading meta…</span>
      <div className="meta-leader-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="meta-leader-card">
            <Skeleton className="meta-leader-art" />
            <div className="skeleton-stack skeleton-stack-grow">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LeaderStats({ leader }: { leader: MetaLeader }) {
  const few = hasFewDecks(leader);
  const note = fewDecksNote(leader);
  return (
    <dl className="meta-stats">
      <div>
        <dt>Share</dt>
        <dd>{formatPercent(leader.share)}</dd>
      </div>
      <div>
        <dt>Decks</dt>
        <dd>{leader.decks}</dd>
      </div>
      <div>
        <dt>Top 8</dt>
        <dd>{leader.top8}</dd>
      </div>
      <div>
        <dt>Win rate</dt>
        <dd className={few ? "meta-few-value" : undefined} title={few ? note : undefined}>
          {formatPercent(leader.win_rate)}
          {few ? (
            <>
              <span className="meta-few-tag" aria-hidden="true">
                few decks
              </span>
              <span className="visually-hidden">{note}</span>
            </>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

export function MetaDeckRow({
  deck,
  leader,
  user,
  leaderPath,
  owned,
  leaderPrice,
  allDecks,
}: {
  deck: MetaDeck;
  leader: { id: string; name: string };
  user: User | null;
  leaderPath: string;
  /** Owned copies per card for a signed-in viewer; undefined while loading or signed out. */
  owned?: ReadonlyMap<string, number>;
  leaderPrice?: number | null;
  /** Every list loaded for this leader, to find what sets this one apart. */
  allDecks?: MetaDeck[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groups = useMemo(() => (open ? groupCardsByCost(deck.cards) : []), [open, deck.cards]);
  const panelId = `meta-deck-${deck.id}`;
  const techs = useMemo(() => (allDecks ? distinctiveCards(deck, allDecks) : []), [deck, allDecks]);

  const create = useMutation({
    mutationFn: () =>
      createMetaDeck(leader, deck, {
        createDeck: api.createDeck,
        onCreated: async () => {
          await qc.invalidateQueries({ queryKey: qk.decks() });
          await qc.invalidateQueries({ queryKey: qk.shopping.all() });
        },
        navigate,
      }),
    onError: (e: Error) => setErr(e.message),
  });

  function onCreate() {
    setErr(null);
    if (!user) {
      rememberLoginNext(leaderPath);
      navigate("/login");
      return;
    }
    create.mutate();
  }

  async function onCopy() {
    if (await copyText(deck.text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      setErr("Could not copy. Select the list and copy it manually.");
    }
  }

  return (
    <li className={`meta-deck${open ? " is-open" : ""}`}>
      <div className="meta-deck-row">
        <button
          type="button"
          className="meta-deck-head"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="meta-deck-chevron" aria-hidden="true" />
          <span className="meta-deck-title">
            <span className="meta-deck-event">{deck.event}</span>
            <span className="muted meta-deck-sub">{formatDeckRow(deck)}</span>
            {user ? (
              <span className="meta-deck-own">
                {owned ? listCostText(listCost(deck.cards, { id: leader.id, price: leaderPrice }, owned)) : "\u00a0"}
              </span>
            ) : null}
          </span>
        </button>
        <div className="meta-deck-actions">
          <button type="button" className="btn primary" onClick={onCreate} disabled={create.isPending} aria-busy={create.isPending}>
            {create.isPending ? "Creating…" : user ? "Create deck" : "Sign in to create"}
          </button>
          <button type="button" className="btn secondary meta-icon-btn" onClick={onCopy} aria-label="Copy list" title={copied ? "Copied" : "Copy list"}>
            <CopyIcon done={copied} />
          </button>
          <span className="visually-hidden" role="status" aria-live="polite">
            {copied ? "Copied" : ""}
          </span>
          <a
            className="btn secondary meta-icon-btn"
            href={deck.event_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on Limitless (opens in a new tab)"
            title="View on Limitless (opens in a new tab)"
          >
            <ExternalIcon />
          </a>
        </div>
      </div>
      {techs.length > 0 && (
        <div className="meta-techs">
          <span className="meta-techs-label">Techs</span>
          <ul className="meta-techs-list" aria-label="Cards that set this list apart">
            {techs.map((c) => (
              <li key={c.card_id} className="meta-tech" title={`${c.name || c.card_id} (${c.count}×)`}>
                <div className="meta-card-art">
                  <CardThumb src={c.image_url} cardId={c.card_id} alt={`${c.name || c.card_id}, ${c.count} copies`} />
                  <span className="meta-card-count" aria-hidden="true">{c.count}×</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="error meta-deck-error">{err}</p>}
      {open && (
        <div id={panelId} className="meta-deck-cards">
          <div className="meta-deck-groups">
          {groups.map((g) => (
            <section key={g.label}>
              <h4>{g.label}</h4>
              <ul className="meta-card-grid">
                {g.cards.map((c) => (
                  <li key={c.card_id} className="meta-card">
                    <div className="meta-card-art">
                      <CardThumb src={c.image_url} cardId={c.card_id} alt={c.name || c.card_id} />
                      <span className="meta-card-count">{c.count}×</span>
                    </div>
                    <Link className="meta-card-name" to={`/cards/${encodeURIComponent(c.card_id)}`} state={cardBackState(location)} title={`${c.name || c.card_id}: open card page`}>
                      {c.name || c.card_id}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          </div>
        </div>
      )}
    </li>
  );
}

function MetaWindowSelect({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <label className="meta-select">
      <span className="muted">Window</span>
      <Select value={days} onChange={onChange} options={META_DAY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))} />
    </label>
  );
}

export function MetaPage({ user }: { user: User | null }) {
  const [params, setParams] = useSearchParams();
  const leaderId = params.get("leader") || "";
  const days = parseDays(params.get("days"));
  const top8 = params.get("top8") === "1";
  const q = params.get("q") ?? "";
  const colors = parseColors(params.get("colors"));
  const sort = parseMetaSort(params.get("sort"));

  const leaders = useQuery({
    queryKey: qk.meta.leaders(days),
    queryFn: () => api.metaLeaders(days),
    staleTime: META_STALE_MS,
  });
  const decks = useQuery({
    queryKey: qk.meta.decks(leaderId, days, top8 ? 8 : 0),
    queryFn: () => api.metaDecks(leaderId, days, top8 ? 8 : 0),
    enabled: Boolean(leaderId),
    staleTime: META_STALE_MS,
  });

  const ownedQ = useQuery({
    queryKey: qk.owned.all(),
    queryFn: () => api.ownedCollection(),
    enabled: Boolean(user && leaderId),
  });
  const ownedById = useMemo(
    () => (ownedQ.data ? new Map(ownedQ.data.items.map((i) => [i.card_id, totalOwnedCopies(i)])) : undefined),
    [ownedQ.data],
  );

  function search(next: { leader?: string; days?: number; top8?: boolean; q?: string; colors?: string[]; sort?: MetaSort }): string {
    const p = new URLSearchParams();
    const l = next.leader ?? leaderId;
    const d = next.days ?? days;
    const t = next.top8 ?? top8;
    const query = next.q ?? q;
    const picked = next.colors ?? colors;
    const sorted = next.sort ?? sort;
    if (l) p.set("leader", l);
    if (d !== META_DEFAULT_DAYS) p.set("days", String(d));
    if (l && t) p.set("top8", "1");
    if (query.trim()) p.set("q", query);
    if (picked.length) p.set("colors", picked.map((c) => c.toLowerCase()).join(","));
    if (sorted !== META_DEFAULT_SORT) p.set("sort", sorted);
    const s = p.toString();
    return s ? `?${s}` : "";
  }
  const go = (next: Parameters<typeof search>[0]) => setParams(search(next).slice(1), { replace: true });

  const selected = leaders.data?.leaders.find((l) => l.leader_id === leaderId);
  const leaderName = decks.data?.name || selected?.name || leaderId;
  const leaderArt = decks.data?.image_url || selected?.image_url;
  const leaderPath = `/meta${search({})}`;
  const sourceUrl = leaders.data?.source_url || FALLBACK_SOURCE_URL;
  const shown = useMemo(
    () => (leaders.data ? filterSortLeaders(leaders.data.leaders, { q, colors, sort }) : []),
    [leaders.data, q, colors.join(","), sort], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const maxShare = shown.reduce((m, l) => Math.max(m, l.share), 0);
  const filtered = q.trim() !== "" || colors.length > 0;

  return (
    <section className="meta-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {leaderId ? <Link to={`/meta${search({ leader: "", top8: false })}`}>All leaders</Link> : "Tournament meta"}
          </p>
          <h1>{leaderId ? leaderName : "Meta"}</h1>
          <p className="muted">
            {leaderId
              ? leaderSubtitle(selected, days)
              : leaders.data
                ? `${leaders.data.events} events · ${leaders.data.total_decks.toLocaleString("en-US")} decks · last ${days} days`
                : "Top leaders and winning lists from recent online tournaments."}
          </p>
        </div>
      </div>

      {!leaderId && (
        <>
          <div className="collection-toolbar meta-toolbar">
            <div className="collection-toolbar-row">
              <CardSearchInput
                icon="search"
                value={q}
                onChange={(v) => go({ q: v })}
                placeholder="Search leader name or ID"
                label="Search leaders"
              />
              <ColorFilterChips
                selected={colors}
                onToggle={(c) => go({ colors: colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c] })}
                onClear={() => go({ colors: [] })}
              />
              <div className="meta-toolbar-selects">
                <label className="meta-select">
                  <span className="muted">Sort</span>
                  <Select
                    value={sort}
                    onChange={(v) => go({ sort: v })}
                    options={META_SORTS.map((v) => ({ value: v, label: META_SORT_LABELS[v] }))}
                  />
                </label>
                <MetaWindowSelect days={days} onChange={(d) => go({ days: d })} />
              </div>
            </div>
          </div>
          {leaders.isLoading && <MetaSkeleton />}
          {leaders.error && (
            <div className="meta-state">
              <p className="error">{(leaders.error as Error).message}</p>
              <button type="button" className="btn secondary" onClick={() => leaders.refetch()}>
                Retry
              </button>
            </div>
          )}
          {leaders.data && leaders.data.leaders.length === 0 && (
            <p className="muted meta-state">No tournament results in the last {days} days.</p>
          )}
          {leaders.data && leaders.data.leaders.length > 0 && shown.length === 0 && filtered && (
            <div className="meta-state meta-empty">
              <p className="muted">No leaders match</p>
              <button type="button" className="btn secondary" onClick={() => go({ q: "", colors: [] })}>
                Clear filters
              </button>
            </div>
          )}
          {shown.length > 0 && (
            <ul className="meta-leader-grid">
              {shown.map((l) => (
                <li key={l.leader_id}>
                  <Link
                    className="meta-leader-card"
                    style={{ "--stripe": leaderStripe(l.color) } as CSSProperties}
                    to={`/meta${search({ leader: l.leader_id })}`}
                  >
                    <LeaderArt src={l.image_url} cardId={l.leader_id} name={l.name} />
                    <div className="meta-leader-body">
                      <h2>{l.name || l.leader_id}</h2>
                      <p className="muted">
                        {l.leader_id}
                        {l.color ? ` · ${l.color.replace(";", "/")}` : ""}
                      </p>
                      <ShareBar share={l.share} max={maxShare} />
                      <LeaderStats leader={l} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {leaderId && (
        <>
          <div className="meta-leader-head" style={{ "--stripe": leaderStripe(selected?.color ?? "") } as CSSProperties}>
            <LeaderArt src={leaderArt} cardId={leaderId} name={leaderName} />
            <div className="meta-leader-body">
              <p className="muted">
                {leaderId}
                {selected?.color ? ` · ${selected.color.replace(";", "/")}` : ""}
              </p>
              {selected ? (
                <>
                  <ShareBar share={selected.share} max={Math.max(...leaders.data!.leaders.map((l) => l.share))} />
                  <LeaderStats leader={selected} />
                </>
              ) : (
                <div className="meta-stats-spacer" />
              )}
            </div>
          </div>
          <div className="collection-toolbar meta-toolbar">
            <div className="collection-toolbar-row">
              <MetaWindowSelect days={days} onChange={(d) => go({ days: d })} />
              <label className="meta-check">
                <input type="checkbox" checked={top8} onChange={(e) => go({ top8: e.target.checked })} />
                Top 8 only
              </label>
            </div>
          </div>
          {decks.isLoading && <MetaSkeleton />}
          {decks.error && (
            <div className="meta-state">
              <p className="error">{(decks.error as Error).message}</p>
              <button type="button" className="btn secondary" onClick={() => decks.refetch()}>
                Retry
              </button>
            </div>
          )}
          {decks.data && decks.data.decks.length === 0 && (
            <p className="muted meta-state">No {top8 ? "top 8 " : ""}decklists for this leader in the last {days} days.</p>
          )}
          {decks.data && decks.data.decks.length > 0 && (
            <ul className="meta-deck-list">
              {decks.data.decks.map((d) => (
                <MetaDeckRow
                  key={d.id}
                  deck={d}
                  leader={{ id: leaderId, name: leaderName === leaderId ? "" : leaderName }}
                  user={user}
                  leaderPath={leaderPath}
                  owned={ownedById}
                  leaderPrice={decks.data.leader_market_price}
                  allDecks={decks.data.decks}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <p className="muted meta-credit">
        Tournament data from{" "}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          Limitless TCG
          <ExternalIcon />
        </a>
      </p>
    </section>
  );
}
