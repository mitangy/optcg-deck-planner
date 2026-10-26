import { useEffect, useRef } from "react";
import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
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

/** The rows of the menu: items of the surrounding Headless UI `Menu`, so render it inside a `MenuList`. */
export function UndoMenuRows({ model, onPick }: { model: UndoMenuModel; onPick: (request: UndoRequestOptions) => void }) {
  return (
    <>
      {model.items.map((item) => (
        <MenuItem key={item.key} disabled={item.disabled}>
          <button
            type="button"
            className={`undo-menu-item${item.warn ? " is-warn" : ""}${item.disabled ? " is-disabled" : ""}`}
            onClick={() => onPick(item.request)}
          >
            <span className="undo-menu-label">{item.label}</span>
            {item.reason ? <span className="undo-menu-reason">{item.reason}</span> : null}
            {item.warn ? <span className="undo-menu-reason">Takes back revealed cards too.</span> : null}
          </button>
        </MenuItem>
      ))}
      {model.reason ? (
        <p className="undo-menu-note" role="status">
          {model.reason}
        </p>
      ) : null}
    </>
  );
}

/**
 * The Undo button and its choice menu (#536): last action or whole turn, with
 * the reason a choice is blocked and a Force option past a reveal. The button
 * is never `disabled` (a disabled button shows no hover title and cannot be
 * tapped on a phone): blocked, it dims, its title says why, and the menu
 * repeats the reason. A Headless UI Menu (#715): the list floats in a portal,
 * flipped above the button when there is no room below, so opening it never
 * moves the button or its neighbours; arrow keys, Escape and outside click
 * come with it.
 */
export function UndoControl({ state, autoAccept, className, label, ariaLabel, defaultOpen = false, onAction }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const blocked = undoBlocked(state);
  const dimmed = blocked && !undoForceable(state);
  const model = undoMenuModel(state);

  useEffect(() => {
    if (defaultOpen) btnRef.current?.click();
    // Only on mount: the menu then belongs to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new state (someone moved, a request opened) makes the choices stale.
  const stateKey = JSON.stringify([state.options, state.targetTurn, state.pending != null]);
  const firstKey = useRef(stateKey);
  useEffect(() => {
    if (firstKey.current === stateKey) return;
    firstKey.current = stateKey;
    closeRef.current();
  }, [stateKey]);

  return (
    <Menu>
      {({ open, close }) => {
        closeRef.current = close;
        return (
          <>
            <MenuButton
              ref={btnRef}
              type="button"
              className={`${className}${dimmed ? " is-blocked" : ""}${open ? " armed" : ""}`}
              title={undoButtonTitle(state, autoAccept)}
              aria-label={ariaLabel}
              data-blocked={dimmed || undefined}
            >
              {label}
            </MenuButton>
            <MenuList anchor={{ to: "bottom end", gap: 6, padding: 8 }} className="undo-menu">
              <UndoMenuRows model={model} onPick={(request) => onAction("request", request)} />
            </MenuList>
          </>
        );
      }}
    </Menu>
  );
}
