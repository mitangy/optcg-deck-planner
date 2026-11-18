import { createContext } from "react";

export const PromptSlotContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}>({ slot: null, setSlot: () => {} });
