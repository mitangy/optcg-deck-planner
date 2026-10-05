import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  placeTip,
  splitStatuses,
  statusGlyph,
  statusTone,
  statusTooltip,
  type StatusGlyph,
  type StatusIconSpec,
} from "./statusIcons";

/**
 * Hover / focus tooltip for status badges. It is a fixed overlay in a portal
 * (so it never shifts layout and is not tilted with the board) placed beside
 * the badge and clamped to the viewport, which also covers a 375px phone.
 * Touch: tapping a badge focuses it, and long-press still opens card inspect
 * (which lists every status in the same colours).
 */
function useStatusTip(labels: string[]) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  useLayoutEffect(() => {
    const a = anchorRef.current;
    const t = tipRef.current;
    if (!open || !a || !t) return;
    const r = a.getBoundingClientRect();
    const vv = window.visualViewport;
    setPos(
      placeTip(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        { width: t.offsetWidth, height: t.offsetHeight },
        { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight },
      ),
    );
  }, [open, labels.join("|")]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  const bind = {
    ref: (el: HTMLElement | null) => {
      anchorRef.current = el;
    },
    // Focusable by tap (the touch tooltip) but not by Tab: a board of status
    // badges was ~30 extra stops. Screen readers get the aria-label, and card
    // inspect lists every status.
    tabIndex: -1,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };
  const tip = open
    ? createPortal(
        <div
          ref={tipRef}
          className="status-tip"
          role="tooltip"
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
        >
          {labels.map((label) => {
            const { text } = statusTooltip(label);
            return (
              <div key={label} className={`status-tip-row status-tone-${statusTone(label)}`}>
                <strong className="status-tip-label">{label}</strong>
                {text ? <span className="status-tip-text">{text}</span> : null}
              </div>
            );
          })}
        </div>,
        document.body,
      )
    : null;
  return { bind, tip };
}

/** 24x24 line icons; stroke/fill use currentColor so the tone class colours them. */
function Glyph({ glyph }: { glyph: StatusGlyph }) {
  switch (glyph) {
    case "negated":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M6.7 17.3 17.3 6.7" />
        </>
      );
    case "no-attack":
      return (
        <>
          <path d="M5 19 17 7M14 5l5 5M5 19l2-2" />
          <path d="M19 19 7 7M10 5 5 10M19 19l-2-2" />
        </>
      );
    case "sleep":
      return <path d="M5 8h8l-8 10h8M15 3h4.5L15 9h4.5" />;
    case "shield":
      return <path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.2-7 9-4.1-1.8-7-4.6-7-9V6z" />;
    case "unblockable":
      return (
        <>
          <path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.2-7 9-4.1-1.8-7-4.6-7-9V6z" />
          <path d="M5 4 19 20" />
        </>
      );
    case "bolt":
      return <path className="fill" d="M13.5 2 5 13.5h6L10 22l9-12h-6z" />;
    case "bolt-character":
      return (
        <>
          <path className="fill" d="M11 2 3.5 12.5H9L8 20l7-9.5h-5.5z" />
          <path d="M20.5 15.5A3.2 3.2 0 1 0 20.5 21" />
        </>
      );
    case "double":
      return <path d="M4 8l6 8M10 8l-6 8M14 10.5c0-2 6-2 6 0 0 3-6 3.5-6 6.5h6" />;
    case "banish":
      return <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />;
    case "no-refresh":
      return (
        <>
          <path d="M19 12a7 7 0 1 1-2.2-5.1M19 4v4.5h-4.5" />
          <path d="M4.5 4.5 19.5 19.5" />
        </>
      );
    case "star":
      return <path className="fill" d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8z" />;
    case "lock":
      return (
        <>
          <rect x="6.5" y="11" width="11" height="9" rx="2" />
          <path d="M9 11V8a3 3 0 0 1 6 0v3" />
        </>
      );
  }
}

