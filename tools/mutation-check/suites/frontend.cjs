/** frontend mutations (frontend/src, vitest). */
const capture = "frontend/src/CardCaptureLive.tsx";
const rectify = "frontend/src/cardRectify.ts";
const sim = "frontend/src/optcgsimExport.ts";
const mass = "frontend/src/tcgplayerMassEntry.ts";
const login = "frontend/src/GroupBuys.tsx";
module.exports = {
  cwd: "frontend",
  runner: "vitest",
  mutations: [
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
    // cardImage
    { id: "card-image-not-rewritten", file: "frontend/src/cardImage.ts", from: "  return `${match[1]}${SIZE_SUFFIX[size]}${match[2]}`;", to: "  return trimmed;", kills: ["rewrites TCGCSV _200w thumbs", "converts already-sized CDN URLs"] },
    { id: "card-image-only-200w", file: "frontend/src/cardImage.ts", from: "\\/product\\/\\d+)(?:_[^./]+)?", to: "\\/product\\/\\d+)(?:_200w)?", kills: ["converts already-sized CDN URLs"] },
    { id: "card-image-foreign-dropped", file: "frontend/src/cardImage.ts", from: "  if (!match) return trimmed;", to: "  if (!match) return \"\";", kills: ["leaves non-TCGplayer URLs and empty values alone"] },
    { id: "card-image-undefined-passthrough", file: "frontend/src/cardImage.ts", from: "  if (!src) return \"\";", to: "  if (!src) return String(src);", kills: ["leaves non-TCGplayer URLs and empty values alone"] },
    // preview art for cards TCGPlayer has no pictures for (#613)
    { id: "preview-alt-ignored", file: "frontend/src/previewArt.ts", from: "if (ALT_PREVIEW_PRODUCT_IDS.has(pid)) return", to: "if (false) return", kills: ["prefers the alt-printing preview over the card-id preview (#613)", "uses the alt preview even when the card id has none (#613)"] },
    { id: "preview-card-id-wins-over-alt", file: "frontend/src/previewArt.ts", from: "  const m = imageUrl?.match(PRODUCT_ID_IN_CDN_URL);\n  const pid = m ? Number(m[1]) : NaN;\n  if (ALT_PREVIEW_PRODUCT_IDS.has(pid)) return `${DUEL_URL}/cards/preview/p${pid}.webp`;\n  const id = (cardId ?? \"\").trim().toUpperCase();\n  return PREVIEW_IDS.has(id) ? `${DUEL_URL}/cards/preview/${id}.webp` : null;", to: "  const id = (cardId ?? \"\").trim().toUpperCase();\n  if (PREVIEW_IDS.has(id)) return `${DUEL_URL}/cards/preview/${id}.webp`;\n  const m = imageUrl?.match(PRODUCT_ID_IN_CDN_URL);\n  const pid = m ? Number(m[1]) : NaN;\n  return ALT_PREVIEW_PRODUCT_IDS.has(pid) ? `${DUEL_URL}/cards/preview/p${pid}.webp` : null;", kills: ["prefers the alt-printing preview over the card-id preview (#613)"] },
    { id: "preview-card-id-not-normalized", file: "frontend/src/previewArt.ts", from: "(cardId ?? \"\").trim().toUpperCase()", to: "(cardId ?? \"\")", kills: ["uses the card-id preview for a new card (#613)"] },
    { id: "preview-card-id-never", file: "frontend/src/previewArt.ts", from: "return PREVIEW_IDS.has(id) ?", to: "return false ?", kills: ["uses the card-id preview for a new card (#613)"] },
    { id: "preview-any-card", file: "frontend/src/previewArt.ts", from: "return PREVIEW_IDS.has(id) ?", to: "return id ?", kills: ["has no preview for a card with real art (#613)"] },
    { id: "art-chain-skips-original", file: "frontend/src/cardImage.ts", from: "  if (original && !chain.includes(original)) chain.push(original);", to: "", kills: ["tries the resized art, the original, then the preview (#613)", "ends at the original when there is no preview (#613)"] },
    { id: "art-chain-repeats-original", file: "frontend/src/cardImage.ts", from: "if (original && !chain.includes(original))", to: "if (original)", kills: ["does not repeat a URL that is not resized (#613)"] },
    { id: "art-chain-no-preview", file: "frontend/src/cardImage.ts", from: "  if (preview) chain.push(preview);", to: "", kills: ["tries the resized art, the original, then the preview (#613)", "shows the preview when the card has no image URL (#613)"] },
    { id: "art-chain-preview-first", file: "frontend/src/cardImage.ts", from: "  const resized = cardImageUrl(src, size);\n  if (resized) chain.push(resized);", to: "  const preview0 = previewArtUrl(cardId, src);\n  if (preview0) chain.push(preview0);\n  const resized = cardImageUrl(src, size);\n  if (resized) chain.push(resized);", kills: ["tries the resized art, the original, then the preview (#613)"] },
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
  ],
};
