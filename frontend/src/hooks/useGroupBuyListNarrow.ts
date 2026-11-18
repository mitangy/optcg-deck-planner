import { useMediaQuery } from "@optcg/ui/hooks";

/** Group buy lines use the card list on phones and on short landscape phones, where the table would scroll sideways. */
export const GROUP_BUY_NARROW_QUERY = "(max-width: 900px), (max-height: 500px) and (orientation: landscape)";

export function useGroupBuyListNarrow() {
  return useMediaQuery(GROUP_BUY_NARROW_QUERY);
}
