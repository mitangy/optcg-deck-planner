import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  OVERLAY_MIN_PX,
  RAIL_MIN_PX,
  clampPhoneWidth,
  nudgePhoneWidth,
  parsePhoneSizes,
  phoneClampCss,
  phoneMaxPx,
  serializePhoneSizes,
  setPhoneWidth,
  type PhoneSizes,
  type PhoneTarget,
} from "./phoneSizes";

type Active = { target: PhoneTarget; startX: number; startW: number };

const LABEL: Record<PhoneTarget, string> = { rail: "Resize right column", overlay: "Resize side panel" };
const MIN: Record<PhoneTarget, number> = { rail: RAIL_MIN_PX, overlay: OVERLAY_MIN_PX };

/**
 * Drag handles for landscape phones: the right column's left edge (drag left =
 * wider) and the log / chat overlay's right edge (drag right = wider). The
 * width follows the pointer live and is saved on release; Esc puts it back.
 * Each handle sits inside the element it sizes, so that element's parent is
 * measured for the start width.
 */
export function usePhoneResize(saved: string, onChange: (next: string) => void) {
  const sizes = parsePhoneSizes(saved);
  const [live, setLive] = useState<PhoneSizes | null>(null);
  const liveRef = useRef<PhoneSizes | null>(null);
  const activeRef = useRef<Active | null>(null);
  const [resizing, setResizing] = useState(false);
  const [measured, setMeasured] = useState<Partial<Record<PhoneTarget, number>>>({});
  const latest = useRef({ saved, onChange });
  latest.current = { saved, onChange };
  const shown = live ?? sizes;

  const apply = useCallback((next: PhoneSizes | null) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      const next = liveRef.current;
      activeRef.current = null;
      apply(null);
      setResizing(false);
      if (!commit || !next) return;
      const text = serializePhoneSizes(next);
      if (text !== latest.current.saved) latest.current.onChange(text);
    },
    [apply],
  );

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const act = activeRef.current;
      if (!act) return;
      const dx = e.clientX - act.startX;
      const px = clampPhoneWidth(act.target, act.startW + (act.target === "rail" ? -dx : dx), window.innerWidth);
      apply(setPhoneWidth(parsePhoneSizes(latest.current.saved), act.target, px));
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    document.body.classList.add("is-panel-resize", "is-panel-resize-col");
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("is-panel-resize", "is-panel-resize-col");
    };
  }, [resizing, apply, finish]);

  const commit = (target: PhoneTarget, px: number | null) => {
    const text = serializePhoneSizes(setPhoneWidth(parsePhoneSizes(latest.current.saved), target, px));
    if (text !== latest.current.saved) latest.current.onChange(text);
  };

  const widthOf = (el: Element | null) => (el ? el.getBoundingClientRect().width : 0);

  const handleProps = (target: PhoneTarget) => ({
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": LABEL[target],
    "aria-valuemin": MIN[target],
    "aria-valuemax": Math.round(phoneMaxPx(target, typeof window === "undefined" ? 812 : window.innerWidth)),
    "aria-valuenow": shown[target] ?? measured[target],
    tabIndex: 0,
    onFocus: (e: React.FocusEvent) => {
      const w = Math.round(widthOf(e.currentTarget.parentElement));
      setMeasured((cur) => (cur[target] === w ? cur : { ...cur, [target]: w }));
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      activeRef.current = { target, startX: e.clientX, startW: widthOf(e.currentTarget.parentElement) };
      setResizing(true);
    },
    onDoubleClick: (e: React.MouseEvent) => {
      commit(target, null);
      const el = e.currentTarget.parentElement;
      requestAnimationFrame(() => setMeasured((cur) => ({ ...cur, [target]: Math.round(widthOf(el)) })));
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const w = latest.current.saved ? (parsePhoneSizes(latest.current.saved)[target] ?? null) : null;
      const cur = w ?? widthOf(e.currentTarget.parentElement);
      // The right column grows to the left, the overlay to the right.
      const grow = e.key === (target === "rail" ? "ArrowLeft" : "ArrowRight");
      commit(target, nudgePhoneWidth(target, cur, grow, window.innerWidth));
    },
  });

  /** Inline vars for the board root (`--rail-w`, `--lp-overlay-w`), clamped by CSS for any window. */
  const style: CSSProperties | undefined =
    shown.rail == null && shown.overlay == null
      ? undefined
      : ({
          ...(shown.rail != null ? { "--rail-w": phoneClampCss("rail", shown.rail) } : null),
          ...(shown.overlay != null ? { "--lp-overlay-w": phoneClampCss("overlay", shown.overlay) } : null),
        } as CSSProperties);

  return { resizing, style, handleProps };
}
