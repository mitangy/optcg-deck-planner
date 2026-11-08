import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type LightboxPanelName = "alert" | "history";
type SetOpen = (next: boolean | ((v: boolean) => boolean)) => void;

type Shared = { open: LightboxPanelName | null; setOpen: (v: LightboxPanelName | null) => void };
const LightboxPanelContext = createContext<Shared | null>(null);

/** Groups the lightbox's floating panels (price alert editor, price history) so only one is open at a time (#1163). Renders no DOM. */
export function LightboxPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<LightboxPanelName | null>(null);
  return <LightboxPanelContext.Provider value={{ open, setOpen }}>{children}</LightboxPanelContext.Provider>;
}

/**
 * Open state of one lightbox panel. Inside a LightboxPanelProvider, opening it closes the sibling panel;
 * without one (card page, other usages) it is plain local state.
 */
export function useLightboxPanel(name: LightboxPanelName): [boolean, SetOpen] {
  const shared = useContext(LightboxPanelContext);
  const [local, setLocal] = useState(false);
  const open = shared ? shared.open === name : local;
  const sharedOpen = shared?.open;
  const sharedSet = shared?.setOpen;
  const setOpen = useCallback<SetOpen>(
    (next) => {
      if (!sharedSet) {
        setLocal(next);
        return;
      }
      const want = typeof next === "function" ? next(sharedOpen === name) : next;
      if (want) sharedSet(name);
      else if (sharedOpen === name) sharedSet(null);
    },
    [name, sharedOpen, sharedSet],
  );
  return [open, setOpen];
}
