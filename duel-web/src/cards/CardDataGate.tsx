import type { ReactNode } from "react";
import { useCardDataReady } from "./cardData";

/** Holds its children until the card data is in; it shows the same empty viewport block the lazy routes use, so nothing jumps. */
export function CardDataGate({ children }: { children: ReactNode }) {
  return useCardDataReady() ? <>{children}</> : <div className="route-fallback" aria-busy="true" />;
}
