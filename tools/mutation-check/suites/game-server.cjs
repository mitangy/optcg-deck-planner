/** game-server mutations (game-server/test, mocha). */
const proto = "game-server/src/protocol.ts";
const room = "game-server/src/rooms/DuelRoom.ts";
const queue = "game-server/src/rooms/MatchmakerRoom.ts";
const cors = "game-server/src/cors.ts";
const presence = "game-server/src/presence.ts";
const appConfig = "game-server/src/app.config.ts";
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
    { id: "ranked-keeps-turn-timer", file: proto, from: "    turnSeconds = null;\n    matchSeconds = RANKED_MATCH_SECONDS;", to: "    turnSeconds = 30;\n    matchSeconds = RANKED_MATCH_SECONDS;", kills: ["ranked games get one 15 minute clock"] },
    { id: "ranked-no-match-clock", file: proto, from: "    matchSeconds = RANKED_MATCH_SECONDS;\n", to: "", kills: ["ranked games get one 15 minute clock"] },
    { id: "ranked-keeps-seat-clock", file: proto, from: "    matchSeconds = RANKED_MATCH_SECONDS;\n    seatSeconds = null;\n", to: "    matchSeconds = RANKED_MATCH_SECONDS;\n", kills: ["ranked games get one 15 minute clock"] },
    { id: "create-duplicate-seat-users", file: proto, from: "      !Number.isSafeInteger(b) ||\n      a === b", to: "      !Number.isSafeInteger(b)", kills: ["rejects invalid ranked seat reservations"] },
    { id: "create-fractional-seat-users", file: proto, from: "      !Number.isSafeInteger(a) ||\n      !Number.isSafeInteger(b) ||", to: "", kills: ["rejects invalid ranked seat reservations"] },
    { id: "intent-returns-envelope", file: proto, from: "  return o.intent as Intent;", to: "  return o as unknown as Intent;", kills: ["parses intent envelope"] },
    // CORS allowlist
    { id: "cors-allowlisted-wildcard", file: cors, from: "      return { \"Access-Control-Allow-Origin\": origin };", to: "      return { \"Access-Control-Allow-Origin\": \"*\" };", kills: ["reflects allowlisted Origin"] },
    { id: "cors-reflects-any-origin", file: cors, from: "    return { \"Access-Control-Allow-Origin\": \"null\" };", to: "    return { \"Access-Control-Allow-Origin\": origin };", kills: ["rejects unknown browser Origin"] },
    { id: "cors-no-origin-blocked", file: cors, from: "    if (!origin) {\n      return { \"Access-Control-Allow-Origin\": \"*\" };\n    }", to: "", kills: ["allows requests with no Origin"] },
    // DuelRoom / ranked_queue
    { id: "welcome-wrong-seat-view", edits: [
      { file: room, from: "      const view = getPlayerView(match, slot.seat);\n      const welcome", to: "      const view = getPlayerView(match, 0);\n      const welcome" },
      { file: room, from: "    const view = getPlayerView(this.match, seat);\n    const welcome", to: "    const view = getPlayerView(this.match, 0);\n    const welcome" },
    ], kills: ["two clients get private views"] },
    { id: "mulligan-always-skipped", file: room, from: "    if (this.autoSkipMulligan) {", to: "    if (true) {", kills: ["mulligan phase keeps both seats"] },
    { id: "intent-trusts-active-seat", file: room, from: "    const result = applyIntent(before, intent, { seat, rng: this.rng });\n    if (!result.ok) {\n      this.log(\"info\", \"illegal_intent\"", to: "    const result = applyIntent(before, intent, { seat: before.activeSeat, rng: this.rng });\n    if (!result.ok) {\n      this.log(\"info\", \"illegal_intent\"", kills: ["illegal intent errors without advancing"] },
    { id: "match-over-not-sent", file: room, from: "    this.onMatchAdvanced();\n    this.maybeSendMatchOver();\n  }\n\n  /** Clear everything", to: "    this.onMatchAdvanced();\n  }\n\n  /** Clear everything", kills: ["legal play reaches match_over"] },
    { id: "third-player-kept", file: room, from: "      this.sendError(client, \"room_full\", \"No free seat\");\n      client.leave();", to: "      this.sendError(client, \"room_full\", \"No free seat\");", kills: ["rejects a third player"] },
    { id: "join-deck-ignored", file: room, from: "    if (identity.deck) {\n      this.seatDecks[seat] = identity.deck;\n    }", to: "", kills: ["uses join-time seat decks for leaders"] },
    { id: "join-unknown-card-deck-accepted", file: room, from: "    if (role === \"player\" && join.deck) assertKnownDeck(join.deck);\n", to: "", kills: ["rejects a deck with unknown cards at join"] },
    { id: "spectator-gets-player-view", file: room, from: "    const view = this.spectatorView(this.match, cameraSeat);\n    const welcome", to: "    const view = { ...getPlayerView(this.match, cameraSeat), spectator: true };\n    const welcome", kills: ["allows a spectator with public view"] },
    { id: "queue-same-seat", file: queue, from: "            roomId: room.roomId,\n            seat: 1,", to: "            roomId: room.roomId,\n            seat: 0,", kills: ["ranked_queue pairs two clients"] },
    { id: "queue-pairs-same-user", file: queue, from: "        const partnerIdx = this.queue.findIndex((q) => q.userId !== a.userId);", to: "        const partnerIdx = 0;", kills: ["ranked_queue skips same-user pair"] },
    { id: "cosmetics-not-relayed", file: room, from: "    this.broadcast(\"cosmetics\", payload);", to: "    client.send(\"cosmetics\", payload);", kills: ["relays cosmetics artPrefs between seats"] },
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
    { id: "result-seat-logs-dropped", file: room, from: "      seat_logs: this.seatLogs(),\n", to: "", kills: ["the result sent to the backend carries leaders, turns, the replay, each seat\'s log and how it ended (#244, #252)"] },
    // spectators see both hands in unranked rooms only (#250)
    {"id": "spectator-hands-in-ranked", "file": "game-server/src/rooms/DuelRoom.ts", "from": "{ revealHands: !this.ranked }", "to": "{ revealHands: true }", "kills": ["spectators of a ranked room see no hands (#250)"]},
    {"id": "spectator-hands-never-sent", "file": "game-server/src/rooms/DuelRoom.ts", "from": "{ revealHands: !this.ranked }", "to": "{ revealHands: false }", "kills": ["spectators of an unranked room see both players' hands (#250)"]},
  ],
};
