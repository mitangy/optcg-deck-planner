/** mobile mutations: the atlas assertions check exported card data, so the opposite conditions are data edits. */
const atlas = "mobile/assets/cardAtlas.json";
module.exports = {
  cwd: "mobile",
  runner: "vitest",
  mutations: [
    { id: "atlas-missing-official-card", json: atlas, patch: (a) => { delete a["OP01-013"]; }, kills: ["card atlas"] },
    { id: "atlas-conditional-rush-static", json: atlas, patch: (a) => { a["ST01-004"].rush = true; }, kills: ["card atlas"] },
    { id: "atlas-printed-rush-missing", json: atlas, patch: (a) => { delete a["OP09-118"].rush; }, kills: ["card atlas"] },
    { id: "atlas-traits-missing", json: atlas, patch: (a) => { a["OP12-002"].traits = []; }, kills: ["card atlas"] },
    { id: "atlas-trigger-flag-missing", json: atlas, patch: (a) => { delete a["ST01-014"].hasTrigger; }, kills: ["card atlas"] },
    { id: "opponent-hand-allowed", file: "mobile/src/net/protocol.ts", from: "    throw new Error(\"privacy leak: opponent.hand present in view\");", to: "", kills: ["parses welcome and rejects opponent hand leaks"] },
    { id: "welcome-drops-role", file: "mobile/src/net/protocol.ts", from: "    o.role === \"spectator\" || o.role === \"player\" ? o.role : undefined;", to: "    undefined;", kills: ["parses spectator welcome with empty hands"] },
    { id: "spectator-empty-hand-rejected", file: "mobile/src/net/protocol.ts", from: "  if (view.you.hand.length > 0) {", to: "  if (view.you.hand.length >= 0) {", kills: ["parses spectator welcome with empty hands"] },
    { id: "error-code-dropped", file: "mobile/src/net/protocol.ts", from: "    code: typeof o.code === \"string\" ? o.code : \"unknown\",", to: "    code: \"unknown\",", kills: ["parses view, error, and match_over"] },
    { id: "match-over-winner-lost", file: "mobile/src/net/protocol.ts", from: "      winner: result.winner,", to: "      winner: 0,", kills: ["parses view, error, and match_over"] },
    { id: "hand-label-uses-id", file: "mobile/src/net/protocol.ts", from: "  return n && n !== defId ? n : defId;", to: "  return defId;", kills: ["labels intents with atlas names"] },
    { id: "board-name-unresolved", file: "mobile/src/net/protocol.ts", from: "  if (!view || instanceId == null) return shortId(instanceId);", to: "  return shortId(instanceId);", kills: ["labels intents with atlas names"] },
    { id: "keep-labelled-mulligan", file: "mobile/src/net/protocol.ts", from: "      return intent.doMulligan ? \"Mulligan (shuffle & redraw 5)\" : \"Keep opening hand\";", to: "      return \"Mulligan (shuffle & redraw 5)\";", kills: ["labels intents with atlas names"] },
  ],
};
