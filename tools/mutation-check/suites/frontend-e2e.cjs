/**
 * Planner click-through mutations (frontend/e2e, Playwright against Vite with
 * the FastAPI backend faked in the browser). `args` narrows a mutation to the
 * spec and screen size that claims it.
 */
const app = "frontend/src/App.tsx";
const css = "frontend/src/styles.css";
const market = "frontend/src/MarketPrice.tsx";
const controls = "frontend/src/cardListControls.tsx";
const layout = "frontend/src/CardLayout.tsx";

const deck = "deck.spec.ts";
const share = "shopping-share.spec.ts";
const visual = "visual.spec.ts";
const trigger = `${deck} > expanding a market price shows the last sales without moving the price`;

module.exports = {
  cwd: "frontend",
  runner: "playwright",
  mutations: [
    // Deck "$ left" prices wanted alt arts (#433): summarizeDeckProgress reverted to still_need * market_price
    { id: "e2e-deck-left-ignores-alt-wants", args: "deck.spec -g \"wanted alt arts\"", file: app, from: "  const remainingMarket = deckRemainingMarket(cards);", to: "  const remainingMarket = cards.reduce((sum, c) => {\n    if (c.still_need <= 0 || c.market_price == null) return sum;\n    return sum + c.still_need * c.market_price;\n  }, 0);", kills: [`${deck} > deck $ left prices wanted alt arts by their count (#433) [desktop-1200]`, `${deck} > deck $ left prices wanted alt arts by their count (#433) [phone-375]`] },
    // UI polish rules 1 and 6: a trigger must not move when it opens something
    // The panel expands in flow instead of floating, so the price shifts in its cell.
    { id: "e2e-price-panel-in-flow", args: "deck --project=desktop-1200 -g \"market price\"", file: css, from: ".market-sales {\n  position: fixed;", to: ".market-sales {\n  position: static;", kills: [`${trigger} [desktop-1200]`] },
    // The Filters badge used to vanish when the drawer opened, shrinking the right-aligned phone trigger and sliding it.
    { id: "e2e-filters-trigger-reflows", args: "deck --project=phone-375 -g \"filters\"", file: controls, from: "        {badge ? (\n          // Held (invisible) while open so a right-aligned trigger keeps its width and position.\n          <span\n            className={`filter-drawer-badge${open ? \" filter-drawer-badge-held\" : \"\"}`}\n            aria-label={`${badge} ${badgeLabel ?? \"items\"}`}\n            aria-hidden={open || undefined}\n          >\n            {badge}\n          </span>\n        ) : null}", to: "        {!open && badge ? (\n          <span className=\"filter-drawer-badge\" aria-label={`${badge} ${badgeLabel ?? \"items\"}`}>\n            {badge}\n          </span>\n        ) : null}", kills: [`${deck} > opening the filters and the sort menu moves nothing [phone-375]`] },
    // The price panel is fixed under the price; without the flip it hangs off the bottom of a phone screen.
    { id: "e2e-price-panel-off-screen", args: "deck --project=phone-375 -g \"market price\"", file: market, from: "    const top = height > 0 && below + height > window.innerHeight - 8 && above >= 8 ? above : below;", to: "    const top = below;", kills: [`${trigger} [phone-375]`] },

    // UI audit: sideways scroll and clipping at 375
    { id: "e2e-phone-list-wider-than-screen", args: "deck --project=phone-375 -g \"passes the UI audit\"", file: css, from: "  .mobile-card-list {\n    display: grid;\n    gap: 0.55rem;", to: "  .mobile-card-list {\n    min-width: 26rem;\n    display: grid;\n    gap: 0.55rem;", kills: [`${deck} > opens the deck and passes the UI audit [phone-375]`] },
    // The deck editor takes a column at 1200, so the table needs its tighter cells there.
    { id: "e2e-edit-table-scrolls-sideways", args: "deck --project=desktop-1200 -g \"edit mode\"", file: css, from: "  .deck-layout-editing .deck-main .data-table :is(th, td) {\n    padding-inline: 0.5rem;\n  }\n\n", to: "", kills: [`${deck} > edit mode opens the card editor and in-deck steppers without breaking layout [desktop-1200]`] },

    // List / Grid toggle
    { id: "e2e-grid-button-stays-list", args: "-g \"List/Grid|grid layout\"", file: layout, from: "        onClick={() => onChange(\"grid\")}", to: "        onClick={() => onChange(\"list\")}", kills: [`${deck} > List/Grid toggle swaps the layout and passes the audit [desktop-1200]`, `${deck} > List/Grid toggle swaps the layout and passes the audit [phone-375]`, `${share} > shopping list switches to the grid layout [desktop-1200]`] },
    { id: "e2e-list-button-pressed-state", args: "deck --project=desktop-1200 -g \"opens the deck\"", file: layout, from: "        aria-pressed={layout === \"list\"}", to: "        aria-pressed={layout === \"grid\"}", kills: [`${deck} > opens the deck and passes the UI audit [desktop-1200]`] },
    // The deck header (title, Main badge, leader line) is part of the region snapshot.
    { id: "e2e-deck-main-badge-missing", args: "deck --project=desktop-1200 -g \"opens the deck\"", file: app, from: "            {data.is_main && <span className=\"deck-main-badge\">Main deck</span>}", to: "", kills: [`${deck} > opens the deck and passes the UI audit [desktop-1200]`] },

    // DON!! browser (#435)
    { id: "e2e-don-search-not-sent", args: "deck -g \"DON!! browser\"", file: app, from: "api.searchCatalog({ q: debouncedQ || undefined, card_type: \"DON\", limit: 100 })", to: "api.searchCatalog({ card_type: \"DON\", limit: 100 })", kills: [`${deck} > DON!! browser shows big card tiles and searches the DON!! catalog (#435) [desktop-1200]`, `${deck} > DON!! browser shows big card tiles and searches the DON!! catalog (#435) [phone-375]`] },
    { id: "e2e-don-tiles-small", args: "deck -g \"DON!! browser\"", file: css, from: ".don-tile .thumb {\n  width: 100%;\n  height: auto;", to: ".don-tile .thumb {\n  width: 60px;\n  height: auto;", kills: [`${deck} > DON!! browser shows big card tiles and searches the DON!! catalog (#435) [desktop-1200]`, `${deck} > DON!! browser shows big card tiles and searches the DON!! catalog (#435) [phone-375]`] },

    // Owned stepper
    { id: "e2e-owned-plus-adds-two", args: "deck --project=desktop-1200 -g \"owned stepper\"", file: app, from: "        onClick={() => commit(displayQty + 1)}", to: "        onClick={() => commit(displayQty + 2)}", kills: [`${deck} > owned stepper saves each click and updates still needed [desktop-1200]`] },
    { id: "e2e-owned-minus-never-disabled", args: "deck --project=phone-375 -g \"below zero\"", file: app, from: "        disabled={mutation.isPending || displayQty <= 0}", to: "        disabled={mutation.isPending}", kills: [`${deck} > cannot take owned below zero [phone-375]`] },
    // The row shows "still needed / needed" in both layouts.
    { id: "e2e-row-still-needed-swapped", args: "deck -g \"each card row\"", edits: [
      { file: app, from: "                    `${c.still_need}/${c.needed}`\n", to: "                    `${c.needed}/${c.still_need}`\n" },
      { file: app, from: "[c.color, `${c.still_need}/${c.needed} still needed`, c.card_type || \"\"]", to: "[c.color, `${c.needed}/${c.still_need} still needed`, c.card_type || \"\"]" },
    ], kills: [`${deck} > each card row names the card, how many are still needed and its price [desktop-1200]`, `${deck} > each card row names the card, how many are still needed and its price [phone-375]`] },

    // Pixel snapshots (@visual): small CSS regressions that no DOM assertion sees
    { id: "e2e-visual-card-surface-colour", args: "visual", file: css, from: "  --card: #fffbf3;", to: "  --card: #c9dff2;", kills: [`${visual} > deck list view @visual [desktop-1200]`, `${visual} > deck grid view @visual [phone-375]`, `${visual} > share page @visual [desktop-1200]`] },
    { id: "e2e-visual-topbar-taller", args: "visual", file: css, from: "  padding: 0.7rem 1.25rem;", to: "  padding: 1.1rem 1.25rem;", kills: [`${visual} > deck list view @visual [desktop-1200]`, `${visual} > share page @visual [desktop-1200]`] },
    { id: "e2e-visual-layout-toggle-reversed", args: "visual", file: css, from: ".layout-toggle {\n  display: inline-flex;", to: ".layout-toggle {\n  display: inline-flex;\n  flex-direction: row-reverse;", kills: [`${visual} > deck list view @visual [phone-375]`] },
    { id: "e2e-visual-grid-card-padding", args: "visual", file: css, from: "  gap: 0.65rem;\n  padding: 0.75rem;\n  border: 1px solid var(--line);\n  border-radius: 16px;", to: "  gap: 0.65rem;\n  padding: 1.25rem;\n  border: 1px solid var(--line);\n  border-radius: 16px;", kills: [`${visual} > deck grid view @visual [desktop-1200]`, `${visual} > deck grid view @visual [phone-375]`] },
    { id: "e2e-visual-price-panel-wider", args: "visual", file: css, from: ".market-sales {\n  position: fixed;\n  width: 14rem;", to: ".market-sales {\n  position: fixed;\n  width: 18rem;", kills: [`${visual} > deck market price panel open @visual [desktop-1200]`] },

    // Shopping list
    { id: "e2e-shopping-shows-owned-cards", args: "shopping-share -g \"shopping list hides\" --project=desktop-1200", file: app, from: "  const filteredItems = useMemo(() => {\n    let list = data?.items ?? [];\n    if (onlyNeed) list = list.filter((i) => i.still_need > 0);\n", to: "  const filteredItems = useMemo(() => {\n    let list = data?.items ?? [];\n", kills: [`${share} > shopping list hides fully owned cards and passes the audit [desktop-1200]`] },

    // Share page
    { id: "e2e-share-route-renamed", args: "shopping-share -g \"share page\" --project=desktop-1200", file: app, from: "<Route path=\"/share/:token\" element={<PublicSharePage />} />", to: "<Route path=\"/shared/:token\" element={<PublicSharePage />} />", kills: [`${share} > share page lists the shared cards with prices and passes the audit [desktop-1200]`, `${share} > share page for a revoked link says so instead of showing a list [desktop-1200]`] },
    { id: "e2e-share-error-hidden", args: "shopping-share -g \"revoked\" --project=phone-375", file: app, from: "        {isLoading && <ShoppingListSkeleton />}\n        {error && <p className=\"error\">{(error as Error).message}</p>}\n        {data && (\n          <div className={data.kind === \"deck\" ? \"deck-layout\" : undefined}>", to: "        {isLoading && <ShoppingListSkeleton />}\n        {data && (\n          <div className={data.kind === \"deck\" ? \"deck-layout\" : undefined}>", kills: [`${share} > share page for a revoked link says so instead of showing a list [phone-375]`] },

    // Collection page (#268)
    { id: "e2e-collection-default-sort-price", args: "collection --project=desktop-1200 -g \"lists owned cards\"", file: controls, from: "export const OWNED_DEFAULT_SORTS: SortKey[] = [\"value\"];", to: "export const OWNED_DEFAULT_SORTS: SortKey[] = [\"price\"];", kills: ["collection.spec.ts > lists owned cards by value with the collection total and passes the audit (#268) [desktop-1200]"] },
    { id: "e2e-collection-total-not-patched", args: "collection --project=desktop-1200 -g \"stepping Owned\"", file: app, from: "  qc.setQueriesData<OwnedCollectionResponse>({ queryKey: [\"owned\"] }, (old) =>\n    old ? patchOwnedCollection(old, id, qty) : old,\n  );\n", to: "", kills: ["collection.spec.ts > stepping Owned updates the card value and the total (#268) [desktop-1200]"] },
    { id: "e2e-collection-color-filter-ignored", args: "collection --project=phone-375 -g \"color filter\"", file: app, from: "  return colors.some((c) => parts.includes(c.toLowerCase()));", to: "  return colors.length >= 0;", kills: ["collection.spec.ts > color filter narrows the list and shows the filtered total (#268) [phone-375]"] },
    { id: "e2e-phone-nav-equal-tabs", args: "collection --project=phone-375 -g \"lists owned cards\"", file: css, from: "  .topbar nav a {\n    flex: 1 1 auto;", to: "  .topbar nav a {\n    flex: 1;", kills: ["collection.spec.ts > lists owned cards by value with the collection total and passes the audit (#268) [phone-375]"] },
    { id: "e2e-collection-add-not-refetched", args: "collection --project=desktop-1200 -g \"Add cards finds\"", file: app, from: "    onSuccess: () => invalidateOwnedViews(qc),\n  });\n  return (\n    <span className=\"collection-owned-control\">", to: "    onSuccess: () => undefined,\n  });\n  return (\n    <span className=\"collection-owned-control\">", kills: ["collection.spec.ts > Add cards finds an unowned card and adds it to the collection (#268) [desktop-1200]"] },
    { id: "e2e-collection-scan-no-add", args: "collection --project=phone-375 -g \"from the scanner\"", file: "frontend/src/CardScanner.tsx", from: "                {renderHitAction?.(phase.card)}\n", to: "", kills: ["collection.spec.ts > a scanned or looked-up card can be added from the scanner (#268) [phone-375]"] },
    // Mark purchased / Undo on a group buy and Buying in person change Owned on the server; the cached Collection must refetch.
    { id: "e2e-collection-stale-after-mark-purchased", args: "collection --project=desktop-1200 -g \"group buy\"", file: "frontend/src/GroupBuys.tsx", from: "      invalidateOwnedViews(qc);\n      setReceiptDraft(null);\n      setReceiptResetKey((k) => k + 1);\n      setMsg(\n        d.status === \"completed\"", to: "      await qc.invalidateQueries({ queryKey: [\"shopping\"] });\n      await qc.invalidateQueries({ queryKey: [\"deck\"] });\n      setReceiptDraft(null);\n      setReceiptResetKey((k) => k + 1);\n      setMsg(\n        d.status === \"completed\"", kills: ["collection.spec.ts > Collection picks up copies a group buy's Mark purchased adds and Undo takes back (#268) [desktop-1200]"] },
    { id: "e2e-collection-stale-after-undo-purchase", args: "collection --project=desktop-1200 -g \"group buy\"", file: "frontend/src/GroupBuys.tsx", from: "      invalidateOwnedViews(qc);\n      setReceiptDraft(null);\n      setReceiptResetKey((k) => k + 1);\n      setMsg(\n        \"Undid Mark purchased", to: "      await qc.invalidateQueries({ queryKey: [\"shopping\"] });\n      await qc.invalidateQueries({ queryKey: [\"deck\"] });\n      setReceiptDraft(null);\n      setReceiptResetKey((k) => k + 1);\n      setMsg(\n        \"Undid Mark purchased", kills: ["collection.spec.ts > Collection picks up copies a group buy's Mark purchased adds and Undo takes back (#268) [desktop-1200]"] },
    { id: "e2e-collection-stale-after-buy-in-person", args: "collection --project=desktop-1200 -g \"Buying in person\"", file: app, from: "    onSuccess: ({ ok, failed, copies }) => {\n      invalidateOwnedViews(qc);", to: "    onSuccess: ({ ok, failed, copies }) => {\n      void qc.invalidateQueries({ queryKey: [\"shopping\"] });", kills: ["collection.spec.ts > Collection picks up a card marked Buying in person on the shopping list (#268) [desktop-1200]"] },
    // Why? on a build hint (#399)
    { id: "e2e-ask-never-sends", args: "deck -g \"Why\\\\?\"", file: "packages/analyst-client/src/LogPose.tsx", from: "    if (action === \"send\") {", to: "    if (false) {", kills: [`${deck} > Why? on a build hint opens Log Pose and sends the hint with the deck (#399) [desktop-1200]`, `${deck} > Why? on a build hint opens Log Pose and sends the hint with the deck (#399) [phone-375]`] },
    { id: "e2e-ask-leaves-popover", args: "deck -g \"Why\\\\?\"", file: "packages/deck-analytics/src/ui/DeckHints.tsx", from: "                    setOpen(null);\n", to: "", kills: [`${deck} > Why? on a build hint opens Log Pose and sends the hint with the deck (#399) [desktop-1200]`, `${deck} > Why? on a build hint opens Log Pose and sends the hint with the deck (#399) [phone-375]`] },
    { id: "e2e-ask-ungated", args: "deck -g \"no Why\"", edits: [
      { file: "packages/analyst-client/src/LogPose.tsx", from: "useMemo(() => (available ? (ask: LogPoseAsk) => void openLogPose(ask) : null), [available, openLogPose])", to: "useMemo(() => (ask: LogPoseAsk) => void openLogPose(ask), [openLogPose])" },
      { file: "packages/analyst-client/src/LogPose.tsx", from: "      if (!available) return false;\n", to: "" },
    ], kills: [`${deck} > no Why? on a hint while Log Pose is off (#399) [desktop-1200]`, `${deck} > no Why? on a hint while Log Pose is off (#399) [phone-375]`] },
  ],
};
