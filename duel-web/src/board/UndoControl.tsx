import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UndoAction, UndoRequestOptions, UndoState } from "../net/protocol";
import { undoBlocked, undoButtonTitle, undoForceable, undoMenuModel, type UndoMenuModel } from "./undoMenu";

type Props = {
  state: UndoState;
  autoAccept: boolean;
  className: string;
  label: string;
  ariaLabel?: string;
  /** Start with the menu open (demo screenshots). */
  defaultOpen?: boolean;
  onAction: (action: UndoAction, opts?: UndoRequestOptions) => void;
};

/** The rows of the menu (also rendered on their own in tests). */
export function UndoMenuList({
  model,
  onPick,
  onClose,
}: {
  model: UndoMenuModel;
  onPick: (request: UndoRequestOptions) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keyboard users land on the first choice they can make.
    listRef.current?.querySelector<HTMLButtonElement>("button:not([aria-disabled='true'])")?.focus({ preventScroll: true });
  }, []);
  const move = (dir: 1 | -1) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([aria-disabled='true'])") ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    rows[(at + dir + rows.length) % rows.length]?.focus();
  };
  return (
    <div
      ref={listRef}
      className="undo-menu-list"
      role="menu"
      aria-label="Undo"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Tab") onClose();
      }}
    >
      {model.items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={`undo-menu-item${item.warn ? " is-warn" : ""}${item.disabled ? " is-disabled" : ""}`}
          aria-disabled={item.disabled || undefined}
          onClick={() => {
            if (item.disabled) return;
            onPick(item.request);
          }}
        >
          <span className="undo-menu-label">{item.label}</span>
          {item.reason ? <span className="undo-menu-reason">{item.reason}</span> : null}
          {item.warn ? <span className="undo-menu-reason">Takes back revealed cards too.</span> : null}
        </button>
      ))}
      {model.reason ? (
        <p className="undo-menu-note" role="status">
          {model.reason}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Undo button and its choice menu (#536): last action or whole turn, with
 * the reason a choice is blocked and a Force option past a reveal. The button
 * is never `disabled` (a disabled button shows no hover title and cannot be
 * tapped on a phone): blocked, it dims, its title says why, and the menu
 * repeats the reason. The menu is a fixed overlay in a portal, so opening it
 * never moves the button or its neighbours.
 */
export function UndoControl({ state, autoAccept, className, label, ariaLabel, defaultOpen = false, onAction }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();
  const blocked = undoBlocked(state);
  const dimmed = blocked && !undoForceable(state);
  const model = undoMenuModel(state);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      const m = menuRef.current?.getBoundingClientRect();
      if (!b || !m) return;
      const margin = 8;
      const left = Math.min(Math.max(b.right - m.width, margin), Math.max(window.innerWidth - m.width - margin, margin));
      const below = b.bottom + 6;
      const top = below + m.height > window.innerHeight - margin ? Math.max(b.top - m.height - 6, margin) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, model.items.length, model.reason]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // A new state (someone moved, a request opened) makes the choices stale.
  const stateKey = JSON.stringify([state.options, state.targetTurn, state.pending != null]);
  const firstKey = useRef(stateKey);
  useEffect(() => {
    if (firstKey.current === stateKey) return;
    firstKey.current = stateKey;
    setOpen(false);
  }, [stateKey]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${className}${dimmed ? " is-blocked" : ""}${open ? " armed" : ""}`}
        title={undoButtonTitle(state, autoAccept)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={dimmed || undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="undo-menu"
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
            >
              <UndoMenuList
                model={model}
                onClose={() => setOpen(false)}
                onPick={(request) => {
                  setOpen(false);
                  onAction("request", request);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
