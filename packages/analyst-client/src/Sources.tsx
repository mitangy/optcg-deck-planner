import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  buildSources,
  kindLabel,
  placeMarkers,
  placePopover,
  playbookStatus,
  safeLink,
  statsDetail,
  type Mark,
  type ParsedSource,
  type PlacedCitation,
  type SourceEntry,
} from "./citations";
import { Markdown } from "./Markdown";

/** What the host app adds to sources: links into the app and card data. Both are optional. */
export type SourceHooks = {
  /** Where this source can be opened in the app (a match's log page, say), or null when nowhere. */
  href?: (source: ParsedSource) => string | null;
  /** A card's name and picture from the app's card data. */
  card?: (id: string) => { name?: string; imageUrl?: string } | null | undefined;
};

export const SourceHooksContext = createContext<SourceHooks>({});

function viewport() {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? window.innerWidth), h: Math.round(vv?.height ?? window.innerHeight) };
}

function StatsLine({ quote }: { quote: string }) {
  const d = statsDetail(quote);
  if (!d) return null;
  return (
    <p className="lp-src-meta">
      {d.tooFew ? (
        <span className="lp-warn">Only {d.games} games: too few for a win rate</span>
      ) : (
        <>
          {d.games} games
          {d.interval ? ` · 95% interval ${d.interval[0]}% to ${d.interval[1]}%` : ""}
        </>
      )}
    </p>
  );
}

function PlaybookLine({ title }: { title: string }) {
  const s = playbookStatus(title);
  if (!s) return null;
  return (
    <p className="lp-src-meta">
      <span className={s.status === "Draft" ? "lp-warn" : undefined}>{s.status}</span> · written for {s.set}
      {s.stale ? " · may be out of date" : ""}
    </p>
  );
}

/** What a source is, said in words: used by the popover and the Sources list. */
function SourceBody({ parsed, title, quote, showCard }: { parsed: ParsedSource; title: string; quote?: string; showCard?: boolean }) {
  const hooks = useContext(SourceHooksContext);
  const card = parsed.kind === "card" && showCard ? hooks.card?.(parsed.id) : null;
  const link = safeLink(hooks.href?.(parsed));
  return (
    <>
      <div className="lp-src-head">
        {card?.imageUrl ? <img className="lp-src-img" src={card.imageUrl} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
        <div className="lp-src-main">
          <p className="lp-src-line">
            <span className="lp-badge">{kindLabel(parsed)}</span>
          </p>
          <p className="lp-src-title">{parsed.kind === "card" && card?.name ? `${card.name} (${parsed.id})` : title}</p>
        </div>
      </div>
      {parsed.kind === "stats" && quote ? <StatsLine quote={quote} /> : null}
      {parsed.kind === "playbook" ? <PlaybookLine title={title} /> : null}
      {quote ? <blockquote className="lp-quote">{quote}</blockquote> : null}
      {link ? (
        <p className="lp-src-meta">
          <a href={link} target="_blank" rel="noopener noreferrer">
            {parsed.kind === "match" ? "Open this game's log" : "Open"}
          </a>
        </p>
      ) : null}
    </>
  );
}

function CitePopover({ anchor, label, onClose, children }: { anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const p = placePopover({ left: r.left, top: r.top, width: r.width, height: r.height }, { w: el.offsetWidth, h: el.offsetHeight }, viewport());
      setPos((cur) => (cur && cur.left === p.left && cur.top === p.top ? cur : { left: p.left, top: p.top }));
    };
    place();
    // A card picture loading changes the popover's height.
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [anchor, children]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (ref.current?.contains(t) || anchor.contains(t))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only the popover, not the panel behind it.
      e.preventDefault();
      onClose();
      anchor.focus({ preventScroll: true });
    };
    const onMove = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className="logpose lp-pop"
      role="dialog"
      aria-label={label}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <button type="button" className="lp-pop-x" onClick={onClose} aria-label="Close source">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
      {children}
    </div>,
    document.body,
  );
}

function SourcesList({ entries }: { entries: SourceEntry[] }) {
  const hooks = useContext(SourceHooksContext);
  return (
    <details className="lp-sources">
      <summary className="lp-sources-sum">Sources ({entries.length})</summary>
      <ol className="lp-sources-list">
        {entries.map((e) => {
          const quote = e.quotes[0];
          const card = e.parsed.kind === "card" ? hooks.card?.(e.parsed.id) : null;
          return (
            <li key={e.source} className="lp-src">
              <span className="lp-src-n" aria-hidden="true">
                {e.n}
              </span>
              <div className="lp-src-body">
                <p className="lp-src-line">
                  <span className="lp-badge">{kindLabel(e.parsed)}</span>
                  <span className="lp-src-title">{e.parsed.kind === "card" && card?.name ? `${card.name} (${e.parsed.id})` : e.title}</span>
                </p>
                {e.parsed.kind === "stats" && quote ? <StatsLine quote={quote} /> : null}
                {e.parsed.kind === "playbook" ? <PlaybookLine title={e.title} /> : null}
                {safeLink(hooks.href?.(e.parsed)) ? (
                  <p className="lp-src-meta">
                    <a href={safeLink(hooks.href?.(e.parsed))!} target="_blank" rel="noopener noreferrer">
                      Open
                    </a>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/**
 * An assistant answer (or review) as Markdown with a numbered marker after each cited span, a popover for each
 * marker, and under it the deduplicated Sources list, or a note that nothing was cited. Source text is only ever
 * rendered as text.
 */
export function CitedAnswer({ text, citations, done = true }: { text: string; citations: readonly PlacedCitation[]; done?: boolean }) {
  const { entries, marks } = useMemo(() => buildSources(citations), [citations]);
  const marked = useMemo(() => placeMarkers(text, marks), [text, marks]);
  const [active, setActive] = useState<{ index: number; el: HTMLElement } | null>(null);
  const close = useCallback(() => setActive(null), []);

  const renderMark = useCallback(
    (index: number) => {
      const m: Mark | undefined = marks[index];
      if (!m) return null;
      const open = active?.index === index;
      return (
        <button
          type="button"
          className="lp-cite"
          data-open={open ? "true" : undefined}
          aria-label={`Source ${m.n}: ${m.citation.title || m.citation.source}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => setActive(open ? null : { index, el: e.currentTarget })}
        >
          {m.n}
        </button>
      );
    },
    [marks, active],
  );

  const open = active ? marks[active.index] : undefined;
  const entry = open ? entries.find((e) => e.n === open.n) : undefined;
  return (
    <>
      <Markdown text={marked} renderMark={renderMark} />
      {active && open && entry ? (
        <CitePopover anchor={active.el} label={`Source ${open.n}: ${entry.title}`} onClose={close}>
          <SourceBody parsed={entry.parsed} title={entry.title} quote={open.citation.cited_text} showCard />
        </CitePopover>
      ) : null}
      {entries.length ? <SourcesList entries={entries} /> : done && text.trim() ? <p className="lp-own">No sources cited: this is Log Pose's own judgement.</p> : null}
    </>
  );
}
