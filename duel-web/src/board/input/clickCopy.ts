import { useMediaQuery } from "../layout/useMediaQuery";
import { FINE_POINTER_QUERY } from "../preview/inspectGestures";

export function clickCopy(text: string, finePointer: boolean): string {
  if (!finePointer) return text;
  return text.replace(/\bTap\b/g, "Click").replace(/\btap\b/g, "click");
}

export function useClickCopy(): (text: string) => string {
  const fine = useMediaQuery(FINE_POINTER_QUERY);
  return (text) => clickCopy(text, fine);
}
