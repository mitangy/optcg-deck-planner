import { useMediaQuery } from "@optcg/ui/hooks";

/** Matches the shopping mobile breakpoint in styles.css (`max-width: 800px`). */
export function useNarrowLayout() {
  return useMediaQuery("(max-width: 800px)");
}
