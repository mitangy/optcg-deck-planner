import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api";
import { COLOR_ORDER, usePersistedChoice, useShowAltArts } from "./cardListControls";
import { useDebouncedValue } from "./useDebouncedValue";

export const CATALOG_TYPE_FILTERS = ["", "Leader", "Character", "Event", "Stage", "DON!!"] as const;

/** Wait this long after the last keystroke before searching the catalog. */
export const CATALOG_SEARCH_DEBOUNCE_MS = 250;

/**
 * The catalog search shared by the Collection / Shopping add drawer and the deck editor: a search box
 * (debounced), color and card-type filters remembered under `colorKey` / `typeKey`, and the query.
 * The search runs once there is text or a filter; alt-art rows follow the "Show alt arts" setting.
 */
export function useCatalogSearch({ colorKey, typeKey }: { colorKey: string; typeKey: string }) {
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedValue(query, CATALOG_SEARCH_DEBOUNCE_MS).trim();
  const [color, setColor] = usePersistedChoice(colorKey, "", ["", ...COLOR_ORDER]);
  const [cardType, setCardType] = usePersistedChoice(typeKey, "", CATALOG_TYPE_FILTERS);
  const [showAltArts] = useShowAltArts();
  const searchEnabled = Boolean(debouncedQ || color || cardType);
  const searchQ = useQuery({
    queryKey: ["catalog-search", debouncedQ, color, cardType, showAltArts],
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
