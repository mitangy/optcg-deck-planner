import { useMediaQuery } from "@optcg/ui/hooks";
import { createContext, useContext, type ReactNode } from "react";

/** True while the rail is a side column (wide screens), so its Filters drawer can stay open. */
const RailPinnedContext = createContext(false);
export const useRailPinned = () => useContext(RailPinnedContext);

/**
 * Card-list toolbar + the list it controls. Below the wide breakpoint this is a
 * plain block, so the rail (search, Scan, List/Grid, Filters) sits above the
 * list exactly as before. On wide screens (wideLayout.css) the rail becomes a
 * sticky left sidebar and the list fills the right column. `wider` is for pages
 * that already have a right-hand dock (deck pages): the rail waits for more room.
 */
export function CardWorkspace({
  rail,
  children,
  wider = false,
}: {
  rail: ReactNode;
  children: ReactNode;
  wider?: boolean;
}) {
  // Keep these breakpoints in step with wideLayout.css.
  const pinned = useMediaQuery(`(min-width: ${wider ? 1900 : 1600}px)`);
  return (
    <div className={`card-workspace${wider ? " card-workspace-wider" : ""}`}>
      <div className="card-workspace-rail">
        <RailPinnedContext.Provider value={pinned}>{rail}</RailPinnedContext.Provider>
      </div>
      <div className="card-workspace-main">{children}</div>
    </div>
  );
}
