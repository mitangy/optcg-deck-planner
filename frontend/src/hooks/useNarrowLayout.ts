import { useMediaQuery } from "@optcg/ui/hooks";

export function useNarrowLayout() {
  return useMediaQuery("(max-width: 800px)");
}
