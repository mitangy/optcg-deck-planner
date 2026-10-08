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
const proposals = "analyst/src/proposals.ts";
const copilot = "analyst/src/copilot.ts";
// Log Pose eval (analyst/evals). Tests are named "eval gold B01 ..." etc., so a mutation's `kills` are fragments of those names.
const ABILITIES = "packages/rules/src/cards/generated/abilities.json";
const ev = (f) => `analyst/evals/${f}`;
const evFaq = ev("faq.ts");
const evGrounding = ev("grade/grounding.ts");
const evCitations = ev("grade/citations.ts");
const evExact = ev("grade/exact.ts");
const evExtract = ev("grade/extract.ts");
const evEdits = ev("grade/edits.ts");
const evOverlap = ev("grade/overlap.ts");
const evStats = ev("stats.ts");
const evLoad = ev("load.ts");
const evPlanner = ev("planner.ts");
const evRunner = ev("runner.ts");
const evGrade = ev("grade.ts");
const evJudge = ev("grade/judge.ts");
const evSelftest = ev("selftest.ts");
const drawOdds = "packages/deck-analytics/src/drawOdds.ts";
const deckHints = "packages/deck-analytics/src/deckHints.ts";
const deckStats = "packages/deck-analytics/src/deckStats.ts";
/** Eval group B: alter one card's generated abilities so the engine plays the case's board differently; `kills` are test-name fragments. */
const evalScn = (id, card, patch, kills) => ({ id: `eval-${id}`, json: ABILITIES, patch: (a) => patch(a[card].abilities), kills });

