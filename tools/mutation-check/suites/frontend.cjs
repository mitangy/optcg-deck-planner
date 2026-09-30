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
    // deckStats (planner Stats panel)
    { id: "stats-curve-cap-off-by-one", file: "frontend/src/deckStats.ts", from: "Math.min(Math.max(card.cost ?? 0, 0), COST_CURVE_MAX)", to: "Math.min(Math.max(card.cost ?? 0, 0), COST_CURVE_MAX - 1)", kills: ["folds cost 10 and above into the last bucket"] },
    { id: "stats-curve-all-character", file: "frontend/src/deckStats.ts", from: "bucket[card.t] += copies;", to: "bucket.character += copies;", kills: ["stacks the cost curve by type"] },
    { id: "stats-curve-counts-cards-not-copies", file: "frontend/src/deckStats.ts", from: "bucket.total += copies;", to: "bucket.total += 1;", kills: ["stacks the cost curve by type"] },
    { id: "stats-type-count-per-card", file: "frontend/src/deckStats.ts", from: "byType[card.t] += copies;", to: "byType[card.t] += 1;", kills: ["counts copies by card type"] },
    { id: "stats-power-rounds", file: "frontend/src/deckStats.ts", from: "const step = Math.floor(card.pow / 1000) * 1000;", to: "const step = Math.round(card.pow / 1000) * 1000;", kills: ["buckets Character power down to 1000 steps"] },
    { id: "stats-power-skips-gaps", file: "frontend/src/deckStats.ts", from: "for (let p = lo; p <= hi; p += 1000) powerCurve.push({ power: p, count: powers.get(p) ?? 0 });", to: "for (const p of powerKeys.sort((a, b) => a - b)) powerCurve.push({ power: p, count: powers.get(p) ?? 0 });", kills: ["keeps empty steps between"] },
    { id: "stats-counter-avg-skips-zero", file: "frontend/src/deckStats.ts", from: "counter.average = total ? counter.totalCounter / total : 0;", to: "counter.average = total - counter.none ? counter.totalCounter / (total - counter.none) : 0;", kills: ["averages counter over every card"] },
    { id: "stats-counter-split-2000-as-1000", file: "frontend/src/deckStats.ts", from: "else if (ctr === 2000) counter.c2000 += copies;", to: "else if (ctr === 2000) counter.c1000 += copies;", kills: ["averages counter over every card"] },
    { id: "stats-counter-events-per-card", file: "frontend/src/deckStats.ts", from: "counter.events += copies;", to: "counter.events += 1;", kills: ["counts Counter events by copies"] },
    { id: "stats-hand-size-7", file: "frontend/src/deckStats.ts", from: "export const OPENING_HAND = 5;", to: "export const OPENING_HAND = 7;", kills: ["computes the expected opening hand"] },
    { id: "stats-hand-ignores-deck-size", file: "frontend/src/deckStats.ts", from: "const size = Math.min(OPENING_HAND, total);", to: "const size = OPENING_HAND;", kills: ["caps the opening hand at the deck size"] },
    { id: "stats-triggers-per-card", file: "frontend/src/deckStats.ts", from: "if (card.trg) triggers += copies;", to: "if (card.trg) triggers += 1;", kills: ["computes the expected opening hand"] },
    { id: "stats-traits-ascending", file: "frontend/src/deckStats.ts", from: "    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));", to: "    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));", kills: ["ranks traits by copies"] },
    { id: "stats-traits-per-card", file: "frontend/src/deckStats.ts", from: "for (const k of card.tr ?? []) bump(traits, k, copies);", to: "for (const k of card.tr ?? []) bump(traits, k, 1);", kills: ["ranks traits by copies"] },
    { id: "stats-colors-first-only", file: "frontend/src/deckStats.ts", from: "for (const k of card.col) bump(colors, k, copies);", to: "for (const k of card.col.slice(0, 1)) bump(colors, k, copies);", kills: ["ranks traits by copies"] },
    { id: "stats-leader-counted", file: "frontend/src/deckStats.ts", from: "    if (card.t === \"leader\") continue;\n", to: "", kills: ["excludes the Leader from the stats"] },
    { id: "stats-unknown-counted-total", file: "frontend/src/deckStats.ts", from: "      unknown += copies;\n      continue;", to: "      unknown += copies;\n      total += copies;\n      continue;", kills: ["excludes the Leader from the stats and reports ids missing"] },
    { id: "stats-id-not-normalized", file: "frontend/src/deckStats.ts", from: "bump(copiesById, normalizeStatsCardId(c.id), c.copies);", to: "bump(copiesById, c.id, c.copies);", kills: ["maps alt-art ids"] },
    { id: "stats-id-suffix-kept", file: "frontend/src/deckStats.ts", from: "return id.trim().toUpperCase().replace(/_(?:P\\d+|R\\d+)$/, \"\");", to: "return id.trim().toUpperCase();", kills: ["maps alt-art ids"] },
    { id: "stats-off-color-every", file: "frontend/src/deckStats.ts", from: "if (!card.col.some((c) => leader.col.includes(c))) offColorIds.push(id);", to: "if (!card.col.every((c) => leader.col.includes(c))) offColorIds.push(id);", kills: ["flags cards that share no color"] },
    { id: "stats-max-cost-inclusive", file: "frontend/src/deckStats.ts", from: "if (kind === \"max_cost\") return (card.cost ?? 0) > Number(arg);", to: "if (kind === \"max_cost\") return (card.cost ?? 0) >= Number(arg);", kills: ["allowing the exact cost limit"] },
    { id: "stats-events-rule-any-type", file: "frontend/src/deckStats.ts", from: "return card.t === \"event\" && (card.cost ?? 0) >= Number(arg);", to: "return (card.cost ?? 0) >= Number(arg);", kills: ["only applies no_events_cost_ge to Events"] },
    { id: "stats-events-rule-exclusive", file: "frontend/src/deckStats.ts", from: "(card.cost ?? 0) >= Number(arg);\n  if (kind === \"only_trait\")", to: "(card.cost ?? 0) > Number(arg);\n  if (kind === \"only_trait\")", kills: ["only applies no_events_cost_ge to Events"] },
    { id: "stats-only-trait-inverted", file: "frontend/src/deckStats.ts", from: "return !(card.tr ?? []).includes(arg ?? \"\");", to: "return (card.tr ?? []).includes(arg ?? \"\");", kills: ["flags max_cost and only_trait separately"] },
  ],
};
