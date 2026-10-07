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
    { id: "mass-alts-ignored", file: mass, from: "  for (const alt of card.alt_arts ?? []) {", to: "  for (const alt of [] as MassEntryAlt[]) {", kills: ["allocates still_need to alt wants before the primary product"] },
    { id: "mass-url-too-long", file: mass, from: "    if (candidate.length <= MASS_ENTRY_URL_MAX_LEN) {", to: "    if (true) {", kills: ["omits url when the list is too long"] },
    { id: "mass-alt-uncapped", file: mass, from: "    const take = Math.min(Math.max(0, want), remaining);", to: "    const take = Math.max(0, want);", kills: ["caps alt allocation by still_need"] },
    // Collection page (owned cards + value), #268
    { id: "collection-unpriced-not-counted", file: "frontend/src/ownedCollection.ts", from: "    if (item.value == null) unpriced += 1;", to: "    if (item.value == null) unpriced += 0;", kills: ["totals leave unpriced cards out of the value"] },
    { id: "collection-patch-value-stale", file: "frontend/src/ownedCollection.ts", from: "    return { ...item, owned: qty, value };", to: "    return { ...item, owned: qty };", kills: ["stepping Owned reprices the card"] },
    { id: "collection-zero-kept-in-totals", file: "frontend/src/ownedCollection.ts", from: "  const totals = collectionTotals(items.filter((i) => i.owned > 0));", to: "  const totals = collectionTotals(items);", kills: ["a card stepped to 0 stays listed but leaves the totals"] },
    { id: "value-sort-uses-price", file: "frontend/src/cardListControls.tsx", from: "  if (key === \"value\") return compareDesc(a.value, b.value);", to: "  if (key === \"value\") return compareDesc(a.market_price, b.market_price);", kills: ["Value sort puts the most valuable holding first"] },
    // Log Pose chat (#377)
    { id: "logpose-on-share-pages", file: "frontend/src/logPose.ts", from: "const NO_LOG_POSE = [\"/share\", \"/login\"];", to: "const NO_LOG_POSE = [\"/login\"];", kills: ["keeps the compass off public share pages"] },
    { id: "logpose-off-everywhere", file: "frontend/src/logPose.ts", from: "  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));", to: "  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && pathname === \"/\";", kills: ["shows it on the signed-in pages (#377)"] },
    { id: "logpose-deck-sends-leader", file: "frontend/src/logPose.ts", from: "    if (c.card_id.trim().toUpperCase() === leader) continue;\n", to: "", kills: ["without the leader or DON!! (#377)"] },
    { id: "logpose-deck-sends-don", file: "frontend/src/logPose.ts", from: "    if ((c.section || \"main\").toLowerCase() !== \"main\" || c.needed <= 0) continue;", to: "    if (c.needed <= 0) continue;", kills: ["without the leader or DON!! (#377)"] },
    { id: "logpose-deck-copies-one", file: "frontend/src/logPose.ts", from: "    copies.set(c.card_id, (copies.get(c.card_id) ?? 0) + c.needed);", to: "    copies.set(c.card_id, 1);", kills: ["sends a deck's main-deck cards with their copies"] },
    // feedback (#371)
    { id: "planner-feedback-posts-as-duel", file: "frontend/src/feedback.ts", from: "app: \"planner\"", to: "app: \"duel\"", kills: ["posts as the planner with cookies and no room"] },
    { id: "planner-feedback-no-cookies", file: "frontend/src/feedback.ts", from: "      credentials: \"include\",\n", to: "", kills: ["posts as the planner with cookies and no room"] },
    // Why? on a build hint (#399)
    { id: "logpose-deck-no-id", file: "frontend/src/logPose.ts", from: "    ...(deck.id ? { plannerDeckId: deck.id } : {}),\n", to: "", kills: ["tells Log Pose which planner deck is open"] },
  ],
};