const sim = "analyst/src/simulate.ts";
const server = "analyst/src/server.ts";
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
    { id: "stats-names-dropped", file: matches, from: "    if ((k === \"leader\" || k === \"opponent\" || k === \"id\") && typeof v === \"string\") out[`${k}_name`] = cardName(v);\n", to: "", kills: ["reads matchup stats with the service secret only and names every card", "reads tournament stats with the service secret only and names leaders and cards"] },
    { id: "stats-top-level-names-only", file: matches, from: "    out[k] = skip.includes(k) ? v : withCardNames(v, skip);", to: "    out[k] = v;", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-sends-a-token", file: matches, from: "plannerCall<Record<string, unknown>>(api, null, `/analyst/stats/matchups?${params}`, true)", to: "plannerCall<Record<string, unknown>>(api, \"\", `/analyst/stats/matchups?${params}`, true)", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-unconfigured-still-calls", file: matches, from: "  if (!api.serviceSecret) throw new Error(\"Match stats aren't set up on this server (ANALYST_SERVICE_SECRET is unset).\");\n", to: "", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-leader-not-normalised", file: matches, from: "  if (q.leader) params.set(\"leader\", q.leader.trim().toUpperCase());\n  if (q.opponent) params.set(\"opponent\", q.opponent.trim().toUpperCase());\n  if (q.days) params.set(\"days\", String(q.days));\n  if (q.rankedOnly)", to: "  if (q.leader) params.set(\"leader\", q.leader);\n  if (q.opponent) params.set(\"opponent\", q.opponent.trim().toUpperCase());\n  if (q.days) params.set(\"days\", String(q.days));\n  if (q.rankedOnly)", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "stats-ranked-only-dropped", file: matches, from: "  if (q.days) params.set(\"days\", String(q.days));\n  if (q.rankedOnly) params.set(\"ranked_only\", \"true\");\n", to: "  if (q.days) params.set(\"days\", String(q.days));\n", kills: ["reads matchup stats with the service secret only and names every card"] },
    { id: "lesson-sent-as-get", file: matches, from: "    method: method ?? (body === undefined ? \"GET\" : \"POST\"),", to: "    method: method ?? \"GET\",", kills: ["posts a lesson draft as JSON with the player's token"] },
    { id: "lesson-body-dropped", file: matches, from: "  return plannerCall<Record<string, unknown>>(api, token, \"/analyst/lessons\", false, lesson);", to: "  return plannerCall<Record<string, unknown>>(api, token, \"/analyst/lessons\", false, {});", kills: ["posts a lesson draft as JSON with the player's token"] },
    { id: "lessons-leader-ignored", file: matches, from: "  if (leader) params.set(\"leader\", leader.trim().toUpperCase());\n  return (await", to: "  return (await", kills: ["asks for lessons by status and leader"] },
    { id: "lessons-status-ignored", file: matches, from: "  const params = new URLSearchParams({ status });", to: "  const params = new URLSearchParams({ status: \"approved\" });", kills: ["asks for lessons by status and leader"] },
    // official rules material (#246)
    { id: "rules-any-numbered-line-opens-chapter", file: rules, from: " : Number(id) === chapter + 1 && /^[A-Z][^.]{0,60}$/.test(m[2]!.trim());", to: " : Number(id) === chapter + 1;", kills: ["keeps wrapped lines in their section"] },
    { id: "rules-page-numbers-kept", file: rules, from: "if (!line || PAGE_NUMBER.test(line) || /\\.{5,}/.test(line)) continue;", to: "if (!line || /\\.{5,}/.test(line)) continue;", kills: ["keeps wrapped lines in their section"] },
    { id: "rules-no-heading-boost", file: rules, from: "      if (text.replace(/[[\\]]/g, \"\").trim() === phrase.replace(/[[\\]]/g, \"\")) score += terms.length + 1;\n", to: "", kills: ["ranks the heading that names a keyword"] },
    { id: "qa-answer-match-weighs-as-question", file: qa, from: "(d.head.includes(t) ? 2 : d.answer.includes(t) ? 1 : 0), 0);", to: "(d.head.includes(t) || d.answer.includes(t) ? 1 : 0), 0);", kills: ["puts an entry whose question has the word above"] },
    { id: "qa-plain-count-scoring", file: qa, from: "weight.get(t)! * (d.head", to: "1 * (d.head", kills: ["ranks the entry with the rare question word above"] },
    { id: "rules-lookup-qa-four", file: knowledge, from: "searchQa(faq.general, q.query, Math.max(limit, 6))", to: "searchQa(faq.general, q.query, 4)", kills: ["returns more than four Q&A entries"] },
    { id: "rules-lookup-qa-ignores-floor", file: knowledge, from: "Math.max(limit, 6))", to: "limit)", kills: ["returns more than four Q&A entries"] },
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
    { id: "chat-tool-results-not-sent", file: chat, from: "    state.turn.push({ role: \"user\", content: await Promise.all(calls.map((c) => runTool(o.tools, c, o.onProposal, o.onPlan))) });", to: "    state.turn.push({ role: \"user\", content: [{ type: \"text\", text: \"done\" }] });", kills: ["runs the tools the model asks for"] },
    { id: "chat-usage-last-call-only", file: chat, from: "    state.usage = addUsage(state.usage, reply.usage);", to: "    state.usage = reply.usage;", kills: ["runs the tools the model asks for"] },
    { id: "chat-context-dropped", file: chat, from: "    content: [...(ctx ? [{ type: \"text\", text: ctx }] : []), ...(game && claims ? [{ type: \"text\", text: gameContextBlock(deps.catalog, game, claims) }] : []), { type: \"text\", text: body.message }],", to: "    content: [{ type: \"text\", text: body.message }],", kills: ["runs the tools the model asks for"] },
    { id: "chat-breakpoint-stored", file: chat, from: "    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1]!, cache_control: { type: \"ephemeral\" } };\n    out[out.length - 1] = { ...last, content: blocks };", to: "    Object.assign(last.content[last.content.length - 1]!, { cache_control: { type: \"ephemeral\" } });", kills: ["runs the tools the model asks for"] },
    { id: "chat-history-not-resent", file: chat, from: "        messages: withCacheBreakpoint([...(o.history ?? []), ...state.turn]),", to: "        messages: withCacheBreakpoint([...state.turn]),", kills: ["resends an existing thread as stored"] },
    { id: "chat-old-thinking-resent", file: chat, from: "history = withoutOldThinking((await plannerCall<{ messages: Message[] }>(api, token, `/analyst/chat/threads/${threadId}/content`, true)).messages);", to: "history = (await plannerCall<{ messages: Message[] }>(api, token, `/analyst/chat/threads/${threadId}/content`, true)).messages;", kills: ["drops earlier turns' thinking blocks when resending a thread"] },
    { id: "chat-saves-unfinished-turn", file: chat, from: "    if (finished) {\n      await plannerCall(api, token, `/analyst/chat/threads/${threadId}/messages`", to: "    {\n      await plannerCall(api, token, `/analyst/chat/threads/${threadId}/messages`", kills: ["doesn't save a turn the model never finished"] },
    { id: "chat-unfinished-cost-dropped", file: chat, from: "    if (usage.input_tokens || usage.output_tokens) await recordUsage(", to: "    if (finished) await recordUsage(", kills: ["doesn't save a turn the model never finished"] },
    { id: "chat-context-drops-hint", file: chat, from: "    lines.push(`build hint (${h.tier}, id ${h.id}): ${h.title}`, `hint detail: ${h.detail}`);\n    if (h.cardIds?.length) lines.push(`hint cards: ${h.cardIds.join(\", \")}`);", to: "", kills: ["puts the hint the player asked about in the context block"] },
    { id: "chat-context-drops-deck-id", file: chat, from: "  if (ctx.deck?.plannerDeckId) lines.push(`planner deck id: ${ctx.deck.plannerDeckId}`);\n", to: "", kills: ["names the planner deck id so Log Pose can find the saved deck"] },
    { id: "chat-hint-detail-too-short", file: chat, from: "  detail: z.string().max(600),", to: "  detail: z.string().max(300),", kills: ["accepts a hint at the app's length limits"] },
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
    // spend cap (#377)
    { id: "chat-partial-usage-dropped", file: chat, from: "      state.usage = addUsage(state.usage, partialUsageOf(err));\n", to: "", kills: ["counts the tokens of a chat stream that broke mid-answer"] },
    { id: "review-partial-usage-dropped", file: chat, from: "    if (partial.input_tokens || partial.output_tokens) await recordUsage(", to: "    if (false) await recordUsage(", kills: ["counts the tokens of a review stream that broke mid-answer"] },
    { id: "stream-partial-usage-not-attached", file: chat, from: "throw Object.assign(err instanceof Error ? err : new Error(String(err)), { partialUsage: used });", to: "throw err;", kills: ["counts the tokens of a Claude stream that was cut off"] },
    { id: "stream-usage-not-tracked", file: chat, from: "      used = { ...snapshot.usage };\n", to: "", kills: ["counts the tokens of a Claude stream that was cut off"] },
    { id: "stream-claim-not-enforced", file: chat, from: "  if (running >= MAX_STREAMS_PER_USER) throw", to: "  if (false) throw", kills: ["lets a user have two chat or review streams at a time"] },
    { id: "stream-claim-not-released", file: chat, from: "const left = (streaming.get(user) ?? 1) - 1;", to: "const left = (streaming.get(user) ?? 1);", kills: ["lets a user have two chat or review streams at a time"] },
    { id: "stream-limit-one-only", file: chat, from: "const MAX_STREAMS_PER_USER = 2;", to: "const MAX_STREAMS_PER_USER = 1;", kills: ["lets a user have two chat or review streams at a time"] },
    { id: "stream-claim-shared-by-all", file: chat, from: "const user = token.split(\".\")[1] ?? token;", to: "const user = \"all\";", kills: ["lets a user have two chat or review streams at a time"] },
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
    { id: "brief-no-stream-claim", file: chat, from: "  const release = claimStream(token);\n  try {\n    await checkBudget(api, token);\n\n    const tools", to: "  const release = () => {};\n  try {\n    await checkBudget(api, token);\n\n    const tools", kills: ["counts a generating brief as one of the user's two streams, but not a cached or peeked one (#409)"] },
    { id: "brief-no-budget-check", file: chat, from: "    await checkBudget(api, token);\n\n    const tools", to: "\n    const tools", kills: ["an empty budget stops a brief that has to be written, after the lookup (#401)"] },
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
    // deck edit suggestions (#400)
    { id: "proposal-delta-sign", file: proposals, from: "const after = before + c.delta;", to: "const after = before - c.delta;", kills: ["turns +2/-2 into before/after lines on the open deck and finds it legal (#400)"] },
    { id: "proposal-new-problems-ignored", file: proposals, from: "const added = introducedProblems(was.problems, was.count, now.problems, now.count);", to: "const added: string[] = [];", kills: ["refuses a change that puts a 5th copy in the deck (#400)", "refuses an off-color card (#400)", "refuses a banned card with the ban list (#400)", "keeps a 50-card deck at 50 (#400)", "still refuses a NEW off-color card on a deck that already has one (#406)"] },
    { id: "proposal-ban-unchecked", file: proposals, from: "const ban = library ? await deckBanCheck(library, deck) : null;", to: "const ban = null as Awaited<ReturnType<typeof deckBanCheck>> | null;", kills: ["refuses a banned card with the ban list (#400)"] },
    { id: "proposal-count-distance-ignored", file: proposals, from: "  if (Math.abs(afterCount - DECK_SIZE) > Math.abs(beforeCount - DECK_SIZE)) added.push(`${afterCount} of ${DECK_SIZE} cards`);\n", to: "", kills: ["lets an incomplete deck move toward 50 but not away (#400)"] },
    { id: "proposal-any-problem-blocks", file: proposals, from: "const had = new Set(before.map((p) => p.key));", to: "const had = new Set<string>();", kills: ["still proposes a fix for a deck that was already illegal, listing its old problems (#400)"] },
    { id: "proposal-joined-problem-key", file: proposals, from: ".flatMap((h) => (h.cardIds?.length ? h.cardIds : [\"\"]).map((cardId) => ({ key: `${h.id}:${cardId}`, text: h.title })));", to: ".map((h) => ({ key: `${h.id}:${[...(h.cardIds ?? [])].sort().join(\",\")}`, text: h.title }));", kills: ["lets a change fix some of several off-color cards without adding a problem (#406)", "lets a change fix some of several over-limit cards without adding a problem (#406)"] },
    { id: "proposal-remove-clamped", file: proposals, from: "const after = before + c.delta;", to: "const after = Math.max(0, before + c.delta);", kills: ["removes only copies the deck has (#400)"] },
    { id: "proposal-ref-not-required", file: proposals, from: "if (!deck?.ref || !deck.leaderId) return", to: "if (!deck || !deck.leaderId) return", kills: ["says no deck is open when the context has no deck or no ref (#400)"] },
    { id: "proposal-leader-allowed", file: proposals, from: "if (card.type === \"leader\") return", to: "if (false) return", kills: ["rejects unknown cards, leaders and a card listed twice (#400)"] },
    { id: "proposal-unknown-card-allowed", file: proposals, from: "if (!card) return { ok: false, error: `${id} is not a card number", to: "if (false) return { ok: false, error: `${id} is not a card number", kills: ["rejects unknown cards, leaders and a card listed twice (#400)"] },
    { id: "proposal-repeat-allowed", file: proposals, from: "if (seen.has(id)) return", to: "if (false) return", kills: ["rejects unknown cards, leaders and a card listed twice (#400)"] },
    { id: "proposal-turn-cap-ignored", file: proposals, from: "if (made >= MAX_PROPOSALS_PER_TURN) return refusal(TOO_MANY_ERROR);", to: "", kills: ["makes at most 4 proposals in one turn (#400)"] },
    { id: "chat-proposal-not-emitted", file: chat, from: "    emit({ event: \"proposal\", data: p });", to: "", kills: ["streams a deck edit as a proposal event and saves it after the turn (#400)"] },
    { id: "chat-proposal-not-saved", file: chat, from: "        await plannerCall(api, token, `/analyst/chat/threads/${threadId}/proposals`, true, { proposals }).catch(", to: "        await Promise.resolve(undefined).catch(", kills: ["streams a deck edit as a proposal event and saves it after the turn (#400)"] },
    { id: "chat-proposal-save-failure-loses-turn", file: chat, from: "{ proposals }).catch((err) =>\n          console.error(\"saving deck edit proposals failed\", err instanceof Error ? err.message : err),\n        );", to: "{ proposals });", kills: ["still finishes the turn when saving the proposal fails (#400)"] },
    { id: "chat-refused-edit-emitted", file: chat, from: "if (tool.name === PROPOSE_TOOL && !result.isError && onProposal)", to: "if (tool.name === PROPOSE_TOOL && onProposal)", kills: ["gives a refused edit no card and tells the model why (#400)"] },
    { id: "chat-ref-shown-to-model", file: chat, from: "lines.push(`open deck: ${d.name ?? \"(unnamed)\"}${list.length", to: "lines.push(`open deck: ${d.name ?? \"(unnamed)\"} ${d.ref}${list.length", kills: ["never shows the app's deck ref to the model (#400)"] },
    { id: "sources-proposal-no-adapter", file: sources, from: "  propose_deck_edit: proposalAdapter,\n", to: "", kills: ["sends a deck edit back to the model as one cited deck source (#400)", "sends the deck edit back to the model as search results only, never mixed with text (#400)"] },

    // ——— Log Pose eval (#403) ———
    // chat: the served model reaches the eval, which asserts it
    { id: "eval-chat-model-not-returned", file: chat, from: "usage: msg.usage, model: msg.model };", to: "usage: msg.usage };", kills: ["returns the model that served the call"] },

    // group B: the engine plays each case's board
    evalScn("b01-kaido-repeatable", "OP01-061", (a) => { a[0].oncePerTurn = false; }, ["eval gold B01"]),
    evalScn("b02-king-nine-don", "OP01-091", (a) => { a[0].conditions[1].right = 9; }, ["eval gold B02"]),
    evalScn("b03-smiley-per-card", "OP01-072", (a) => { a[0].statics[0].amount.times = 500; }, ["eval gold B03"]),
    evalScn("b04-usopp-block-limit", "ST01-002", (a) => { a[0].effect.value = 6000; }, ["eval gold B04"]),
    evalScn("b05-franky-two-don", "OP01-021", (a) => { a[0].don = 2; }, ["eval gold B05"]),
    evalScn("b06-moria-hand-size", "OP01-068", (a) => { a[0].conditions[1].right = 6; }, ["eval gold B06"]),
    evalScn("b07-burgess-protection", "OP09-086", (a) => { a[0].statics[0].restriction = "cannot_be_ko_in_battle"; }, ["eval gold B07"]),
    evalScn("b08-ivankov-condition", "OP02-049", (a) => { a[0].effect.cond.op = "<="; a[0].effect.cond.right = 1; }, ["eval gold B08"]),
    evalScn("b09-radical-beam-life", "OP01-029", (a) => { a[0].effect.steps[1].cond.right = 1; }, ["eval gold B09"]),
    evalScn("b10-rayleigh-ignores-colors", "OP14-108", (a) => { a[0].effect.cond.conds = [a[0].effect.cond.conds[1]]; }, ["eval gold B10"]),
    evalScn("b11-doc-q-one-target", "OP16-109", (a) => { a[0].effect.then.steps[1].target.max = 1; }, ["eval gold B11"]),
    evalScn("b12-caribou-filter", "OP01-007", (a) => { a[0].effect.target.selector.filter.power.value = 2000; }, ["eval gold B12"]),

    // group C: the tools compute what the cases expect
    { id: "eval-c-going-first-draw", file: drawOdds, from: "return OPENING_HAND + (goingFirst ? turn - 1 : turn);", to: "return OPENING_HAND + turn;", kills: ["eval gold C10"] },
    { id: "eval-c-mulligan-ignored", file: drawOdds, from: "return o.mulligan ? atLeastWithMulligan(o.deckSize, o.hits, seen, o.atLeast) : hypergeomAtLeast(o.deckSize, o.hits, seen, o.atLeast);", to: "return hypergeomAtLeast(o.deckSize, o.hits, seen, o.atLeast);", kills: ["eval gold C12"] },
    { id: "eval-c-at-least-ignored", file: drawOdds, from: "for (let j = 0; j < k; j++) below += hypergeomPmf(N, K, draws, j);", to: "for (let j = 0; j < 1; j++) below += hypergeomPmf(N, K, draws, j);", kills: ["eval gold C15"] },
    { id: "eval-c-five-copies-ok", file: deckHints, from: "n > T.maxCopies &&", to: "n > T.maxCopies + 1 &&", kills: ["eval gold C02"] },
    { id: "eval-c-any-number-ignored", file: deckHints, from: " && !atlas[id]?.rules?.includes(\"any_number\")", to: "", kills: ["eval gold C07"] },
    { id: "eval-c-count-not-final", file: deckHints, from: "if (count !== T.deckSize && (opts.finished || count > T.deckSize)) {", to: "if (count > T.deckSize) {", kills: ["eval gold C03"] },
    { id: "eval-c-offcolor-ignored", file: deckStats, from: "if (!card.col.some((c) => leader.col.includes(c))) offColorIds.push(id);", to: "", kills: ["eval gold C04"] },
    { id: "eval-c-max-cost-ignored", file: deckStats, from: "if (kind === \"max_cost\") return (card.cost ?? 0) > Number(arg);", to: "if (kind === \"max_cost\") return false;", kills: ["eval gold C05"] },
    { id: "eval-c-event-cost-ignored", file: deckStats, from: "if (kind === \"no_events_cost_ge\") return card.t === \"event\" && (card.cost ?? 0) >= Number(arg);", to: "if (kind === \"no_events_cost_ge\") return false;", kills: ["eval gold C06"] },
    { id: "eval-c-legal-without-hints", file: analysis, from: "legal: !hints.some((h) => h.tier === \"rule\") && deck.leaderId !== null,", to: "legal: deck.leaderId !== null,", kills: ["eval gold C02", "eval gold C03", "eval gold C04", "eval gold C05", "eval gold C06"] },

    // FAQ references
    { id: "eval-faq-zero-based", file: evFaq, from: "source: `ruling:${card}#${found.index + 1}`", to: "source: `ruling:${card}#${found.index}`", kills: ["resolves a FAQ reference to the 1-based ruling id"] },
    { id: "eval-faq-missing-is-no", file: evFaq, from: "const found = pick(rulings, qh);\n  if (typeof found === \"string\") return found;", to: "const found = pick(rulings, qh);\n  if (typeof found === \"string\") return { source: `ruling:${card}#0`, polarity: \"no\" as const };", kills: ["marks a reference whose question is gone as stale"] },
    { id: "eval-faq-loose-polarity", file: evFaq, from: "/^(Yes|No)\\b/.exec(answer.trim())", to: "/^(Yes|No)/.exec(answer.trim())", kills: ["reads the verdict from the official answer's first word"] },

    // grounded
    { id: "eval-grounding-skips-percent", file: evGrounding, from: "for (const p of facts.percents) {", to: "for (const p of [] as typeof facts.percents) {", kills: ["flags a percentage no tool returned"] },
    { id: "eval-grounding-loose-rounding", file: evGrounding, from: "const PERCENT_TOL = 0.05;", to: "const PERCENT_TOL = 0.5;", kills: ["accepts a whole-number rounding of a tool's percentage"] },
    { id: "eval-grounding-whole-allowance", file: evGrounding, from: " ||\n        (Number.isInteger(c.value) && closePercent(p.value, c.value, WHOLE_TOL))", to: "", kills: ["accepts a tool's 78.0% written as 78%"] },
    { id: "eval-grounding-skips-cards", file: evGrounding, from: "if (!opts.catalog.cards.has(id) || !haystack.has(id))", to: "if (false)", kills: ["flags a card number the tools never returned"] },
    { id: "eval-grounding-skips-wins", file: evGrounding, from: "for (const n of facts.wins) if (!known.wins.includes(n)) ungrounded.push(`${n} wins`);", to: "", kills: ["flags a win count the tools never returned"] },
    { id: "eval-grounding-tools-only", file: evGrounding, from: "const source = [corpus.tools, corpus.user].join(\"\\n\");", to: "const source = corpus.tools;", kills: ["counts the player's own message as a source"] },

    // cited
    { id: "eval-cites-any-group", file: evCitations, from: "const missing = cites.all.filter((group) => !hit(group));", to: "const missing = cites.all.some(hit) ? [] : cites.all;", kills: ["needs a citation for every required group"] },
    { id: "eval-cites-rule-subsections", file: evCitations, from: 'source === rule || source.startsWith(`${rule}-`)', to: "source === rule", kills: ["counts a rule's subsections as citing the rule"] },
    { id: "eval-cites-rule-prefix-only", file: evCitations, from: 'source === rule || source.startsWith(`${rule}-`)', to: "source.startsWith(rule)", kills: ["counts a rule's subsections as citing the rule"] },
    { id: "eval-cites-substring", file: evCitations, from: "return source === rule;", to: "return source.includes(rule);", kills: ["does not let ruling:OP01-061#12 satisfy ruling:OP01-061#1"] },
    { id: "eval-cites-no-wildcard", file: evCitations, from: "if (rule.endsWith(\"*\")) return source.startsWith(rule.slice(0, -1));", to: "", kills: ["accepts any alternative within a group, and a * suffix wildcard"] },
    { id: "eval-cites-ignores-none", file: evCitations, from: "const forbidden = sources.filter((s) => (cites.none ?? []).some((rule) => sourceMatches(rule, s)));", to: "const forbidden: string[] = [];", kills: ["fails an answer that cites a forbidden ruling"] },
    { id: "eval-cites-n-matches-anything", file: evCitations, from: ".join(\"\\\\d+\")", to: ".join(\".+\")", kills: ["fails an answer that cites a forbidden ruling"] },

    // correct
    { id: "eval-exact-wide-tolerance", file: evExact, from: "const ODDS_TOL = 0.05;", to: "const ODDS_TOL = 2.5;", kills: ["passes 91.2% and fails 89.2% for C12's gold", "passes a whole 78% when the gold is 78.0 but fails 35% for 35.3"] },
    { id: "eval-exact-legal-any-verdict", file: evExact, from: "if (said === \"unclear\" || (said === \"legal\") !== gold.legal) return no(", to: "if (false) return no(", kills: ["fails \"legal\" against a not-legal gold"] },
    { id: "eval-exact-no-card-needed", file: evExact, from: "if ((gold.offending?.length || gold.mention !== undefined) && !named) {", to: "if (false) {", kills: ["fails \"legal\" against a not-legal gold"] },
    { id: "eval-exact-unclear-passes", file: evExact, from: "const said = v.verdict;", to: "const said = v.verdict === \"unclear\" ? gold.verdict : v.verdict;", kills: ["scores an unclear verdict as wrong"] },
    { id: "eval-exact-date-skipped", file: evExact, from: "if (gold.dates && !gold.dates.some(", to: "if (false && gold.dates && !gold.dates.some(", kills: ["needs the errata date in the answer"] },
    { id: "eval-exact-number-skipped", file: evExact, from: "if (gold.number !== undefined && !facts.numbers.includes(gold.number))", to: "if (false)", kills: ["needs the gold number among the answer's numbers"] },
    { id: "eval-exact-cannot-unchecked", file: evExact, from: "if (!lists(v.cannot, id, catalog) || lists(v.can, id, catalog))", to: "if (false)", kills: ["needs which cards can and cannot"] },
    { id: "eval-exact-cannot-also-can", file: evExact, from: " || lists(v.can, id, catalog)) return no(", to: ") return no(", kills: ["needs which cards can and cannot"] },
    { id: "eval-exact-can-unchecked", file: evExact, from: "for (const id of gold.can ?? []) if (!lists(v.can, id, catalog)) return no(", to: "for (const id of gold.can ?? []) if (false) return no(", kills: ["needs which cards can and cannot"] },
    { id: "eval-exact-no-ruling-claim", file: evExact, from: "if (said !== \"no\" || !v.says_no_official_ruling) return no(", to: "if (said !== \"no\") return no(", kills: ["needs an A15 answer to say no official ruling covers it"] },
    { id: "eval-extract-card-digits-counted", file: evExtract, from: "const bare = answer.replace(CARD_ID, \" \");", to: "const bare = answer;", kills: ["needs the gold number among the answer's numbers, ignoring the digits in card numbers"] },
    { id: "eval-extract-card-after-quantity", file: evExtract, from: "/(?<![A-Z0-9])(P-", to: "/\\b(P-", kills: ["counts the player's own message as a source"] },
    { id: "eval-extract-ignores-minus-lines", file: evExtract, from: "const SIGN = \"[+\\\\-\\\\u2212\\\\u2013]\";", to: "const SIGN = \"[+]\";", kills: ["reads +N/-N edit lines with card numbers"] },
    { id: "eval-extract-bullet-not-stripped", file: evExtract, from: ".replace(new RegExp(`^(?:[-*\\u2022]|\\\\d+[.)])\\\\s+(?=${SIGN}\\\\s*\\\\d)`), \"\")", to: "", kills: ["reads edit lines written with markdown, a real minus sign, card names and paired swaps"] },
    { id: "eval-extract-bold-not-stripped", file: evExtract, from: '.replace(/(\\*\\*|__|`)/g, "")', to: "", kills: ["reads edit lines written with markdown, a real minus sign, card names and paired swaps"] },
    { id: "eval-extract-unicode-minus-ignored", file: evExtract, from: "const SIGN = \"[+\\\\-\\\\u2212\\\\u2013]\";", to: "const SIGN = \"[+\\\\-]\";", kills: ["reads edit lines written with markdown, a real minus sign, card names and paired swaps"] },
    { id: "eval-extract-name-before-id-ignored", file: evExtract, from: "|[A-Z][^()\\\\n/,;]{0,49}?\\\\(\\\\s*(${ID})\\\\s*\\\\))", to: ")", kills: ["reads edit lines written with markdown, a real minus sign, card names and paired swaps"] },
    { id: "eval-extract-only-first-edit-on-line", file: evExtract, from: "    if (!next) break;\n", to: "    break;\n", kills: ["reads edit lines written with markdown, a real minus sign, card names and paired swaps"] },
    { id: "eval-extract-lowercase-prose-is-edit", file: evExtract, from: "|[A-Z][^()\\\\n/,;]{0,49}?\\\\(", to: "|[^()\\\\n/,;]{1,50}?\\\\(", kills: ["reads edit lines written with markdown, a real minus sign, card names and paired swaps"] },
    { id: "eval-grounding-no-whole-rounding", file: evGrounding, from: " ||\n        (p.whole && p.value === Math.round(c.value)),", to: ",", kills: ["accepts a whole-number rounding of a tool's percentage"] },
    { id: "eval-grounding-rounds-any-percent", file: evGrounding, from: "p.value === Math.round(c.value)", to: "Math.abs(p.value - c.value) < 1", kills: ["accepts a whole-number rounding of a tool's percentage"] },
    { id: "eval-judge-rubric-on-sonnet", file: evJudge, from: "(RUBRIC_MODEL, RUBRIC_SYSTEM", to: "(JUDGE_MODEL, RUBRIC_SYSTEM", kills: ["judges D rubrics on Opus"] },
    { id: "eval-judge-opus-priced-as-sonnet", file: evJudge, from: 'model.startsWith("claude-opus")', to: "false", kills: ["prices a judge call by the model that answered it (#414)"] },
    { id: "eval-planner-tournament-fixture-ignored", file: evPlanner, from: "if (key in fixtures.responses) return { ...(fixtures.responses[key] as object), ...window };\n  if (!leader) return { ...window, events: [], total_decks", to: "if (false) return { ...(fixtures.responses[key] as object), ...window };\n  if (!leader) return { ...window, events: [], total_decks", kills: ["answers tournament stats from the fixtures by leader and opponent"] },
    { id: "eval-planner-tournament-route-missing", file: evPlanner, from: 'path === "/analyst/tournaments/stats" && opts.tournaments', to: 'path === "/analyst/tournaments/stats" && false', kills: ["answers tournament stats from the fixtures by leader and opponent"] },
    { id: "eval-extract-no-number-words", file: evExtract, from: "    ...[...bare.toLowerCase().matchAll(/\\b(one|two|three|four|five|six|seven|eight|nine|ten)\\b/g)].map((m) => WORDS[m[1]!]!),\n", to: "", kills: ["reads percentages, game counts, win counts and number words"] },

    // D: edits, rubric and the self-test
    { id: "eval-edits-ignore-minus", file: evEdits, from: "(e.sign === \"+\" ? e.copies : -e.copies)", to: "(e.sign === \"+\" ? e.copies : 0)", kills: ["applies +N/-N lines and keeps a legal Rayleigh deck legal"] },
    { id: "eval-edits-skip-analyze", file: evEdits, from: "legal: analysis.legal && problems.length === 0,", to: "legal: true,", kills: ["reports a cost-5 card in a Rayleigh deck as illegal", "fails a D answer whose +N/-N edits break the deck"] },
    { id: "eval-edits-no-lines-pass", file: evEdits, from: "return { applied: 0, legal: false,", to: "return { applied: 0, legal: true,", kills: ["fails an answer with no +N/-N lines to apply"] },
    { id: "eval-d-rubric-threshold", file: evGrade, from: "export const RUBRIC_PASS = 0.8;", to: "export const RUBRIC_PASS = 0;", kills: ["calls a D answer correct only at a rubric score of 0.8 or more"] },
    { id: "eval-d-checks-ignored", file: evGrade, from: "const pass = rubric >= RUBRIC_PASS && problems.length === 0;", to: "const pass = rubric >= RUBRIC_PASS;", kills: ["fails a D answer whose +N/-N edits break the deck", "fails a D answer that invents a win rate"] },
    { id: "eval-rubric-null-counts", file: evJudge, from: "const applicable = Object.values(rubric).filter((i) => i.pass !== null);", to: "const applicable = Object.values(rubric);", kills: ["scores the rubric as passes over the items that apply"] },
    { id: "eval-grade-cited-always", file: evGrade, from: "cited: cites.ok ? 1 : 0,", to: "cited: 1,", kills: ["marks an answer that cites nothing as not cited"] },
    { id: "eval-grade-grounded-always", file: evGrade, from: "grounded: ground.ok ? 1 : 0,", to: "grounded: 1,", kills: ["marks an answer that cites nothing as not cited"] },
    { id: "eval-grade-default-pass", file: evGrade, from: "correct = { correct: 0, why: \"the answer is empty\" };", to: "correct = { correct: 1, why: \"the answer is empty\" };", kills: ["scores a scripted right answer 1 and an empty answer 0 through runChat"] },
    { id: "eval-selftest-ignores-pass", file: evSelftest, from: "if (!failed) ok = false;", to: "", kills: ["fails the self-test when a grader passes a known-bad answer"] },

    // overlap: Bandai text stays out of git
    { id: "eval-overlap-threshold", file: evOverlap, from: "export const OVERLAP_WORDS = 12;", to: "export const OVERLAP_WORDS = 1000;", kills: ["refuses to store an answer that repeats 12 words of official text"] },
    { id: "eval-overlap-off-by-one", file: evOverlap, from: "return officialOverlap(text, corpus) < n;", to: "return officialOverlap(text, corpus) < n - 1;", kills: ["stores an answer that shares only 11 words"] },

    // stats
    { id: "eval-stats-flat-reps", file: evStats, from: "byCase.set(r.case, [...(byCase.get(r.case) ?? []), v]);", to: "byCase.set(`${r.case}#${r.rep}`, [v]);", kills: ["averages reps within a case before averaging cases"] },
    { id: "eval-stats-counts-truncated", file: evStats, from: "const v = r.status === \"ok\" ? r.grade?.[metric] : undefined;", to: "const v = r.grade?.[metric];", kills: ["leaves truncated and error-free-but-unscored rows out of the averages"] },
    { id: "eval-stats-flip-boundary", file: evStats, from: "Math.abs(v - a.get(id)!) >= by - 1e-9", to: "Math.abs(v - a.get(id)!) > by", kills: ["reports the cases whose mean moved by 0.5 or more"] },
    { id: "eval-stats-delta-unpaired", file: evStats, from: "const diffs = [...b].filter(([id]) => a.has(id)).map(", to: "const diffs = [...b].map(", kills: ["reports the cases whose mean moved by 0.5 or more"] },

    // loader
    { id: "eval-load-no-catalog-check", file: evLoad, from: "if (!catalog.cards.has(id)) problems.push(", to: "if (false) problems.push(", kills: ["rejects a case naming a card that isn't in the catalog"] },
    { id: "eval-load-no-duplicate-check", file: evLoad, from: "if (seen.has(c.id)) problems.push(", to: "if (false) problems.push(", kills: ["rejects two cases with the same id"] },
    { id: "eval-load-no-count-check", file: evLoad, from: "if ((counts[g] ?? 0) !== n)", to: "if (false)", kills: ["rejects a question list with the wrong number of cases per group"] },
    { id: "eval-load-no-qh-check", file: evLoad, from: "else if (\"qh\" in c.faq && !/^[0-9a-f]{8}$/.test(c.faq.qh))", to: "else if (false)", kills: ["rejects an A case whose question hash is not 8 hex characters"] },

    // fake planner: eval spend never reaches a player's caps
    { id: "eval-planner-usage-not-local", file: evPlanner, from: "if (method === \"POST\" && path === \"/analyst/chat/usage\") {", to: "if (false) {", kills: ["keeps chat usage local but forwards stats reads"] },
    { id: "eval-planner-live-no-forward", file: evPlanner, from: "if (live && forwarded && opts.liveUrl) {", to: "if (false) {", kills: ["keeps chat usage local but forwards stats reads"] },
    { id: "eval-planner-fixture-ignored", file: evPlanner, from: "if (key in fixtures.responses) return { ...(fixtures.responses[key] as object), ...window };\n  if (!leader) return { ...window, total_games", to: "if (false) return { ...(fixtures.responses[key] as object), ...window };\n  if (!leader) return { ...window, total_games", kills: ["answers stats from the fixtures when fake"] },

    // harness: failures are classed, not scored
    { id: "eval-errors-in-results", file: evRunner, from: "else return fault(\"api_error\", msgOf(err));", to: "else graded = { failure: \"too_many_rounds\" };", kills: ["puts a failed model call in errors.jsonl, not in the scores"] },
    { id: "eval-no-model-assert", file: evRunner, from: "if (reply.model !== opts.model) throw new ModelMismatch(", to: "if (false) throw new ModelMismatch(", kills: ["rejects a reply served by a different model"] },
    { id: "eval-rounds-as-error", file: evRunner, from: "if (calls.length >= MAX_TOOL_ROUNDS && /too many lookups/.test(msgOf(err))) graded = { failure: \"too_many_rounds\" };", to: "if (false) graded = { failure: \"too_many_rounds\" };", kills: ["scores running out of tool rounds as a graded 0, not an error"] },
    { id: "eval-refusal-graded-as-answer", file: evRunner, from: "if (!graded && calls.some((k) => k.stop_reason === \"refusal\")) graded = { failure: \"refusal\" };", to: "", kills: ["scores a refusal as a graded 0"] },
    { id: "eval-no-retry", file: evRunner, from: "const reply = await withRetry(() => base(params, onText, signal, onCite), { signal, baseMs: opts.retryMs, onRetry: () => retries++ });", to: "const reply = await base(params, onText, signal, onCite);", kills: ["retries an overloaded call and counts the retry"] },
    { id: "eval-retries-not-counted", file: evRunner, from: "onRetry: () => retries++", to: "onRetry: () => undefined", kills: ["retries an overloaded call and counts the retry"] },
    { id: "eval-skip-gated-tools", file: evRunner, from: "const missing = (c.requiresTools ?? []).filter((t) => !offered.has(t));", to: "const missing: string[] = [];", kills: ["skips a case that needs a tool the chat doesn't offer"] },
    { id: "eval-max-usd-ignored", file: evRunner, from: "if (spent >= opts.maxUsd) {", to: "if (false) {", kills: ["stops dispatching new cases once the spend cap is reached"] },
    { id: "eval-resume-repeats", file: evRunner, from: "for (let rep = 0; rep < opts.reps; rep++) if (!done.has(`${c.id}#${rep}`)) work.push({ c, gold, rep });", to: "for (let rep = 0; rep < opts.reps; rep++) work.push({ c, gold, rep });", kills: ["resumes without repeating a case that already has a result"] },

    // goldfish simulate (#402)
    { id: "sim-adapter-missing", file: sources, from: "  simulate: simulateAdapter,\n", to: "", kills: ["makes a goldfish run one sim: source with a sentence per turn and the engine-support warning (#402)"] },
    { id: "sim-support-warning-dropped", file: sources, from: "    ...simSupportFacts(v),\n", to: "", kills: ["makes a goldfish run one sim: source with a sentence per turn and the engine-support warning (#402)"] },
    { id: "sim-id-ignores-life", file: sim, from: "    opponentLife: q.opponentLife,\n    opponentPower: q.opponentPower,\n    mulligan: q.mulligan,\n    keepCards: [...q.keepCards].sort(),", to: "    opponentPower: q.opponentPower,\n    mulligan: q.mulligan,\n    keepCards: [...q.keepCards].sort(),", kills: ["gives the same question the same sim: source, and a new one for another dummy Life or game count (#402)"] },
    { id: "sim-id-keepcards-order", file: sim, from: "keepCards: [...q.keepCards].sort(),", to: "keepCards: q.keepCards,", kills: ["gives the same question the same sim: source, and a new one for another dummy Life or game count (#402)"] },
    { id: "sim-id-ignores-runs", file: sim, from: "shortHash(canonical + \"|\" + runsCompleted)", to: "shortHash(canonical)", kills: ["gives the same question the same sim: source, and a new one for another dummy Life or game count (#402)"] },
    { id: "sim-budget-ignored", file: sim, from: "    if (i > 0 && now() - started > budgetMs) { truncated = true; break; }\n", to: "", kills: ["stops at the time budget and says how many of the requested games it ran (#402)"] },
    { id: "sim-cache-bypassed", file: sim, from: "const hit = cache.get(key);", to: "const hit = undefined;", kills: ["answers a repeated question from the cache without replaying games (#402)"] },
    { id: "sim-deck-size-unchecked", file: sim, from: "  if (count !== 50) throw new Error(`simulate needs exactly 50 main-deck cards; this list has ${count}.`);\n", to: "", kills: ["refuses a deck without exactly 50 main-deck cards (#402)"] },
    { id: "sim-life-not-passed", file: sim, from: "opponentLife: q.opponentLife ?? 5", to: "opponentLife: 5", kills: ["passes the dummy's Life through to the engine: a vanilla deck beats a 0-Life dummy on turn 2 (#402)"] },
    // tournament stats from Limitless TCG (#397)
    { id: "tourney-names-event-ids", file: matches, from: "    out[k] = skip.includes(k) ? v : withCardNames(v, skip);", to: "    out[k] = withCardNames(v, skip);", kills: ["reads tournament stats with the service secret only and names leaders and cards"] },
    { id: "tourney-min-players-param", file: matches, from: "params.set(\"min_players\", String(q.minPlayers))", to: "params.set(\"minPlayers\", String(q.minPlayers))", kills: ["reads tournament stats with the service secret only and names leaders and cards", "offers tournament_stats beside matchup_stats only when the planner API is configured"] },
    { id: "tourney-tool-reads-duel-stats", file: server, from: "return json(await tournamentStats(api, args));", to: "return json(await matchupStats(api, args));", kills: ["offers tournament_stats beside matchup_stats only when the planner API is configured"] },
    { id: "tourney-no-adapter", file: sources, from: "  tournament_stats: tournamentAdapter,\n", to: "", kills: ["offers tournament_stats beside matchup_stats only when the planner API is configured"] },
    { id: "tourney-meta-source", file: sources, from: "searchResult(\"tourney:meta\",", to: "searchResult(\"stats:meta\",", kills: ["ranks the meta overview with its minimum sample and gives each leader a meta share"] },
    { id: "tourney-overview-leader-source", file: sources, from: "searchResult(`tourney:${l.leader}`,", to: "searchResult(`stats:${l.leader}`,", kills: ["ranks the meta overview with its minimum sample and gives each leader a meta share"] },
    { id: "tourney-top-win-rate-dropped", file: sources, from: "        ...top.map((l, i) => recordSentence(", to: "        ...[].map((l: Rec, i: number) => recordSentence(", kills: ["ranks the meta overview with its minimum sample and gives each leader a meta share"] },
    { id: "tourney-opponent-source", file: sources, from: "searchResult(`tourney:${v.leader}~${o.opponent}`,", to: "searchResult(`stats:${v.leader}~${o.opponent}`,", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-matchup-source", file: sources, from: "searchResult(`tourney:${v.leader}~${v.opponent}`,", to: "searchResult(`stats:${v.leader}~${v.opponent}`,", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-card-source", file: sources, from: "searchResult(`tourney:${v.leader}#${c.id}`,", to: "searchResult(`stats:${v.leader}#${c.id}`,", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-ties-dropped", file: sources, from: "typeof r.ties === \"number\" && r.ties > 0 ?", to: "typeof r.ties === \"number\" && r.ties > 99 ?", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-mirror-games-dropped", file: sources, from: "v.mirror_games > 0 &&", to: "v.mirror_games > 99 &&", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-not-duel-games-unsaid", file: sources, from: "events with at least ${v.min_players} players; not games from optcgduel.app.`;", to: "events with at least ${v.min_players} players.`;", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-too-few-decks-unsaid", file: sources, from: "v.too_few_decks && `Only ${v.decklists} decklists, too few to call this a trend.`", to: "false", kills: ["puts tournament records under tourney:, apart from the stats: sources"] },
    { id: "tourney-event-source", file: sources, from: "searchResult(`event:${id}`,", to: "searchResult(`tourney:${id}`,", kills: ["makes an event: source of each event a leader placed at"] },
    { id: "tourney-decklist-fewest-first", file: sources, from: ".sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))", to: ".sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))", kills: ["makes an event: source of each event a leader placed at"] },
    { id: "tourney-ordinal-teens", file: sources, from: "tens >= 11 && tens <= 13 ? \"th\"", to: "false ? \"th\"", kills: ["makes an event: source of each event a leader placed at"] },
    { id: "tourney-finish-ties-dropped", file: sources, from: "${r.ties ? `-${r.ties}` : \"\"}", to: "", kills: ["makes an event: source of each event a leader placed at"] },
    // Log Pose copilot (#416)
    { id: "copilot-lookup-error-rethrown", file: copilot, from: "if (err instanceof PlannerApiError && (err.status === 403 || err.status === 400 || err.status === 422)) throw refuse();", to: "if (false) throw refuse();", kills: ["copilot refuses a ranked or forged ticket before any model call (#416)"] },
    { id: "copilot-own-leader-unchecked", file: copilot, from: "if (you.leader.defId !== found.leader_id || opponent.leader.defId", to: "if (opponent.leader.defId", kills: ["refuses a snapshot whose own Leader isn't the ticket's (#416)"] },
    { id: "copilot-opponent-leader-unchecked", file: copilot, from: "|| opponent.leader.defId !== found.opponent_id) throw refuse();", to: "|| false) throw refuse();", kills: ["refuses a snapshot whose opponent Leader isn't the ticket's (#416)"] },
    { id: "copilot-ticket-not-sent", file: copilot, from: "{ ticket: game.ticket, variant: briefVariant(catalog) }", to: "{ ticket: \"\", variant: briefVariant(catalog) }", kills: ["sends the ticket and variant to the planner and returns the leaders and deck it names (#416)"] },
    { id: "copilot-opponent-keys-kept", file: copilot, from: "    hand: count,\n    donTotal: count,\n  }),", to: "    hand: count,\n    donTotal: count,\n  }).passthrough(),", kills: ["drops keys the app should never send"] },
    { id: "copilot-snapshot-keys-kept", file: copilot, from: "  legal: z.array(legalAction).max(120),\n});", to: "  legal: z.array(legalAction).max(120),\n}).passthrough();", kills: ["drops keys the app should never send"] },
    { id: "copilot-card-id-free-text", file: copilot, from: "const defId = z.string().regex(CARD_ID);", to: "const defId = z.string();", kills: ["refuses a card id that isn't a card number"] },
    { id: "copilot-block-opponent-hand-count-dropped", file: copilot, from: "`Opponent hand: ${s.opponent.hand} cards (hidden), DON!! total ${s.opponent.donTotal}`", to: "`DON!! total ${s.opponent.donTotal}`", kills: ["names the cards, the legal actions, the deck and the card text"] },
    { id: "copilot-block-deck-list-dropped", file: copilot, from: "lines.push(`Your deck (${claims.deck.reduce((n, d) => n + d.copies, 0)} cards besides the Leader, whole list, not what is left):`, ...deck);", to: "", kills: ["names the cards, the legal actions, the deck and the card text"] },
    { id: "copilot-block-card-text-dropped", file: copilot, from: "${text ? `: ${text}` : \"\"}`);", to: "`);", kills: ["names the cards, the legal actions, the deck and the card text"] },
    { id: "copilot-block-legal-dropped", file: copilot, from: "    ...s.legal.map((a) => `- ${describeLegal(a, named)}`),\n", to: "", kills: ["names the cards, the legal actions, the deck and the card text"] },
    { id: "copilot-label-uses-ids", file: copilot, from: "label: `Attack ${who} with ${nm(st.attacker)}`", to: "label: `Attack ${who} with ${st.attacker}`", kills: ["writes labels from card names and stamps the snapshot's turn (#416)"] },
    { id: "copilot-label-play-cost-dropped", file: copilot, from: "label: `Play ${nm(st.card)}${cost !== undefined ? ` (cost ${cost})` : \"\"}", to: "label: `Play ${nm(st.card)}", kills: ["writes labels from card names and stamps the snapshot's turn (#416)"] },
    { id: "copilot-plan-turn-wrong", file: copilot, from: "plan: { turn: s.turn, summary", to: "plan: { turn: 0, summary", kills: ["writes labels from card names and stamps the snapshot's turn (#416)"] },
    { id: "copilot-played-character-cannot-act", file: copilot, from: "          actors.add(st.card);\n", to: "", kills: ["accepts a character played earlier in the plan as an attacker"] },
    { id: "copilot-not-your-turn-planned", file: copilot, from: "if (!s.yourTurn) return fail(", to: "if (false) return fail(", kills: ["refuses a plan when it isn't the player's turn (#416)"] },
    { id: "copilot-pending-choice-planned", file: copilot, from: "if (s.choice) return fail(", to: "if (false) return fail(", kills: ["refuses a plan while a choice is pending (#416)"] },
    { id: "copilot-non-main-phase-planned", file: copilot, from: "if (s.phase !== \"main\") return fail(", to: "if (false) return fail(", kills: ["refuses a plan outside the main phase (#416)"] },
    { id: "copilot-play-not-in-hand", file: copilot, from: "if (!h) return fail(", to: "if (false) return fail(", kills: ["refuses a hand card that isn't in the hand (#416)"] },
    { id: "copilot-opponent-card-acts", file: copilot, from: "if (opponents.has(id)) return `${at}: ${id} (${nm(id)}) is the opponent's card;", to: "if (false) return `${at}: ${id} (${nm(id)}) is the opponent's card;", kills: ["refuses an opponent's character as an attacker or DON target (#416)"] },
    { id: "copilot-attacks-own-card", file: copilot, from: "if (!targets.has(st.target)) {", to: "if (false) {", kills: ["refuses an attack aimed at the player's own card (#416)"] },
    { id: "copilot-don-over-budget", file: copilot, from: "        if (don > s.you.donActive) return fail(spentTooMuch(at, don, s.you.donActive));\n        steps.push({ label: `Give", to: "        steps.push({ label: `Give", kills: ["refuses giving more DON!! than are active"] },
    { id: "copilot-don-budget-off-by-one", file: copilot, from: "        if (don > s.you.donActive) return fail(spentTooMuch(at, don, s.you.donActive));\n        steps.push({ label: `Give", to: "        if (don >= s.you.donActive) return fail(spentTooMuch(at, don, s.you.donActive));\n        steps.push({ label: `Give", kills: ["refuses giving more DON!! than are active"] },
    { id: "copilot-play-cost-not-counted", file: copilot, from: "        don += cost ?? 0;\n", to: "", kills: ["counts card costs against active DON!!"] },
    { id: "copilot-card-played-twice", file: copilot, from: "if (played.has(st.card)) return fail(", to: "if (false) return fail(", kills: ["refuses playing the same hand card twice (#416)"] },
    { id: "copilot-end-turn-not-last", file: copilot, from: "if (steps.at(-1)?.action === \"end_turn\") return fail(", to: "if (false) return fail(", kills: ["refuses an end_turn that isn't the last step (#416)"] },
    { id: "copilot-first-step-unchecked", file: copilot, from: "if (!ok) return fail(", to: "if (false) return fail(", kills: ["refuses a plan whose first step isn't a legal action right now (#416)"] },
    { id: "copilot-first-attack-target-ignored", file: copilot, from: "return a.type === \"declare_attack\" && a.attacker === first.attacker && a.target === first.target;", to: "return a.type === \"declare_attack\" && a.attacker === first.attacker;", kills: ["refuses a first step that matches the action but not the card it names (#416)"] },
    { id: "copilot-stub-runs-without-game", file: copilot, from: "if (!game) return refusal(NO_GAME_ERROR);\n", to: "", kills: ["stands in as a refusing tool when no game is attached (#416)", "keeps the tool registered for a later turn without a game"] },
    { id: "copilot-plan-event-not-emitted", file: chat, from: "const onPlan = (p: TurnPlan) => emit({ event: \"plan\", data: p });", to: "const onPlan = (_p: TurnPlan) => undefined;", kills: ["emits the plan, puts the <game> block in the message and appends the copilot instructions (#416)"] },
    { id: "copilot-game-block-not-in-message", file: chat, from: "...(game && claims ? [{ type: \"text\", text: gameContextBlock(deps.catalog, game, claims) }] : []),", to: "", kills: ["emits the plan, puts the <game> block in the message and appends the copilot instructions (#416)"] },
    { id: "copilot-instructions-not-appended", file: chat, from: "...(game ? [{ type: \"text\", text: COPILOT_INSTRUCTIONS }] : []),", to: "", kills: ["emits the plan, puts the <game> block in the message and appends the copilot instructions (#416)"] },
    { id: "copilot-instructions-always-appended", file: chat, from: "...(game ? [{ type: \"text\", text: COPILOT_INSTRUCTIONS }] : []),", to: "{ type: \"text\", text: COPILOT_INSTRUCTIONS },", kills: ["keeps the tool registered for a later turn without a game"] },
    { id: "copilot-plan-tool-unregistered-without-game", file: chat, from: "deckEditTool(deps.catalog, deps.knowledge, body.context?.deck), turnPlanTool(deps.catalog, game)];", to: "deckEditTool(deps.catalog, deps.knowledge, body.context?.deck), ...(game ? [turnPlanTool(deps.catalog, game)] : [])];", kills: ["keeps the tool registered for a later turn without a game"] },
    { id: "copilot-refused-plan-emitted", file: chat, from: "if (tool.name === PLAN_TOOL && !result.isError && onPlan)", to: "if (tool.name === PLAN_TOOL && onPlan)", kills: ["sends a refused plan back to the model and emits no plan event (#416)"] },
    { id: "copilot-ticket-unchecked-before-thread", file: chat, from: "  const claims = game ? await verifyGame(api, token, deps.catalog, game) : null;\n", to: "  const claims = game ? { leader: \"\", opponent: \"\", deck: [] } : null;\n", kills: ["copilot refuses a ranked or forged ticket before any model call (#416)"] },
  ],
};
