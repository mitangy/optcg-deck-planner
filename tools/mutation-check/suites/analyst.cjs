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
const chat = "analyst/src/chat.ts";
const sources = "analyst/src/sources.ts";
module.exports = {
  cwd: "analyst",
  runner: "vitest",
  mutations: [
    // deck lists
    { id: "deck-glued-count-not-split", file: decks, from: "const line = raw.replace(/^(\\s*\\d+)x(?=[A-Z])/i, \"$1x \");", to: "const line = raw;", kills: ["reads OPTCGSim lists with the count glued"] },
    { id: "deck-trailing-count-ignored", file: decks, from: "const copies = Number(lead?.[1] ?? trail?.[1] ?? 1);", to: "const copies = Number(lead?.[1] ?? 1);", kills: ["counts written after the card number"] },
    { id: "deck-huge-line-kept", file: decks, from: "    if (e.copies > MAX_LINE_COPIES) {", to: "    if (false) {", kills: ["leaves out a line with a huge copy count"] },
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
    { id: "review-unprojected-events", file: matches, from: "      const events = view === null ? step.events : projectGameEvents(step.events, view);", to: "      const events = step.events;", kills: ["names a taken Life card only for the player who took it"] },
    { id: "review-seat-labels-swapped", file: matches, from: "(${Number(s) === view ? \"you\" : \"opponent\"})", to: "(${Number(s) !== view ? \"you\" : \"opponent\"})", kills: ["names a taken Life card only for the player who took it"] },
    { id: "review-turn-headers-dropped", file: matches, from: "          if (event.phase === \"refresh\") {", to: "          if (false) {", kills: ["reads only the asked turns and cuts long logs"] },
    { id: "review-turns-by-seat-alternation", edits: [
      { file: matches, from: "          if (event.phase === \"refresh\") {", to: "          if (event.activeSeat !== active) {" },
      { file: matches, from: "    if (opening.phase !== \"mulligan\" && turn >= fromTurn && turn <= toTurn) push(header());", to: "    if (turn >= fromTurn && turn <= toTurn) push(header());" },
    ], kills: ["numbers turns like the engine when the mulligan step was played"] },
    { id: "review-opening-hand-before-mulligan", file: matches, from: "      if (step.intent.type === \"mulligan\") openingHands[step.seat] = hand(step.state, step.seat);\n", to: "", kills: ["gives the opening hand after a mulligan redraw"] },
    { id: "review-went-first-for-everyone", file: matches, from: "    wentFirst: replay.firstSeat === seat,", to: "    wentFirst: true,", kills: ["tells the game from the reviewing player's seat"] },
    { id: "review-result-not-from-seat", file: matches, from: "      ? { won: replay.end.winner === seat, reason: replay.end.reason }", to: "      ? { won: true, reason: replay.end.reason }", kills: ["tells the game from the reviewing player's seat"] },
    { id: "review-opening-hand-seat-0", file: matches, from: "    yourOpeningHand: n.openingHands[seat],", to: "    yourOpeningHand: n.openingHands[0],", kills: ["tells the game from the reviewing player's seat"] },
    { id: "review-turn-range-ignored", file: matches, from: "        if (turn < fromTurn || turn > toTurn) continue;\n", to: "", kills: ["reads only the asked turns and cuts long logs"] },
    { id: "review-max-lines-ignored", file: matches, from: "    if (lines.length >= maxLines) truncated = true;\n    else lines.push(line);", to: "    lines.push(line);", kills: ["reads only the asked turns and cuts long logs"] },
    { id: "review-service-secret-not-sent", file: matches, from: "  if (service) headers[\"X-Analyst-Service\"] = api.serviceSecret;\n", to: "", kills: ["asks the planner for a replay with the player's token and the service secret"] },
    { id: "review-unconfigured-still-calls", file: matches, from: "  if (!api.serviceSecret) throw new Error(\"Match review isn't set up on this server (ANALYST_SERVICE_SECRET is unset).\");\n", to: "", kills: ["asks the planner for a replay with the player's token and the service secret"] },
    { id: "token-any-error-means-dead", file: matches, from: "    if (err instanceof PlannerApiError && err.status === 401) return false;", to: "    return false;", kills: ["treats only a 401 as a dead personal link"] },
    // learning loop (#246)
    { id: "stats-names-dropped", file: matches, from: "      if ((k === \"leader\" || k === \"opponent\" || k === \"id\") && typeof v === \"string\") out[`${k}_name`] = cardName(v);\n", to: "", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-top-level-names-only", file: matches, from: "      out[k] = named(v);", to: "      out[k] = v;", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-sends-a-token", file: matches, from: "plannerCall<Record<string, unknown>>(api, null, `/analyst/stats/matchups?${params}`, true)", to: "plannerCall<Record<string, unknown>>(api, \"\", `/analyst/stats/matchups?${params}`, true)", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-unconfigured-still-calls", file: matches, from: "  if (!api.serviceSecret) throw new Error(\"Match stats aren't set up on this server (ANALYST_SERVICE_SECRET is unset).\");\n", to: "", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-leader-not-normalised", file: matches, from: "  if (q.leader) params.set(\"leader\", q.leader.trim().toUpperCase());", to: "  if (q.leader) params.set(\"leader\", q.leader);", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-ranked-only-dropped", file: matches, from: "  if (q.days) params.set(\"days\", String(q.days));\n  if (q.rankedOnly) params.set(\"ranked_only\", \"true\");\n", to: "  if (q.days) params.set(\"days\", String(q.days));\n", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "lesson-sent-as-get", file: matches, from: "    method: method ?? (body === undefined ? \"GET\" : \"POST\"),", to: "    method: method ?? \"GET\",", kills: ["posts a lesson draft as JSON with the player's token"] },
    { id: "lesson-body-dropped", file: matches, from: "  return plannerCall<Record<string, unknown>>(api, token, \"/analyst/lessons\", false, lesson);", to: "  return plannerCall<Record<string, unknown>>(api, token, \"/analyst/lessons\", false, {});", kills: ["posts a lesson draft as JSON with the player's token"] },
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
    // in-app chat, post-game analysis and the game archive
    { id: "archive-replay-hides-cards", file: matches, from: "      const events = view === null ? step.events : projectGameEvents(step.events, view);", to: "      const events = projectGameEvents(step.events, view ?? 0);", kills: ["names every hidden card in an archive replay"] },
    { id: "archive-search-sends-token", file: matches, from: "  const body = await plannerCall<{ total: number; offset: number; window_days: number; games: { A: CorpusSide; B: CorpusSide }[] }>(\n    api,\n    null,", to: "  const body = await plannerCall<{ total: number; offset: number; window_days: number; games: { A: CorpusSide; B: CorpusSide }[] }>(\n    api,\n    \"tok\",", kills: ["searches the archive with the service secret only"] },
    { id: "archive-search-drops-result", file: matches, from: "  if (q.result) params.set(\"result\", q.result);\n", to: "", kills: ["searches the archive with the service secret only"] },
    { id: "chat-cost-cache-reads-at-input-price", file: chat, from: "      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +", to: "      (u.cache_read_input_tokens ?? 0) * PRICE.input +", kills: ["prices calls at the chat model's rates"] },
    { id: "chat-budget-unchecked", file: chat, from: "  if (!budget.allowed) throw new ChatHttpError(429,", to: "  if (false) throw new ChatHttpError(429,", kills: ["turns away a missing token, an expired session and a spent budget"] },
    { id: "chat-any-token-shape", file: chat, from: "  if (!token?.startsWith(\"chat.\")) throw", to: "  if (!token) throw", kills: ["turns away a missing token, an expired session and a spent budget"] },
    { id: "chat-tool-results-not-sent", file: chat, from: "    state.turn.push({ role: \"user\", content: await Promise.all(calls.map((c) => runTool(o.tools, c))) });", to: "    state.turn.push({ role: \"user\", content: [{ type: \"text\", text: \"done\" }] });", kills: ["runs the tools the model asks for"] },
    { id: "chat-usage-last-call-only", file: chat, from: "    state.usage = addUsage(state.usage, reply.usage);", to: "    state.usage = reply.usage;", kills: ["runs the tools the model asks for"] },
    { id: "chat-context-dropped", file: chat, from: "    content: [...(ctx ? [{ type: \"text\", text: ctx }] : []), { type: \"text\", text: body.message }],", to: "    content: [{ type: \"text\", text: body.message }],", kills: ["runs the tools the model asks for"] },
    { id: "chat-breakpoint-stored", file: chat, from: "    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1]!, cache_control: { type: \"ephemeral\" } };\n    out[out.length - 1] = { ...last, content: blocks };", to: "    Object.assign(last.content[last.content.length - 1]!, { cache_control: { type: \"ephemeral\" } });", kills: ["runs the tools the model asks for"] },
    { id: "chat-history-not-resent", file: chat, from: "        messages: withCacheBreakpoint([...(o.history ?? []), ...state.turn]),", to: "        messages: withCacheBreakpoint([...state.turn]),", kills: ["resends an existing thread as stored"] },
    { id: "chat-saves-unfinished-turn", file: chat, from: "    if (finished) await plannerCall(api, token, `/analyst/chat/threads/${threadId}/messages`", to: "    await plannerCall(api, token, `/analyst/chat/threads/${threadId}/messages`", kills: ["doesn't save a turn the model never finished"] },
    { id: "chat-unfinished-cost-dropped", file: chat, from: "    if (usage.input_tokens || usage.output_tokens) await recordUsage(", to: "    if (finished) await recordUsage(", kills: ["doesn't save a turn the model never finished"] },
    { id: "chat-any-origin", file: chat, from: "  return allowed.includes(origin) || /^https:\\/\\/[a-z0-9-]+\\.vercel\\.app$/.test(origin)", to: "  return true || /^https:\\/\\/[a-z0-9-]+\\.vercel\\.app$/.test(origin)", kills: ["lets only the apps' own origins call the chat"] },
    { id: "chat-origin-unanchored", file: chat, from: "/^https:\\/\\/[a-z0-9-]+\\.vercel\\.app$/", to: "/^https:\\/\\/[a-z0-9.-]+/", kills: ["lets only the apps' own origins call the chat"] },
    { id: "review-not-saved", file: chat, from: "  await plannerCall(api, token, `/analyst/reviews/${encodeURIComponent(body.match_id)}`, true, { text: final, citations }, \"PUT\");\n", to: "", kills: ["reviews the game from the player's seat"] },
    { id: "review-usage-kind", file: chat, from: "  await recordUsage(api, token, \"review\", reply.usage, cost)", to: "  await recordUsage(api, token, \"chat\", reply.usage, cost)", kills: ["reviews the game from the player's seat"] },
    // a tool result is only search results; the API refuses a mix with text (#394)
    { id: "src-tool-result-mixed", file: sources, from: "    return [...results.slice(0, MAX_RESULTS), ...(note ? [note] : [])];", to: "    return [...results.slice(0, MAX_RESULTS), ...notes.map((text) => ({ type: \"text\" as const, text }))];", kills: ["sends a tool result made only of search results"] },
    // sources and citations (#390)
    { id: "src-card-source-id", file: sources, from: "searchResult(`card:${c.id}`, `${c.name} (${c.id})`, cardFacts(c))", to: "searchResult(`card:${c.name}`, `${c.name} (${c.id})`, cardFacts(c))", kills: ["gives each card its own card: source"] },
    { id: "src-tool-results-plain", file: chat, from: "content: sources ?? text }", to: "content: text }", kills: ["runs the tools the model asks for"] },
    { id: "src-citations-disabled", file: sources, from: "citations: { enabled: true } };\n}", to: "citations: { enabled: false } };\n}", kills: ["enables citations on every search result"] },
    { id: "src-blank-facts-kept", file: sources, from: "    .map((f) => f.replace(/\\s+/g, \" \").trim())\n    .filter(Boolean)\n", to: "    .map((f) => f.replace(/\\s+/g, \" \").trim())\n", kills: ["drops blank facts"] },
    { id: "src-rule-source-id", file: sources, from: "searchResult(`rule:${s.id}`,", to: "searchResult(`rule:${s.path}`,", kills: ["cites rules by section number"] },
    { id: "src-ruling-numbering", file: sources, from: "searchResult(`ruling:${c.id}#${n + 1}`,", to: "searchResult(`ruling:${c.id}#${n}`,", kills: ["numbers a card's official rulings"] },
    { id: "src-general-qa-source", file: sources, from: "searchResult(`ruling:general#${shortHash(String(q.question))}`,", to: "searchResult(`ruling:general`,", kills: ["cites rules by section number"] },
    { id: "src-record-too-few", file: sources, from: "  if (r.too_few_games) return", to: "  if (false) return", kills: ["writes each win record as one sentence"] },
    { id: "src-stats-matchup-source", file: sources, from: "searchResult(`stats:${v.leader}~${v.opponent}`, title,", to: "searchResult(`stats:${v.opponent}~${v.leader}`, title,", kills: ["puts a matchup under stats"] },
    { id: "src-stats-card-source", file: sources, from: "searchResult(`stats:${v.leader}#${c.id}`,", to: "searchResult(`stats:${v.leader}`,", kills: ["puts a matchup under stats"] },
    { id: "src-playbook-status", file: sources, from: "m?.status === \"draft\" || !m?.status ? \"Draft\" : \"Reviewed\"", to: "\"Reviewed\"", kills: ["titles a playbook note with whether a player reviewed it"] },
    { id: "src-playbook-stale", file: sources, from: "${m?.stale ? \", stale\" : \"\"})`", to: "${\"\"})`", kills: ["titles a playbook note with whether a player reviewed it"] },
    { id: "src-playbook-opponent-side", file: sources, from: "searchResult(`playbook:${om.leader}~${lm.leader}`,", to: "searchResult(`playbook:${lm.leader}~${om.leader}`,", kills: ["titles a playbook note with whether a player reviewed it"] },
    { id: "src-playbook-general", file: sources, from: "searchResult(\"playbook:general\", \"General playbook principles\", Object.entries(v.general as Record<string, string>).flatMap(([h, t]) => noteFacts(h, t))) : null;", to: "null : null;", kills: ["makes the playbook's general principles a playbook:general source"] },
    { id: "src-lesson-source", file: sources, from: "searchResult(`lesson:${l.id}`,", to: "searchResult(`lesson:${l.status}`,", kills: ["gives a saved lesson its own lesson: source"] },
    { id: "src-turn-numbers-shifted", file: sources, from: "groups.push({ turn: Number(m[1]), who: m[2]!, lines: [] });", to: "groups.push({ turn: Number(m[1]) + 1, who: m[2]!, lines: [] });", kills: ["cuts a game into one source per turn"] },
    { id: "src-game-prefix", file: sources, from: "const results = gameResults(\"game\", String(v.gameId), v);", to: "const results = gameResults(\"match\", String(v.gameId), v);", kills: ["cuts a game into one source per turn"] },
    { id: "src-search-matches-source", file: sources, from: "searchResult(`game:${g.game_id}`,", to: "searchResult(`match:${g.game_id}`,", kills: ["lists archive search hits as game:<id> sources"] },
    { id: "src-deck-hash-order", file: sources, from: "const body = [leaderId ?? \"\", ...cards.map((c) => `${c.id}x${c.copies}`).sort()].join(\"|\");", to: "const body = [leaderId ?? \"\", ...cards.map((c) => `${c.id}x${c.copies}`)].join(\"|\");", kills: ["gives the same deck the same deck: source"] },
    { id: "src-deck-hash-copies", file: sources, from: "cards.map((c) => `${c.id}x${c.copies}`).sort()", to: "cards.map((c) => `${c.id}`).sort()", kills: ["gives the same deck the same deck: source"] },
    { id: "src-deck-hash-leader", file: sources, from: "const body = [leaderId ?? \"\", ...", to: "const body = [...", kills: ["gives the same deck the same deck: source"] },
    { id: "src-deck-ban-problems", file: sources, from: "    ...bans.map((p) => `Ban list: ${p.problem}`),\n", to: "", kills: ["states a deck check's legality, ban list problems"] },
    { id: "src-odds-order", file: sources, from: "${v.goingFirst ? \"f\" : \"s\"}${v.mulligan ? \"m\" : \"\"}`", to: "f${v.mulligan ? \"m\" : \"\"}`", kills: ["makes draw odds one odds: source"] },
    { id: "src-split-sentences", file: sources, from: "export function splitFacts(text: string, long = 200)", to: "export function splitFacts(text: string, long = 100000)", kills: ["splits a long paragraph into sentences"] },
    { id: "src-split-bullets", file: sources, from: ".replace(/^\\s*[-*]\\s+/, \"\")", to: "", kills: ["splits a long paragraph into sentences"] },
    { id: "cite-flush-missing-at-end", file: chat, from: "    out.flush();\n    state.usage = addUsage(state.usage, reply.usage);", to: "    state.usage = addUsage(state.usage, reply.usage);", kills: ["sends a cite event after the cited text"] },
    { id: "cite-after-next-text", file: chat, from: "      flush();\n      onDelta?.(delta);\n      emit({ event: \"text\", data: { delta } });", to: "      onDelta?.(delta);\n      emit({ event: \"text\", data: { delta } });\n      flush();", kills: ["sends a cite event after the cited text"] },
    { id: "cite-not-batched", file: chat, from: "    onCite: (c: Citation) => void pending.push(c),", to: "    onCite: (c: Citation) => emit({ event: \"cite\", data: { citations: [c] } }),", kills: ["sends a cite event after the cited text"] },
    { id: "cite-any-kind", file: chat, from: "if (c.type !== \"search_result_location\" || typeof c.source", to: "if (typeof c.source", kills: ["keeps only search-result citations"] },
    { id: "cite-quote-uncapped", file: chat, from: "cited.length > MAX_CITED_TEXT ?", to: "false ?", kills: ["keeps only search-result citations"] },
    { id: "cite-offset-block-start", file: chat, from: "placed.push({ at: text.length, ...c });", to: "placed.push({ at: text.length - String(b.text).length, ...c });", kills: ["places each block's citations at the end"] },
    { id: "cite-offset-trim-unshifted", file: chat, from: "({ ...c, at: Math.min(Math.max(c.at - lead, 0), trimmed.length) })", to: "({ ...c, at: Math.min(Math.max(c.at, 0), trimmed.length) })", kills: ["places each block's citations at the end"] },
    { id: "cite-duplicate-kept", file: chat, from: "      if (!c || seen.has(key!)) continue;", to: "      if (!c) continue;", kills: ["places each block's citations at the end"] },
    { id: "cite-rounds-run-together", file: chat, from: "out.onText(breakPending ? `\\n\\n${delta}` : delta);", to: "out.onText(delta);", kills: ["keeps rounds apart by a blank line"] },
    { id: "cite-stored-without-citations", file: chat, from: "    state.turn.push({ role: \"assistant\", content: reply.content });", to: "    state.turn.push({ role: \"assistant\", content: reply.content.map(({ citations: _c, ...b }) => b) });", kills: ["keeps rounds apart by a blank line"] },
    { id: "cite-stream-not-wired", file: chat, from: "    stream.on(\"citation\", (citation) => {\n      const c = toCitation(citation);\n      if (c) onCite?.(c);\n    });\n", to: "", kills: ["passes the Claude stream's text and search-result citations on"] },
    { id: "review-turns-not-sources", file: chat, from: "            ...gameResults(\"match\", game.matchId, game),\n", to: "", kills: ["sends the game to the review as one search result per turn"] },
    { id: "review-citations-not-saved", file: chat, from: "{ text: final, citations }", to: "{ text: final, citations: [] }", kills: ["sends the game to the review as one search result per turn"] },
    { id: "playbook-stale-never", file: playbook, from: "    stale: Number.isFinite(written) && Number.isFinite(current) && written < current,", to: "    stale: false,", kills: ["flags notes older than the current set"] },
    { id: "playbook-newest-counts-previews", file: playbook, from: "  const newest = Math.max(0, ...[...counts].filter(([, c]) => c >= minCards).map(([n]) => n));", to: "  const newest = Math.max(0, ...[...counts].map(([n]) => n));", kills: ["takes the newest booster with a full card list"] },
    { id: "playbook-matchups-by-heading-text", file: playbook, from: "      if (id) matchups[id] = { heading: subHeading,", to: "      if (id) matchups[subHeading] = { heading: subHeading,", kills: ["reads front matter, sections and matchups"] },
    // matchup briefs (#401)
    { id: "brief-cache-skipped", file: chat, from: "  if (found.brief) {\n    replayCited(", to: "  if (false && found.brief) {\n    replayCited(", kills: ["serves a cached brief without calling the model, even over the daily cap (#401)"] },
    { id: "brief-cache-needs-budget", file: chat, from: "  const variant = briefVariant(deps.catalog);\n  let found: BriefLookup;", to: "  const variant = briefVariant(deps.catalog);\n  await checkBudget(api, token);\n  let found: BriefLookup;", kills: ["serves a cached brief without calling the model, even over the daily cap (#401)"] },
    { id: "brief-replay-cites-at-end", edits: [
      { file: chat, from: "    if (at > sent) emit({ event: \"text\", data: { delta: text.slice(sent, at) } });\n    sent = Math.max(sent, at);\n", to: "" },
    ], kills: ["replays a cached brief's citations at the offsets they were saved at (#401)"] },
    { id: "brief-peek-generates", file: chat, from: "  if (!body.generate) {", to: "  if (false) {", kills: ["a peek with nothing cached calls no model and records no spend (#401)"] },
    { id: "brief-refusal-ignored", file: chat, from: "      throw new ChatHttpError(400, \"Matchup briefs are only for casual and practice games.\", \"bad_request\");\n    }\n    throw err;\n  }", to: "      found = { leader_id: \"OP01-001\", opponent_id: \"ST01-001\", deck: [], key: \"\", brief: null };\n    } else {\n      throw err;\n    }\n  }", kills: ["a ticket the planner refuses never reaches the model (#401)"] },
    { id: "brief-no-budget-check", file: chat, from: "  await checkBudget(api, token);\n\n  const tools", to: "\n  const tools", kills: ["an empty budget stops a brief that has to be written, after the lookup (#401)"] },
    // Layers of one rule (a brief is cached for everyone, so it can't use personal tools): no personal context, the name filter, and the non-personal prompt.
    { id: "brief-personal-tools", edits: [
      { file: chat, from: "buildTools(deps.catalog, undefined, undefined, deps.knowledge).filter((t) => BRIEF_TOOLS.includes(t.name))", to: "buildTools(deps.catalog, undefined, { api, token }, deps.knowledge)" },
    ], kills: ["writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)"] },
    { id: "brief-tools-unfiltered", file: chat, from: ".filter((t) => BRIEF_TOOLS.includes(t.name));", to: ";", kills: ["writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)"] },
    { id: "brief-personal-prompt", file: chat, from: "instructionsFor(false) + BRIEF_INSTRUCTIONS", to: "instructionsFor(true) + BRIEF_INSTRUCTIONS", kills: ["writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)"] },
    { id: "brief-deck-left-out", file: chat, from: "    ...deckLines,\n", to: "", kills: ["writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)"] },
    { id: "brief-not-saved", file: chat, from: "  await plannerCall(api, token, \"/analyst/briefs\", true, { ticket: body.ticket, variant, text: cited.text, citations: cited.citations }, \"PUT\");\n", to: "", kills: ["writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)"] },
    { id: "brief-usage-as-chat", file: chat, from: "recordUsage(api, token, \"brief\", state.usage", to: "recordUsage(api, token, \"chat\", state.usage", kills: ["writes the brief from both leaders and the player's deck with only shared tools, then saves it and records brief spend (#401)"] },
    { id: "brief-variant-fixed", file: chat, from: "  return `v1:${newestFormat(catalog.cards.keys())}`;", to: "  return \"v1\";", kills: ["the cache variant follows the newest set (#401)"] },
  ],
};
