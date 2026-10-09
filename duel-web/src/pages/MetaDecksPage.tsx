import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BackLink } from "./BackLink";
import { CardArt } from "../cards/CardArt";
import { cardImageUrl } from "../cards/cardImage";
import { listSavedDecks, setSelectedDeckId } from "../decks/storage";
import {
  META_DEFAULT_DAYS,
  META_WINDOWS,
  addMetaDeck,
  fetchMetaDecks,
  fetchMetaLeaders,
  findSavedCopy,
  formatDeckRow,
  formatPercent,
  groupByCost,
  type MetaDeck,
  type MetaDecksResponse,
  type MetaLeader,
  type MetaLeadersResponse,
} from "../decks/meta";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

function LeaderArt({ id, url, className }: { id: string; url: string; className: string }) {
  return (
    <CardArt
      src={cardImageUrl(url, "thumb") || null}
      defId={id}
      className={className}
      fallback={
        <span className={`${className} meta-art-fallback`} aria-hidden>
          {id}
        </span>
      }
    />
  );
}

function LeaderRow({ leader, selected, onPick }: { leader: MetaLeader; selected: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        className={`meta-leader${selected ? " is-selected" : ""}`}
        aria-pressed={selected}
        onClick={onPick}
      >
        <LeaderArt id={leader.leader_id} url={leader.image_url} className="meta-leader-art" />
        <span className="meta-leader-body">
          <span className="meta-leader-name">{leader.name || leader.leader_id}</span>
          <span className="meta-leader-id">
            {leader.leader_id}
            {leader.color ? ` · ${leader.color.replace(";", "/")}` : ""}
          </span>
          <span className="meta-leader-stats">
            <span><b>{formatPercent(leader.share)}</b> share</span>
            <span><b>{leader.decks}</b> decks</span>
            <span><b>{leader.top8}</b> top 8</span>
            <span><b>{formatPercent(leader.win_rate)}</b> win</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function DeckCards({ deck }: { deck: MetaDeck }) {
  return (
    <div className="meta-cards">
      {groupByCost(deck.cards).map((g) => (
        <section key={g.cost || "other"} className="meta-cost-group">
          <h4 className="meta-cost-title">{g.cost === "" ? "Other" : `Cost ${g.cost}`}</h4>
          <ul className="meta-card-list">
            {g.cards.map((c) => (
              <li key={c.card_id} className="meta-card" title={`${c.count}x ${c.name || c.card_id}`}>
                <span className="meta-card-thumb">
                  <LeaderArt id={c.card_id} url={c.image_url} className="meta-card-art" />
                  <span className="meta-card-count">{c.count}x</span>
                </span>
                <span className="meta-card-name">{c.name || c.card_id}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MetaDeckItem({
  deck,
  leader,
  expanded,
  onToggle,
}: {
  deck: MetaDeck;
  leader: { leaderId: string; name: string };
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const saved = useMemo(() => {
    void tick;
    return findSavedCopy(listSavedDecks(), leader.leaderId, deck);
  }, [tick, leader.leaderId, deck]);

  function open(id: string, warnings: string[] = []) {
    setSelectedDeckId(id);
    navigate(`/decks/${id}/configure`, {
      state: warnings.length ? { importNotice: warnings.join(" ") } : undefined,
    });
  }

  function add() {
    setError(null);
    const result = addMetaDeck(leader, deck);
    setTick((n) => n + 1);
    if (!result.ok) {
      setError(result.errors.join(" · ") || "Could not add this deck");
      return;
    }
    open(result.deck.id, result.warnings);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(deck.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy. Your browser blocked clipboard access.");
    }
  }

  return (
    <li className={`meta-deck${expanded ? " is-open" : ""}`}>
      <button type="button" className="meta-deck-toggle" aria-expanded={expanded} onClick={onToggle}>
        <span className="meta-deck-summary">{formatDeckRow(deck)}</span>
        <span className="meta-deck-chevron" aria-hidden>▾</span>
      </button>
      <div className="meta-deck-actions">
        {saved ? (
          <>
            <span className="meta-deck-added" role="status">Added</span>
            <button type="button" className="btn btn-secondary" onClick={() => open(saved.id)}>
              Open
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={add}>
            Add to my decks
          </button>
        )}
        <button type="button" className="btn btn-secondary meta-copy" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy list"}
        </button>
        <a className="btn btn-secondary" href={deck.event_url} target="_blank" rel="noopener noreferrer">
          View on Limitless
        </a>
      </div>
      {error ? <p className="error-text meta-deck-error" role="alert">{error}</p> : null}
      {expanded ? <DeckCards deck={deck} /> : null}
    </li>
  );
}

function DeckPanel({ leader, days }: { leader: MetaLeader | undefined; days: number }) {
  const leaderId = leader?.leader_id ?? "";
  const [top8, setTop8] = useState(false);
  const [state, setState] = useState<Load<MetaDecksResponse>>({ status: "loading" });
  const [tries, setTries] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setOpenId(null);
    fetchMetaDecks(leaderId, days, top8)
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((e) => !cancelled && setState({ status: "error", message: e instanceof Error ? e.message : "Could not load decks" }));
    return () => {
      cancelled = true;
    };
  }, [leaderId, days, top8, tries]);

  const name = leader?.name || state.status === "ready" && state.data.name || leaderId;
  return (
    <div className="meta-detail" aria-live="polite">
      <div className="meta-detail-head">
        <h2 className="lobby-section-title meta-detail-title">{name} decklists</h2>
        <label className="meta-top8">
          <input type="checkbox" checked={top8} onChange={(e) => setTop8(e.target.checked)} />
          Top 8 only
        </label>
      </div>
      {state.status === "loading" ? (
        <p className="meta meta-status">Loading decklists…</p>
      ) : state.status === "error" ? (
        <p className="error-text meta-status">
          Couldn&apos;t load decklists.{" "}
          <button type="button" className="linkish" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : state.data.decks.length === 0 ? (
        <p className="meta meta-status">
          {top8 ? "No top 8 decklists for this leader in this window." : "No decklists for this leader in this window."}
        </p>
      ) : (
        <ul className="meta-deck-list">
          {state.data.decks.map((d) => (
            <MetaDeckItem
              key={d.id}
              deck={d}
              leader={{ leaderId, name: state.data.name || leader?.name || "" }}
              expanded={openId === d.id}
              onToggle={() => setOpenId(openId === d.id ? null : d.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MetaDecksPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("leader") ?? "";
  const daysParam = Number(params.get("days"));
  const days = (META_WINDOWS as readonly number[]).includes(daysParam) ? daysParam : META_DEFAULT_DAYS;
  const [state, setState] = useState<Load<MetaLeadersResponse>>({ status: "loading" });
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchMetaLeaders(days)
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((e) => !cancelled && setState({ status: "error", message: e instanceof Error ? e.message : "Could not load the meta" }));
    return () => {
      cancelled = true;
    };
  }, [days, tries]);

  function update(next: { leader?: string | null; days?: number }) {
    const p = new URLSearchParams(params);
    if (next.leader !== undefined) {
      if (next.leader) p.set("leader", next.leader);
      else p.delete("leader");
    }
    if (next.days !== undefined) {
      if (next.days === META_DEFAULT_DAYS) p.delete("days");
      else p.set("days", String(next.days));
    }
    setParams(p);
  }

  const data = state.status === "ready" ? state.data : null;
  const selected = data?.leaders.find((l) => l.leader_id === selectedId);
  // A deep link to a leader outside the loaded window still lists its decks.
  const showDetail = Boolean(selectedId) && state.status !== "error";

  return (
    <div className="app-shell">
      <div className="deck-config deck-config-wide meta-page">
        <header className="deck-config-header">
          <BackLink to="/decks" label="Decks" ariaLabel="Back to decks" />
          <div className="deck-config-heading">
            <h1 className="deck-config-title">Meta decks</h1>
            <p className="meta">
              {data
                ? `${data.total_decks} decks from ${data.events} events in the last ${data.days} days.`
                : "Top decks from recent online tournaments."}
            </p>
          </div>
          <div className="field meta-window">
            <label htmlFor="meta-window">Window</label>
            <select id="meta-window" value={days} onChange={(e) => update({ days: Number(e.target.value) })}>
              {META_WINDOWS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className={`meta-layout${showDetail ? " has-leader" : ""}`}>
          <section className="meta-leaders" aria-label="Leaders">
            {state.status === "loading" ? (
              <p className="meta meta-status">Loading the meta…</p>
            ) : state.status === "error" ? (
              <p className="error-text meta-status" title={state.message}>
                Couldn&apos;t load the meta.{" "}
                <button type="button" className="linkish" onClick={() => setTries((n) => n + 1)}>
                  Try again
                </button>
              </p>
            ) : state.data.leaders.length === 0 ? (
              <p className="meta meta-status">No tournament decks in this window yet.</p>
            ) : (
              <ul className="meta-leader-list">
                {state.data.leaders.map((l) => (
                  <LeaderRow
                    key={l.leader_id}
                    leader={l}
                    selected={l.leader_id === selectedId}
                    onPick={() => update({ leader: l.leader_id })}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="meta-detail-col" aria-label="Decklists">
            {showDetail ? (
              <>
                <button type="button" className="btn btn-secondary meta-all-leaders" onClick={() => update({ leader: null })}>
                  ← All leaders
                </button>
                <DeckPanel key={selectedId} leader={selected ?? (selectedId ? ({ leader_id: selectedId, name: "" } as MetaLeader) : undefined)} days={days} />
              </>
            ) : (
              <p className="meta meta-status meta-pick">Pick a leader to see its decklists.</p>
            )}
          </section>
        </div>

        <p className="meta meta-credit">
          Tournament data from{" "}
          <a className="linkish" href={data?.source_url ?? "https://play.limitlesstcg.com/tournaments/completed?game=OP"} target="_blank" rel="noopener noreferrer">
            Limitless TCG
          </a>
          .
        </p>
      </div>
    </div>
  );
}
