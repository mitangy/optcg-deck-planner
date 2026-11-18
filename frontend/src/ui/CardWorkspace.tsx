import { useMediaQuery } from "@optcg/ui/hooks";
import { createContext, useContext, type ReactNode } from "react";

const RailPinnedContext = createContext(false);
export const useRailPinned = () => useContext(RailPinnedContext);

export function CardWorkspace({
  rail,
  children,
  wider = false,
}: {
  rail: ReactNode;
  children: ReactNode;
  wider?: boolean;
}) {
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
