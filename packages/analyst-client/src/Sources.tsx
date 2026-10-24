import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import {
  buildSources,
  eventLink,
  hasRecord,
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
import { citedCardNames, findMentions } from "./mentions";

/** What the host app adds to sources: links into the app and card data. Both are optional. */
export type SourceHooks = {
  /** Where this source can be opened in the app (a match's log page, say), or null when nowhere. */
  href?: (source: ParsedSource) => string | null;
  /** A card's name and picture from the app's card data. */
  card?: (id: string) => { name?: string; imageUrl?: string } | null | undefined;
  /** Where a deck ("planner:<id>" or "duel:<id>") can be opened in the app, for an edit that belongs to another page. */
  deckHref?: (ref: string) => string | null;
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
  const link = safeLink(hooks.href?.(parsed)) ?? eventLink(parsed);
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
      {hasRecord(parsed) && quote ? <StatsLine quote={quote} /> : null}
      {parsed.kind === "playbook" ? <PlaybookLine title={title} /> : null}
      {quote ? <blockquote className="lp-quote">{quote}</blockquote> : null}
      {link ? (
        <p className="lp-src-meta">
          <a href={link} target="_blank" rel="noopener noreferrer">
            {parsed.kind === "match" ? "Open this game's log" : parsed.kind === "event" ? "Open on Limitless TCG" : "Open"}
          </a>
        </p>
      ) : null}
    </>
  );
}

/**
 * A numbered marker and its source popover: a Headless UI Popover, floating (in a portal, kept on
 * screen) next to the marker, so opening it never moves the text. Escape closes only the popover
 * (focus returns to the marker), not the panel behind it, as does a click or tap elsewhere.
 */
function CiteMark({ mark, entry }: { mark: Mark; entry: SourceEntry }) {
  return (
    <Popover as="span">
      {({ close }: { close: () => void }) => (
        <>
          <PopoverButton
            type="button"
            className="lp-cite"
            aria-label={`Source ${mark.n}: ${mark.citation.title || mark.citation.source}`}
          >
            {mark.n}
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom start", gap: 8, padding: 8 }}
            role="dialog"
            aria-label={`Source ${mark.n}: ${entry.title}`}
            className="logpose lp-pop"
          >
            <button type="button" className="lp-pop-x" onClick={() => close()} aria-label="Close source">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
            <SourceBody parsed={entry.parsed} title={entry.title} quote={mark.citation.cited_text} showCard />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

/** The card picture a mention shows: fixed in place next to it, never in the way of the pointer. */
const PEEK_W = 240;
const PEEK_RATIO = 7 / 5;

function CardPeek({ anchor, name, src }: { anchor: HTMLElement; name: string; src: string }) {
  const [pos, setPos] = useState<{ left: number; top: number; w: number; h: number } | null>(null);
  const [broken, setBroken] = useState(false);
  useLayoutEffect(() => {
    const vp = viewport();
    const w = Math.max(Math.min(PEEK_W, vp.w - 16, (vp.h - 16) / PEEK_RATIO), 80);
    const size = { w, h: Math.round(w * PEEK_RATIO) };
    const r = anchor.getBoundingClientRect();
    const p = placePopover({ left: r.left, top: r.top, width: r.width, height: r.height }, size, vp);
    setPos({ left: p.left, top: p.top, ...size });
  }, [anchor]);
  if (typeof document === "undefined" || broken) return null;
  return createPortal(
    <div
      className="logpose lp-peek"
      role="img"
      aria-label={name}
      style={pos ? { left: pos.left, top: pos.top, width: pos.w, height: pos.h } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <img src={src} alt="" decoding="async" onError={() => setBroken(true)} />
    </div>,
    document.body,
  );
}

/**
 * A card named in an answer. A mouse shows its picture while hovering; the keyboard, while focused; a finger,
 * after a tap (and a tap elsewhere or Escape puts it away). The text never moves.
 */
function CardMention({ text, name, src }: { text: string; name: string; src: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const mouse = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const shut = () => setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && el?.contains(e.target)) return;
      shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Put away the picture, not the panel behind it.
      e.preventDefault();
      shut();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="lp-mention"
        data-open={open ? "true" : undefined}
        aria-label={`${text}: show card`}
        onPointerDown={(e) => {
          mouse.current = e.pointerType === "mouse";
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && document.activeElement !== ref.current) setOpen(false);
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={() => {
          // A mouse already shows it on hover; a finger or the keyboard toggles it.
          if (!mouse.current) setOpen((o) => !o);
          mouse.current = false;
        }}
      >
        {text}
      </button>
      {open && ref.current ? <CardPeek anchor={ref.current} name={name} src={src} /> : null}
    </>
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
          const link = safeLink(hooks.href?.(e.parsed)) ?? eventLink(e.parsed);
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
                {hasRecord(e.parsed) && quote ? <StatsLine quote={quote} /> : null}
                {e.parsed.kind === "playbook" ? <PlaybookLine title={e.title} /> : null}
                {link ? (
                  <p className="lp-src-meta">
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      {e.parsed.kind === "event" ? "Open on Limitless TCG" : "Open"}
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
  const hooks = useContext(SourceHooksContext);

  const renderMark = useCallback(
    (index: number) => {
      const m: Mark | undefined = marks[index];
      const entry = m ? entries.find((e) => e.n === m.n) : undefined;
      return m && entry ? <CiteMark mark={m} entry={entry} /> : null;
    },
    [marks, entries],
  );

  const renderText = useMemo(() => {
    const cardOf = hooks.card;
    if (!cardOf) return undefined;
    const names = citedCardNames(entries, (id) => cardOf(id)?.name);
    const img = (id: string) => cardOf(id)?.imageUrl || undefined;
    return (t: string): ReactNode => {
      const parts = findMentions(t, names, (id) => Boolean(img(id)));
      if (parts.length === 1 && typeof parts[0] === "string") return t;
      return parts.map((p, k) => (typeof p === "string" ? p : <CardMention key={k} text={p.text} name={cardOf(p.id)?.name || p.text} src={img(p.id)!} />));
    };
  }, [entries, hooks]);

  return (
    <>
      <Markdown text={marked} renderMark={renderMark} renderText={renderText} />
      {entries.length ? <SourcesList entries={entries} /> : done && text.trim() ? <p className="lp-own">No sources cited: this is Log Pose's own judgement.</p> : null}
    </>
  );
}
