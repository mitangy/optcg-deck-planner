import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { COLOR_ORDER, usePersistedChoice, useShowAltArts } from "../ui/cardListControls";
import { useDebouncedValue } from "./useDebouncedValue";
import { qk } from "../cache/queryKeys";

export const CATALOG_TYPE_FILTERS = ["", "Leader", "Character", "Event", "Stage", "DON!!"] as const;

export const CATALOG_SEARCH_DEBOUNCE_MS = 250;

export function useCatalogSearch({ colorKey, typeKey }: { colorKey: string; typeKey: string }) {
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedValue(query, CATALOG_SEARCH_DEBOUNCE_MS).trim();
  const [color, setColor] = usePersistedChoice(colorKey, "", ["", ...COLOR_ORDER]);
  const [cardType, setCardType] = usePersistedChoice(typeKey, "", CATALOG_TYPE_FILTERS);
  const [showAltArts] = useShowAltArts();
  const searchEnabled = Boolean(debouncedQ || color || cardType);
  const searchQ = useQuery({
    queryKey: qk.catalogSearch.query(debouncedQ, color, cardType, showAltArts),
    queryFn: () =>
      api.searchCatalog({
        q: debouncedQ || undefined,
        color: color || undefined,
        card_type: cardType || undefined,
        limit: 40,
        alts: showAltArts,
      }),
    enabled: searchEnabled,
  });
  return { query, setQuery, color, setColor, cardType, setCardType, searchEnabled, searchQ };
}
