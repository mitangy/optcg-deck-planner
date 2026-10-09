import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { lookupCard } from "../cards/atlas";
import type { PendingChoiceView } from "../net/protocol";
import { peekPillLeft } from "./peekPill";
import { usePromptDodge } from "./usePromptDodge";
import { updateSettings, useDuelSettings } from "../settings";
import { usePromptDrag } from "./promptDrag";
import { PromptDockContext, usePromptDockControls, usePromptDockHost, type PromptDock } from "./promptDock";
import { DESKTOP_BOARD_QUERY, useMediaQuery } from "./useMediaQuery";
import "./float.css";

/** The card an effect comes from, for prompt headers and the "Back to …" pill. */
export function promptSourceName(choice: PendingChoiceView): string {
  return choice.cardDefId && choice.cardDefId !== "HIDDEN" ? lookupCard(choice.cardDefId).name : "Effect";
}

/**
 * Wraps a choice pop-up so its Hide button can tuck it away: the pop-up stays
 * mounted (picks so far are kept) and one pill brings it back. `dodge` (wide
 * boards, mid-battle) keeps the pop-up off the card being attacked. The
 * header drags the pop-up anywhere on screen (see usePromptDrag). On the
 * desktop board (`dockable`) it can also dock into a side column (the
 * `promptDock` setting, #449) without leaving this spot in the React tree, so
 * the picks made so far survive; docked, it no longer dodges a battle.
 */
export function HideablePrompt({
  name,
  hidden,
  onShow,
  dodge = null,
  dockable = false,
  children,
}: {
  name: string;
  hidden: boolean;
  onShow: () => void;
  dodge?: { defenderId: string; attackerId: string } | null;
  /** The board has side columns to dock into (wide desktop, not a landscape phone). */
  dockable?: boolean;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { promptPos, promptDock } = useDuelSettings();
  const side: PromptDock = dockable ? promptDock : "";
  const setSide = useCallback((s: PromptDock) => updateSettings({ promptDock: s }), []);
  usePromptDodge(wrapRef, side ? null : dodge, dodge != null && !hidden && !side);
  usePromptDrag(wrapRef, promptPos, { side, dockable, setSide });
  usePromptDockHost(wrapRef, side || null);
  const dockControls = useMemo(() => ({ side, dockable, setSide }), [side, dockable, setSide]);
  return (
    <>
      <div ref={wrapRef} hidden={hidden} className="prompt-hide-wrap">
        <PromptDockContext.Provider value={dockControls}>{children}</PromptDockContext.Provider>
      </div>
      {hidden ? <BackPill label={`Back to ${name}`} onShow={onShow} /> : null}
    </>
  );
}

/**
 * The pill that brings a hidden prompt back. On desktop it sits in the top
 * bar's empty middle (clear of the status chips and buttons) rather than on
 * the opponent's DON!! row, or straddling the bar's lower edge when the chips
 * leave no gap; phones keep it floating under the bar.
 */
export function BackPill({ label, onShow }: { label: string; onShow: () => void }) {
  const desktop = useMediaQuery(DESKTOP_BOARD_QUERY);
  const layerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const pill = pillRef.current;
    const bar = document.querySelector<HTMLElement>(".hud-bar");
    if (!desktop || !layer || !pill || !bar) {
      setSpot(null);
      return;
    }
    const measure = () => {
      const lr = layer.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const chips = [...(bar.querySelector(".hud-status")?.children ?? [])];
      const statusRight = Math.max(0, ...chips.map((c) => c.getBoundingClientRect().right));
      const actions = bar.querySelector(".hud-actions")?.getBoundingClientRect();
      const left = peekPillLeft(
        {
          from: Math.max(statusRight + 12, lr.left),
          to: Math.min((actions?.left ?? lr.right) - 12, lr.right),
        },
        pill.offsetWidth,
        (lr.left + lr.right) / 2,
      );
      // No room beside the chips: straddle the bar's lower edge instead, above
      // the opponent's DON!! row (the mat's top margin is empty).
      const next =
        left == null
          ? { left: (lr.left + lr.right - pill.offsetWidth) / 2 - lr.left, top: br.bottom - 12 - lr.top }
          : { left: left - lr.left, top: br.top + (br.height - pill.offsetHeight) / 2 - lr.top };
      setSpot((cur) =>
        cur === next || (cur && next && Math.abs(cur.left - next.left) < 0.5 && Math.abs(cur.top - next.top) < 0.5) ? cur : next,
      );
    };
    measure();
    // The clocks tick and statuses come and go, so the room beside them changes.
    const timer = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [desktop, label]);

  const style: CSSProperties | undefined = spot ? { position: "absolute", left: spot.left, top: spot.top } : undefined;
  return (
    <div ref={layerRef} className="float-layer float-layer-peek">
      <button ref={pillRef} type="button" className="float-return" style={style} onClick={onShow}>
        {label}
      </button>
    </div>
  );
}

/** Dock-left / dock-right buttons (desktop): the pressed one undocks. */
function PromptDockButtons() {
  const dock = usePromptDockControls();
  if (!dock?.dockable) return null;
  return (
    <span className="prompt-dock-tools">
      {(["left", "right"] as const).map((s) => (
        <button
          key={s}
          type="button"
          className="prompt-dock-btn"
          data-dock={s}
          aria-pressed={dock.side === s}
          title={dock.side === s ? `Undock from the ${s} column` : `Dock in the ${s} column`}
          aria-label={dock.side === s ? `Undock this prompt from the ${s} column` : `Dock this prompt in the ${s} column`}
          onClick={() => dock.setSide(dock.side === s ? "" : s)}
        >
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden>
            <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <rect x={s === "left" ? 1.5 : 10} y="1.5" width="4.5" height="9" fill="currentColor" />
          </svg>
        </button>
      ))}
    </span>
  );
}

/** Small "Hide" button for a pop-up's top-right corner, with the dock buttons beside it. */
export function PromptHideButton({ onHide }: { onHide?: () => void }) {
  if (!onHide) return null;
  return (
    <>
      <PromptDockButtons />
      <button type="button" className="prompt-hide" onClick={onHide} aria-label="Hide this prompt to see your hand and the board">
        Hide
      </button>
    </>
  );
}
