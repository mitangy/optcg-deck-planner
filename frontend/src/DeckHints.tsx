import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { computeDeckHints, splitDismissed, type DeckHint } from "./deckHints";
import { computeDeckStats, type DeckStatsCard, type StatsAtlas } from "./deckStats";
import { useStatsAtlas } from "./useStatsAtlas";

export type HintsState = {
  atlas: StatsAtlas | null;
  loading: boolean;
  visible: DeckHint[];
  dismissed: DeckHint[];
  dismiss: (id: string) => void;
  restore: (id: string) => void;
};

const storageKey = (deckId: number | string) => `optcg_deck_hints_dismissed_${deckId}`;

function readDismissed(deckId: number | string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(deckId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Hints for one deck plus per-deck dismissals (kept in localStorage when it is available). */
export function useDeckHints(deckId: number | string, cards: DeckStatsCard[], leaderId: string | null, finished: boolean): HintsState {
  const { data: atlas, isLoading } = useStatsAtlas();
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => readDismissed(deckId));
  useEffect(() => setDismissedIds(readDismissed(deckId)), [deckId]);

  const all = useMemo(() => {
    if (!atlas) return [];
    return computeDeckHints(computeDeckStats(cards, atlas, leaderId), cards, atlas, leaderId, { finished });
  }, [atlas, cards, leaderId, finished]);
  const split = useMemo(() => splitDismissed(all, dismissedIds), [all, dismissedIds]);

  const save = useCallback(
    (next: string[]) => {
      setDismissedIds(next);
      try {
        localStorage.setItem(storageKey(deckId), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [deckId],
  );
  const dismiss = useCallback((id: string) => save([...new Set([...dismissedIds, id])]), [dismissedIds, save]);
  const restore = useCallback((id: string) => save(dismissedIds.filter((x) => x !== id)), [dismissedIds, save]);

  return { atlas: atlas ?? null, loading: isLoading, visible: split.visible, dismissed: split.dismissed, dismiss, restore };
}

const POP_WIDTH = 320;
const MAX_LISTED = 12;

type Open = { id: string; left: number; top: number; width: number };

export function DeckHintsTray({ hints }: { hints: HintsState }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(0);
  const trayRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLUListElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const shown = showDismissed ? [...hints.visible, ...hints.dismissed] : hints.visible;
  const openHint = open ? shown.find((h) => h.id === open.id) : undefined;

  useEffect(() => {
    if (open && !openHint) setOpen(null);
  }, [open, openHint]);

  // The tray reserves two rows. Chips that do not fit are clipped and counted; "+N" overlays the rest.
  useLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const measure = () => {
      const limit = el.clientHeight;
      setHidden(Array.from(el.children).filter((li) => (li as HTMLElement).offsetTop + (li as HTMLElement).offsetHeight > limit + 1).length);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown.length, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest(".dh-tray") && !t?.closest(".dh-pop")) setExpanded(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [expanded]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(".dh-pop") || t?.closest(".dh-chip")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && (popRef.current?.contains(e.target) || trayRef.current?.contains(e.target))) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Keep the popover on screen: flip above the chip when there is no room below.
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!open || !el) return;
    const h = el.offsetHeight;
    if (open.top + h > window.innerHeight - 8) {
      const chip = document.querySelector<HTMLElement>(`[data-hint-id="${CSS.escape(open.id)}"]`);
      const top = Math.max(8, (chip ? chip.getBoundingClientRect().top - 6 : open.top) - h);
      el.style.top = `${top}px`;
    }
  }, [open]);

  function toggle(h: DeckHint, el: HTMLElement) {
    if (open?.id === h.id) return setOpen(null);
    const r = el.getBoundingClientRect();
    const width = Math.min(POP_WIDTH, window.innerWidth - 24);
    setOpen({ id: h.id, width, left: Math.min(Math.max(12, r.left), window.innerWidth - width - 12), top: r.bottom + 6 });
  }

  const dismissedIds = new Set(hints.dismissed.map((h) => h.id));
  const listed = openHint?.cardIds ?? [];

  return (
    <div ref={trayRef} className="dh-tray" role="group" aria-label="Build hints">
      <ul ref={chipsRef} className={`dh-chips${expanded ? " dh-expanded" : ""}`}>
        {shown.length === 0 ? (
          <li className="dh-empty muted">{hints.loading ? "Checking deck…" : hints.atlas ? "No build hints" : "Hints unavailable"}</li>
        ) : (
          shown.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={`dh-chip dh-${h.tier}${dismissedIds.has(h.id) ? " dh-off" : ""}`}
                data-hint-id={h.id}
                aria-expanded={open?.id === h.id}
                title={h.title}
                onClick={(e) => toggle(h, e.currentTarget)}
              >
                <span className="dh-dot" aria-hidden="true" />
                <span className="dh-chip-text">{h.title}</span>
              </button>
            </li>
          ))
        )}
      </ul>
      {hidden > 0 || expanded || hints.dismissed.length > 0 ? (
        <div className="dh-side">
          {hidden > 0 || expanded ? (
            <button type="button" className="dh-chip dh-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show less" : `+${hidden} more`}
            </button>
          ) : null}
          {hints.dismissed.length > 0 ? (
            <button type="button" className="dh-chip dh-toggle" aria-pressed={showDismissed} onClick={() => setShowDismissed((v) => !v)}>
              {showDismissed ? "Hide dismissed" : `Show ${hints.dismissed.length} dismissed`}
            </button>
          ) : null}
        </div>
      ) : null}
      {open && openHint ? (
        <div ref={popRef} className={`dh-pop dh-${openHint.tier}`} role="dialog" aria-label={openHint.title} style={{ left: open.left, top: open.top, width: open.width }}>
          <strong className="dh-pop-title">{openHint.title}</strong>
          <p className="dh-pop-detail">{openHint.detail}</p>
          {listed.length > 0 ? (
            <ul className="dh-pop-cards">
              {listed.slice(0, MAX_LISTED).map((id) => (
                <li key={id}>
                  <span className="card-id">{id}</span>
                  <span className="dh-pop-name">
                    {hints.atlas?.[id]?.n ?? ""}
                    {typeof hints.atlas?.[id]?.cost === "number" ? <span className="muted"> · Cost {hints.atlas[id]!.cost}</span> : null}
                  </span>
                </li>
              ))}
              {listed.length > MAX_LISTED ? <li className="muted">+{listed.length - MAX_LISTED} more</li> : null}
            </ul>
          ) : null}
          <div className="dh-pop-actions">
            {dismissedIds.has(openHint.id) ? (
              <button type="button" className="btn secondary" onClick={() => hints.restore(openHint.id)}>
                Restore
              </button>
            ) : (
              <button type="button" className="btn secondary" onClick={() => hints.dismiss(openHint.id)}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
