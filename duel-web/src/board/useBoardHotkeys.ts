import { useEffect, useRef } from "react";
import { hotkeyAction, type HotkeyAction } from "./hotkeys";

type Options = {
  spectating: boolean;
  over: boolean;
  wide: boolean;
  onToggleHand: () => void;
  onSortHand: () => void;
  onHelp: () => void;
};

const MODAL_SELECTOR =
  '[aria-modal="true"], .sheet-backdrop, .card-inspect-backdrop, .trash-viewer-backdrop';

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

/** Focus-visible buttons and links activate themselves on Space; leave those alone. */
function isKeyboardFocusedControl(el: Element | null): boolean {
  if (!el || !el.matches('button, a, [role="button"]')) return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** Desktop shortcuts for the board; Space clicks the bar's primary button. */
export function useBoardHotkeys(opts: Options) {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    // A handled Space must not also click a focused button when it is released.
    let swallowKeyup = false;

    function run(action: Exclude<HotkeyAction, null>) {
      const o = ref.current;
      if (action === "toggle_hand") o.onToggleHand();
      else if (action === "sort_hand") o.onSortHand();
      else if (action === "help") o.onHelp();
      else {
        const btn = document.querySelector<HTMLButtonElement>(
          ".board-root .intent-btn-primary:not(:disabled)",
        );
        btn?.click();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement;
      const o = ref.current;
      const action = hotkeyAction(e, {
        typing: isTyping(active),
        keyboardFocusedControl: isKeyboardFocusedControl(active),
        modalOpen: document.querySelector(MODAL_SELECTOR) != null,
        spectating: o.spectating,
        over: o.over,
        wide: o.wide,
      });
      if (!action) return;
      e.preventDefault();
      if (action === "primary") swallowKeyup = true;
      run(action);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (!swallowKeyup || (e.key !== " " && e.code !== "Space")) return;
      swallowKeyup = false;
      e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
