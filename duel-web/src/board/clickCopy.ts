import { useMediaQuery } from "./useMediaQuery";
import { FINE_POINTER_QUERY } from "./inspectGestures";

/** Board copy is written for touch ("Tap again to end"); a mouse says "Click". */
export function clickCopy(text: string, finePointer: boolean): string {
  if (!finePointer) return text;
  return text.replace(/\bTap\b/g, "Click").replace(/\btap\b/g, "click");
}

/** `clickCopy` for this device: phones keep "Tap", mouse-like desktops get "Click". */
export function useClickCopy(): (text: string) => string {
  const fine = useMediaQuery(FINE_POINTER_QUERY);
  return (text) => clickCopy(text, fine);
}
