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
const trigger = `${deck} > expanding a market price shows the last sales without moving the price`;

module.exports = {
  cwd: "frontend",
  runner: "playwright",
  mutations: [
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

    // Owned stepper
    { id: "e2e-owned-plus-adds-two", args: "deck --project=desktop-1200 -g \"owned stepper\"", file: app, from: "        onClick={() => commit(displayQty + 1)}", to: "        onClick={() => commit(displayQty + 2)}", kills: [`${deck} > owned stepper saves each click and updates still needed [desktop-1200]`] },
    { id: "e2e-owned-minus-never-disabled", args: "deck --project=phone-375 -g \"below zero\"", file: app, from: "        disabled={mutation.isPending || displayQty <= 0}", to: "        disabled={mutation.isPending}", kills: [`${deck} > cannot take owned below zero [phone-375]`] },
    // The row shows "still needed / needed" in both layouts.
    { id: "e2e-row-still-needed-swapped", args: "deck -g \"each card row\"", edits: [
      { file: app, from: "                    `${c.still_need}/${c.needed}`\n", to: "                    `${c.needed}/${c.still_need}`\n" },
      { file: app, from: "[c.color, `${c.still_need}/${c.needed} still needed`, c.card_type || \"\"]", to: "[c.color, `${c.needed}/${c.still_need} still needed`, c.card_type || \"\"]" },
    ], kills: [`${deck} > each card row names the card, how many are still needed and its price [desktop-1200]`, `${deck} > each card row names the card, how many are still needed and its price [phone-375]`] },

    // Shopping list
    { id: "e2e-shopping-shows-owned-cards", args: "shopping-share -g \"shopping list hides\" --project=desktop-1200", file: app, from: "  const filteredItems = useMemo(() => {\n    let list = data?.items ?? [];\n    if (onlyNeed) list = list.filter((i) => i.still_need > 0);\n", to: "  const filteredItems = useMemo(() => {\n    let list = data?.items ?? [];\n", kills: [`${share} > shopping list hides fully owned cards and passes the audit [desktop-1200]`] },

    // Share page
    { id: "e2e-share-route-renamed", args: "shopping-share -g \"share page\" --project=desktop-1200", file: app, from: "<Route path=\"/share/:token\" element={<PublicSharePage />} />", to: "<Route path=\"/shared/:token\" element={<PublicSharePage />} />", kills: [`${share} > share page lists the shared cards with prices and passes the audit [desktop-1200]`, `${share} > share page for a revoked link says so instead of showing a list [desktop-1200]`] },
    { id: "e2e-share-error-hidden", args: "shopping-share -g \"revoked\" --project=phone-375", file: app, from: "        {isLoading && <ShoppingListSkeleton />}\n        {error && <p className=\"error\">{(error as Error).message}</p>}\n        {data && (\n          <div className={data.kind === \"deck\" ? \"deck-layout\" : undefined}>", to: "        {isLoading && <ShoppingListSkeleton />}\n        {data && (\n          <div className={data.kind === \"deck\" ? \"deck-layout\" : undefined}>", kills: [`${share} > share page for a revoked link says so instead of showing a list [phone-375]`] },
  ],
};
