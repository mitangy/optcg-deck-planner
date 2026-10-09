/** game-server mutations (game-server/test, mocha). */
const proto = "game-server/src/protocol.ts";
const room = "game-server/src/rooms/DuelRoom.ts";
const queue = "game-server/src/rooms/MatchmakerRoom.ts";
const cors = "game-server/src/cors.ts";
const presence = "game-server/src/presence.ts";
const appConfig = "game-server/src/app.config.ts";
const guard = "game-server/src/matchmakeGuard.ts";
const env = "game-server/src/env.ts";
const handOrder = "game-server/src/handOrder.ts";
module.exports = {
  cwd: "game-server",
  runner: "mocha",
  mutations: [
    // protocol parsers
    { id: "join-drops-secret", file: proto, from: "    secret: typeof o.secret === \"string\" ? o.secret : undefined,", to: "    secret: undefined,", kills: ["parses join options"] },
    { id: "join-drops-seat", file: proto, from: "    preferredSeat: preferredSeat as Seat | undefined,", to: "    preferredSeat: undefined,", kills: ["parses join options"] },
    { id: "join-spectator-as-player", file: proto, from: "    role = roleRaw;", to: "    role = \"player\";", kills: ["parses spectator join role"] },
    { id: "join-anonymous-allowed", file: proto, from: "    throw Object.assign(new Error(\"gameToken or devUserId required\"), {\n      code: \"unauthorized\" as const,\n    });", to: "", kills: ["rejects join without gameToken or devUserId"] },
    { id: "join-deck-dropped", file: proto, from: "    deck = asPlayerDeck(o.deck);", to: "", kills: ["parses join options with seat deck"] },
    { id: "create-skip-mulligan-opt-in", file: proto, from: "  const autoSkipMulligan = o.autoSkipMulligan !== false;", to: "  const autoSkipMulligan = o.autoSkipMulligan === true;", kills: ["defaults create options"] },
    { id: "create-ranked-by-default", file: proto, from: "  const ranked = o.ranked === true;", to: "  const ranked = o.ranked !== false;", kills: ["defaults create options"] },
    { id: "create-ranked-ignored", file: proto, from: "  const ranked = o.ranked === true;", to: "  const ranked = false;", kills: ["treats ranked as an explicit request"] },
    { id: "ranked-keeps-turn-timer", file: proto, from: "    turnSeconds = null;\n    matchSeconds = null;\n    seatSeconds = RANKED_SEAT_SECONDS;", to: "    turnSeconds = 30;\n    matchSeconds = null;\n    seatSeconds = RANKED_SEAT_SECONDS;", kills: ["ranked games get a 15 minute clock per player, no shared match clock and no turn timer (#248, #349)"] },
    { id: "ranked-keeps-match-clock", file: proto, from: "    matchSeconds = null;\n    seatSeconds = RANKED_SEAT_SECONDS;", to: "    matchSeconds = 900;\n    seatSeconds = RANKED_SEAT_SECONDS;", kills: ["ranked games get a 15 minute clock per player, no shared match clock and no turn timer (#248, #349)"] },
    { id: "ranked-no-seat-clock", file: proto, from: "    seatSeconds = RANKED_SEAT_SECONDS;\n", to: "", kills: ["ranked games get a 15 minute clock per player, no shared match clock and no turn timer (#248, #349)"] },
    { id: "ranked-seat-clock-wrong-length", file: proto, from: "export const RANKED_SEAT_SECONDS = 15 * 60;", to: "export const RANKED_SEAT_SECONDS = 30 * 60;", kills: ["ranked games get a 15 minute clock per player, no shared match clock and no turn timer (#248, #349)"] },
    { id: "seat-clock-ignores-pending-stage-prompt", file: room, from: "    if (m.pendingChoices[0]) return m.pendingChoices[0].seat;\n    if (m.phase === \"mulligan\") {", to: "    if (m.phase === \"mulligan\") {", kills: ["per-player clock: the Imu seat's open Stage prompt drains its own bank, not the first player's (#353)"] },
    { id: "match-clock-mulligan-ignores-pending-prompt", file: room, from: "      ? (m.pendingChoices[0]?.seat ?? m.activeSeat)", to: "      ? m.activeSeat", kills: ["match clock: expiry while the Imu seat's Stage prompt is open names the prompt owner the loser (#353)"] },
    { id: "seat-clock-idle-during-mulligan", file: room, from: "    if (m.phase === \"mulligan\") {\n      const first = m.activeSeat;", to: "    if (m.phase === \"mulligan\") {\n      return null;\n      const first = m.activeSeat;", kills: ["per-player clock: a seat that stalls its mulligan runs its own bank down and loses on time (#349)"] },
    { id: "create-duplicate-seat-users", file: proto, from: "      !Number.isSafeInteger(b) ||\n      a === b", to: "      !Number.isSafeInteger(b)", kills: ["rejects invalid ranked seat reservations"] },
    { id: "create-fractional-seat-users", file: proto, from: "      !Number.isSafeInteger(a) ||\n      !Number.isSafeInteger(b) ||", to: "", kills: ["rejects invalid ranked seat reservations"] },
    { id: "intent-returns-envelope", file: proto, from: "  return o.intent as Intent;", to: "  return o as unknown as Intent;", kills: ["parses intent envelope"] },
    // CORS allowlist
    { id: "cors-allowlisted-wildcard", file: cors, from: "      return { \"Access-Control-Allow-Origin\": origin };", to: "      return { \"Access-Control-Allow-Origin\": \"*\" };", kills: ["reflects allowlisted Origin"] },
    { id: "cors-reflects-any-origin", file: cors, from: "    return { \"Access-Control-Allow-Origin\": \"null\" };", to: "    return { \"Access-Control-Allow-Origin\": origin };", kills: ["rejects unknown browser Origin", "answers the CORS preflight and tags responses for an allowlisted origin only"] },
    { id: "cors-no-origin-blocked", file: cors, from: "    if (!origin) {\n      return { \"Access-Control-Allow-Origin\": \"*\" };\n    }", to: "", kills: ["allows requests with no Origin"] },
    // DuelRoom / ranked_queue
    { id: "welcome-wrong-seat-view", edits: [
      { file: room, from: "      const view = getPlayerView(match, slot.seat);\n      const welcome", to: "      const view = getPlayerView(match, 0);\n      const welcome" },
      { file: room, from: "    const view = getPlayerView(this.match, seat);\n    const welcome", to: "    const view = getPlayerView(this.match, 0);\n    const welcome" },
    ], kills: ["two clients get private views"] },
    { id: "mulligan-always-skipped", file: room, from: "    if (this.autoSkipMulligan) {", to: "    if (true) {", kills: ["mulligan phase keeps both seats"] },
    { id: "intent-trusts-active-seat", file: room, from: "    const result = applyIntent(before, intent, { seat, rng: this.rng });\n    if (!result.ok) {\n      this.log(\"info\", \"illegal_intent\"", to: "    const result = applyIntent(before, intent, { seat: before.activeSeat, rng: this.rng });\n    if (!result.ok) {\n      this.log(\"info\", \"illegal_intent\"", kills: ["illegal intent errors without advancing"] },
    { id: "match-over-not-sent", file: room, from: "    this.onMatchAdvanced();\n    this.maybeSendMatchOver();\n  }\n\n  /** Clear everything", to: "    this.onMatchAdvanced();\n  }\n\n  /** Clear everything", kills: ["legal play reaches match_over"] },
    { id: "third-player-kept", edits: [
      { file: room, from: "      this.rejectJoin(client, \"room_full\", \"Match already in progress\");\n      return;", to: "      this.sendError(client, \"room_full\", \"Match already in progress\");" },
      { file: room, from: "      this.rejectJoin(client, \"room_full\", \"No free seat\");", to: "      this.sendError(client, \"room_full\", \"No free seat\");" },
    ], kills: ["rejects a third player"] },
    { id: "join-deck-ignored", file: room, from: "    if (identity.deck) {\n      this.seatDecks[seat] = identity.deck;\n    }", to: "", kills: ["uses join-time seat decks for leaders"] },
    { id: "join-unknown-card-deck-accepted", file: room, from: "    if (role === \"player\" && join.deck) assertKnownDeck(join.deck);\n", to: "", kills: ["rejects a deck with unknown cards at join"] },
    { id: "spectator-gets-player-view", file: room, from: "    const view = this.spectatorView(this.match, cameraSeat);\n    const welcome", to: "    const view = { ...getPlayerView(this.match, cameraSeat), spectator: true };\n    const welcome", kills: ["allows a spectator with public view"] },
    { id: "queue-same-seat", file: queue, from: "            roomId: room.roomId,\n            seat: 1,", to: "            roomId: room.roomId,\n            seat: 0,", kills: ["ranked_queue pairs two clients"] },
    // One entry per account and never pairing an account with itself are two layers of one rule.
    { id: "queue-pairs-same-user", edits: [
      { file: queue, from: "        const partnerIdx = this.queue.findIndex((q) => q.userId !== a.userId);", to: "        const partnerIdx = 0;" },
      { file: queue, from: "    for (const old of this.queue.filter((q) => q.userId === identity.userId)) {", to: "    for (const old of [] as Queued[]) {" },
    ], kills: ["ranked_queue keeps one place per account"] },
    { id: "queue-keeps-duplicate-entries", file: queue, from: "    for (const old of this.queue.filter((q) => q.userId === identity.userId)) {", to: "    for (const old of [] as Queued[]) {", kills: ["ranked_queue keeps one place per account"] },
    { id: "cosmetics-not-relayed", file: room, from: "      c.send(\"cosmetics\", payload);\n    }\n  }\n\n  /** Fold", to: "      if (this.seatForClient(c) === seat) c.send(\"cosmetics\", payload);\n    }\n  }\n\n  /** Fold", kills: ["relays cosmetics only for cards already public to the other seat and spectators (#369)"] },
    // Two layers: the live relay and the replay to joiners both filter through artPrefsFor.
    { id: "cosmetics-leak-decklist", file: room, from: "    return this.seatForClient(client) === seat ? prefs : visibleArtPrefs(prefs, this.publicArtDefs[seat]);", to: "    return prefs;", kills: ["relays cosmetics only for cards already public to the other seat and spectators (#369)"] },
    { id: "cosmetics-public-never-pushed", file: room, from: "      if (key !== this.sentPublicArt[seat]) this.broadcastSeatCosmetics(seat, true);", to: "", kills: ["relays cosmetics only for cards already public to the other seat and spectators (#369)"] },
    { id: "public-art-counts-hand", file: "game-server/src/publicArt.ts", from: "  for (const c of p.resolving) into.add(c.defId);", to: "  for (const c of p.resolving) into.add(c.defId);\n  for (const c of p.hand) into.add(c.defId);", kills: ["counts the Leader and face-up cards, never hand, deck or face-down Life (#369)"] },
    { id: "public-art-counts-face-down-life", file: "game-server/src/publicArt.ts", from: "    if (p.faceUpLife[i]) into.add(defId);", to: "    into.add(defId);", kills: ["counts the Leader and face-up cards, never hand, deck or face-down Life (#369)"] },
    { id: "public-art-ignores-event-owner", file: "game-server/src/publicArt.ts", from: "        if (e.seat === seat) into.add(e.defId);", to: "        into.add(e.defId);", kills: ["keeps a card public after it leaves the table, but only for its own seat (#369)"] },
    { id: "public-art-ignores-hidden-moves", file: "game-server/src/publicArt.ts", from: "        if (e.seat === seat && !e.hidden) into.add(e.defId);", to: "        if (e.seat === seat) into.add(e.defId);", kills: ["keeps a card public after it leaves the table, but only for its own seat (#369)"] },
    { id: "public-art-filter-keeps-all", file: "game-server/src/publicArt.ts", from: "    if (publicDefIds.has(defId)) out[defId] = altId;", to: "    out[defId] = altId;", kills: ["filters a pref map down to public cards (#369)"] },
    // Undo must not hand both players the old shuffle order again.
    { id: "undo-reshuffles-decks", file: room, from: "    this.replay?.intents.splice(snap.intentCount);\n", to: "    this.replay?.intents.splice(snap.intentCount);\n    this.match = { ...this.match, players: this.match.players.map((p) => ({ ...p, deck: [...p.deck].reverse(), zoneInstanceIds: { ...p.zoneInstanceIds, deck: [...p.zoneInstanceIds.deck].reverse() } })) } as typeof this.match;\n", kills: ["an accepted undo restores the turn exactly, so the same cards are drawn again, and the replay rebuilds (#449)"] },
    { id: "undo-reseeds-rng", file: room, from: "    this.replay?.intents.splice(snap.intentCount);\n", to: "    this.replay?.intents.splice(snap.intentCount);\n    this.match = { ...this.match, rng: { seed: 777001, cursor: 0 } };\n", kills: ["an accepted undo restores the turn exactly, so the same cards are drawn again, and the replay rebuilds (#449)"] },
    { id: "skin-not-relayed", file: room, from: "    this.broadcast(\"skin\", payload);", to: "    client.send(\"skin\", payload);", kills: ["relays a seat's playmat / card back skin"] },
    { id: "skin-any-mime", file: proto, from: "^data:image\\/(?:jpeg|webp|png);base64,", to: "^data:[a-z]+\\/[a-z]+;base64,", kills: ["relays a seat's playmat / card back skin"] },
    { id: "skin-ws-default-max-payload", file: appConfig, from: "  transport: new WebSocketTransport({ maxPayload: WS_MAX_PAYLOAD_BYTES }),\n", to: "", kills: ["relays a cap-sized playmat and card back in one skin message"] },
    { id: "presence-room-unregistered", file: room, from: "    presence.register(this);\n", to: "", kills: ["friends presence: reports seats as waiting"] },
    { id: "presence-waiting-as-playing", file: room, from: "    const phase: PresenceEntry[\"phase\"] = !this.matchStarted\n      ? \"waiting\"", to: "    const phase: PresenceEntry[\"phase\"] = !this.matchStarted\n      ? \"playing\"", kills: ["friends presence: reports seats as waiting"] },
    { id: "presence-spectator-as-player", file: room, from: "role: \"spectator\", phase", to: "role: \"player\", phase", kills: ["friends presence: reports seats as waiting"] },
    { id: "presence-sends-synthetic-ids", file: presence, from: "        if (entry.user_id > 0) out.push(entry);", to: "        out.push(entry);", kills: ["pushes a full snapshot of real accounts"] },
    { id: "presence-no-ingest-secret", file: presence, from: "\"X-Duel-Ingest-Token\": getDuelIngestSecret()", to: "\"X-Duel-Ingest-Token\": \"\"", kills: ["pushes a full snapshot of real accounts"] },
    { id: "presence-pushes-before-start", file: presence, from: "    if (!this.started || this.debounce) return;", to: "    if (this.debounce) return;", kills: ["pushes soon after a change once started, and not before"] },
    { id: "presence-change-not-pushed", file: presence, from: "    if (!this.started || this.debounce) return;", to: "    return;", kills: ["pushes soon after a change once started, and not before"] },
    // protocol contract (golden fixtures from packages/rules)
    {"id": "contract-version-bumped", "file": "game-server/src/protocol.ts", "from": "export const PROTOCOL_VERSION = 5 as const;", "to": "export const PROTOCOL_VERSION = 6 as const;", "kills": ["speaks the protocol version the fixtures were generated for"]},
    {"id": "contract-any-version-accepted", "file": "game-server/src/protocol.ts", "from": "  return v === PROTOCOL_VERSION;", "to": "  return typeof v === \"number\";", "kills": ["rejects malformed variants of every client intent fixture"]},
    {"id": "contract-intent-type-unchecked", "file": "game-server/src/protocol.ts", "from": "    typeof (o.intent as { type?: unknown }).type !== \"string\"", "to": "    false", "kills": ["rejects malformed variants of every client intent fixture"]},
    {"id": "contract-intent-envelope-returned", "file": "game-server/src/protocol.ts", "from": "  return o.intent as Intent;", "to": "  return { ...(o.intent as Intent), protocolVersion: o.protocolVersion } as Intent;", "kills": ["parses every client intent fixture to its intent unchanged"]},
    // ranked match clock
    { id: "match-clock-active-seat-loses", file: room, from: "    const loser = bothMulliganing\n      ? (m.pendingChoices[0]?.seat ?? m.activeSeat)\n      : (this.actingSeatForTimer() ?? m.activeSeat);", to: "    const loser = m.activeSeat;", kills: ["match clock: a seat that never answers its mulligan loses on time, not the first player (#248)", "match clock: a defender sitting on the block step loses on time, not the attacker (#248)"] },
    // match replays
    { id: "replay-player-intent-dropped", file: room, from: "      return;\n    }\n\n    this.match = result.state;\n    this.replay?.intents.push({ seat, intent });", to: "      return;\n    }\n\n    this.match = result.state;", kills: ["the recorded replay rebuilds the game, including turn-clock auto moves (#244)"] },
    { id: "replay-auto-intent-dropped", file: room, from: "      return;\n    }\n    this.match = result.state;\n    this.replay?.intents.push({ seat, intent });", to: "      return;\n    }\n    this.match = result.state;", kills: ["the recorded replay rebuilds the game, including turn-clock auto moves (#244)"] },
    { id: "replay-mulligan-skip-unrecorded", file: room, from: "      skipMulligans: this.autoSkipMulligan,", to: "      skipMulligans: false,", kills: ["the recorded replay rebuilds the game, including turn-clock auto moves (#244)", "an accepted undo drops the rewound moves from the replay (#244)"] },
    { id: "replay-undo-keeps-rewound-intents", file: room, from: "    this.replay?.intents.splice(snap.intentCount);\n", to: "", kills: ["an accepted undo drops the rewound moves from the replay (#244)"] },
    { id: "replay-undo-count-not-snapshotted", file: room, from: "        intentCount: this.replay?.intents.length ?? 0,", to: "        intentCount: 0,", kills: ["an accepted undo drops the rewound moves from the replay (#244)"] },
    { id: "result-leaders-dropped", file: room, from: "      seat0_leader_id: this.replay?.players[0].leaderId,\n      seat1_leader_id: this.replay?.players[1].leaderId,\n", to: "", kills: ["the result sent to the backend carries leaders, turns, the replay, each seat's log and how it ended (#244, #252)"] },
    { id: "result-leaders-swapped", file: room, from: "      seat0_leader_id: this.replay?.players[0].leaderId,\n      seat1_leader_id: this.replay?.players[1].leaderId,", to: "      seat0_leader_id: this.replay?.players[1].leaderId,\n      seat1_leader_id: this.replay?.players[0].leaderId,", kills: ["the result sent to the backend carries leaders, turns, the replay, each seat's log and how it ended (#244, #252)"] },
    { id: "result-turns-dropped", file: room, from: "      turns: this.match?.turnNumber,\n", to: "", kills: ["the result sent to the backend carries leaders, turns, the replay, each seat's log and how it ended (#244, #252)"] },
    { id: "result-replay-without-end", file: room, from: "intents: [...this.replay.intents], end: { winner, reason } }", to: "intents: [...this.replay.intents] }", kills: ["the result sent to the backend carries leaders, turns, the replay, each seat's log and how it ended (#244, #252)"] },
    { id: "result-seat-logs-dropped", file: room, from: "      seat_logs: this.seatLogs(reveal),\n", to: "", kills: ["the result sent to the backend carries leaders, turns, the replay, each seat\'s log and how it ended (#244, #252)"] },
    // spectators see both hands in unranked rooms only (#250)
    {"id": "spectator-hands-in-ranked", "file": "game-server/src/rooms/DuelRoom.ts", "from": "{ revealHands: !this.ranked }", "to": "{ revealHands: true }", "kills": ["spectators of a ranked room see no hands (#250)"]},
    {"id": "spectator-hands-never-sent", "file": "game-server/src/rooms/DuelRoom.ts", "from": "{ revealHands: !this.ranked }", "to": "{ revealHands: false }", "kills": ["spectators of an unranked room see both players' hands (#250)"]},
    // a paired player who can't join must not strand the other (#302)
    { id: "ranked-queue-skips-deck-check", file: queue, from: "    if (join.deck) {\n      assertKnownDeck(join.deck);\n      const problem = rankedDeckProblem(join.deck);\n      if (problem) throw new Error(problem);\n    }\n", to: "", kills: ["ranked_queue turns away a deck ranked can't play before pairing it (#302)"] },
    { id: "ranked-queue-rejects-every-deck", file: queue, from: "      if (problem) throw new Error(problem);", to: "      throw new Error(problem ?? \"no deck\");", kills: ["ranked_queue turns away a deck ranked can't play before pairing it (#302)"] },
    { id: "ranked-no-show-never-expires", file: room, from: "      this.clock.setTimeout(() => this.expireNoShow(), getRankedNoShowSeconds() * 1000);\n", to: "", kills: ["a paired ranked room sends the waiting player back when the opponent never joins (#302)"] },
    {"id": "progress-snapshot-reveals-hands", "file": "game-server/src/rooms/DuelRoom.ts", "from": "      void this.saveProgress();\n", "to": "      void this.saveProgress(true);\n", "kills": ["a live game's progress snapshots hide the opponent's hand; the result and a cut-off log show it (#359)"]},
    {"id": "result-hides-hands", "file": "game-server/src/rooms/DuelRoom.ts", "from": "      ...this.progressPayload(s0, s1, true),", "to": "      ...this.progressPayload(s0, s1, false),", "kills": ["a live game's progress snapshots hide the opponent's hand; the result and a cut-off log show it (#359)"]},
    {"id": "cutoff-snapshot-hides-hands", "file": "game-server/src/rooms/DuelRoom.ts", "from": "      await this.saveProgress(true);\n", "to": "      await this.saveProgress();\n", "kills": ["a live game's progress snapshots hide the opponent's hand; the result and a cut-off log show it (#359)"]},
    {"id": "progress-not-saved-each-turn", "file": "game-server/src/rooms/DuelRoom.ts", "from": "      this.progressTurn = this.match.turnNumber;\n      void this.saveProgress();\n", "to": "      this.progressTurn = this.match.turnNumber;\n", "kills": ["an unfinished game's log is saved at the start of every turn and when the room closes (#316)"]},
    {"id": "progress-not-saved-on-close", "file": "game-server/src/rooms/DuelRoom.ts", "from": "      await this.saveProgress(true);\n", "to": "", "kills": ["an unfinished game's log is saved at the start of every turn and when the room closes (#316)"]},
    {"id": "progress-sends-oldest-waiting", "file": "game-server/src/writeback.ts", "from": "    this.next = payload;\n", "to": "    this.next ??= payload;\n", "kills": ["sends one at a time and skips to the newest snapshot (#316)"]},
    {"id": "progress-failure-stops-sender", "file": "game-server/src/writeback.ts", "from": "      try {\n        await this.send(payload);\n      } catch (error) {\n        this.onError(error);\n      }\n", "to": "      await this.send(payload);\n", "kills": ["a failed send doesn't stop the next snapshot (#316)"]},
    // hand_order: spectators see each hand in its player's own order (#346)
    { id: "hand-order-not-applied", file: room, from: "applyHandOrder(h0, this.seatHandOrder[0]), applyHandOrder(h1, this.seatHandOrder[1])", to: "h0, h1", kills: ["a player's hand_order reorders the hands spectators see", "hand_order ids not in the sender's hand are ignored"] },
    { id: "hand-order-reaches-opponent", file: room, from: "      specClient.send(\"view\", {", to: "      this.broadcast(\"view\", {", kills: ["a player's hand_order reorders the hands spectators see"] },
    { id: "hand-order-spectator-allowed", edits: [
      { file: room, from: "    if (this.spectatorForClient(client)) {\n      this.sendError(client, \"unauthorized\", \"Spectators cannot set a hand order\");\n      return;\n    }\n    const seat = this.seatForClient(client);\n    if (seat === null) {\n      this.sendError(client, \"unauthorized\", \"Not seated\");\n      return;\n    }\n    let ids: string[];", to: "    const seat = this.seatForClient(client) ?? 0;\n    let ids: string[];" },
    ], kills: ['a spectator cannot send hand_order'] },
    { id: "hand-order-foreign-ids-kept", edits: [
      { file: handOrder, from: "    if (!held.has(id) || seen.has(id)) continue;", to: "    if (seen.has(id)) continue;" },
      { file: handOrder, from: "    const card = byId.get(id);\n    if (!card) continue;", to: "    const card = byId.get(id) ?? ({ id } as T);" },
    ], kills: ["hand_order ids not in the sender's hand are ignored"] },
    { id: "hand-order-too-many-ids", file: proto, from: "    ids.length > HAND_ORDER_MAX_IDS ||\n", to: "", kills: ['a spectator cannot send hand_order'] },
    { id: "hand-order-long-ids", file: proto, from: "typeof id !== \"string\" || id.length > HAND_ORDER_MAX_ID_LENGTH", to: "typeof id !== \"string\"", kills: ['a spectator cannot send hand_order'] },
    { id: "hand-order-resends-unchanged", file: room, from: "    if (next.length === prev.length && next.every((id, i) => id === prev[i])) return;\n", to: "", kills: ['an unchanged hand_order does not resend'] },
    { id: "hand-order-kept-in-ranked", file: room, from: "    if (this.ranked || !this.match) return;", to: "    if (!this.match) return;", kills: ['a ranked room keeps hands hidden whatever hand_order says'] },
    // matchmake guards (security review)
    { id: "matchmake-no-token-check", file: guard, from: "  if (!token || !verifyGameToken(token)) {\n    throw Object.assign(new Error(\"gameToken required\"), { code: \"unauthorized\" as const });\n  }\n  return true;", to: "  return true;", kills: ["refuses to create a room without a game token"] },
    { id: "duel-room-public", file: room, from: "    void this.setPrivate(true);\n", to: "", kills: ["duel rooms can only be joined by id"] },
    { id: "creator-room-cap-off", file: guard, from: "  if (live >= MAX_ROOMS_PER_CREATOR) {", to: "  if (false) {", kills: ["caps how many open rooms one account can create"] },
    { id: "creator-room-kept-on-failed-create", file: room, from: "      releaseCreatorRoom(this.creatorUid);\n      this.creatorUid = null;\n      throw e;", to: "      throw e;", kills: ["a rejected room create doesn't use up one of the account's room slots (#318)"] },
    { id: "room-message-flood-allowed", file: room, from: "  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;\n", to: "", kills: ["drops a client that floods the room with messages"] },
    { id: "seed-client-chosen", file: guard, from: "  if (clientSeed !== undefined && !requireGameToken()) return clientSeed;", to: "  if (clientSeed !== undefined) return clientSeed;", kills: ["ignores a client-chosen seed when tokens are required"] },
    { id: "seed-from-clock", file: guard, from: "  return randomInt(0, 2 ** 32);", to: "  return Date.now() % 1_000_000_000;", kills: ["does not derive the seed from the clock"] },
    { id: "prod-dev-secret-allowed", file: env, from: "  if (secret === DEV_GAME_TOKEN_SECRET) {\n    throw new Error(\"GAME_TOKEN_SECRET must be set in production\");\n  }", to: "", kills: ["refuses to start in production with the dev game token secret"] },
    { id: "prod-token-optional", file: env, from: "  if (env.NODE_ENV === \"production\") return true;\n", to: "", kills: ["starts in production without REQUIRE_GAME_TOKEN and still requires tokens"] },
    { id: "prod-start-needs-token-flag", file: env, from: "    throw new Error(\"GAME_TOKEN_SECRET must be set in production\");\n  }\n}", to: "    throw new Error(\"GAME_TOKEN_SECRET must be set in production\");\n  }\n  if ((env.REQUIRE_GAME_TOKEN ?? \"\").toLowerCase() !== \"true\") throw new Error(\"REQUIRE_GAME_TOKEN must be true in production\");\n}", kills: ["starts in production without REQUIRE_GAME_TOKEN and still requires tokens"] },
    // matchup brief tickets (#401)
    { id: "brief-ticket-opponent-is-self", file: room, from: "    const theirs = this.replay.players[1 - seat];", to: "    const theirs = this.replay.players[seat];", kills: ["an unranked room gives each player a brief ticket for their own seat and the other seat's leader (#401)"] },
    // Two layers of one rule: the room never asks for a ranked ticket, and the minter never signs one.
    { id: "brief-ticket-in-ranked", edits: [
      { file: room, from: "    if (this.ranked || !this.replay) return undefined;", to: "    if (!this.replay) return undefined;" },
      { file: "game-server/src/briefTicket.ts", from: "  if (claims.ranked) return null;\n", to: "" },
    ], kills: ["a ranked room's welcome says ranked and carries no brief ticket (#401)", "a ranked game gets no ticket and the ticket lasts three hours (#401)"] },
    { id: "brief-ticket-to-spectators", file: room, from: "      role: \"spectator\",\n      view,\n      players: this.playersInfo(),\n      ranked: this.ranked,\n", to: "      role: \"spectator\",\n      view,\n      players: this.playersInfo(),\n      ranked: this.ranked,\n      brief: this.briefFor(cameraSeat),\n", kills: ["spectators never get a brief ticket (#401)"] },
    { id: "brief-ticket-unsalted", file: "game-server/src/briefTicket.ts", from: "createHmac(\"sha256\", \"match-brief:\" + getGameTokenSecret())", to: "createHmac(\"sha256\", getGameTokenSecret())", kills: ["a brief ticket is not a game token and needs the brief key (#401)"] },
    { id: "brief-ticket-json-order", file: "game-server/src/briefTicket.ts", from: "return `mb1.${body}.${sig}`;", to: "return `mb0.${body}.${sig}`;", kills: ["the game server signs the shared brief ticket vector (#401)"] },
    // DON!! card art (#440)
    { id: "skin-don-art-string-passthrough", file: proto, from: "donArt: asDonArtId(skin.donArt),", to: "donArt: (skin.donArt as number | undefined) ?? null,", kills: ["relays only a positive 31-bit integer as the DON!! art id, never a string or URL (#440)"] },
    { id: "skin-don-art-unbounded", file: proto, from: "Number.isSafeInteger(raw) && raw > 0 && raw <= 2_147_483_647", to: "Number.isSafeInteger(raw) && raw > 0", kills: ["relays only a positive 31-bit integer as the DON!! art id, never a string or URL (#440)"] },
    { id: "skin-don-art-not-integer", file: proto, from: "Number.isSafeInteger(raw) && raw > 0 && raw <= 2_147_483_647", to: "typeof raw === \"number\" && raw > 0 && raw <= 2_147_483_647", kills: ["relays only a positive 31-bit integer as the DON!! art id, never a string or URL (#440)"] },
    { id: "skin-don-art-negative", file: proto, from: "Number.isSafeInteger(raw) && raw > 0 && raw <= 2_147_483_647", to: "Number.isSafeInteger(raw) && raw <= 2_147_483_647", kills: ["relays only a positive 31-bit integer as the DON!! art id, never a string or URL (#440)"] },
    // Device handoff (#451)
    { id: "handoff-join-drops-takeover", file: proto, from: "  const takeover = o.takeover === true ? true : undefined;", to: "  const takeover = undefined;", kills: ["parses takeover and ownerToken join options", "taking a seat over closes the old connected device"] },
    { id: "handoff-takeover-without-seat", file: proto, from: "  if (takeover && (role === \"spectator\" || preferredSeat === undefined)) {", to: "  if (false) {", kills: ["parses takeover and ownerToken join options"] },
    { id: "handoff-skip-owner-check", file: room, from: "    if (!slot || owner !== identity.userId) {", to: "    if (!slot) {", kills: ["another account cannot take over a seat it does not hold (#451)", "a guest seat without ownerToken cannot be taken over by an account (#451)"] },
    // Three layers of one rule: the ranked reservation (two checks) and the takeover owner check.
    { id: "handoff-ranked-seat-takeover-unguarded", edits: [
      { file: room, from: "    if (!slot || owner !== identity.userId) {", to: "    if (!slot) {" },
      { file: room, from: "    if (seat !== 0 && seat !== 1) {\n      throw Object.assign(new Error(\"Identity is not reserved for this match\")", to: "    if (false) {\n      throw Object.assign(new Error(\"Identity is not reserved for this match\")" },
      { file: room, from: "    if (identity.preferredSeat !== seat) {\n      throw Object.assign(new Error(\"Identity is not reserved for the requested seat\")", to: "    if (false) {\n      throw Object.assign(new Error(\"Identity is not reserved for the requested seat\")" },
    ], kills: ["a ranked reserved seat can only be taken over by its own account on its own seat (#451)"] },
    { id: "handoff-ignore-owner-token", file: room, from: "    const ownerUid = join.ownerToken ? (verifyGameToken(join.ownerToken)?.uid ?? null) : null;", to: "    const ownerUid = null;", kills: ["a practice owner takes over both guest seats with ownerToken; others cannot (#451)"] },
    { id: "handoff-allowed-after-match-over", file: room, from: "    if (this.matchOverSent) {\n      this.rejectJoin(client, \"match_over\", \"That match has ended\");", to: "    if (false) {\n      this.rejectJoin(client, \"match_over\", \"That match has ended\");", kills: ["takeover is refused once the match is over (#451)"] },
    { id: "handoff-old-device-stays-bound", file: room, from: "    slot.sessionId = client.sessionId;\n    this.intentTimestamps.delete(oldSessionId);", to: "    this.intentTimestamps.delete(oldSessionId);", kills: ["taking a seat over closes the old connected device"] },
    { id: "handoff-old-device-not-told", file: room, from: "      old.send(\"taken_over\", { protocolVersion: PROTOCOL_VERSION, seat });\n", to: "", kills: ["taking a seat over closes the old connected device"] },
    { id: "handoff-old-device-not-closed", file: room, from: "      old.leave(TAKEN_OVER_CLOSE_CODE);", to: "", kills: ["taking a seat over closes the old connected device"] },
    { id: "handoff-no-welcome-for-new-device", file: room, from: "    if (this.matchStarted && this.match) this.sendSync(client);\n    this.refreshMetadata();\n  }\n\n  /** Lobby lookup", to: "    this.refreshMetadata();\n  }\n\n  /** Lobby lookup", kills: ["taking a seat over closes the old connected device"] },
    { id: "handoff-old-reconnection-survives", file: room, from: "      if (entry[0] === oldSessionId) entry[1].reject(false);", to: "", kills: ["taking over a dropped seat during the reconnect grace works and the old reconnection token can no longer reclaim (#451)"] },
    { id: "handoff-metadata-no-owners", file: room, from: "{ owners: [...this.seatOwnerUids], phase, ranked: this.ranked }", to: "{ owners: [null, null], phase, ranked: this.ranked }", kills: ["GET /active-matches lists a live match for the account that holds a seat", "GET /active-matches reports a practice match"] },
    { id: "handoff-metadata-never-finished", file: room, from: "const phase = this.matchOverSent ? \"finished\" : this.matchStarted", to: "const phase = this.matchStarted", kills: ["GET /active-matches leaves out finished matches (#451)"] },
    { id: "handoff-lookup-lists-finished", file: appConfig, from: "if (!owners || meta?.phase === \"finished\") return [];", to: "if (!owners) return [];", kills: ["GET /active-matches leaves out finished matches (#451)"] },
    { id: "handoff-lookup-lists-everyone", file: appConfig, from: "owners[s] === uid)", to: "owners[s] != null)", kills: ["GET /active-matches lists a live match for the account that holds a seat, not for anyone else (#451)"] },
    { id: "handoff-lookup-no-auth", file: appConfig, from: "      if (uid === null) {", to: "      if (false) {", kills: ["GET /active-matches lists a live match for the account that holds a seat, not for anyone else (#451)"] },
    { id: "handoff-lookup-dev-id-when-tokens-required", file: appConfig, from: "if (!requireGameToken() && typeof devUserId", to: "if (typeof devUserId", kills: ["GET /active-matches accepts ?devUserId= only while game tokens are not required (#451)"] },
    { id: "handoff-lookup-no-dev-id", file: appConfig, from: "if (!requireGameToken() && typeof devUserId", to: "if (false && typeof devUserId", kills: ["GET /active-matches accepts ?devUserId= only while game tokens are not required (#451)"] },
    // Rematch deck pick (#479)
    { id: "rematch-pick-not-applied", file: room, from: "          if (picked) this.seatDecks[s] = picked;", to: "          void picked;", kills: ["rematch: a player who picks a different deck plays it in the next game (#479)"] },
    { id: "rematch-decline-keeps-pick", file: room, from: "        this.rematchRequested = [false, false];\n        this.rematchDecks = [null, null];\n        this.rematchDeclinedBy = seat;", to: "        this.rematchRequested = [false, false];\n        this.rematchDeclinedBy = seat;", kills: ["rematch: declining drops a picked deck (#479)"] },
    { id: "rematch-deck-unchecked", file: room, from: "      if (deck) assertKnownDeck(deck);\n", to: "", kills: ["rematch: a deck with unknown cards is refused (#479)"] },
  ],
};
