import { useEffect, useRef } from "react";
import { nextBoardFocusIndex, takesTab } from "./boardFocus";
import { hotkeyAction, type HotkeyAction } from "./hotkeys";

type Options = {
  spectating: boolean;
  over: boolean;
  wide: boolean;
  /** Desktop rail layout: number / letter / arrow card keys are live. */
  cardKeys: boolean;
  onEscape: () => void;
  onStepHand: (dir: 1 | -1) => void;
  onToggleHand: () => void;
  /** Keep hand open: H hides / shows the hand instead of pinning it. */
  handHides: boolean;
  onHideHand: () => void;
  onSortHand: () => void;
  onHelp: () => void;
};

const MODAL_SELECTOR =
  '[aria-modal="true"], .sheet-backdrop, .card-inspect-backdrop, .trash-viewer-backdrop';

/** Popovers that close themselves on Esc; the board must not also drop the selection. */
const ESC_OWNER_SELECTOR = ".lp-overlay, .match-menu";

/** Dialogs, prompts and sheets keep Tab for their own controls (a hidden prompt does not count). */
const DIALOG_SELECTOR =
  '[role="dialog"]:not(.card-actions), [role="alertdialog"]';

function dialogOpen(): boolean {
  return Array.from(document.querySelectorAll(`${MODAL_SELECTOR}, ${DIALOG_SELECTOR}`)).some(
    (el) => !el.closest("[hidden]"),
  );
}

/** Your board cards (Leader, Characters, Stage), then opponent cards that are targets right now. */
function boardCardButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      ".board-root .side-you button[data-instance-id], .board-root .side-opp button[data-instance-id]",
    ),
  ).filter((el) => !el.disabled && el.getClientRects().length > 0);
}

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

/** Board and hand tiles: Space belongs to the primary action there, Enter selects. */
const CARD_FOCUS_SELECTOR =
  ".side-field .card-tile, .hand-fan .card-tile, .rail-hand .card-tile, .hand-row .card-tile";

/**
 * Focus-visible buttons and links activate themselves on Space, except card
 * tiles: a focused card must not swallow the Space that ends the turn.
 */
function focusKind(el: Element | null): "none" | "card" | "control" {
  if (!el || !el.matches('button, a, [role="button"]')) return "none";
  if (el.matches(CARD_FOCUS_SELECTOR)) return "card";
  try {
    return el.matches(":focus-visible") ? "control" : "none";
  } catch {
    return "none";
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
      if (typeof action === "object") {
        const sel =
          action.kind === "slot"
            ? `[data-key-num="${action.n}"]`
            : `[data-key-letter="${action.letter}"]`;
        // Card actions live in a popover on the card (a portal), the rest in the bar.
        document
          .querySelector<HTMLButtonElement>(
            `.board-root .intent-row ${sel}:not(:disabled), .card-actions ${sel}:not(:disabled)`,
          )
          ?.click();
      } else if (action === "escape") o.onEscape();
      else if (action === "hand_prev") o.onStepHand(-1);
      else if (action === "hand_next") o.onStepHand(1);
      else if (action === "toggle_hand") o.onToggleHand();
      else if (action === "hide_hand") o.onHideHand();
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
      if (e.key === "Tab") {
        const cards = boardCardButtons();
        if (
          takesTab(e, {
            typing: isTyping(active),
            dialogOpen: dialogOpen(),
            inActions: active?.closest(".card-actions") != null,
            over: ref.current.over,
            cardCount: cards.length,
          })
        ) {
          const at = active ? cards.indexOf(active as HTMLButtonElement) : -1;
          const next = nextBoardFocusIndex(cards.length, at, e.shiftKey);
          if (next != null) {
            e.preventDefault();
            cards[next]!.focus();
          }
        }
        return;
      }
      const o = ref.current;
      const action = hotkeyAction(e, {
        typing: isTyping(active),
        focus: focusKind(active),
        modalOpen: document.querySelector(MODAL_SELECTOR) != null,
        spectating: o.spectating,
        over: o.over,
        wide: o.wide,
        cardKeys: o.cardKeys,
        escOwned: document.querySelector(ESC_OWNER_SELECTOR) != null,
        handHides: o.handHides,
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
