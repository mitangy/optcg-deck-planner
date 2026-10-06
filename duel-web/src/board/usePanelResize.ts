import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { PanelColumn, PanelId } from "./panelLayout";
import {
  COLUMN_MAX_PX,
  COLUMN_MAX_VW,
  COLUMN_MIN_PX,
  PANEL_MIN_PX,
  PANEL_STEP_SHARE,
  clampColumnWidth,
  columnMaxPx,
  nudgeColumnWidth,
  samePanelSizes,
  setShares,
  setWidth,
  splitHeights,
  type PanelSizes,
} from "./panelSizes";

type Active =
  | { kind: "column"; column: PanelColumn; startX: number; startW: number }
  | {
      kind: "split";
      a: PanelId;
      b: PanelId;
      startY: number;
      hA: number;
      hB: number;
      minA: number;
      minB: number;
      colH: number;
    };

/** A panel's CSS minimum height in px (percentages against the column), at least the floor. */
function minHeightOf(el: HTMLElement, colH: number): number {
  const raw = getComputedStyle(el).minHeight;
  const px = raw.endsWith("%") ? (parseFloat(raw) / 100) * colH : parseFloat(raw);
  return Math.max(PANEL_MIN_PX, Number.isFinite(px) ? px : 0);
}

function contentHeight(col: HTMLElement): number {
  const s = getComputedStyle(col);
  return col.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
}

/** Measure the two panels around a divider; null when either is not on screen. */
function measureSplit(root: HTMLElement, a: PanelId, b: PanelId) {
  const elA = root.querySelector<HTMLElement>(`[data-panel="${a}"]`);
  const elB = root.querySelector<HTMLElement>(`[data-panel="${b}"]`);
  const col = elA?.parentElement;
  if (!elA || !elB || !col) return null;
  const colH = contentHeight(col);
  if (colH <= 0) return null;
  return {
    hA: elA.getBoundingClientRect().height,
    hB: elB.getBoundingClientRect().height,
    minA: minHeightOf(elA, colH),
    minB: minHeightOf(elB, colH),
    colH,
  };
}

function columnEl(root: HTMLElement, column: PanelColumn) {
  return root.querySelector<HTMLElement>(`[data-panel-col="${column}"]`);
}

/**
 * Drag-to-resize for the desktop side panels: the inner edge of each column
 * sets its width, the divider between two neighbouring panels moves height from
 * one to the other. The panels follow the pointer live (local state); the
 * size is only saved on release, and Esc puts everything back.
 */
