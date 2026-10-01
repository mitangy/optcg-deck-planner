import type { ReactNode } from "react";
import { lookupCard } from "../cards/atlas";
import type { PendingChoiceView } from "../net/protocol";
import "./float.css";

/** The card an effect comes from, for prompt headers and the "Back to …" pill. */
export function promptSourceName(choice: PendingChoiceView): string {
  return choice.cardDefId && choice.cardDefId !== "HIDDEN" ? lookupCard(choice.cardDefId).name : "Effect";
}

/**
 * Wraps a choice pop-up so its Hide button can tuck it away: the pop-up stays
 * mounted (picks so far are kept) and one pill brings it back.
 */
export function HideablePrompt({ name, hidden, onShow, children }: { name: string; hidden: boolean; onShow: () => void; children: ReactNode }) {
  return (
    <>
      <div hidden={hidden} className="prompt-hide-wrap">
        {children}
      </div>
      {hidden ? (
        <div className="float-layer float-layer-peek">
          <button type="button" className="float-return" onClick={onShow}>
            Back to {name}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Small "Hide" button for a pop-up's top-right corner. */
export function PromptHideButton({ onHide }: { onHide?: () => void }) {
  if (!onHide) return null;
  return (
    <button type="button" className="prompt-hide" onClick={onHide} aria-label="Hide this prompt to see your hand and the board">
      Hide
    </button>
  );
}
