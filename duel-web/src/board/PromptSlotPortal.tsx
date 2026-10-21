import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PromptSlotContext } from "./promptSlot";
import { useMediaQuery, WIDE_BOARD_QUERY } from "./useMediaQuery";

/**
 * Portrait phones: a pop-up's buttons ride in the bottom bar's prompt slot
 * (End turn's spot) so they never cover the hand (#663). Anywhere else, or
 * while the bar has no slot, they stay where they were written. A hidden
 * pop-up takes its buttons away with it.
 */
export function PromptSlotPortal({ hidden = false, children }: { hidden?: boolean; children: ReactNode }) {
  const { slot } = useContext(PromptSlotContext);
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  if (wide || !slot) return <>{children}</>;
  return hidden ? null : createPortal(children, slot);
}

/** Layout of a bar slot that holds a pop-up's buttons (see fieldBar.css). */
export const SLOT_ROW = "prompt-slot-row";
