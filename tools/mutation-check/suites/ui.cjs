/** ui mutations (packages/ui/src, vitest): card art urls and preview art shared by the planner and duel-web (#700), and the Headless UI Dialog / Menu wrappers (#708). */
const img = "packages/ui/src/cardArt/cardImage.ts";
const prev = "packages/ui/src/cardArt/previewArt.ts";
const dlg = "packages/ui/src/popups/Dialog.tsx";
const menu = "packages/ui/src/popups/Menu.tsx";
module.exports = {
  cwd: "packages/ui",
  runner: "vitest",
  mutations: [
    // size rewrite
    { id: "card-image-not-rewritten", file: img, from: "  return `${match[1]}${SIZE_SUFFIX[size]}${match[2]}`;", to: "  return trimmed;", kills: ["rewrites TCGCSV _200w thumbs", "converts already-sized CDN URLs"] },
    { id: "art-no-local-mirror", file: img, from: "  if (isTcgplayerCdnUrl(failed)) {\n    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);\n  }\n", to: "", kills: ["tries the local mirror once after the CDN fails, then gives up for the text fallback (#262)"] },
    { id: "art-no-preview-fallback", file: img, from: "  if (isTcgplayerCdnUrl(failed)) {\n    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);\n  }", to: "  if (isTcgplayerCdnUrl(failed)) return localCardArtPath(defId);", kills: ["EB05 cards fall back to preview art when TCGPlayer art fails (#575)"] },
    { id: "art-local-failure-skips-preview", file: img, from: "  if (isLocalCardsUrl(failed)) return previewArtPath(defId);\n", to: "", kills: ["OP18 card whose local /cards art fails falls back to its preview, once (#575)"] },
    { id: "art-preview-failure-retries", file: img, from: "  if (isPreviewArtPath(failed)) return null;\n", to: "", kills: ["OP18 card whose local /cards art fails falls back to its preview, once (#575)"] },
    { id: "art-retries-forever", file: img, from: "  if (isPreviewArtPath(failed)) return null;\n  if (isTcgplayerCdnUrl(failed)) {\n    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);\n  }\n  if (isLocalCardsUrl(failed)) return previewArtPath(defId);\n  return null;", to: "  return localCardArtPath(defId);", kills: ["tries the local mirror once after the CDN fails, then gives up for the text fallback (#262)"] },
    { id: "art-alt-preview-skipped", file: img, from: "    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);", to: "    return previewArtPath(defId) ?? localCardArtPath(defId);", kills: ["a failed alt printing shows its own preview, not the card's (#581)"] },
    { id: "art-alt-preview-card-wins", file: img, from: "    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);", to: "    return previewArtPath(defId) ?? altPreviewArtPath(failed) ?? localCardArtPath(defId);", kills: ["a failed alt printing shows its own preview, not the card's (#581)"] },
    { id: "art-alt-preview-1000px-unparsed", file: prev, from: "const PRODUCT_ID_IN_CDN_URL = /product\\/(\\d+)_/;", to: "const PRODUCT_ID_IN_CDN_URL = /product\\/(\\d+)_400w/;", kills: ["a failed alt printing shows its own preview, not the card's (#581)"] },
    { id: "placeholder-art-portrait", file: img, from: "naturalWidth > 0 && naturalWidth > naturalHeight", to: "naturalWidth > 0 && naturalWidth < naturalHeight", kills: ["a landscape picture from the CDN is the Image Coming Soon placeholder (#276)"] },
    { id: "placeholder-art-any-source", file: img, from: "return isTcgplayerCdnUrl(src) && naturalWidth > 0", to: "return naturalWidth > 0", kills: ["only judges CDN pictures that have loaded (#276)"] },
    { id: "card-image-only-200w", file: img, from: "\\/product\\/\\d+)(?:_[^./]+)?", to: "\\/product\\/\\d+)(?:_200w)?", kills: ["converts already-sized CDN URLs"] },
    { id: "card-image-foreign-dropped", file: img, from: "  if (!match) return trimmed;", to: "  if (!match) return \"\";", kills: ["leaves non-TCGplayer URLs and empty values alone"] },
    { id: "card-image-undefined-passthrough", file: img, from: "  if (!src) return \"\";", to: "  if (!src) return String(src);", kills: ["leaves non-TCGplayer URLs and empty values alone"] },
    { id: "preview-card-id-never", file: prev, from: "return PREVIEW_IDS.has(id) ?", to: "return false ?", kills: ["uses the card-id preview for a new card (#613)"] },
    { id: "preview-any-card", file: prev, from: "return PREVIEW_IDS.has(id) ?", to: "return id ?", kills: ["has no preview for a card with real art (#613)"] },
    { id: "art-chain-skips-original", file: img, from: "  if (original && !chain.includes(original)) chain.push(original);", to: "", kills: ["tries the resized art, the original, then the preview (#613)", "ends at the original when there is no preview (#613)"] },
    { id: "art-chain-repeats-original", file: img, from: "if (original && !chain.includes(original))", to: "if (original)", kills: ["does not repeat a URL that is not resized (#613)"] },
    { id: "art-chain-no-preview", file: img, from: "  if (preview) chain.push(preview);", to: "", kills: ["tries the resized art, the original, then the preview (#613)", "shows the preview when the card has no image URL (#613)"] },
    // previewArtUrl: alt printing first, then the card id; origin only prefixes
    { id: "preview-alt-ignored", file: prev, from: "(imageUrl ? altPreviewArtPath(imageUrl, origin) : null) ??", to: "null ??", kills: ["prefers the alt-printing preview over the card-id preview (#613)", "uses the alt preview even when the card id has none (#613)"] },
    { id: "preview-card-id-wins-over-alt", file: prev, from: "    (imageUrl ? altPreviewArtPath(imageUrl, origin) : null) ??\n    previewArtPath(cardId ?? \"\", origin)", to: "    previewArtPath(cardId ?? \"\", origin) ??\n    (imageUrl ? altPreviewArtPath(imageUrl, origin) : null)", kills: ["prefers the alt-printing preview over the card-id preview (#613)"] },
    { id: "preview-card-id-not-normalized", file: prev, from: "const id = defId.trim().toUpperCase();", to: "const id = defId;", kills: ["uses the card-id preview for a new card (#613)"] },
    { id: "preview-origin-dropped-alt", file: prev, from: "`${origin}/cards/preview/p${pid}.webp`", to: "`/cards/preview/p${pid}.webp`", kills: ["prefers the alt-printing preview over the card-id preview (#613)"] },
    { id: "preview-origin-dropped-card", file: prev, from: "`${origin}/cards/preview/${id}.webp`", to: "`/cards/preview/${id}.webp`", kills: ["uses the card-id preview for a new card (#613)"] },
    { id: "preview-url-default-origin-absolute", file: prev, from: "  imageUrl?: string | null,\n  origin = \"\",", to: "  imageUrl?: string | null,\n  origin = \"https://duel.example.test\",", kills: ["builds relative paths when no origin is given (#700)"] },
    { id: "preview-path-default-origin-absolute", file: prev, from: "export function previewArtPath(defId: string, origin = \"\")", to: "export function previewArtPath(defId: string, origin = \"https://duel.example.test\")", kills: ["EB05 cards fall back to preview art when TCGPlayer art fails (#575)"] },
    { id: "art-chain-origin-dropped", file: img, from: "previewArtUrl(cardId, src, origin)", to: "previewArtUrl(cardId, src)", kills: ["tries the resized art, the original, then the preview (#613)"] },
    { id: "art-chain-preview-first", file: img, from: "  const resized = cardImageUrl(src, size);\n  if (resized) chain.push(resized);", to: "  const preview0 = previewArtUrl(cardId, src, origin);\n  if (preview0) chain.push(preview0);\n  const resized = cardImageUrl(src, size);\n  if (resized) chain.push(resized);", kills: ["tries the resized art, the original, then the preview (#613)"] },
    // popups: Dialog and Menu wrappers (#708)
    { id: "dialog-onclose-dropped", file: dlg, from: "open={open} onClose={close}", to: "open={open} onClose={() => {}}", kills: ["a click outside the panel closes it", "moves focus into the dialog on open and back to the trigger"] },
    { id: "dialog-no-panel", edits: [{ file: dlg, from: "<DialogPanel ref", to: "<div ref" }, { file: dlg, from: "</DialogPanel>", to: "</div>" }], kills: ["a click outside the panel closes it, a click inside does not"] },
    { id: "dialog-backdrop-class-dropped", file: dlg, from: "className={`ui-dialog ${className ?? \"\"}`.trim()}", to: "className=\"ui-dialog\"", kills: ["opens as a named modal on the backdrop class"] },
    { id: "dialog-label-dropped", file: dlg, from: " aria-label={label}>", to: ">", kills: ["opens as a named modal on the backdrop class"] },
    { id: "menu-list-in-flow", file: menu, from: "      anchor={anchor}\n", to: "", kills: ["opens from the keyboard in a portal"] },
    { id: "menu-list-always-open", file: menu, from: "<MenuItems\n      anchor={anchor}", to: "<MenuItems\n      static\n      anchor={anchor}", kills: ["Escape closes it and focus returns to the button", "arrow keys move through the items and Enter picks one"] },
    // MenuItem keepOpen and the Enter / Space capture in MenuList (#715)
    {"id": "menu-keep-open-click-closes", "file": "packages/ui/src/popups/Menu.tsx", "from": "          onClick?.(e);\n          e.preventDefault();\n", "to": "          onClick?.(e);\n", "kills": ["a click picks a keepOpen item and leaves the menu open; a plain item closes it (#715)", "Enter on a keepOpen item picks it once and leaves the menu open (#715)"]},
    {"id": "menu-keep-open-enter-closes", "file": "packages/ui/src/popups/Menu.tsx", "from": "if (item?.hasAttribute(\"data-keep-open\") && !item.hasAttribute(\"data-disabled\")) {", "to": "if (false as boolean) {", "kills": ["Enter on a keepOpen item picks it once and leaves the menu open (#715)"]},
  ],
};
