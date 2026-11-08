import { mainImageUrl } from "../../cards/altArt";
import { GroupBuyLine, GroupBuyMember } from "../../api";
import { compareCardOrder, matchesCardSearch, type SortKey } from "../../ui/cardListControls";
import { sortByColumn, useColumnSort } from "../../ui/columnSort";
import { groupBuyShownPrice, visibleGroupBuyLines } from "./groupBuyArt";
import { useMemo } from "react";
import { buildGroupBuyDisplayRows, groupBuyLineValue, userSortKeyForLine } from "./lineRows";

/** The card's main image follows your chosen art; line.image_url is the host's checkout printing, so start from the base art (#874). */
export function lineArtUrl(line: GroupBuyLine): string | undefined {
  return mainImageUrl({ ...line, image_url: line.base_image_url || line.image_url });
}

const NO_KEEP_VISIBLE: ReadonlySet<string> = new Set();

/**
 * Filter, search and sort a group buy's lines, then lay them out as grid/list rows
 * (with User section headings when User is the primary sort) and as table rows
 * (a column-header sort replaces the headings). The member page and the view-only
 * invite page share it so the two always order and price cards the same way.
 */
export function useGroupBuyLines(
  allLines: GroupBuyLine[],
  members: GroupBuyMember[],
  search: string,
  effectiveSorts: SortKey[],
  columnSortKey: string,
  { showExcluded = false, keepVisible = NO_KEEP_VISIBLE }: { showExcluded?: boolean; keepVisible?: ReadonlySet<string> } = {},
) {
  const lines = useMemo(() => {
    let list = visibleGroupBuyLines(allLines, { showExcluded, keepVisible });
    if (search.trim()) {
      list = list.filter((l) =>
        matchesCardSearch(
          {
            card_id: l.card_id,
            name: l.name,
            color: l.color,
            card_type: l.card_type,
            rarity: l.rarity,
            used_in: l.members.map((m) => m.display_name),
          },
          search,
        ),
      );
    }
    const sortKey = (l: GroupBuyLine) => ({
      card_id: l.card_id,
      color: l.color || "",
      still_need: l.total_qty,
      market_price: groupBuyShownPrice(l),
      user_sort_key: userSortKeyForLine(l, members),
    });
    return [...list].sort((a, b) => compareCardOrder(sortKey(a), sortKey(b), effectiveSorts));
  }, [allLines, members, showExcluded, keepVisible, effectiveSorts, search]);

  /** Section headers only when User is the primary sort (otherwise groups would fragment). */
  const groupingByUser = effectiveSorts[0] === "user";
  const displayRows = useMemo(
    () => buildGroupBuyDisplayRows(lines, members, groupingByUser),
    [lines, members, groupingByUser],
  );
  const { sort: cardsSort, onSort: onCardsSort } = useColumnSort(columnSortKey);
  const tableRows = useMemo(
    () =>
      cardsSort
        ? buildGroupBuyDisplayRows(sortByColumn(lines, cardsSort, groupBuyLineValue), members, false)
        : displayRows,
    [cardsSort, lines, members, displayRows],
  );
  return { lines, displayRows, tableRows, cardsSort, onCardsSort };
}
