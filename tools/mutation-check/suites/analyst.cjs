/** analyst mutations (analyst/src, vitest): Log Pose connector tools (deck parsing, card search, analysis). */
const decks = "analyst/src/decks.ts";
const search = "analyst/src/search.ts";
const catalog = "analyst/src/catalog.ts";
const analysis = "analyst/src/analysis.ts";
const auth = "analyst/src/auth.ts";
module.exports = {
  cwd: "analyst",
  runner: "vitest",
  mutations: [
    // deck lists
    { id: "deck-glued-count-not-split", file: decks, from: "const line = raw.replace(/^(\\s*\\d+)x(?=[A-Z])/i, \"$1x \");", to: "const line = raw;", kills: ["reads OPTCGSim lists with the count glued"] },
    { id: "deck-trailing-count-ignored", file: decks, from: "const copies = Number(lead?.[1] ?? trail?.[1] ?? 1);", to: "const copies = Number(lead?.[1] ?? 1);", kills: ["counts written after the card number"] },
    { id: "deck-repeats-overwrite", file: decks, from: "copies.set(id, (copies.get(id) ?? 0) + e.copies);", to: "copies.set(id, e.copies);", kills: ["adds up repeated lines"] },
    { id: "deck-last-leader-wins", file: decks, from: "if (!leaderId) leaderId = id;\n      else if", to: "if (true) leaderId = id;\n      else if", kills: ["keeps the first leader"] },
    { id: "deck-export-leader-last", file: decks, from: "const lines = deck.leaderId ? [line(1, deck.leaderId)] : [];\n  for (const c of deck.cards) lines.push(line(c.copies, c.id));", to: "const lines: string[] = [];\n  for (const c of deck.cards) lines.push(line(c.copies, c.id));\n  if (deck.leaderId) lines.push(line(1, deck.leaderId));", kills: ["exports OPTCGSim text with the leader first"] },
    { id: "share-keeps-don-rows", file: decks, from: "const items = (body.items ?? []).filter((i) => !isDon(i));", to: "const items = body.items ?? [];", kills: ["leaves DON!! rows out of a shared planner deck"] },
    // card search
    { id: "search-legal-ignores-color", file: search, from: "if (!c.colors.some((x) => leader.colors.includes(x))) continue;", to: "", kills: ["legalFor drops cards that share no color"] },
    { id: "search-legal-ignores-rules", file: search, from: "if (atlasCard && leaderRules.some((r) => ruleOffends(r, atlasCard))) continue;", to: "", kills: ["legalFor applies the leader's own deck rules"] },
    { id: "search-keywords-any", file: search, from: "!f.keywords.every((k) =>", to: "!f.keywords.some((k) =>", kills: ["needs every listed keyword"] },
    { id: "search-counter-none-not-zero", file: search, from: "!f.counters.includes(c.counter ?? 0)", to: "!f.counters.includes(c.counter as number)", kills: ["treats counter 0 as no printed counter"] },
    { id: "catalog-effects-top-level-only", file: catalog, from: "  for (const v of Object.values(rec)) collectVerbs(v, out);\n", to: "", kills: ["finds effects nested inside conditions"] },
    { id: "catalog-effects-keep-structural", file: catalog, from: "if (typeof rec.do === \"string\" && !STRUCTURAL.has(rec.do)) out.add(rec.do);", to: "if (typeof rec.do === \"string\") out.add(rec.do);", kills: ["finds effects nested inside conditions"] },
    // analysis
    { id: "analysis-legal-without-leader", file: analysis, from: "legal: !hints.some((h) => h.tier === \"rule\") && deck.leaderId !== null,", to: "legal: !hints.some((h) => h.tier === \"rule\"),", kills: ["calls a 50-card deck with a leader legal"] },
    { id: "analysis-hit-ids-case", file: analysis, from: "ids: spec.cardIds.map((id) => id.trim().toUpperCase())", to: "ids: spec.cardIds.map((id) => id.trim())", kills: ["counts hits for lower-case card numbers"] },
    // connector key
    { id: "auth-any-key", file: auth, from: "return a.length === b.length && timingSafeEqual(a, b);", to: "return true;", kills: ["rejects a wrong or missing key"] },
  ],
};
