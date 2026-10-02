/** analyst mutations (analyst/src, vitest): Log Pose connector tools (deck parsing, card search, analysis). */
const decks = "analyst/src/decks.ts";
const search = "analyst/src/search.ts";
const catalog = "analyst/src/catalog.ts";
const analysis = "analyst/src/analysis.ts";
const auth = "analyst/src/auth.ts";
const matches = "analyst/src/matches.ts";
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
    // match review (personal link)
    { id: "review-unprojected-events", file: matches, from: "      for (const event of projectGameEvents(step.events, seat)) {", to: "      for (const event of step.events) {", kills: ["names a taken Life card only for the player who took it"] },
    { id: "review-seat-labels-swapped", file: matches, from: "  const who = (s: string) => (Number(s) === seat ? \"you\" : \"opponent\");", to: "  const who = (s: string) => (Number(s) !== seat ? \"you\" : \"opponent\");", kills: ["names a taken Life card only for the player who took it"] },
    { id: "review-turn-headers-dropped", file: matches, from: "          if (event.activeSeat !== active) {", to: "          if (false) {", kills: ["reads only the asked turns and cuts long logs"] },
    { id: "review-went-first-for-everyone", file: matches, from: "    wentFirst: replay.firstSeat === seat,", to: "    wentFirst: true,", kills: ["tells the game from the reviewing player's seat"] },
    { id: "review-result-not-from-seat", file: matches, from: "      ? { won: replay.end.winner === seat, reason: replay.end.reason }", to: "      ? { won: true, reason: replay.end.reason }", kills: ["tells the game from the reviewing player's seat"] },
    { id: "review-opening-hand-seat-0", file: matches, from: "    yourOpeningHand: opening.players[seat].hand", to: "    yourOpeningHand: opening.players[0].hand", kills: ["tells the game from the reviewing player's seat"] },
    { id: "review-turn-range-ignored", file: matches, from: "        if (turn < fromTurn || turn > toTurn) continue;\n", to: "", kills: ["reads only the asked turns and cuts long logs"] },
    { id: "review-max-lines-ignored", file: matches, from: "    if (lines.length >= maxLines) truncated = true;\n    else lines.push(line);", to: "    lines.push(line);", kills: ["reads only the asked turns and cuts long logs"] },
    { id: "review-service-secret-not-sent", file: matches, from: "  if (service) headers[\"X-Analyst-Service\"] = api.serviceSecret;\n", to: "", kills: ["asks the planner for a replay with the player's token and the service secret"] },
    { id: "review-unconfigured-still-calls", file: matches, from: "  if (!api.serviceSecret) throw new Error(\"Match review isn't set up on this server (ANALYST_SERVICE_SECRET is unset).\");\n", to: "", kills: ["asks the planner for a replay with the player's token and the service secret"] },
    { id: "token-any-error-means-dead", file: matches, from: "    if (err instanceof PlannerApiError && err.status === 401) return false;", to: "    return false;", kills: ["treats only a 401 as a dead personal link"] },
  ],
};
