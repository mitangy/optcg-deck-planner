import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import { computeDeckHints, splitDismissed, type DeckHint } from "../deckHints";
import { computeDeckStats, type DeckStatsCard, type StatsAtlas } from "../deckStats";
import { useStatsAtlas } from "./useStatsAtlas";

export type HintsState = {
  atlas: StatsAtlas | null;
  loading: boolean;
  visible: DeckHint[];
  dismissed: DeckHint[];
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  /** Set by the app when it can answer "Why?" (Log Pose is on here): adds the button to a hint's popover. */
  onAsk?: (hint: DeckHint) => void;
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

/** One chip and its popover: a Headless UI Popover, floating under the chip so opening it never moves the tray. */
function HintChip({ hint: h, dismissed, hints }: { hint: DeckHint; dismissed: boolean; hints: HintsState }) {
  const listed = h.cardIds ?? [];
  return (
    <Popover as="li">
      {({ close }: { close: () => void }) => (
        <>
          <PopoverButton
            type="button"
            className={`dh-chip dh-${h.tier}${dismissed ? " dh-off" : ""}`}
            data-hint-id={h.id}
            title={h.title}
          >
            <span className="dh-dot" aria-hidden="true" />
            <span className="dh-chip-text">{h.title}</span>
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom start", gap: 6, padding: 12 }}
            role="dialog"
            aria-label={h.title}
            className={`dh-pop dh-${h.tier}`}
            style={{ width: `min(${POP_WIDTH}px, calc(100vw - 24px))` }}
          >
            <strong className="dh-pop-title">{h.title}</strong>
            <p className="dh-pop-detail">{h.detail}</p>
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
            <HintActions
              dismissed={dismissed}
              onDismiss={() => hints.dismiss(h.id)}
              onRestore={() => hints.restore(h.id)}
              onAsk={
                hints.onAsk
                  ? () => {
                      close();
                      hints.onAsk!(h);
                    }
                  : undefined
              }
            />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

export function DeckHintsTray({ hints }: { hints: HintsState }) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(0);
  const trayRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLUListElement>(null);
  const shown = showDismissed ? [...hints.visible, ...hints.dismissed] : hints.visible;

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

  const dismissedIds = new Set(hints.dismissed.map((h) => h.id));

  return (
    <div ref={trayRef} className="dh-tray" role="group" aria-label="Build hints">
      <ul ref={chipsRef} className={`dh-chips${expanded ? " dh-expanded" : ""}`}>
        {shown.length === 0 ? (
          <li className="dh-empty muted">{hints.loading ? "Checking deck…" : hints.atlas ? "No build hints" : "Hints unavailable"}</li>
        ) : (
          shown.map((h) => (
            <HintChip key={h.id} hint={h} dismissed={dismissedIds.has(h.id)} hints={hints} />
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
    </div>
  );
}

/** The popover's action row: "Why? Ask Log Pose" (only when the app can answer it), then Dismiss or Restore. */
export function HintActions({ dismissed, onDismiss, onRestore, onAsk }: { dismissed: boolean; onDismiss: () => void; onRestore: () => void; onAsk?: () => void }) {
  return (
    <div className="dh-pop-actions">
      {onAsk ? (
        <button type="button" className="btn secondary dh-ask" onClick={onAsk}>
          Why? Ask Log Pose
        </button>
      ) : null}
      {dismissed ? (
        <button type="button" className="btn secondary" onClick={onRestore}>
          Restore
        </button>
      ) : (
        <button type="button" className="btn secondary" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
