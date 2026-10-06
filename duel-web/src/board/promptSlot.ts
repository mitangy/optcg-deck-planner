import { createContext } from "react";

/**
 * Phones (portrait): the action footer's empty primary slot, where End turn
 * usually sits. A board pick from the hand puts its Confirm / None buttons
 * there so they sit bottom right like End turn, instead of in the bar at the
 * top of the screen. `null` when the footer isn't showing a prompt.
 */
export const PromptSlotContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}>({ slot: null, setSlot: () => {} });