/** Fixed-size square badge for one status label; the full label is the tooltip / accessible name. */
export function StatusIcon({ label, spec }: { label: string; spec: StatusIconSpec }) {
  const { bind, tip } = useStatusTip([label]);
  const { text } = statusTooltip(label);
  return (
    <>
      <span
        role="img"
        className={`status-icon status-tone-${spec.tone}`}
        aria-label={text ? `${label}: ${text}` : label}
        {...bind}
      >
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
          <Glyph glyph={spec.glyph} />
        </svg>
      </span>
      {tip}
    </>
  );
}

/** Text chip for a status with no icon; same tooltip and colours. */
function StatusChip({ label }: { label: string }) {
  const { bind, tip } = useStatusTip([label]);
  return (
    <>
      <span className={`status-chip status-tone-${statusTone(label)}`} {...bind}>
        {label}
      </span>
      {tip}
    </>
  );
}

/** The row's "+N" badge: hovering lists the hidden statuses. */
function StatusMore({ hidden }: { hidden: string[] }) {
  const { bind, tip } = useStatusTip(hidden);
  return (
    <>
      <span
        role="img"
        className="status-icon status-more"
        aria-label={`${hidden.length} more: ${hidden.join(", ")}`}
        {...bind}
      >
        +{hidden.length}
      </span>
      {tip}
    </>
  );
}

/** Smallest .status-icon size (see --status-icon-size in styles.css). */
const ICON_MIN_PX = 13;

/**
 * One row of statuses in the tile's bottom-right corner. The row never wraps
 * (a second row would climb into the power / DON!! stack on phone tiles);
 * when it runs out of room the last slot becomes "+N" (the hidden labels are
 * its tooltip, and card inspect lists everything). On the smallest rested
 * tiles the stack reaches down to the row, so the row moves left of it.
 *
 * `stackKey` changes whenever the stack's size may (power buff, DON!!).
 */
export function StatusRow({ labels, stackKey }: { labels: string[]; stackKey: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number | null>(null);
  const key = `${labels.join("|")}#${stackKey}`;

  // A new label set or a resized tile starts over from "show everything".
  useLayoutEffect(() => setFit(null), [key]);

  // Measure with every label rendered: the row lays out right to left, so
  // children that overflow sit left of the row (negative offsetLeft).
  // offset* ignore transforms, so the rest rotation doesn't skew it.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const box = row?.parentElement;
    if (!row || !box || fit !== null) return;
    const stack = box.querySelector<HTMLElement>(".card-stat-stack");
    row.style.right = row.style.maxWidth = "";
    row.classList.remove("status-chips-squeezed");
    if (stack && stack.offsetTop + stack.offsetHeight > row.offsetTop) {
      const room = stack.offsetLeft - 5;
      if (room < ICON_MIN_PX) {
        // Not even one slot beside the stack: a lone "+N" in the far corner.
        row.classList.add("status-chips-squeezed");
        setFit(0);
        return;
      }
      row.style.right = `${box.clientWidth - stack.offsetLeft + 2}px`;
      row.style.maxWidth = `${room}px`;
    }
    const kids = [...row.children] as HTMLElement[];
    const inside = kids.filter((k) => k.offsetLeft >= -0.5).length;
    if (inside < kids.length) setFit(inside);
  }, [fit, key]);

  useLayoutEffect(() => {
    const box = rowRef.current?.parentElement;
    if (!box || typeof ResizeObserver === "undefined") return;
    let size = `${box.clientWidth}x${box.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${box.clientWidth}x${box.clientHeight}`;
      if (next !== size) {
        size = next;
        setFit(null);
      }
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const { shown, hidden } = splitStatuses(labels, fit);
  return (
    <div ref={rowRef} className="status-chips" aria-label="Card statuses">
      {shown.map((label) => {
        // Board tiles are too narrow for words; known statuses get an icon
        // (full text in title / aria-label and in card inspect).
        const icon = statusGlyph(label);
        return icon ? (
          <StatusIcon key={label} label={label} spec={icon} />
        ) : (
          <StatusChip key={label} label={label} />
        );
      })}
      {hidden.length ? <StatusMore hidden={hidden} /> : null}
    </div>
  );
}
