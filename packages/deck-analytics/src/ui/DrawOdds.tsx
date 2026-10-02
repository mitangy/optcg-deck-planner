import { useId, useMemo, useState } from "react";
import {
  cardLabel,
  countHits,
  defaultHitCardId,
  deckSizeOf,
  oddsByTurn,
  searcherOdds,
  type DeckEntry,
  type HitGroup,
} from "../drawOdds";

type Mode = "card" | "counter2000" | "blocker" | "costMax" | "trait" | "custom";

const MODE_LABEL: Record<Mode, string> = {
  card: "One card",
  counter2000: "+2000 counters",
  blocker: "Blockers",
  costMax: "Cost or less",
  trait: "Trait",
  custom: "Custom cards",
};

const pct = (p: number) => `${(p * 100).toFixed(p >= 0.9995 || p === 0 ? 0 : 1)}%`;

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="layout-toggle ds-seg-toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? "active" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DrawOdds({ entries }: { entries: DeckEntry[] }) {
  const uid = useId();
  const deckSize = deckSizeOf(entries);
  const defaultId = useMemo(() => defaultHitCardId(entries), [entries]);
  const [mode, setMode] = useState<Mode>("card");
  const [cardId, setCardId] = useState<string | null>(null);
  const [costMax, setCostMax] = useState(2);
  const [trait, setTrait] = useState<string | null>(null);
  const [custom, setCustom] = useState<string[]>([]);
  const [goingFirst, setGoingFirst] = useState(true);
  const [mulligan, setMulligan] = useState(false);
  const [atLeast, setAtLeast] = useState(1);

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.card.n ?? a.id).localeCompare(b.card.n ?? b.id) || a.id.localeCompare(b.id)), [entries]);
  const traits = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) for (const t of e.card.tr ?? []) m.set(t, (m.get(t) ?? 0) + e.copies);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries]);

  const effCard = cardId && entries.some((e) => e.id === cardId) ? cardId : defaultId;
  const effTrait = trait && traits.some(([t]) => t === trait) ? trait : (traits[0]?.[0] ?? null);
  const effCustom = custom.filter((id) => entries.some((e) => e.id === id));

  let group: HitGroup | null;
  switch (mode) {
    case "card": group = effCard ? { kind: "card", id: effCard } : null; break;
    case "trait": group = effTrait ? { kind: "trait", trait: effTrait } : null; break;
    case "costMax": group = { kind: "costMax", max: costMax }; break;
    case "custom": group = { kind: "custom", ids: effCustom }; break;
    default: group = { kind: mode };
  }
  const hits = group ? countHits(entries, group) : 0;
  const odds = useMemo(
    () => oddsByTurn({ deckSize, hits, atLeast, goingFirst, mulligan }),
    [deckSize, hits, atLeast, goingFirst, mulligan],
  );

  if (deckSize === 0) return null;
  return (
    <div className="ds-block ds-odds">
      <h3>Draw odds</h3>
      <div className="ds-odds-controls">
        <label className="ds-field">
          <span className="muted">Looking for</span>
          <select aria-label="Looking for" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <option key={m} value={m}>{MODE_LABEL[m]}</option>
            ))}
          </select>
        </label>
        {mode === "card" ? (
          <label className="ds-field ds-field-wide">
            <span className="muted">Card</span>
            <select aria-label="Card" value={effCard ?? ""} onChange={(e) => setCardId(e.target.value)}>
              {sorted.map((e) => (
                <option key={e.id} value={e.id}>{cardLabel(e.id, e.card, e.copies)}</option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === "costMax" ? (
          <label className="ds-field">
            <span className="muted">Cost</span>
            <select aria-label="Maximum cost" value={costMax} onChange={(e) => setCostMax(Number(e.target.value))}>
              {Array.from({ length: 11 }, (_, c) => (
                <option key={c} value={c}>{c} or less</option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === "trait" ? (
          <label className="ds-field">
            <span className="muted">Trait</span>
            <select aria-label="Trait" value={effTrait ?? ""} onChange={(e) => setTrait(e.target.value)}>
              {traits.map(([t, n]) => (
                <option key={t} value={t}>{t} ({n})</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {mode === "custom" ? (
        <ul className="ds-pick" aria-label="Cards to look for">
          {sorted.map((e, i) => (
            <li key={e.id}>
              <label htmlFor={`${uid}-${i}`}>
                <input
                  id={`${uid}-${i}`}
                  type="checkbox"
                  checked={effCustom.includes(e.id)}
                  onChange={(ev) => setCustom(ev.target.checked ? [...effCustom, e.id] : effCustom.filter((x) => x !== e.id))}
                />
                <span className="ds-pick-name" title={cardLabel(e.id, e.card)}>
                  {e.card.n ?? e.id}
                  <span className="muted ds-pick-meta">
                    {typeof e.card.cost === "number" ? ` · Cost ${e.card.cost}` : ""} · {e.id}
                  </span>
                </span>
                <span className="ds-chip-count">{e.copies}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="ds-odds-toggles">
        <Segmented label="Turn order" value={goingFirst ? "first" : "second"} options={[{ value: "first", label: "Going first" }, { value: "second", label: "Going second" }]} onChange={(v) => setGoingFirst(v === "first")} />
        <Segmented label="Copies needed" value={atLeast} options={[{ value: 1, label: "At least 1" }, { value: 2, label: "At least 2" }]} onChange={setAtLeast} />
        <label className="ds-check">
          <input type="checkbox" checked={mulligan} onChange={(e) => setMulligan(e.target.checked)} />
          <span>Mulligan if no hit in opening 5</span>
        </label>
      </div>
      <p className="ds-note ds-odds-note">
        <strong>{hits}</strong> of {deckSize} cards count. Chance of seeing at least {atLeast} by your turn:
      </p>
      <ol className="ds-odds-row" aria-label="Draw odds by turn">
        {odds.map((p, i) => (
          <li key={i} className="ds-odds-cell">
            <span className="ds-odds-turn">Turn {i + 1}</span>
            <strong className="ds-odds-val">{pct(p)}</strong>
            <span className="ds-odds-bar"><span style={{ height: `${p * 100}%` }} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const SEARCHER_WARN = 0.75;

export function SearcherOdds({ entries }: { entries: DeckEntry[] }) {
  const rows = useMemo(() => searcherOdds(entries), [entries]);
  if (rows.length === 0) return null;
  return (
    <div className="ds-block ds-searchers">
      <h3>Searchers</h3>
      <p className="ds-note ds-search-help">
        <strong>Targets in deck</strong> = cards this effect can pick up (copies, excluding the searcher). <strong>Hit chance</strong> = odds at least one is in the cards it looks at.
      </p>
      <ul className="ds-search-list">
        <li className="ds-search-head" aria-hidden="true">
          <span>Card</span>
          <span>Looks at</span>
          <span>Targets in deck</span>
          <span>Hit chance</span>
        </li>
        {rows.map((r, i) => {
          const low = r.chance !== null && r.chance < SEARCHER_WARN;
          return (
            <li key={`${r.id}-${i}`} className={low ? "ds-search-row ds-warn" : "ds-search-row"}>
              <span className="ds-search-name" title={`${r.name} · ${r.id}`}>
                {r.name}
                <span className="muted ds-search-meta">
                  {typeof r.cost === "number" ? `Cost ${r.cost} · ` : ""}{r.id}
                </span>
              </span>
              <span className="ds-search-num">top {r.look}</span>
              <span className="ds-search-num">{r.hits === null ? "?" : r.hits}</span>
              <strong className="ds-search-chance" title={r.chance === null ? "This search filter can't be estimated" : undefined}>{r.chance === null ? "n/a" : pct(r.chance)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
