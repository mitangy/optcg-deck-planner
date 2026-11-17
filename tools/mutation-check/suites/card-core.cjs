/** card-core mutations (packages/card-core/src, vitest): card ids, deck-list parser, TCGPlayer art shared by the apps and packages. */
const id = "packages/card-core/src/cardId.ts";
const list = "packages/card-core/src/decklist.ts";
const art = "packages/card-core/src/tcgArt.ts";
const money = "packages/card-core/src/money.ts";
module.exports = {
  cwd: "packages/card-core",
  runner: "vitest",
  mutations: [
    // normalizeCardId / isCardId
    { id: "normalize-suffix-kept", file: id, from: "return id.trim().toUpperCase().replace(ART_SUFFIX_RE, \"\");", to: "return id.trim().toUpperCase();", kills: ["maps parallel and reprint printing ids to the base card"] },
    { id: "normalize-reprint-suffix-kept", file: id, from: "const ART_SUFFIX_RE = /_(?:P\\d+|R\\d+)$/;", to: "const ART_SUFFIX_RE = /_(?:P\\d+)$/;", kills: ["maps parallel and reprint printing ids to the base card"] },
    { id: "normalize-suffix-anywhere", file: id, from: "const ART_SUFFIX_RE = /_(?:P\\d+|R\\d+)$/;", to: "const ART_SUFFIX_RE = /_(?:P\\d+|R\\d+)/;", kills: ["only drops a trailing art suffix"] },
    { id: "normalize-not-trimmed", file: id, from: "return id.trim().toUpperCase().replace(ART_SUFFIX_RE, \"\");", to: "return id.toUpperCase().replace(ART_SUFFIX_RE, \"\");", kills: ["maps parallel and reprint printing ids to the base card"] },
    { id: "normalize-case-kept", file: id, from: "return id.trim().toUpperCase().replace(ART_SUFFIX_RE, \"\");", to: "return id.trim().replace(ART_SUFFIX_RE, \"\");", kills: ["maps parallel and reprint printing ids to the base card"] },
    { id: "card-id-re-unanchored-end", file: id, from: "export const CARD_ID_RE = /^[A-Z0-9]+-\\d+[A-Z]?$/;", to: "export const CARD_ID_RE = /^[A-Z0-9]+-\\d+[A-Z]?/;", kills: ["rejects text that is not a card number"] },
    { id: "card-id-case-sensitive", file: id, from: "return CARD_ID_RE.test(id.trim().toUpperCase());", to: "return CARD_ID_RE.test(id.trim());", kills: ["accepts printed card numbers whatever their case"] },
    { id: "card-id-not-trimmed", file: id, from: "return CARD_ID_RE.test(id.trim().toUpperCase());", to: "return CARD_ID_RE.test(id.toUpperCase());", kills: ["accepts printed card numbers whatever their case"] },
    // parseDecklist (golden cases shared with backend parse_decklist) and its text helpers
    { id: "parse-trailing-qty", file: list, from: "    if (trailing) {", to: "    if (false && trailing) {", kills: ["reads a count glued to the card number as a count"] },
    { id: "parse-bare-qty", file: list, from: "const TOKEN_RE = /(?:(\\d+)\\s*[xX]?\\s*)?", to: "const TOKEN_RE = /(?:(\\d+)\\s*[xX]\\s*)?", kills: ["Limitless count then name"] },
    { id: "parse-trailing-bare-count", file: list, from: "const bare = rest && !m[1] ? TRAILING_QTY_RE.exec(rest) : null;", to: "const bare = null as RegExpExecArray | null;", kills: ["trailing bare count"] },
    { id: "parse-single-space-codes", file: list, from: "if (bare || !rest || !new RegExp(TOKEN_RE.source, \"i\").test(rest)) {", to: "if (true) {", kills: ["several codes, single spaces"] },
    { id: "parse-comments-kept", file: list, from: "if (!line || line.startsWith(\"#\") || line.startsWith(\"//\")) continue;", to: "if (!line) continue;", kills: ["comment and blank lines are skipped"] },
    { id: "parse-ids-not-uppercased", file: list, from: "      const id = m[2]!.toUpperCase();", to: "      const id = m[2]!;", kills: ["lower case ids are upper-cased"] },
    { id: "parse-repeats-replace", file: list, from: "counts.set(id, (counts.get(id) ?? 0) + qty);\n        continue;", to: "counts.set(id, qty);\n        continue;", kills: ["repeated lines add up"] },
    { id: "decklist-text-no-leader", file: list, from: "  if (leaderId) counts.set(leaderId, 1);", to: "", kills: ["writes the leader first with a count of one"] },
    { id: "decklist-expand-once", file: list, from: "for (let i = 0; i < count; i++) out.push(cardId);", to: "out.push(cardId);", kills: ["repeats each card id once per copy"] },
    // property tests (#1322, decklist.property.test.ts)
    { id: "prop1322-parse-lead-qty-zero-allowed", file: list, from: "        if (!Number.isFinite(qty) || qty < 1) throw new Error(`Bad quantity on ${line}`);\n        counts.set(id, (counts.get(id) ?? 0) + qty);\n        continue;\n      }\n    }", to: "        counts.set(id, (counts.get(id) ?? 0) + qty);\n        continue;\n      }\n    }", kills: ["parseDecklist on arbitrary text returns positive counts on card-number ids or throws a plain Error (#1322)", "a zero count never yields a zero-count line (#1322)"] },
    { id: "prop1322-parse-token-qty-zero-allowed", file: list, from: "if (!Number.isFinite(qty) || qty < 1) throw new Error(`Bad quantity for ${id}`);", to: "", kills: ["parseDecklist on arbitrary text returns positive counts on card-number ids or throws a plain Error (#1322)"] },
    { id: "prop1322-parse-huge-qty-infinite", file: list, from: "      if (!Number.isFinite(qty) || qty < 1) throw new Error(`Bad quantity on ${line}`);\n      counts.set(id, (counts.get(id) ?? 0) + qty);\n      continue;\n    }\n    const m", to: "      if (qty < 1) throw new Error(`Bad quantity on ${line}`);\n      counts.set(id, (counts.get(id) ?? 0) + qty);\n      continue;\n    }\n    const m", kills: ["parseDecklist on arbitrary text returns positive counts on card-number ids or throws a plain Error (#1322)"] },
    { id: "prop1322-parse-id-not-uppercased-trailing", file: list, from: "const id = trailing[1]!.toUpperCase();", to: "const id = trailing[1]!;", kills: ["parseDecklist on arbitrary text returns positive counts on card-number ids or throws a plain Error (#1322)"] },
    { id: "prop1322-text-repeats-replace", file: list, from: "for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);", to: "for (const id of cardIds) counts.set(id, 1);", kills: ["expandDecklist(parseDecklist(toDecklistText(deck))) gives back the same card multiset (#1322)"] },
    { id: "prop1322-text-duplicates-dropped", file: list, from: "  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);", to: "  for (const id of cardIds) if (!counts.has(id)) counts.set(id, 1); else counts.set(id, counts.get(id)!);", kills: ["expandDecklist(parseDecklist(toDecklistText(deck))) gives back the same card multiset (#1322)"] },
    { id: "prop1322-text-count-off-by-one", file: list, from: ".map(([id, n]) => `${n}x${id}`)", to: ".map(([id, n]) => `${Math.max(1, n - 1)}x${id}`)", kills: ["expandDecklist(parseDecklist(toDecklistText(deck))) gives back the same card multiset (#1322)"] },
    { id: "prop1322-parse-repeats-replace-property", file: list, from: "counts.set(id, (counts.get(id) ?? 0) + qty);\n        continue;\n      }\n    }", to: "counts.set(id, qty);\n        continue;\n      }\n    }", kills: ["the same card on several lines adds its counts up (#1322)"] },
    // TCGPlayer art
    { id: "tcg-large-suffix-thumb", file: art, from: "const suffix = size === \"large\" ? \"_in_1000x1000\" : \"_400w\";", to: "const suffix = \"_400w\";", kills: ["builds thumb (_400w) and large (_in_1000x1000) CDN urls"] },
    { id: "tcg-alt-uses-card-product", file: art, from: "imageUrl: tcgProductImageUrl(a.productId, \"thumb\"),", to: "imageUrl: tcgProductImageUrl(hit.productId, \"thumb\"),", kills: ["lists a card's alternate arts with their own product ids and urls"] },
    { id: "tcg-alt-product-id-dropped", file: art, from: "    productId: a.productId,\n  }));", to: "  }));", kills: ["lists a card's alternate arts with their own product ids and urls"] },
    { id: "tcg-art-always-mapped", file: art, from: "return hit ? tcgProductImageUrl(hit.productId, \"thumb\") : undefined;", to: "return tcgProductImageUrl(hit?.productId ?? 0, \"thumb\");", kills: ["gives no art for an unmapped card"] },
    // formatMoney / formatMoneyCompact (#1223)
    { id: "money1223-no-thousands-separator", file: money, from: "return USD.format(n);", to: "return `$${n.toFixed(2)}`;", kills: ["groups thousands with commas and keeps two decimals"] },
    { id: "money1223-whole-no-separator", file: money, from: "return USD_WHOLE.format(n);\n}\n\n/** \"$2K\"", to: "return `$${Math.round(n)}`;\n}\n\n/** \"$2K\"", kills: ["whole dollars also group thousands"] },
    { id: "money1223-compact-old-k", file: money, from: "? USD_COMPACT.format(n) :", to: "? `$${(n / 1000).toFixed(1)}k` :", kills: ["compact reads $2K / $1.2K from a thousand and whole dollars below"] },
  ],
};
