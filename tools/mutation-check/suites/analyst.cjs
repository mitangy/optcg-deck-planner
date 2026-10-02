/** analyst mutations (analyst/src, vitest): Log Pose connector tools (deck parsing, card search, analysis, official rules, playbook). */
const decks = "analyst/src/decks.ts";
const search = "analyst/src/search.ts";
const catalog = "analyst/src/catalog.ts";
const analysis = "analyst/src/analysis.ts";
const auth = "analyst/src/auth.ts";
const matches = "analyst/src/matches.ts";
const rules = "analyst/src/official/rules.ts";
const qa = "analyst/src/official/qa.ts";
const banlist = "analyst/src/official/banlist.ts";
const errata = "analyst/src/official/errata.ts";
const library = "analyst/src/official/library.ts";
const knowledge = "analyst/src/knowledge.ts";
const playbook = "analyst/src/playbook.ts";
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
    // learning loop (#246)
    { id: "stats-names-dropped", file: matches, from: "      if ((k === \"leader\" || k === \"opponent\" || k === \"id\") && typeof v === \"string\") out[`${k}_name`] = cardName(v);\n", to: "", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-top-level-names-only", file: matches, from: "      out[k] = named(v);", to: "      out[k] = v;", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-sends-a-token", file: matches, from: "getJson<Record<string, unknown>>(api, null, `/analyst/stats/matchups?${params}`, true)", to: "getJson<Record<string, unknown>>(api, \"\", `/analyst/stats/matchups?${params}`, true)", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-unconfigured-still-calls", file: matches, from: "  if (!api.serviceSecret) throw new Error(\"Match stats aren't set up on this server (ANALYST_SERVICE_SECRET is unset).\");\n", to: "", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-leader-not-normalised", file: matches, from: "  if (q.leader) params.set(\"leader\", q.leader.trim().toUpperCase());", to: "  if (q.leader) params.set(\"leader\", q.leader);", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-ranked-only-dropped", file: matches, from: "  if (q.rankedOnly) params.set(\"ranked_only\", \"true\");\n", to: "", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "lesson-sent-as-get", file: matches, from: "    method: body === undefined ? \"GET\" : \"POST\",", to: "    method: \"GET\",", kills: ["posts a lesson draft as JSON with the player's token"] },
    { id: "lesson-body-dropped", file: matches, from: "  return getJson<Record<string, unknown>>(api, token, \"/analyst/lessons\", false, lesson);", to: "  return getJson<Record<string, unknown>>(api, token, \"/analyst/lessons\", false, {});", kills: ["posts a lesson draft as JSON with the player's token"] },
    { id: "lessons-leader-ignored", file: matches, from: "  if (leader) params.set(\"leader\", leader.trim().toUpperCase());\n  return (await", to: "  return (await", kills: ["asks for lessons by status and leader"] },
    { id: "lessons-status-ignored", file: matches, from: "  const params = new URLSearchParams({ status });", to: "  const params = new URLSearchParams({ status: \"approved\" });", kills: ["asks for lessons by status and leader"] },
    // official rules material (#246)
    { id: "rules-any-numbered-line-opens-chapter", file: rules, from: " : Number(id) === chapter + 1 && /^[A-Z][^.]{0,60}$/.test(m[2]!.trim());", to: " : Number(id) === chapter + 1;", kills: ["keeps wrapped lines in their section"] },
    { id: "rules-page-numbers-kept", file: rules, from: "if (!line || PAGE_NUMBER.test(line) || /\\.{5,}/.test(line)) continue;", to: "if (!line || /\\.{5,}/.test(line)) continue;", kills: ["keeps wrapped lines in their section"] },
    { id: "rules-no-heading-boost", file: rules, from: "      if (text.replace(/[[\\]]/g, \"\").trim() === phrase.replace(/[[\\]]/g, \"\")) score += terms.length + 1;\n", to: "", kills: ["ranks the heading that names a keyword"] },
    { id: "qa-labels-not-shifted", file: qa, from: "    for (const it of labels) rowAt(it.y, line).label.push(it);", to: "    for (const it of labels) rowAt(it.y).label.push(it);", kills: ["matches each question and answer to its card"] },
    { id: "qa-answers-to-row-below", file: qa, from: "      for (let n = rows.length - 1; n >= 0; n--) if (y <= rows[n]!.top + shift + 2) return rows[n]!;", to: "      for (let n = 0; n < rows.length; n++) if (y >= rows[n]!.top - shift - 2) return rows[n]!;", kills: ["matches each question and answer to its card"] },
    { id: "qa-page-break-row-split", file: qa, from: "        if (n === 0 && prev) {", to: "        if (false) {", kills: ["joins a row that runs over a page break"] },
    { id: "qa-set-range-st01-st04", file: qa, from: "    const part = raw.replace(/^(op|eb|st|prb)(-?\\d+)-\\1-?(\\d+)$/i, \"$1$2-$3\");", to: "    const part = raw;", kills: ["reads which sets each FAQ file covers"] },
    { id: "ban-upcoming-never-applies", file: banlist, from: "  for (const change of list.upcoming.filter((u) => u.effective <= today)) {", to: "  for (const change of list.upcoming.filter((u) => false)) {", kills: ["keeps announced bans upcoming until their date"] },
    { id: "ban-upcoming-applies-early", file: banlist, from: "  for (const change of list.upcoming.filter((u) => u.effective <= today)) {", to: "  for (const change of list.upcoming) {", kills: ["keeps announced bans upcoming until their date"] },
    { id: "ban-pairs-merged", file: banlist, from: "if (category === \"pair\" && b.tag === \"ul\" && found.length === 2) list.bannedPairs.push([found[0]!, found[1]!]);", to: "if (category === \"pair\") list.banned.push(...found);", kills: ["reads each banned pair from its own list"] },
    { id: "ban-restricted-one-copy-flagged", file: banlist, from: "if ((copies.get(id) ?? 0) > 1) problems.push", to: "if ((copies.get(id) ?? 0) >= 1) problems.push", kills: ["flags banned cards, a second restricted copy"] },
    { id: "ban-pair-one-half-flagged", file: banlist, from: "if (copies.has(a) && copies.has(b)) problems.push", to: "if (copies.has(a) || copies.has(b)) problems.push", kills: ["flags banned cards, a second restricted copy"] },
    { id: "errata-heading-date-ignored", file: errata, from: "date: ownDate ?? date,", to: "date,", kills: ["takes the date from the card heading"] },
    { id: "errata-alt-art-repeats", file: errata, from: "if (!after || out.some((e) => e.cardId === id[1] && e.after === after)) continue;", to: "if (!after) continue;", kills: ["skips alt-art repeats"] },
    { id: "library-no-stale-fallback", file: library, from: "          if (slot.value !== undefined) return slot.value;\n", to: "", kills: ["serves the last good copy when a refresh fails"] },
    { id: "library-never-refreshes", file: library, from: "const fresh = slot.value !== undefined && this.now().getTime() - slot.at < this.ttlMs;", to: "const fresh = slot.value !== undefined;", kills: ["serves the last good copy when a refresh fails"] },
    { id: "rulings-upcoming-ban-hidden", file: knowledge, from: "  const soon = list.upcoming.find((u) => u.banned.includes(id) || u.restricted.includes(id));", to: "  const soon = undefined as BanList[\"upcoming\"][number] | undefined;", kills: ["ban status including announced bans"] },
    { id: "rulings-mentions-include-own", file: knowledge, from: "faq?.entries.filter((e) => e.cardId !== id && `${e.question} ${e.answer}`.includes(id))", to: "faq?.entries.filter((e) => `${e.cardId} ${e.question} ${e.answer}`.includes(id))", kills: ["rulings that mention it"] },
    { id: "deck-ban-upcoming-dropped", file: knowledge, from: "    const next: BanList = { ...list, banned: [...list.banned, ...u.banned],", to: "    const next: BanList = { ...list, banned: [...list.banned],", kills: ["lists ban problems now and the ones an announced change will add"] },
    { id: "playbook-opponent-side-wrong-key", file: playbook, from: "      fromOpponentSide: leader ? (opponentNote?.matchups[leader] ?? null) : null,", to: "      fromOpponentSide: opponentNote?.matchups[opponent!] ?? null,", kills: ["gives both sides of a matchup"] },
    { id: "playbook-stale-never", file: playbook, from: "    stale: Number.isFinite(written) && Number.isFinite(current) && written < current,", to: "    stale: false,", kills: ["flags notes older than the current set"] },
    { id: "playbook-newest-counts-previews", file: playbook, from: "  const newest = Math.max(0, ...[...counts].filter(([, c]) => c >= minCards).map(([n]) => n));", to: "  const newest = Math.max(0, ...[...counts].map(([n]) => n));", kills: ["takes the newest booster with a full card list"] },
    { id: "playbook-matchups-by-heading-text", file: playbook, from: "      if (id) matchups[id] = { heading: subHeading,", to: "      if (id) matchups[subHeading] = { heading: subHeading,", kills: ["reads front matter, sections and matchups"] },
  ],
};
