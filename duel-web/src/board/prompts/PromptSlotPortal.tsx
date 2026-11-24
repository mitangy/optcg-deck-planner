import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PromptSlotContext } from "./promptSlot";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../layout/useMediaQuery";

export function PromptSlotPortal({ hidden = false, children }: { hidden?: boolean; children: ReactNode }) {
  const { slot } = useContext(PromptSlotContext);
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  if (wide || !slot) return <>{children}</>;
  return hidden ? null : createPortal(children, slot);
}

export const SLOT_ROW = "prompt-slot-row";