export function usePanelResize(
  rootRef: React.RefObject<HTMLElement | null>,
  sizes: PanelSizes,
  onChange: (next: PanelSizes) => void,
) {
  const [live, setLive] = useState<PanelSizes | null>(null);
  const liveRef = useRef<PanelSizes | null>(null);
  const activeRef = useRef<Active | null>(null);
  const [resizing, setResizing] = useState(false);
  /** Sizes read from the screen for handles with nothing saved yet (aria-valuenow). */
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const latest = useRef({ sizes, onChange });
  latest.current = { sizes, onChange };
  const shown = live ?? sizes;

  const apply = useCallback((next: PanelSizes | null) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  const move = useCallback(
    (e: PointerEvent) => {
      const act = activeRef.current;
      if (!act) return;
      const base = latest.current.sizes;
      if (act.kind === "column") {
        const dx = e.clientX - act.startX;
        const px = clampColumnWidth(act.startW + (act.column === "left" ? dx : -dx), window.innerWidth);
        apply(setWidth(base, act.column, px));
      } else {
        const [a, b] = splitHeights(act.hA, act.hB, e.clientY - act.startY, act.minA, act.minB);
        apply(setShares(base, { [act.a]: a / act.colH, [act.b]: b / act.colH }));
      }
    },
    [apply],
  );

  const finish = useCallback(
    (commit: boolean) => {
      const next = liveRef.current;
      activeRef.current = null;
      apply(null);
      setResizing(false);
      if (!commit || !next) return;
      const { sizes: cur, onChange: change } = latest.current;
      if (!samePanelSizes(next, cur)) change(next);
    },
    [apply],
  );

  useEffect(() => {
    if (!resizing) return;
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    const kind = activeRef.current?.kind === "column" ? "is-panel-resize-col" : "is-panel-resize-row";
    document.body.classList.add("is-panel-resize", kind);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("is-panel-resize", kind);
    };
  }, [resizing, move, finish]);

  const begin = (act: Active) => {
    activeRef.current = act;
    setResizing(true);
  };

  /** Read the current size of a handle's target from the screen. */
  const measure = useCallback(
    (key: string, a: PanelColumn | PanelId, b?: PanelId) => {
      const root = rootRef.current;
      if (!root) return;
      let value: number | null = null;
      if (!b) {
        const el = columnEl(root, a as PanelColumn);
        if (el) value = Math.round(el.getBoundingClientRect().width);
      } else {
        const m = measureSplit(root, a as PanelId, b);
        if (m) value = Math.round((m.hA / m.colH) * 100);
      }
      if (value != null) setMeasured((cur) => (cur[key] === value ? cur : { ...cur, [key]: value }));
    },
    [rootRef],
  );
  const remeasureSoon = (key: string, a: PanelColumn | PanelId, b?: PanelId) =>
    requestAnimationFrame(() => measure(key, a, b));

  const commit = (next: PanelSizes) => {
    if (!samePanelSizes(next, latest.current.sizes)) latest.current.onChange(next);
  };

  const columnHandleProps = (column: PanelColumn) => {
    const key = `col:${column}`;
    return {
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": `Resize ${column} column`,
      "aria-valuemin": COLUMN_MIN_PX,
      "aria-valuemax": Math.round(
        columnMaxPx(typeof window === "undefined" ? COLUMN_MAX_PX / (COLUMN_MAX_VW / 100) : window.innerWidth),
      ),
      "aria-valuenow": shown.widths[column] ?? measured[key],
      tabIndex: 0,
      onFocus: () => measure(key, column),
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const root = rootRef.current;
        const el = root && columnEl(root, column);
        if (!el) return;
        e.preventDefault();
        begin({ kind: "column", column, startX: e.clientX, startW: el.getBoundingClientRect().width });
      },
      onDoubleClick: () => {
        commit(setWidth(latest.current.sizes, column, null));
        remeasureSoon(key, column);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        const root = rootRef.current;
        const el = root && columnEl(root, column);
        if (!el) return;
        // The left column grows to the right, the right one to the left.
        const grow = e.key === (column === "left" ? "ArrowRight" : "ArrowLeft");
        const w = latest.current.sizes.widths[column] ?? el.getBoundingClientRect().width;
        commit(setWidth(latest.current.sizes, column, nudgeColumnWidth(w, grow, window.innerWidth)));
        remeasureSoon(key, column);
      },
    };
  };

  /** The divider above panel `b`, between it and the panel `a` above it. */
  const dividerProps = (a: PanelId, b: PanelId, label: string) => {
    const key = `split:${a}:${b}`;
    const saved = shown.heights[a];
    return {
      role: "separator" as const,
      "aria-orientation": "horizontal" as const,
      "aria-label": `Resize ${label}`,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": saved != null ? Math.round(saved * 100) : measured[key],
      tabIndex: 0,
      onFocus: () => measure(key, a, b),
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const root = rootRef.current;
        const m = root && measureSplit(root, a, b);
        if (!m) return;
        e.preventDefault();
        begin({ kind: "split", a, b, startY: e.clientY, ...m });
      },
      onDoubleClick: () => {
        commit(setShares(latest.current.sizes, { [a]: null, [b]: null }));
        remeasureSoon(key, a, b);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        e.stopPropagation();
        const root = rootRef.current;
        const m = root && measureSplit(root, a, b);
        if (!m) return;
        const step = PANEL_STEP_SHARE * m.colH * (e.key === "ArrowDown" ? 1 : -1);
        const [nA, nB] = splitHeights(m.hA, m.hB, step, m.minA, m.minB);
        commit(setShares(latest.current.sizes, { [a]: nA / m.colH, [b]: nB / m.colH }));
        remeasureSoon(key, a, b);
      },
    };
  };

  /** Inline overrides for the board root: the column widths, clamped by CSS for a smaller window. */
  const arenaStyle: CSSProperties | undefined =
    shown.widths.left == null && shown.widths.right == null
      ? undefined
      : ({
          ...(shown.widths.left != null ? { "--left-w": clampCss(shown.widths.left) } : null),
          ...(shown.widths.right != null ? { "--rail-w": clampCss(shown.widths.right) } : null),
        } as CSSProperties);

  /**
   * A panel's inline height. `last` is the panel at the bottom of its column:
   * it always grows, so a sized column never leaves an empty gap.
   */
  const panelStyle = (id: PanelId, last: boolean, columnSized: boolean): CSSProperties | undefined => {
    const share = shown.heights[id];
    if (share != null) return { flex: `${last ? 1 : 0} 1 ${share * 100}%`, maxHeight: "none" };
    return last && columnSized ? { flexGrow: 1, maxHeight: "none" } : undefined;
  };

  return {
    resizing,
    shown,
    arenaStyle,
    panelStyle,
    columnHandleProps,
    dividerProps,
  };
}

function clampCss(px: number): string {
  return `clamp(${COLUMN_MIN_PX}px, ${px}px, min(${COLUMN_MAX_PX}px, ${COLUMN_MAX_VW}vw))`;
}
