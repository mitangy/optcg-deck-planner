import type { ReactNode } from "react";
import { useCardDataReady } from "./cardData";

export function CardDataGate({ children }: { children: ReactNode }) {
  return useCardDataReady() ? <>{children}</> : <div className="route-fallback" aria-busy="true" />;
}
