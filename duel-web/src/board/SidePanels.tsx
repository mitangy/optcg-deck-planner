import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  PANEL_LABELS,
  movePanel,
  nudgePanel,
  panelDropAt,
  samePanelLayout,
  type ColumnRect,
  type PanelColumn,
  type PanelDrop,
  type PanelId,
  type PanelLayout,
  type PanelRect,
} from "./panelLayout";

type DragState = {
  id: PanelId;
  x: number;
  y: number;
  drop: PanelDrop;
  /** Fixed-position insertion line (viewport px). */
  line: { left: number; width: number; top: number };
};

/** Measure the desktop side columns and their panels inside `root`. */
function measure(root: HTMLElement) {
  const columns = {} as Record<PanelColumn, ColumnRect & { top: number }>;
  const panels: PanelRect[] = [];
  for (const col of root.querySelectorAll<HTMLElement>("[data-panel-col]")) {
    const column = col.dataset.panelCol as PanelColumn;
    const r = col.getBoundingClientRect();
    columns[column] = { left: r.left, right: r.right, top: r.top };
    for (const p of col.querySelectorAll<HTMLElement>(":scope > [data-panel]")) {
      const pr = p.getBoundingClientRect();
      panels.push({ id: p.dataset.panel as PanelId, column, top: pr.top, bottom: pr.bottom });
    }
  }
  return { columns, panels };
}

/**
 * Drag-to-move for the desktop side panels. The panels never move while you
 * drag: a line shows where the panel will land, and the layout only changes on
 * drop (Esc cancels), so nothing on the board shifts under the pointer.
 */
export function usePanelDrag(
  rootRef: React.RefObject<HTMLElement | null>,
  layout: PanelLayout,
  onChange: (next: PanelLayout) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const latest = useRef({ layout, onChange });
  latest.current = { layout, onChange };

  const track = useCallback(
    (id: PanelId, x: number, y: number) => {
      const root = rootRef.current;
      if (!root) return;
      const { columns, panels } = measure(root);
      if (!columns.left || !columns.right) return;
      const drop = panelDropAt(columns, panels, id, x, y);
      const col = columns[drop.column];
      const rest = panels.filter((p) => p.column === drop.column && p.id !== id);
      const before = drop.beforeId ? rest.find((p) => p.id === drop.beforeId) : null;
      const top = before ? before.top : rest.length ? Math.max(...rest.map((p) => p.bottom)) : col.top;
      setDrag({ id, x, y, drop, line: { left: col.left, width: col.right - col.left, top } });
    },
    [rootRef],
  );

  const stop = useCallback((commit: boolean) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || !commit) return;
    const { layout: cur, onChange: change } = latest.current;
    const next = movePanel(cur, d.id, d.drop.column, d.drop.beforeId);
    if (!samePanelLayout(next, cur)) change(next);
  }, []);

  const dragging = drag != null;
  useEffect(() => {
    if (!dragging) return;
    const id = dragRef.current!.id;
    const onMove = (e: PointerEvent) => track(id, e.clientX, e.clientY);
    const onUp = () => stop(true);
    const onCancel = () => stop(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      stop(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    document.body.classList.add("is-panel-drag");
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("is-panel-drag");
    };
  }, [dragging, track, stop]);

  const gripProps = (id: PanelId) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      track(id, e.clientX, e.clientY);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      const dir = (
        { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const
      )[e.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"];
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      const root = rootRef.current;
      if (!root) return;
      // Panels with nothing to show are not rendered; they keep their places.
      const visible = new Set(measure(root).panels.map((p) => p.id));
      const cur = latest.current.layout;
      const next = nudgePanel(cur, id, dir, visible);
      if (!samePanelLayout(next, cur)) latest.current.onChange(next);
    },
  });

  const overlay =
    drag && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="panel-drop-line"
              aria-hidden
              style={{ left: drag.line.left, width: drag.line.width, top: drag.line.top }}
            />
            <div className="panel-drag-ghost" aria-hidden style={{ left: drag.x, top: drag.y }}>
              {PANEL_LABELS[drag.id]}
            </div>
          </>,
          document.body,
        )
      : null;

  return { draggingId: drag?.id ?? null, gripProps, overlay };
}

/** One movable side panel: the panel itself plus a grip that shows on hover. */
export function SidePanel({
  id,
  dragging,
  grip,
  children,
}: {
  id: PanelId;
  dragging: boolean;
  grip: ReturnType<ReturnType<typeof usePanelDrag>["gripProps"]>;
  children: ReactNode;
}) {
  return (
    <div className={`board-panel${dragging ? " is-panel-dragging" : ""}`} data-panel={id}>
      <button
        type="button"
        className="panel-grip"
        aria-label={`Move ${PANEL_LABELS[id]} (drag, or arrow keys)`}
        title={`Drag to move ${PANEL_LABELS[id]}`}
        {...grip}
      >
        <span aria-hidden />
      </button>
      {children}
    </div>
  );
}
