/** frontend mutations (frontend/src, vitest). */
const capture = "frontend/src/CardCaptureLive.tsx";
const rectify = "frontend/src/cardRectify.ts";
const sim = "frontend/src/optcgsimExport.ts";
const mass = "frontend/src/tcgplayerMassEntry.ts";
const login = "frontend/src/GroupBuys.tsx";
const cs = "frontend/src/columnSort.tsx";
module.exports = {
  cwd: "frontend",
  runner: "vitest",
  mutations: [
    // Owned shows the total including alt arts (#652)
    { id: "owned-total-base-only", file: "frontend/src/OwnedCells.tsx", from: "return owned + Math.max(0, altsOwned ?? 0);", to: "return owned;", kills: ["totalOwned adds the alt copies to the base count (#652)", "the Owned cell is a read-only total, not a stepper, when editable alt tiles are shown (#652)"] },
    { id: "owned-total-cell-shows-stepper", file: "frontend/src/OwnedCells.tsx", from: "if (isTotal) return <OwnedTotal owned={owned} altsOwned={altsOwned} />;", to: "if (false) return <OwnedTotal owned={owned} altsOwned={altsOwned} />;", kills: ["the Owned cell is a read-only total, not a stepper, when editable alt tiles are shown (#652)"] },
    { id: "owned-total-hides-stepper-without-alts", file: "frontend/src/OwnedCells.tsx", from: "if (isTotal) return <OwnedTotal", to: "if (isTotal || altsOwned) return <OwnedTotal", kills: ["without alt tiles the Owned cell keeps its stepper and a +N alt note (#652)"] },
    { id: "owned-total-when-alts-not-editable", file: "frontend/src/OwnedCells.tsx", from: "return showAltArts && altCount > 0 && altsEditable;", to: "return showAltArts && altCount > 0;", kills: ["the total only replaces the stepper when the alt tiles are shown, present and editable (#652)"] },
    { id: "owned-total-when-alts-hidden", file: "frontend/src/OwnedCells.tsx", from: "return showAltArts && altCount > 0 && altsEditable;", to: "return altCount > 0 && altsEditable;", kills: ["the total only replaces the stepper when the alt tiles are shown, present and editable (#652)"] },
    { id: "still-needed-shows-slash", file: "frontend/src/OwnedCells.tsx", from: "<span className=\"still-need-num\">{still}</span>", to: "<span className=\"still-need-num\">{still}/{need}</span>", kills: ["the cell shows the count with the deck need underneath, not 5/8 (#652)"] },
    { id: "still-needed-text-never-complete", file: "frontend/src/OwnedCells.tsx", from: "return still > 0 ? `Still need ${still} of ${need}` : `Have all ${need}`;", to: "return `Still need ${still} of ${need}`;", kills: ["meta text says how many more are needed, or that you have them all (#652)"] },
    { id: "base-owned-stepper-missing", file: "frontend/src/MarketPrice.tsx", from: "            {baseOwnedControl}\n", to: "", kills: ["the Base tile has an Owned stepper that saves the base count, not the total (#652)"] },
    { id: "base-owned-stepper-adds-two", file: "frontend/src/OwnedCells.tsx", from: "onClick={() => commit(displayQty + 1)}", to: "onClick={() => commit(displayQty + 2)}", kills: ["the Base tile has an Owned stepper that saves the base count, not the total (#652)"] },
    { id: "base-tile-never-forced", file: "frontend/src/altArt.ts", from: "if (!always && !featuredAlt(card)) return null;", to: "if (!featuredAlt(card)) return null;", kills: ["baseTileFor keeps the Base tile with no owned alt only when asked to (#652)"] },
    // Sortable table headers (#636)
    { id: "colsort-empties-first", file: cs, from: "return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;", to: "return aEmpty === bEmpty ? a.index - b.index : aEmpty ? -1 : 1;", kills: ["keeps empty values last in both directions", "treats an empty string like a missing value"] },
    { id: "colsort-empty-string-is-a-value", file: cs, from: "v === null || v === undefined || v === \"\"", to: "v === null || v === undefined", kills: ["treats an empty string like a missing value"] },
    { id: "colsort-desc-not-reversed", file: cs, from: "const sign = sort.dir === \"asc\" ? 1 : -1;", to: "const sign = 1;", kills: ["keeps empty values last in both directions", "ties keep the incoming order in both directions"] },
    { id: "colsort-ties-reverse", file: cs, from: "return cmp !== 0 ? sign * cmp : a.index - b.index;", to: "return sign * (cmp !== 0 ? cmp : a.index - b.index);", kills: ["ties keep the incoming order in both directions"] },
    { id: "colsort-numbers-as-text", file: cs, from: "if (typeof a === \"number\" && typeof b === \"number\") return a - b;", to: "if (typeof a === \"number\" && typeof b === \"number\") return String(a).localeCompare(String(b));", kills: ["compares numbers by value, not as text"] },
    { id: "colsort-not-natural-order", file: cs, from: "numeric: true, sensitivity", to: "numeric: false, sensitivity", kills: ["reads card numbers in natural order"] },
    { id: "colsort-third-click-keeps-sort", file: cs, from: "  return null;\n}\n\nconst isEmpty", to: "  return { key, dir: firstDir };\n}\n\nconst isEmpty", kills: ["cycles first direction, reverse, then clears"] },
    { id: "colsort-first-click-reversed", file: cs, from: "if (!current || current.key !== key) return { key, dir: firstDir };", to: "if (!current || current.key !== key) return { key, dir: firstDir === \"asc\" ? \"desc\" : \"asc\" };", kills: ["cycles first direction, reverse, then clears", "starts text columns ascending"] },
    { id: "colsort-other-column-keeps-cycle", file: cs, from: "if (!current || current.key !== key) return", to: "if (!current) return", kills: ["switching to another column restarts"] },
    // shopping extras (#525)
    { id: "extra-plus-ignores-owned", file: "frontend/src/shoppingExtras.ts", from: "const listTarget = owned + stillNeed;", to: "const listTarget = stillNeed;", kills: ["+ on a card that is covered targets one copy beyond what is owned"] },
    { id: "extra-plus-two-copies", file: "frontend/src/shoppingExtras.ts", from: "if (delta > 0) return listTarget + 1;", to: "if (delta > 0) return listTarget + 2;", kills: ["+ buys one more than the list already wants", "+ on a deck-driven card goes above the deck need"] },
    { id: "extra-minus-keeps-covered-extra", file: "frontend/src/shoppingExtras.ts", from: "if (next <= Math.max(owned, deckNeed)) return 0;", to: "if (next < Math.max(owned, deckNeed)) return 0;", kills: ["\u2212 removes the extra once owned copies or decks already cover the lower target"] },
    { id: "extra-minus-ignores-deck-need", file: "frontend/src/shoppingExtras.ts", from: "if (next <= Math.max(owned, deckNeed)) return 0;", to: "if (next <= owned) return 0;", kills: ["\u2212 removes the extra once owned copies or decks already cover the lower target"] },
    { id: "extra-minus-goes-negative", file: "frontend/src/shoppingExtras.ts", from: "if (next <= Math.max(owned, deckNeed)) return 0;", to: "if (next <= Math.max(owned, deckNeed)) return next;", kills: ["\u2212 never goes below zero", "\u2212 removes the extra once owned copies or decks already cover the lower target"] },
    { id: "collection-buying-stale-after-step", file: "frontend/src/ownedCollection.ts", from: "Math.max(0, item.owned + item.buying - qty)", to: "item.buying", kills: ["stepping Owned shrinks Buying for a card on the list"] },
    { id: "collection-buying-negative", file: "frontend/src/ownedCollection.ts", from: "Math.max(0, item.owned + item.buying - qty)", to: "item.owned + item.buying - qty", kills: ["stepping Owned shrinks Buying for a card on the list"] },
    // remembered filter choices (#527)
    { id: "persisted-choice-accepts-stale", file: "frontend/src/cardListControls.tsx", from: "  if (allowed && !allowed.includes(raw)) return defaultValue;\n", to: "", kills: ["falls back to the default for a stale value or nothing stored (#527)"] },
    { id: "persisted-choice-drops-all-choice", file: "frontend/src/cardListControls.tsx", from: "  if (raw === null) return defaultValue;\n  if (allowed", to: "  if (raw === null || raw === \"\") return defaultValue;\n  if (allowed", kills: ["keeps a stored value that is still an option, including the empty All choice (#527)"] },
    // analytics URL redaction
    { id: "analytics-keeps-share-token", file: "frontend/src/analytics.ts", from: "      path = `${prefix}[token]`;", to: "      path = path;", kills: ["replaces public share and group-buy tokens"] },
    { id: "analytics-keeps-group-buy-token", file: "frontend/src/analytics.ts", from: "const TOKEN_ROUTES = [\"/share/\", \"/group-buy/join/\", \"/group-buy/view/\"];", to: "const TOKEN_ROUTES = [\"/share/\"];", kills: ["replaces public share and group-buy tokens"] },
    { id: "analytics-keeps-query", file: "frontend/src/analytics.ts", from: "  return `${parsed.origin}${path}`;", to: "  return `${parsed.origin}${path}${parsed.search}${parsed.hash}`;", kills: ["drops query strings and hashes"] },
    // buildInfo
    { id: "build-tag-full-sha", file: "frontend/src/buildInfo.ts", from: "  return trimmed.slice(0, 7);", to: "  return trimmed;", kills: ["uses the first 7 characters of a full SHA"] },
    { id: "build-tag-blank-not-dev", file: "frontend/src/buildInfo.ts", from: "  const trimmed = (sha ?? \"\").trim();", to: "  const trimmed = sha ?? \"\";", kills: ["falls back to dev when missing"] },
    // isSafeLoginNext (open-redirect guard). Checks are layered, so each mutation removes every layer for one attack.
    { id: "login-next-rejects-all", file: login, from: "    return false;\n  }\n  return true;\n}", to: "    return false;\n  }\n  return false;\n}", kills: ["allows same-origin relative paths"] },
    { id: "login-next-protocol-relative", edits: [
      { file: login, from: "  if (!path.startsWith(\"/\") || path.startsWith(\"//\")) return false;", to: "  if (!path.startsWith(\"/\")) return false;" },
      { file: login, from: "    if (decoded.startsWith(\"//\") || decoded.includes", to: "    if (decoded.includes" },
    ], kills: ["rejects protocol-relative and absolute URLs"] },
    { id: "login-next-absolute", edits: [
      { file: login, from: "  if (!path.startsWith(\"/\") || path.startsWith(\"//\")) return false;", to: "  if (path.startsWith(\"//\")) return false;" },
      { file: login, from: "  if (path.includes(\"\\\\\") || path.includes(\"://\")) return false;", to: "  if (path.includes(\"\\\\\")) return false;" },
      { file: login, from: " || decoded.includes(\"://\")", to: "" },
    ], kills: ["rejects protocol-relative and absolute URLs"] },
    { id: "login-next-backslash", edits: [
      { file: login, from: "  if (path.includes(\"\\\\\") || path.includes(\"://\")) return false;", to: "  if (path.includes(\"://\")) return false;" },
      { file: login, from: " || decoded.includes(\"\\\\\")", to: "" },
    ], kills: ["rejects protocol-relative and absolute URLs"] },
    { id: "login-next-encoded", file: login, from: "    const decoded = decodeURIComponent(path);", to: "    const decoded = path;", kills: ["rejects protocol-relative and absolute URLs"] },
    // AltArtsRow tiles pass the card id so the preview fallback works (#643)
    { id: "alt-row-alt-tile-no-card-id", file: "frontend/src/MarketPrice.tsx", from: "<CardThumb src={alt.image_url || undefined} cardId={cardId} alt={alt.name} />", to: "<CardThumb src={alt.image_url || undefined} alt={alt.name} />", kills: ["an alt with no alt preview falls back to the card preview (#643)"] },
    { id: "alt-row-base-tile-no-card-id", file: "frontend/src/MarketPrice.tsx", from: "<CardThumb src={base.image_url || undefined} cardId={cardId} alt=", to: "<CardThumb src={base.image_url || undefined} alt=", kills: ["the Base tile ends on the card preview (#643)"] },
    // CardCaptureLive guide crop
    { id: "crop-no-guide-empty", file: capture, from: "!box.width || !box.height) return full;", to: "!box.width || !box.height) return { ...full, width: 0, height: 0 };", kills: ["falls back to the whole frame"] },
    { id: "crop-y-unscaled", file: capture, from: "  const y = (top + hiddenY) / scale;", to: "  const y = top + hiddenY;", kills: ["maps a centred guide to the centre of the frame"] },
    { id: "crop-contain-scale", file: capture, from: "  const scale = Math.max(box.width / video.videoWidth", to: "  const scale = Math.min(box.width / video.videoWidth", kills: ["undoes the cover scale"] },
    { id: "crop-margin-one-side", file: capture, from: "  const width = (g.width + marginX * 2) / scale;", to: "  const width = (g.width + marginX) / scale;", kills: ["undoes the cover scale"] },
    { id: "crop-ignores-hidden-overflow", file: capture, from: "  const hiddenX = (shownW - box.width) / 2;", to: "  const hiddenX = 0;", kills: ["accounts for the horizontally cropped overflow"] },
    { id: "crop-ignores-element-offset", file: capture, from: "  const left = g.left - box.left - marginX;", to: "  const left = g.left - marginX;", kills: ["offsets by the element's own position"] },
    { id: "crop-unclamped-origin", file: capture, from: "  const cy = Math.max(0, Math.min(y, video.videoHeight));", to: "  const cy = y;", kills: ["never asks for pixels outside the frame"] },
    { id: "crop-unclamped-size", file: capture, from: "    height: Math.max(1, Math.min(height, video.videoHeight - cy)),", to: "    height: Math.max(1, height),", kills: ["never asks for pixels outside the frame"] },
    // cardRectify
    { id: "homography-swaps-axes", file: rectify, from: "    x: (h[0] * p.x + h[1] * p.y + h[2]) / d,\n    y: (h[3] * p.x + h[4] * p.y + h[5]) / d,", to: "    y: (h[0] * p.x + h[1] * p.y + h[2]) / d,\n    x: (h[3] * p.x + h[4] * p.y + h[5]) / d,", kills: ["recovers an identity mapping"] },
    { id: "homography-affine-only", edits: [
      { file: rectify, from: "    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);", to: "    a.push([x, y, 1, 0, 0, 0, 0, 0]);" },
      { file: rectify, from: "    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);", to: "    a.push([0, 0, 0, x, y, 1, 0, 0]);" },
    ], kills: ["maps every corner onto its target"] },
    { id: "homography-degenerate-solved", file: rectify, from: "    if (Math.abs(a[pivot][col]) < 1e-9) return null;", to: "", kills: ["returns null for a degenerate quad"] },
    { id: "corners-tr-bl-swapped", file: rectify, from: "  const bl = byDiff[0];\n  const tr = byDiff[3];", to: "  const bl = byDiff[3];\n  const tr = byDiff[0];", kills: ["sorts shuffled corners into TL, TR, BR, BL"] },
    { id: "corners-any-count", file: rectify, from: "  if (points.length !== 4) return null;", to: "", kills: ["rejects the wrong number of points"] },
    { id: "quad-area-doubled", file: rectify, from: "  return Math.abs(sum) / 2;", to: "  return Math.abs(sum);", kills: ["measures an axis-aligned rectangle"] },
    { id: "quad-finds-background", file: rectify, from: "      if (d < threshold) continue;", to: "      if (d >= threshold) continue;", kills: ["locates an upright card", "locates a rotated card"] },
    { id: "quad-bounding-box", file: rectify, from: "  const quad: Quad = [tl, tr, br, bl];", to: "  const x0 = Math.min(tl.x, bl.x), x1 = Math.max(tr.x, br.x), y0 = Math.min(tl.y, tr.y), y1 = Math.max(bl.y, br.y);\n  const quad: Quad = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];", kills: ["locates a rotated card"] },
    { id: "quad-accepts-specks", edits: [
      { file: rectify, from: "  if (count < w * h * minAreaFraction) return null;", to: "" },
      { file: rectify, from: "  if (area < w * h * minAreaFraction) return null;", to: "" },
    ], kills: ["returns null when nothing card-shaped is present"] },
    { id: "quad-aspect-check", file: rectify, from: "  if (!width || !height) return null;\n  return quad;", to: "  if (!width || !height || Math.abs(width / height - CARD_ASPECT) > 0.3) return null;\n  return quad;", kills: ["accepts a shape that is not card-proportioned"] },
    { id: "region-x-uses-height", file: rectify, from: "    x0: Math.round(region.x * width),", to: "    x0: Math.round(region.x * height),", kills: ["converts fractions to pixels"] },
    // OPTCGSim export
    { id: "sim-leader-not-first", file: sim, from: "    if (leaderId) {", to: "    if (false) {", kills: ["formats qty×id lines with leader first"] },
    { id: "sim-ids-not-uppercased", file: sim, from: "  const pasteLines = lines.map((c) => `${c.needed}x${c.card_id.trim().toUpperCase()}`);", to: "  const pasteLines = lines.map((c) => `${c.needed}x${c.card_id.trim()}`);", kills: ["formats qty×id lines with leader first"] },
    { id: "sim-copy-count-lines", file: sim, from: "  const copyCount = lines.reduce((sum, c) => sum + c.needed, 0);", to: "  const copyCount = lines.length;", kills: ["formats qty×id lines with leader first"] },
    { id: "sim-don-type-kept", file: sim, from: "  if (type.startsWith(\"don\") || type.includes(\"don!!\")) return true;", to: "", kills: ["omits DON!! and zero-qty lines"] },
    { id: "sim-zero-qty-kept", file: sim, from: "    (c) => c.needed > 0 &&", to: "    (c) => c.needed >= 0 &&", kills: ["omits DON!! and zero-qty lines"] },
    { id: "sim-don-section-kept", edits: [
      { file: sim, from: "  if ((card.section || \"\").trim().toLowerCase() === \"don\") return true;", to: "" },
      { file: sim, from: "  return (card.card_id || \"\").toUpperCase().startsWith(\"DON-\");", to: "  return false;" },
    ], kills: ["returns empty paste when nothing exportable"] },
    { id: "sim-filename-unsanitized", file: sim, from: "    .replace(/[<>:\"/\\\\|?*\\u0000-\\u001f]+/g, \"\")", to: "", kills: ["sanitizes and appends .txt"] },
    { id: "sim-filename-double-ext", file: sim, from: "  return /\\.(txt|deck)$/i.test(safe) ? safe : `${safe}.txt`;", to: "  return `${safe}.txt`;", kills: ["sanitizes and appends .txt"] },
    { id: "sim-filename-empty", edits: [
      { file: sim, from: "  const base = (deckName || \"deck\")", to: "  const base = deckName" },
      { file: sim, from: "  const safe = base || \"deck\";", to: "  const safe = base;" },
    ], kills: ["sanitizes and appends .txt"] },
    // TCGplayer Mass Entry
    { id: "mass-zero-need-included", file: mass, from: "  const included = cards.filter((c) => c.still_need > 0);", to: "  const included = cards;", kills: ["prefers product ids and skips zero qty"] },
    { id: "mass-product-ids-ignored", file: mass, from: "      if (buy.product_id != null && buy.product_id > 0) {", to: "      if (false) {", kills: ["prefers product ids and skips zero qty"] },
    { id: "mass-missing-not-counted", file: mass, from: "    if (cardHasFallback) missingProductId += 1;", to: "", kills: ["prefers product ids and skips zero qty"] },
    { id: "mass-url-too-long", file: mass, from: "    if (candidate.length <= MASS_ENTRY_URL_MAX_LEN) {", to: "    if (true) {", kills: ["omits url when the list is too long"] },
    // Collection page (owned cards + value), #268
    { id: "collection-unpriced-not-counted", file: "frontend/src/ownedCollection.ts", from: "    if (item.value == null) unpriced += 1;", to: "    if (item.value == null) unpriced += 0;", kills: ["totals leave unpriced cards out of the value"] },
    { id: "collection-patch-value-stale", file: "frontend/src/ownedCollection.ts", from: "    return { ...item, owned: qty, value, buying };", to: "    return { ...item, owned: qty, buying };", kills: ["stepping Owned reprices the card"] },
    { id: "collection-zero-kept-in-totals", file: "frontend/src/ownedCollection.ts", from: "  const totals = collectionTotals(items.filter(holdsCopies));", to: "  const totals = collectionTotals(items);", kills: ["a card stepped to 0 stays listed but leaves the totals"] },
    { id: "value-sort-uses-price", file: "frontend/src/cardListControls.tsx", from: "  if (key === \"value\") return compareDesc(a.value, b.value);", to: "  if (key === \"value\") return compareDesc(a.market_price, b.market_price);", kills: ["Value sort puts the most valuable holding first"] },
    // Log Pose chat (#377)
    { id: "logpose-on-share-pages", file: "frontend/src/logPose.ts", from: "const NO_LOG_POSE = [\"/share\", \"/login\"];", to: "const NO_LOG_POSE = [\"/login\"];", kills: ["keeps the compass off public share pages"] },
    { id: "logpose-off-everywhere", file: "frontend/src/logPose.ts", from: "  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));", to: "  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && pathname === \"/\";", kills: ["shows it on the signed-in pages (#377)"] },
    { id: "logpose-deck-sends-leader", file: "frontend/src/logPose.ts", from: "    if (c.card_id.trim().toUpperCase() === leader) continue;\n", to: "", kills: ["without the leader or DON!! (#377)"] },
    { id: "logpose-deck-sends-don", file: "frontend/src/logPose.ts", from: "    if ((c.section || \"main\").toLowerCase() === \"don\" || c.needed <= 0) continue;", to: "    if (c.needed <= 0) continue;", kills: ["without the leader or DON!! (#377)"] },
    { id: "logpose-deck-copies-one", file: "frontend/src/logPose.ts", from: "    copies.set(c.card_id, (copies.get(c.card_id) ?? 0) + c.needed);", to: "    copies.set(c.card_id, 1);", kills: ["sends a deck's main-deck cards with their copies"] },
    // feedback (#371)
    { id: "planner-feedback-posts-as-duel", file: "frontend/src/feedback.ts", from: "app: \"planner\"", to: "app: \"duel\"", kills: ["posts as the planner with cookies and no room"] },
    { id: "planner-feedback-no-cookies", file: "frontend/src/feedback.ts", from: "      credentials: \"include\",\n", to: "", kills: ["posts as the planner with cookies and no room"] },
    // Log Pose Apply card (#400)
    { id: "planner-context-main-only", file: "frontend/src/logPose.ts", from: "if ((c.section || \"main\").toLowerCase() === \"don\" || c.needed <= 0) continue;", to: "if ((c.section || \"main\").toLowerCase() !== \"main\" || c.needed <= 0) continue;", kills: ["sends a variant deck's additional cards too (#400)"] },
    { id: "planner-apply-no-rollback", file: "frontend/src/logPose.ts", from: "      for (const d of done.reverse()) {", to: "      for (const d of [] as DeckEditOp[]) {", kills: ["puts saved lines back when a later save fails (#400)"] },
    { id: "planner-apply-increases-first", file: "frontend/src/logPose.ts", from: "a.after - a.before - (b.after - b.before)", to: "b.after - b.before - (a.after - a.before)", kills: ["saves the decreases first, one card at a time, and returns the last save's result (#400)"] },
    { id: "planner-apply-hides-partial", file: "frontend/src/logPose.ts", from: "restored = false;", to: "", kills: ["says some changes were saved when putting them back fails too (#400)"] },
    { id: "planner-context-ref-dropped", file: "frontend/src/logPose.ts", from: "    ...(deck.id ? { ref: `planner:${deck.id}` } : {}),\n", to: "", kills: ["sends a deck's main-deck cards with their copies, without the leader or DON!! (#377)"] },
    // Why? on a build hint (#399)
    { id: "logpose-deck-no-id", file: "frontend/src/logPose.ts", from: "    ...(deck.id ? { plannerDeckId: deck.id } : {}),\n", to: "", kills: ["tells Log Pose which planner deck is open"] },
    // Deck "$ left" prices still-needed copies at the standard price (#625)
    { id: "deck-cost-standard-price-ignored", file: "frontend/src/deckCost.ts", from: "Math.round(still * card.market_price * 100)", to: "Math.round(1 * card.market_price * 100)", kills: ["prices every still-needed copy at the standard price (#625)"] },
    { id: "deck-cost-finished-unpriced-null", file: "frontend/src/deckCost.ts", from: "  if (still <= 0) return 0;\n", to: "", kills: ["is 0 for a finished card even when it has no price (#625)"] },
    { id: "deck-cost-unpriced-counts-zero", file: "frontend/src/deckCost.ts", from: "  if (card.market_price == null) return null;", to: "  if (card.market_price == null) return 0;", kills: ["returns null when a needed copy has no price (#625)"] },
    { id: "deck-cost-sum-counts-unpriced-as-standard", file: "frontend/src/deckCost.ts", from: "(remainingCostForCard(c) ?? 0)", to: "(remainingCostForCard(c) ?? c.still_need * 1)", kills: ["sums priced cards and leaves out unpriced and finished ones (#625)"] },
    // Alt arts on by default (#625)
    { id: "alt-arts-default-off", file: "frontend/src/cardListControls.tsx", from: "  return raw !== \"0\";", to: "  return raw === \"1\";", kills: ["shows alt arts when nothing is stored and hides them only after an explicit off (#625)"] },
    { id: "alt-arts-off-ignored", file: "frontend/src/cardListControls.tsx", from: "  return raw !== \"0\";", to: "  return true;", kills: ["shows alt arts when nothing is stored and hides them only after an explicit off (#625)"] },
    // Collection counts alt copies (#625)
    { id: "collection-copies-skip-alts", file: "frontend/src/ownedCollection.ts", from: "    copies += item.owned + (item.alts_owned ?? 0);", to: "    copies += item.owned;", kills: ["copies and value include alt-art copies, and stepping base keeps their share (#625)"] },
    { id: "collection-step-reprices-alts-at-base", file: "frontend/src/ownedCollection.ts", from: "      value = Math.round((item.value + (qty - item.owned) * item.market_price) * 100) / 100;", to: "      value = Math.round(qty * item.market_price * 100) / 100;", kills: ["copies and value include alt-art copies, and stepping base keeps their share (#625)"] },
    { id: "collection-alt-only-card-leaves-totals", file: "frontend/src/ownedCollection.ts", from: "  return item.owned + (item.alts_owned ?? 0) > 0;", to: "  return item.owned > 0;", kills: ["a card owned only as alts stays in the totals when base goes to 0 (#625)"] },
    // Owned alt becomes the main art (#625)
    { id: "featured-alt-picks-first-owned", file: "frontend/src/altArt.ts", from: "n > (best.owned ?? 0)", to: "n >= (best.owned ?? 0)", kills: ["breaks ties toward the first alt in the list (#625)"] },
    { id: "featured-alt-picks-least-owned", file: "frontend/src/altArt.ts", from: "n > (best.owned ?? 0)", to: "n < (best.owned ?? 0)", kills: ["picks the alt with the most owned copies (#625)"] },
    { id: "featured-alt-needs-owned", file: "frontend/src/altArt.ts", from: "if (n > 0 && (best", to: "if ((best", kills: ["is null when no alt is owned (#625)"] },
    { id: "main-image-ignores-owned-alt", file: "frontend/src/altArt.ts", from: "return featuredAlt(card)?.image_url || card.image_url || undefined;", to: "return card.image_url || undefined;", kills: ["shows the owned alt art, else the base art (#625)"] },
    // Choose which art a card shows (#702)
    { id: "display-art-base-ignored", file: "frontend/src/altArt.ts", from: "  if (chosen === 0) return null;\n", to: "", kills: ["0 shows the base art even while an alt is owned (#702)"] },
    { id: "display-art-unowned-alt-ignored", file: "frontend/src/altArt.ts", from: "    if (picked) return picked;", to: "    if (picked && (picked.owned ?? 0) > 0) return picked;", kills: ["a chosen alt is shown even when unowned and others are owned (#702)"] },
    { id: "display-art-unknown-no-fallback", file: "frontend/src/altArt.ts", from: "    if (picked) return picked;", to: "    return picked ?? null;", kills: ["an unknown or null choice falls back to the most-owned alt (#702)"] },
    { id: "display-art-shown-id-base-wrong", file: "frontend/src/altArt.ts", from: "featuredAlt(card)?.product_id ?? 0;", to: "featuredAlt(card)?.product_id ?? -1;", kills: ["0 shows the base art even while an alt is owned (#702)"] },
    { id: "display-art-show-click-wrong-id", file: "frontend/src/MarketPrice.tsx", from: "onClick={() => onShow(productId)}", to: "onClick={() => onShow(0)}", kills: ["clicking Show on an alt calls onShow with its product id (#702)"] },
    { id: "display-art-shown-tile-keeps-button", file: "frontend/src/MarketPrice.tsx", from: "      productId === shown ? (", to: "      productId === -1 ? (", kills: ["the shown tile has a Shown chip and no Show button (#702)"] },
    { id: "display-art-show-without-handler", file: "frontend/src/MarketPrice.tsx", from: "    onShow ? (\n      productId === shown", to: "    true ? (\n      productId === shown", kills: ["shows no Show controls without onShow, as on share pages (#702)"] },
    { id: "main-image-owned-alt-without-image", file: "frontend/src/altArt.ts", from: "return featuredAlt(card)?.image_url || card.image_url || undefined;", to: "return featuredAlt(card) ? featuredAlt(card)?.image_url : card.image_url || undefined;", kills: ["falls back to base when the owned alt has no image (#625)"] },
    // Meta deck browser (#443)
    { id: "meta-ordinal-teens", file: "frontend/src/meta.ts", from: "  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;\n", to: "", kills: ["ordinals use th for 11-13"] },
    { id: "meta-name-always-ordinal", file: "frontend/src/meta.ts", from: "const place = deck.placing ? `${ordinal(deck.placing)} ` : \"\";", to: "const place = `${ordinal(deck.placing ?? 0)} `;", kills: ["deck name is leader, placing ordinal, event"] },
    { id: "meta-name-no-leader-fallback", file: "frontend/src/meta.ts", from: "leaderName.trim() || leaderId", to: "leaderName.trim()", kills: ["deck name is leader, placing ordinal, event"] },
    { id: "meta-name-untrimmed", file: "frontend/src/meta.ts", from: ".slice(0, DECK_NAME_MAX).trim()", to: "", kills: ["deck name is trimmed to the API name limit"] },
    { id: "meta-row-record-order", file: "frontend/src/meta.ts", from: "${wins}-${losses}-${ties}", to: "${wins}-${ties}-${losses}", kills: ["deck row reads placing of players"] },
    { id: "meta-row-no-field-size", file: "frontend/src/meta.ts", from: "`${ordinal(deck.placing)} of ${deck.players}`", to: "`${ordinal(deck.placing)}`", kills: ["deck row reads placing of players"] },
    { id: "meta-date-month-off-by-one", file: "frontend/src/meta.ts", from: "MONTHS[Number(m[2]) - 1]", to: "MONTHS[Number(m[2])]", kills: ["dates read as the written month and day"] },
    { id: "meta-percent-whole-number", file: "frontend/src/meta.ts", from: "(value * 100).toFixed(1)", to: "(value * 100).toFixed(0)", kills: ["percentages show one decimal"] },
    { id: "meta-percent-null-as-zero", file: "frontend/src/meta.ts", from: "  if (value === null || value === undefined || Number.isNaN(value)) return \"\u2013\";\n", to: "", kills: ["percentages show one decimal"] },
    { id: "meta-cost-groups-descending", file: "frontend/src/meta.ts", from: ".sort((a, b) => a[0] - b[0])", to: ".sort((a, b) => b[0] - a[0])", kills: ["cards group by numeric cost ascending"] },
    { id: "meta-cost-other-first", file: "frontend/src/meta.ts", from: "if (other.length) groups.push(", to: "if (other.length) groups.unshift(", kills: ["cards group by numeric cost ascending"] },
    { id: "meta-create-edits-text", file: "frontend/src/meta.ts", from: "deck.text);\n  await deps.onCreated", to: "deck.text.trim());\n  await deps.onCreated", kills: ["posts the deck's text and generated name"] },
    { id: "meta-create-no-refresh", file: "frontend/src/meta.ts", from: "  await deps.onCreated();\n", to: "", kills: ["posts the deck's text and generated name"] },
    { id: "meta-create-wrong-destination", file: "frontend/src/meta.ts", from: "`/decks/${created.id}`", to: "`/decks`", kills: ["posts the deck's text and generated name"] },
    // Friends, spares and trades (#703)
    { id: "friends-cap-ignores-spare", file: "frontend/src/friends/tradeLogic.ts", from: "const byCard = cap.spare - others;", to: "const byCard = Infinity;", kills: ["never holds more copies of a card than the other side has spare (#703)"] },
    { id: "friends-cap-printings-dont-share-spare", file: "frontend/src/friends/tradeLogic.ts", from: "const byCard = cap.spare - others;", to: "const byCard = cap.spare;", kills: ["shares one spare count between the standard printing and an alt printing of the same card (#703)"] },
    { id: "friends-cap-ignores-printing-owned", file: "frontend/src/friends/tradeLogic.ts", from: "const byPrinting = card.productId == null ? Infinity : (cap.printings[card.productId] ?? 0);", to: "const byPrinting = Infinity;", kills: ["limits an alt printing to the copies owned of that printing (#703)"] },
    { id: "friends-cap-mixes-sides", file: "frontend/src/friends/tradeLogic.ts", from: "const others = lines.filter((l) => l.side === card.side && l.cardId === card.cardId && lineKey(l) !== key)", to: "const others = lines.filter((l) => l.cardId === card.cardId && lineKey(l) !== key)", kills: ["does not let the give side use the get side's spare (#703)"] },
    { id: "friends-line-cap-20", file: "frontend/src/friends/tradeLogic.ts", from: "Math.min(MAX_LINE_QTY, byCard, byPrinting)", to: "Math.min(byCard, byPrinting)", kills: ["caps one line at 20 copies even when more are spare (#703)"] },
    { id: "friends-tray-duplicates-line", file: "frontend/src/friends/tradeLogic.ts", from: "  if (idx >= 0) return lines.map((l, i) => (i === idx ? { ...l, qty: next } : l));\n", to: "", kills: ["adding the same card and printing again merges into one line, and 0 removes it (#703)"] },
    { id: "friends-tray-zero-keeps-line", file: "frontend/src/friends/tradeLogic.ts", from: "if (next <= 0) return idx < 0 ? lines : lines.filter((_, i) => i !== idx);", to: "if (next <= 0) return lines;", kills: ["adding the same card and printing again merges into one line, and 0 removes it (#703)"] },
    { id: "friends-tray-no-line-limit", file: "frontend/src/friends/tradeLogic.ts", from: "  if (lines.length >= MAX_LINES) return lines;\n", to: "", kills: ["stops adding new cards at 40 lines (#703)"] },
    { id: "friends-tray-unpriced-counts-zero", file: "frontend/src/friends/tradeLogic.ts", from: "if (l.marketPrice == null) return null;", to: "if (l.marketPrice == null) continue;", kills: ["has no value for a side that holds an unpriced card (#703)"] },
    { id: "friends-tray-value-ignores-qty", file: "frontend/src/friends/tradeLogic.ts", from: "total += l.qty * l.marketPrice;", to: "total += l.marketPrice;", kills: ["adds copies and market value per side (#703)"] },
    { id: "friends-sides-ignore-role", file: "frontend/src/friends/tradeLogic.ts", from: "trade.lines.filter((l) => l.side === (trade.i_am_sender ? side : side === \"give\" ? \"get\" : \"give\"));", to: "trade.lines.filter((l) => l.side === side);", kills: ["as the recipient, the sender's give lines are what I receive (#703)"] },
    { id: "friends-sides-values-not-swapped", file: "frontend/src/friends/tradeLogic.ts", from: "iGiveValue: trade.i_am_sender ? trade.give_value : trade.get_value,", to: "iGiveValue: trade.give_value,", kills: ["as the recipient, the sender's give lines are what I receive (#703)"] },
    { id: "friends-counter-not-flipped", file: "frontend/src/friends/tradeLogic.ts", from: "fromLine(l, l.side === \"give\" ? \"get\" : \"give\")", to: "fromLine(l, l.side)", kills: ["a counter starts from the offer turned around, keeping printings and quantities (#703)"] },
    { id: "friends-badge-ignores-active", file: "frontend/src/friends/tradeLogic.ts", from: "return Math.max(0, summary.incoming_pending) + Math.max(0, summary.active);", to: "return Math.max(0, summary.incoming_pending);", kills: ["counts offers waiting plus trades in progress (#703)"] },
    { id: "friends-badge-no-cap", file: "frontend/src/friends/tradeLogic.ts", from: "(n > 9 ? \"9+\" : String(n))", to: "String(n)", kills: ["shows 9+ for ten or more (#703)"] },
    { id: "friends-username-no-min", file: "frontend/src/friends/username.ts", from: "v.length < USERNAME_MIN || ", to: "", kills: ["rejects names that are too short, too long or have other characters (#703)"] },
    { id: "friends-username-no-max", file: "frontend/src/friends/username.ts", from: " || v.length > USERNAME_MAX", to: "", kills: ["rejects names that are too short, too long or have other characters (#703)"] },
    { id: "friends-username-any-chars", file: "frontend/src/friends/username.ts", from: "if (!USERNAME_RE.test(v))", to: "if (false)", kills: ["rejects names that are too short, too long or have other characters (#703)"] },
  ],
};
