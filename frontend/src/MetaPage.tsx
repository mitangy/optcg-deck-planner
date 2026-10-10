import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type MetaDeck, type MetaLeader, type User } from "./api";
import { cardImageUrl } from "./cardImage";
import { CardThumb } from "./CardThumb";
import { rememberLoginNext } from "./GroupBuys";
import { Skeleton } from "./Skeleton";
import {
  createMetaDeck,
  formatDeckRow,
  formatPercent,
  groupCardsByCost,
  META_DAY_OPTIONS,
  META_DEFAULT_DAYS,
} from "./meta";

const FALLBACK_SOURCE_URL = "https://play.limitlesstcg.com/tournaments/completed?game=OP";
const META_STALE_MS = 5 * 60_000;

function parseDays(raw: string | null): number {
  const n = Number(raw);
  return (META_DAY_OPTIONS as readonly number[]).includes(n) ? n : META_DEFAULT_DAYS;
}

function LeaderArt({ src, name }: { src?: string; name: string }) {
  return src ? (
    <img className="meta-leader-art" src={cardImageUrl(src, "thumb")} alt="" loading="lazy" decoding="async" width={72} height={100} title={name} />
  ) : (
    <div className="meta-leader-art placeholder" />
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
        <dd>{formatPercent(leader.win_rate)}</dd>
      </div>
    </dl>
  );
}

function MetaDeckRow({
  deck,
  leader,
  user,
  leaderPath,
}: {
  deck: MetaDeck;
  leader: { id: string; name: string };
  user: User | null;
  leaderPath: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groups = useMemo(() => (open ? groupCardsByCost(deck.cards) : []), [open, deck.cards]);
  const panelId = `meta-deck-${deck.id}`;

  const create = useMutation({
    mutationFn: () =>
      createMetaDeck(leader, deck, {
        createDeck: api.createDeck,
        onCreated: async () => {
          await qc.invalidateQueries({ queryKey: ["decks"] });
          await qc.invalidateQueries({ queryKey: ["shopping"] });
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
    try {
      await navigator.clipboard.writeText(deck.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr("Could not copy. Select the list and copy it manually.");
    }
  }

  return (
    <li className={`meta-deck${open ? " is-open" : ""}`}>
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
        </span>
      </button>
      <div className="meta-deck-actions">
        <button type="button" className="btn primary" onClick={onCreate} disabled={create.isPending} aria-busy={create.isPending}>
          {create.isPending ? "Creating…" : "Create deck"}
        </button>
        <button type="button" className="btn secondary" onClick={onCopy}>
          {copied ? "Copied" : "Copy list"}
        </button>
        <a className="btn secondary" href={deck.event_url} target="_blank" rel="noopener noreferrer">
          View on Limitless
        </a>
      </div>
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
                      <CardThumb src={c.image_url} alt={c.name || c.card_id} />
                      <span className="meta-card-count">{c.count}×</span>
                    </div>
                    <span className="meta-card-name" title={c.name}>
                      {c.name || c.card_id}
                    </span>
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

export function MetaPage({ user }: { user: User | null }) {
  const [params, setParams] = useSearchParams();
  const leaderId = params.get("leader") || "";
  const days = parseDays(params.get("days"));
  const top8 = params.get("top8") === "1";

  const leaders = useQuery({
    queryKey: ["meta", "leaders", days],
    queryFn: () => api.metaLeaders(days),
    staleTime: META_STALE_MS,
  });
  const decks = useQuery({
    queryKey: ["meta", "decks", leaderId, days, top8 ? 8 : 0],
    queryFn: () => api.metaDecks(leaderId, days, top8 ? 8 : 0),
    enabled: Boolean(leaderId),
    staleTime: META_STALE_MS,
  });

  function search(next: { leader?: string; days?: number; top8?: boolean }): string {
    const p = new URLSearchParams();
    const l = next.leader ?? leaderId;
    const d = next.days ?? days;
    const t = next.top8 ?? top8;
    if (l) p.set("leader", l);
    if (d !== META_DEFAULT_DAYS) p.set("days", String(d));
    if (l && t) p.set("top8", "1");
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  const selected = leaders.data?.leaders.find((l) => l.leader_id === leaderId);
  const leaderName = decks.data?.name || selected?.name || leaderId;
  const leaderArt = decks.data?.image_url || selected?.image_url;
  const leaderPath = `/meta${search({})}`;
  const sourceUrl = leaders.data?.source_url || FALLBACK_SOURCE_URL;

  return (
    <section className="meta-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {leaderId ? <Link to={`/meta${search({ leader: "", top8: false })}`}>All leaders</Link> : "Tournament meta"}
          </p>
          <h1>{leaderId ? leaderName : "Meta"}</h1>
          <p className="muted">
            {leaders.data
              ? `${leaders.data.events} events · ${leaders.data.total_decks.toLocaleString("en-US")} decks · last ${days} days`
              : "Top leaders and winning lists from recent online tournaments."}
          </p>
        </div>
        <div className="meta-controls">
          <label className="meta-select">
            <span className="muted">Window</span>
            <select value={days} onChange={(e) => setParams(search({ days: Number(e.target.value) }).slice(1), { replace: true })}>
              {META_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!leaderId && (
        <>
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
          {leaders.data && leaders.data.leaders.length > 0 && (
            <ul className="meta-leader-grid">
              {leaders.data.leaders.map((l) => (
                <li key={l.leader_id}>
                  <Link className="meta-leader-card" to={`/meta${search({ leader: l.leader_id })}`}>
                    <LeaderArt src={l.image_url} name={l.name} />
                    <div className="meta-leader-body">
                      <h2>{l.name || l.leader_id}</h2>
                      <p className="muted">
                        {l.leader_id}
                        {l.color ? ` · ${l.color.replace(";", "/")}` : ""}
                      </p>
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
          <div className="meta-leader-head">
            <LeaderArt src={leaderArt} name={leaderName} />
            <div className="meta-leader-body">
              <p className="muted">{leaderId}</p>
              {selected ? <LeaderStats leader={selected} /> : <div className="meta-stats-spacer" />}
            </div>
            <div className="filters meta-filters">
              <label>
                <input
                  type="checkbox"
                  checked={top8}
                  onChange={(e) => setParams(search({ top8: e.target.checked }).slice(1), { replace: true })}
                />
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
        </a>
      </p>
    </section>
  );
}
